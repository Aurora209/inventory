import logging
import re
import random
from models.base import BaseModel
from models.order_item import OrderItem
from models.product import Product
from utils.database import serialize_rows
from datetime import datetime

logger = logging.getLogger(__name__)

_IDENT_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')

def _safe_ident(name: str) -> str:
    if not name or not _IDENT_RE.match(str(name)):
        raise ValueError(f"非法标识符: {name!r}")
    return str(name)


class Order(BaseModel):
    """订单模型"""

    TABLE_NAME = 'orders'

    @classmethod
    def create_table(cls):
        """创建订单表"""
        query = '''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_number TEXT UNIQUE NOT NULL,
                order_type TEXT NOT NULL,
                customer_supplier TEXT NOT NULL,
                order_date DATE NOT NULL,
                total_amount DECIMAL(10,2) DEFAULT 0,
                shipping_cost DECIMAL(10,2) DEFAULT 0,
                status TEXT DEFAULT 'pending',
                notes TEXT,
                seller_name TEXT,
                seller_address TEXT,
                seller_phone TEXT,
                seller_taxNo TEXT,
                seller_note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        '''
        cls.execute_query(query)
        try:
            cols = [r.get('name') for r in cls.execute_query("PRAGMA table_info(orders)")]
            extras = {
                'seller_name': 'TEXT',
                'seller_address': 'TEXT',
                'seller_phone': 'TEXT',
                'seller_taxNo': 'TEXT',
                'seller_note': 'TEXT',
                'shipping_cost': 'DECIMAL(10,2)',
                'status': 'TEXT'
            }
            for col, typ in extras.items():
                if col not in cols:
                    alter_sql = f'ALTER TABLE orders ADD COLUMN {col} {typ}'
                    if col == 'shipping_cost':
                        alter_sql += ' DEFAULT 0'
                    elif col == 'status':
                        alter_sql += " DEFAULT 'pending'"
                    try:
                        cls.execute_query(alter_sql)
                    except Exception:
                        pass
        except Exception:
            pass

    @classmethod
    def get_all(cls, order_type=None, status=None):
        """获取所有订单（已修复 N+1 查询）"""
        query = 'SELECT * FROM orders WHERE 1=1'
        params = []

        if order_type:
            query += ' AND order_type = ?'
            params.append(order_type)

        if status:
            query += ' AND status = ?'
            params.append(status)

        query += ' ORDER BY order_date DESC, created_at DESC'

        rows = cls.execute_query(query, params)
        orders = serialize_rows(rows)

        # 一次性加载所有订单的订单项（修复 N+1）
        if orders:
            order_ids = [o['id'] for o in orders]
            placeholders = ','.join(['?'] * len(order_ids))
            items_query = f'''SELECT oi.*, p.name as product_name, p.sku as product_sku
                FROM order_items oi
                LEFT JOIN products p ON oi.product_id = p.id
                WHERE oi.order_id IN ({placeholders})
                ORDER BY oi.id'''
            all_items = OrderItem.execute_query(items_query, tuple(order_ids))
            items_by_order = {}
            for item in all_items:
                oid = item['order_id']
                items_by_order.setdefault(oid, []).append(item)
            for order in orders:
                order['items'] = items_by_order.get(order['id'], [])

        return orders

    @staticmethod
    def _calculate_item_total(item):
        if item.get('total_price') is not None:
            return float(item.get('total_price') or 0)
        return float(item.get('quantity', 0)) * float(item.get('unit_price', 0))

    @staticmethod
    def _calculate_order_total(items, shipping_cost=0):
        items_total = sum(Order._calculate_item_total(item) for item in (items or []))
        return items_total + float(shipping_cost or 0)

    @classmethod
    def recalculate_totals(cls):
        """按订单明细与运费重算并回填订单总金额。"""
        query = '''
            SELECT o.id,
                   COALESCE(o.shipping_cost, 0) AS shipping_cost,
                   COALESCE(o.total_amount, 0) AS total_amount,
                   COALESCE(SUM(COALESCE(oi.total_price, oi.quantity * oi.unit_price, 0)), 0) AS items_total
            FROM orders o
            LEFT JOIN order_items oi ON oi.order_id = o.id
            GROUP BY o.id
        '''
        rows = cls.execute_query(query)
        updates = []
        for row in rows:
            expected_total = round(float(row.get('items_total') or 0) + float(row.get('shipping_cost') or 0), 2)
            current_total = round(float(row.get('total_amount') or 0), 2)
            if abs(expected_total - current_total) >= 0.01:
                updates.append((expected_total, row['id']))

        if not updates:
            return 0

        from utils.database import get_db_connection
        with get_db_connection() as conn:
            conn.executemany(
                'UPDATE orders SET total_amount = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                updates
            )
            conn.commit()
        return len(updates)

    @classmethod
    def create(cls, order_type, customer_supplier, order_date, total_amount=0, shipping_cost=0, notes=None, items=None, order_number=None, seller_name=None, seller_address=None, seller_phone=None, seller_taxNo=None, seller_note=None, status='pending'):
        """创建订单（已修复订单号重复问题）"""
        if not order_number:
            ts = datetime.now().strftime('%Y%m%d%H%M%S')
            suffix = ''.join(random.choices('abcdefghijklmnopqrstuvwxyz0123456789', k=4))
            order_number = f"ORD{ts}{suffix}"

        if items:
            total_amount = cls._calculate_order_total(items, shipping_cost)

        query = '''
            INSERT INTO orders (order_number, order_type, customer_supplier, order_date, total_amount, shipping_cost, notes, seller_name, seller_address, seller_phone, seller_taxNo, seller_note, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''

        from utils.database import get_db_connection
        with get_db_connection() as conn:
            try:
                cursor = conn.execute(query, (
                    order_number,
                    order_type,
                    customer_supplier,
                    order_date,
                    float(total_amount) if total_amount is not None else 0,
                    float(shipping_cost) if shipping_cost is not None else 0,
                    notes,
                    seller_name,
                    seller_address,
                    seller_phone,
                    seller_taxNo,
                    seller_note,
                    status
                ))
                conn.commit()
                order_id = cursor.lastrowid

                if items:
                    for item in items:
                        quantity = float(item.get('quantity', 1))
                        unit_price = float(item.get('unit_price', 0))
                        total_price = cls._calculate_item_total(item)

                        unit_val = item.get('unit')
                        if not unit_val:
                            try:
                                prod = Product.get_by_id(item.get('product_id')) if item.get('product_id') else None
                                unit_val = prod.get('unit') if prod and prod.get('unit') else '个'
                            except Exception:
                                unit_val = '个'

                        item_query = '''
                            INSERT INTO order_items
                            (order_id, product_id, description, quantity, unit_price, total_price, unit, units_per_box, packaging, notes)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        '''
                        conn.execute(item_query, (
                            order_id,
                            item.get('product_id'),
                            item.get('description', ''),
                            quantity,
                            unit_price,
                            total_price,
                            unit_val,
                            item.get('units_per_box', 1),
                            item.get('packaging'),
                            item.get('notes', '')
                        ))

                conn.commit()

                created_order = cls.get_by_id(order_id)
                try:
                    logger.info("新建订单(ID=%s)项单位: %s", order_id, [it.get('unit') for it in created_order.get('items', [])])
                except Exception:
                    logger.debug("无法记录新建订单的项单位")

                return created_order

            except Exception as e:
                conn.rollback()
                raise e

    @classmethod
    def update(cls, order_id, **kwargs):
        """更新订单及其订单项（已修复列名校验）"""
        items = kwargs.pop('items', None)
        if items is not None:
            kwargs['total_amount'] = cls._calculate_order_total(items, kwargs.get('shipping_cost', 0))

        # 校验列名
        safe_set_parts = []
        values = []
        for key in kwargs.keys():
            safe_key = cls._safe_col(key)
            safe_set_parts.append(f"{safe_key} = ?")
            values.append(kwargs[key])
        values.append(order_id)

        safe_table = _safe_ident(cls.TABLE_NAME)
        query = f'UPDATE {safe_table} SET {", ".join(safe_set_parts)} WHERE id = ?'

        from utils.database import get_db_connection
        with get_db_connection() as conn:
            try:
                conn.execute(query, values)

                if items is not None:
                    conn.execute('DELETE FROM order_items WHERE order_id = ?', (order_id,))

                    for item in items:
                        quantity = float(item.get('quantity', 1))
                        unit_price = float(item.get('unit_price', 0))
                        total_price = cls._calculate_item_total(item)

                        unit_val = item.get('unit')
                        if not unit_val:
                            try:
                                prod = Product.get_by_id(item.get('product_id')) if item.get('product_id') else None
                                unit_val = prod.get('unit') if prod and prod.get('unit') else '个'
                            except Exception:
                                unit_val = '个'

                        item_query = '''
                            INSERT INTO order_items
                            (order_id, product_id, description, quantity, unit_price, total_price, unit, units_per_box, packaging, notes)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        '''
                        conn.execute(item_query, (
                            order_id,
                            item.get('product_id'),
                            item.get('description', ''),
                            quantity,
                            unit_price,
                            total_price,
                            unit_val,
                            item.get('units_per_box', 1),
                            item.get('packaging'),
                            item.get('notes', '')
                        ))

                conn.commit()

                updated = cls.get_by_id(order_id)
                try:
                    logger.info("更新订单(ID=%s)后项单位: %s", order_id, [it.get('unit') for it in updated.get('items', [])])
                except Exception:
                    logger.debug("无法记录更新订单的项单位")

                return updated

            except Exception as e:
                conn.rollback()
                raise e

    @classmethod
    def get_by_id(cls, order_id):
        """根据ID获取订单及其关联的产品信息"""
        query = 'SELECT * FROM orders WHERE id = ?'
        rows = cls.execute_query(query, (order_id,))
        order = serialize_rows(rows)[0] if rows else None

        if order:
            order['items'] = OrderItem.get_by_order_id(order_id)

        return order

    @classmethod
    def delete(cls, order_id):
        """删除订单（已修复回滚逻辑：按 order_type 决定方向）"""
        existing = cls.get_by_id(order_id)
        if not existing:
            raise ValueError('订单不存在')

        order_number = existing.get('order_number', '')
        order_type = existing.get('order_type', '')

        from utils.database import get_db_connection

        with get_db_connection() as conn:
            try:
                if order_number:
                    transaction_rows = conn.execute(
                        """
                        SELECT product_id, transaction_type, quantity
                        FROM transactions
                        WHERE TRIM(COALESCE(reference_no, '')) = TRIM(?)
                        """,
                        (str(order_number),)
                    ).fetchall()

                    for row in transaction_rows:
                        product_id = row['product_id']
                        quantity = float(row['quantity'] or 0)
                        if not product_id or quantity <= 0:
                            continue

                        # 按订单类型决定回滚方向
                        if order_type == 'purchase':
                            quantity_change = -quantity
                        elif order_type == 'sales':
                            quantity_change = quantity
                        else:
                            continue

                        conn.execute(
                            'UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            (float(quantity_change), int(product_id))
                        )

                    conn.execute(
                        "DELETE FROM transactions WHERE TRIM(COALESCE(reference_no, '')) = TRIM(?)",
                        (str(order_number),)
                    )

                conn.execute('DELETE FROM order_items WHERE order_id = ?', (order_id,))
                cursor = conn.execute('DELETE FROM orders WHERE id = ?', (order_id,))
                conn.commit()
                return cursor.rowcount
            except Exception as e:
                conn.rollback()
                raise e
