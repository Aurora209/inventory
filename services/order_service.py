"""订单服务。"""
from typing import List, Dict, Any, Optional
from datetime import datetime
import random
import string
import logging
import threading
from decimal import Decimal

from models.order import Order
from models.product import Product
from models.transaction import Transaction
from utils.database import db_manager, serialize_rows
from utils.error_handler import ValidationError, DatabaseError
import sqlite3
from utils.validators import DataValidator, OrderValidator

logger = logging.getLogger(__name__)


class OrderNumberGenerator:
    """订单号生成器"""

    _counter = 0
    _counter_lock = threading.Lock()

    @staticmethod
    def generate(prefix: str = 'ORD') -> str:
        """生成订单号：时间戳(微秒) + 递增序号，保证全局唯一"""
        ts = datetime.now().strftime('%Y%m%d%H%M%S')
        with OrderNumberGenerator._counter_lock:
            OrderNumberGenerator._counter += 1
            seq = OrderNumberGenerator._counter
        return f"{prefix}{ts}{seq:06d}"

    @staticmethod
    def reset_counter():
        """重启时重置计数器（可选）"""
        with OrderNumberGenerator._counter_lock:
            OrderNumberGenerator._counter = 0


class OrderCalculator:
    """订单计算器"""

    @staticmethod
    def calculate_order_total(items: List[Dict[str, Any]], shipping_cost: float = 0) -> Dict[str, Any]:
        """计算订单总金额"""
        shipping_cost = float(shipping_cost or 0)
        if not items:
            return {
                'items_total': 0.0,
                'shipping_cost': shipping_cost,
                'order_total': shipping_cost
            }

        items_total = sum(
            float(item.get('total_price'))
            if item.get('total_price') is not None
            else float(item.get('quantity', 0)) * float(item.get('unit_price', 0))
            for item in items
        )

        return {
            'items_total': items_total,
            'shipping_cost': shipping_cost,
            'order_total': items_total + shipping_cost
        }

    @staticmethod
    def allocate_shipping_cost(items: List[Dict[str, Any]], shipping_cost: float) -> List[Dict[str, Any]]:
        """分摊运费到订单项"""
        shipping_cost = float(shipping_cost or 0)
        if not items or shipping_cost <= 0:
            return items

        items_total = sum(
            float(item.get('total_price'))
            if item.get('total_price') is not None
            else float(item.get('quantity', 0)) * float(item.get('unit_price', 0))
            for item in items
        )
        if items_total <= 0:
            return items

        shipping_ratio = shipping_cost / items_total
        updated_items = []
        for item in items:
            updated_item = item.copy()
            item_total = (
                float(item.get('total_price'))
                if item.get('total_price') is not None
                else float(item.get('quantity', 0)) * float(item.get('unit_price', 0))
            )
            allocated_shipping = item_total * shipping_ratio
            quantity = float(item.get('quantity', 1) or 1)
            original_unit_price = float(item.get('unit_price', 0) or 0)
            adjusted_unit_price = (item_total + allocated_shipping) / quantity if quantity > 0 else original_unit_price

            updated_item['allocated_shipping'] = allocated_shipping
            updated_item['adjusted_unit_price'] = adjusted_unit_price
            updated_items.append(updated_item)

        return updated_items


class OrderTransactionCreator:
    """订单交易记录创建器"""

    @staticmethod
    def rollback_order_transactions(order: Dict[str, Any]) -> bool:
        """按已存在的订单交易记录回滚库存并删除交易。"""
        with db_manager.get_connection() as conn:
            try:
                OrderTransactionCreator.rollback_order_transactions_in_conn(conn, order)
                conn.commit()
                return True
            except Exception:
                conn.rollback()
                raise

    @staticmethod
    def rollback_order_transactions_in_conn(conn, order: Dict[str, Any]) -> bool:
        """在调用方事务内按已存在交易记录回滚库存并删除交易。"""
        order_number = str(order.get('order_number', '')).strip() if order else ''
        if not order_number:
            return True

        transaction_rows = conn.execute(
            """
            SELECT id, product_id, transaction_type, quantity
            FROM transactions
            WHERE TRIM(COALESCE(reference_no, '')) = TRIM(?)
            """,
            (order_number,)
        ).fetchall()

        for row in transaction_rows:
            product_id = row['product_id']
            quantity = float(row['quantity'] or 0)
            transaction_type = row['transaction_type']
            if not product_id or quantity <= 0:
                continue

            if transaction_type == 'in':
                quantity_change = -quantity
            elif transaction_type == 'out':
                quantity_change = quantity
            else:
                continue

            conn.execute(
                'UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                (quantity_change, int(product_id))
            )

        conn.execute(
            "DELETE FROM transactions WHERE TRIM(COALESCE(reference_no, '')) = TRIM(?)",
            (order_number,)
        )
        return True

    @staticmethod
    def create_from_order(order: Dict[str, Any]) -> bool:
        """从订单创建库存交易记录"""
        try:
            with db_manager.get_connection() as conn:
                OrderTransactionCreator.create_from_order_in_conn(conn, order)
                conn.commit()
                return True
        except Exception as e:
            logger.error("创建订单交易记录失败: %s", e)
            raise DatabaseError(f"创建交易记录失败: {str(e)}")

    @staticmethod
    def create_from_order_in_conn(conn, order: Dict[str, Any]) -> bool:
        """在调用方事务内从订单创建交易记录并同步库存。"""
        order_type = order.get('order_type')
        items = order.get('items', [])
        if order_type == 'purchase':
            shipping_cost = float(order.get('shipping_cost', 0) or 0)
            items = OrderCalculator.allocate_shipping_cost(items, shipping_cost) if shipping_cost > 0 else items
            transaction_type = 'in'
            note_prefix = '采购订单'
        elif order_type == 'sales':
            transaction_type = 'out'
            note_prefix = '销售订单'
        else:
            logger.warning("未知的订单类型: %s", order_type)
            return False

        for item in items:
            if not item.get('product_id'):
                continue

            product_id = int(item['product_id'])
            quantity = float(item.get('quantity', 0) or 0)
            if quantity <= 0:
                continue
            unit_price = float(item.get('adjusted_unit_price', item.get('unit_price', 0)) or 0)
            total_value = quantity * unit_price

            conn.execute(
                '''
                INSERT INTO transactions (product_id, transaction_type, quantity, unit_price, total_value,
                                          reference_no, customer_supplier, transaction_date, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    product_id,
                    transaction_type,
                    quantity,
                    unit_price,
                    total_value,
                    str(order.get('order_number', '')),
                    str(order.get('customer_supplier', '')),
                    datetime.now().date().isoformat(),
                    f"{note_prefix} #{order.get('order_number', '')}"
                )
            )

            if transaction_type == 'in':
                product = conn.execute('SELECT quantity, price FROM products WHERE id = ?', (product_id,)).fetchone()
                current_qty = float(product['quantity'] or 0) if product else 0.0
                current_price = float(product['price'] or 0) if product else 0.0
                new_qty = current_qty + quantity
                if new_qty > 0:
                    new_price = ((current_qty * current_price) + (quantity * unit_price)) / new_qty
                    conn.execute(
                        'UPDATE products SET quantity = ?, price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        (new_qty, new_price, product_id)
                    )
                else:
                    conn.execute(
                        'UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        (quantity, product_id)
                    )
            else:
                conn.execute(
                    'UPDATE products SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    (quantity, product_id)
                )

        return True

    @staticmethod
    def _create_purchase_transactions(order: Dict[str, Any], items: List[Dict[str, Any]]) -> bool:
        """兼容旧调用：创建采购订单交易记录。"""
        order_copy = order.copy()
        order_copy['items'] = items
        order_copy['order_type'] = 'purchase'
        return OrderTransactionCreator.create_from_order(order_copy)

    @staticmethod
    def _create_sales_transactions(order: Dict[str, Any], items: List[Dict[str, Any]]) -> bool:
        """兼容旧调用：创建销售订单交易记录。"""
        order_copy = order.copy()
        order_copy['items'] = items
        order_copy['order_type'] = 'sales'
        return OrderTransactionCreator.create_from_order(order_copy)


class OrderService:
    """优化后的订单服务"""

    @staticmethod
    def _row_to_dict(row) -> Optional[Dict[str, Any]]:
        return dict(row) if row else None

    @staticmethod
    def _get_order_items_in_conn(conn, order_id: int) -> List[Dict[str, Any]]:
        rows = conn.execute(
            '''
            SELECT oi.*, p.name as product_name, p.sku as product_sku,
                   COALESCE(oi.unit, p.unit, '个') as unit
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
            ORDER BY oi.id
            ''',
            (order_id,)
        ).fetchall()
        return serialize_rows(rows)

    @staticmethod
    def _get_order_in_conn(conn, order_id: int) -> Optional[Dict[str, Any]]:
        row = conn.execute('SELECT * FROM orders WHERE id = ?', (order_id,)).fetchone()
        order = OrderService._row_to_dict(row)
        if order:
            order['items'] = OrderService._get_order_items_in_conn(conn, order_id)
        return order

    @staticmethod
    def _resolve_item_unit(conn, item: Dict[str, Any]) -> str:
        unit_val = item.get('unit')
        if unit_val:
            return unit_val
        product_id = item.get('product_id')
        if product_id:
            row = conn.execute('SELECT unit FROM products WHERE id = ?', (product_id,)).fetchone()
            if row and row['unit']:
                return row['unit']
        return '个'

    @staticmethod
    def _insert_order_items_in_conn(conn, order_id: int, items: List[Dict[str, Any]]) -> None:
        for item in items or []:
            quantity = float(item.get('quantity', 1))
            unit_price = float(item.get('unit_price', 0))
            total_price = float(item.get('total_price')) if item.get('total_price') is not None else quantity * unit_price
            conn.execute(
                '''
                INSERT INTO order_items
                (order_id, product_id, description, quantity, unit_price, total_price, unit, units_per_box, packaging, notes)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''',
                (
                    order_id,
                    item.get('product_id'),
                    item.get('description', ''),
                    quantity,
                    unit_price,
                    total_price,
                    OrderService._resolve_item_unit(conn, item),
                    item.get('units_per_box', 1),
                    item.get('packaging'),
                    item.get('notes', '')
                )
            )

    @staticmethod
    def create_order(order_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建订单；若状态为 completed，同一事务内同步交易和库存。"""
        logger.info("创建订单: %s", order_data.get('order_number', '新订单'))

        validated_data = OrderService._validate_order_data(order_data)

        calculation = OrderCalculator.calculate_order_total(
            validated_data.get('items', []),
            validated_data.get('shipping_cost', 0)
        )

        if not validated_data.get('order_number'):
            validated_data['order_number'] = OrderNumberGenerator.generate()

        validated_data['total_amount'] = calculation['order_total']
        validated_data.setdefault('status', 'pending')

        with db_manager.get_connection() as conn:
            try:
                cursor = conn.execute(
                    '''
                    INSERT INTO orders (order_number, order_type, customer_supplier, order_date, total_amount,
                                        shipping_cost, notes, seller_name, seller_address, seller_phone,
                                        seller_taxNo, seller_note, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        validated_data.get('order_number'),
                        validated_data.get('order_type'),
                        validated_data.get('customer_supplier'),
                        validated_data.get('order_date'),
                        float(validated_data.get('total_amount') or 0),
                        float(validated_data.get('shipping_cost') or 0),
                        validated_data.get('notes'),
                        validated_data.get('seller_name'),
                        validated_data.get('seller_address'),
                        validated_data.get('seller_phone'),
                        validated_data.get('seller_taxNo'),
                        validated_data.get('seller_note'),
                        validated_data.get('status')
                    )
                )
                order_id = cursor.lastrowid
                OrderService._insert_order_items_in_conn(conn, order_id, validated_data.get('items', []))
                order = OrderService._get_order_in_conn(conn, order_id)

                if order and order.get('status') == 'completed':
                    OrderTransactionCreator.create_from_order_in_conn(conn, order)
                    order = OrderService._get_order_in_conn(conn, order_id)

                conn.commit()
                logger.info("订单创建成功: ID=%s, 订单号=%s", order['id'], order['order_number'])
                return order

            except Exception as e:
                conn.rollback()
                # 区分订单号重复和其他数据库错误
                if 'UNIQUE constraint failed' in str(e) and 'order_number' in str(e):
                    logger.warning("订单号重复: %s", validated_data.get('order_number'))
                    raise ValidationError(f"订单号「{validated_data.get('order_number')}」已存在，不能重复创建。请手动输入其他订单号或留空自动生成。")
                logger.error("订单创建失败: %s", e)
                raise DatabaseError(f"订单创建失败: {str(e)}")

    @staticmethod
    def update_order(order_id: int, update_data: Dict[str, Any]) -> Dict[str, Any]:
        """更新订单；订单主表、明细、交易记录和库存使用同一个事务。"""
        logger.info("更新订单: ID=%s", order_id)

        DataValidator.validate_integer(order_id, 'order_id', min_value=1)
        validated_data = OrderService._validate_update_data(update_data)

        with db_manager.get_connection() as conn:
            try:
                existing_order = OrderService._get_order_in_conn(conn, order_id)
                if not existing_order:
                    raise ValidationError("订单不存在")

                original_status = existing_order['status']

                if 'items' in validated_data or 'shipping_cost' in validated_data:
                    calculation = OrderCalculator.calculate_order_total(
                        validated_data.get('items', existing_order.get('items', [])),
                        validated_data.get('shipping_cost', existing_order.get('shipping_cost', 0))
                    )
                    validated_data['total_amount'] = calculation['order_total']

                items = validated_data.pop('items', None)

                if validated_data:
                    set_clause = ', '.join([f'{key} = ?' for key in validated_data.keys()])
                    conn.execute(
                        f'UPDATE orders SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                        list(validated_data.values()) + [order_id]
                    )

                if items is not None:
                    conn.execute('DELETE FROM order_items WHERE order_id = ?', (order_id,))
                    OrderService._insert_order_items_in_conn(conn, order_id, items)

                updated_order = OrderService._get_order_in_conn(conn, order_id)
                new_status = updated_order.get('status', original_status)
                stock_affecting_fields_changed = any(
                    field in update_data for field in ['items', 'order_type', 'shipping_cost']
                )
                should_rollback_existing = (
                    original_status == 'completed' and
                    (new_status != 'completed' or stock_affecting_fields_changed)
                )
                should_create_transactions = (
                    new_status == 'completed' and
                    (original_status != 'completed' or stock_affecting_fields_changed)
                )

                if updated_order and (should_rollback_existing or should_create_transactions):
                    OrderTransactionCreator.rollback_order_transactions_in_conn(conn, existing_order)

                if updated_order and should_create_transactions:
                    OrderTransactionCreator.create_from_order_in_conn(conn, updated_order)
                    updated_order = OrderService._get_order_in_conn(conn, order_id)

                conn.commit()
                logger.info("订单更新成功: ID=%s", order_id)
                return updated_order

            except Exception as e:
                conn.rollback()
                logger.error("订单更新失败: %s", e)
                raise DatabaseError(f"订单更新失败: {str(e)}")

    @staticmethod
    def _validate_order_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """验证订单数据"""
        return OrderValidator.validate_create_data(data)

    @staticmethod
    def _validate_update_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """验证订单更新数据"""
        validated_data = {}

        if 'order_type' in data:
            order_type = DataValidator.validate_string(data['order_type'], 'order_type')
            if order_type not in ['purchase', 'sales']:
                raise ValidationError("订单类型必须是 'purchase' 或 'sales'")
            validated_data['order_type'] = order_type

        if 'customer_supplier' in data:
            validated_data['customer_supplier'] = DataValidator.validate_string(
                data['customer_supplier'], 'customer_supplier', min_length=1, max_length=100
            )

        if 'order_date' in data:
            validated_data['order_date'] = DataValidator.validate_string(data['order_date'], 'order_date')

        if 'status' in data:
            status = DataValidator.validate_string(data['status'], 'status')
            if status not in ['pending', 'completed', 'cancelled']:
                raise ValidationError("订单状态无效")
            validated_data['status'] = status

        if 'shipping_cost' in data:
            validated_data['shipping_cost'] = float(DataValidator.validate_decimal(
                data['shipping_cost'], 'shipping_cost', min_value=Decimal('0')
            ))

        if 'notes' in data:
            validated_data['notes'] = DataValidator.validate_string(
                data['notes'], 'notes', min_length=0, max_length=500
            )

        if 'items' in data:
            if not isinstance(data['items'], list):
                raise ValidationError("订单项必须是列表", field='items')
            validated_data['items'] = DataValidator.validate_order_items(data['items'])

        seller_fields = ['seller_name', 'seller_address', 'seller_phone', 'seller_taxNo', 'seller_note']
        for field in seller_fields:
            if field in data:
                validated_data[field] = DataValidator.validate_string(
                    data[field], field, min_length=0, max_length=200
                ) if data[field] else None

        return validated_data

    @staticmethod
    def get_order_statistics() -> Dict[str, Any]:
        """获取订单统计信息"""
        all_orders = Order.get_all()

        stats = {
            'total_orders': len(all_orders),
            'by_type': {'purchase': 0, 'sales': 0},
            'by_status': {'pending': 0, 'completed': 0, 'cancelled': 0},
            'amounts': {'total': 0.0, 'purchase': 0.0, 'sales': 0.0}
        }

        for order in all_orders:
            order_type = order['order_type']
            status = order['status']
            amount = float(order.get('total_amount', 0))
            stats['by_type'][order_type] = stats['by_type'].get(order_type, 0) + 1
            stats['by_status'][status] = stats['by_status'].get(status, 0) + 1
            stats['amounts']['total'] += amount
            stats['amounts'][order_type] += amount

        return stats

    @staticmethod
    def export_orders_to_dict(orders: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """将订单数据导出为字典格式（用于报表等）"""
        exported_orders = []

        for order in orders:
            exported_order = {
                'id': order['id'],
                'order_number': order.get('order_number', ''),
                'order_type': order['order_type'],
                'customer_supplier': order['customer_supplier'],
                'order_date': order['order_date'],
                'total_amount': float(order.get('total_amount', 0)),
                'shipping_cost': float(order.get('shipping_cost', 0)),
                'status': order.get('status', 'pending'),
                'created_at': order.get('created_at', ''),
                'items': []
            }

            for item in order.get('items', []):
                exported_item = {
                    'product_id': item.get('product_id'),
                    'product_name': item.get('product_name', ''),
                    'description': item.get('description', ''),
                    'quantity': float(item.get('quantity', 0)),
                    'unit_price': float(item.get('unit_price', 0)),
                    'total_price': float(item.get('total_price', 0)),
                    'unit': item.get('unit', '个')
                }
                exported_order['items'].append(exported_item)

            exported_orders.append(exported_order)

        return exported_orders
