from models.product import Product
from models.transaction import Transaction
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

class InventoryService:
    """库存服务"""

    @staticmethod
    def get_dashboard_stats():
        """获取仪表板统计（已优化：使用 SQL 聚合替代 Python 循环）"""
        try:
            # 使用 SQL 聚合直接计算库存总值和低库存数量
            query = '''
                SELECT
                    COUNT(*) as total_products,
                    COALESCE(SUM(quantity * price), 0) as total_inventory_value,
                    COALESCE(SUM(CASE WHEN min_stock > 0 AND quantity <= min_stock THEN 1 ELSE 0 END), 0) as low_stock_count
                FROM products
            '''
            result = Product.execute_query(query)
            if result:
                row = result[0]
                total_products = int(row.get('total_products') or 0)
                total_inventory_value = float(row.get('total_inventory_value') or 0)
                low_stock_count = int(row.get('low_stock_count') or 0)
            else:
                total_products = 0
                total_inventory_value = 0.0
                low_stock_count = 0

            # 今日交易统计
            today_incoming = 0
            today_outgoing = 0
            try:
                incoming, outgoing = Transaction.get_today_stats()
                today_incoming = incoming or 0
                today_outgoing = outgoing or 0
            except Exception as e:
                logger.warning("获取今日交易统计时出错: %s", e)

            return {
                'total_products': total_products,
                'total_inventory_value': total_inventory_value,
                'today_incoming': today_incoming,
                'today_outgoing': today_outgoing,
                'low_stock_count': low_stock_count
            }
        except Exception as e:
            logger.exception("获取仪表板统计时发生未预期的错误: %s", e)
            return {
                'total_products': 0,
                'total_inventory_value': 0,
                'today_incoming': 0,
                'today_outgoing': 0,
                'low_stock_count': 0
            }

    @staticmethod
    def get_stock_alerts():
        """获取库存预警"""
        try:
            products_data = Product.get_all()
            if isinstance(products_data, dict) and 'products' in products_data:
                products = products_data['products']
            else:
                products = products_data

            alerts = []

            if not products:
                return alerts

            for product in products:
                try:
                    quantity = float(product.get('quantity', 0) or 0)
                    min_stock = float(product.get('min_stock', 0) or 0)
                    name = product.get('name', '未知产品')
                    sku = product.get('sku', '')

                    if quantity == 0:
                        status = 'zero'
                        message = '库存为零'
                    elif min_stock > 0 and quantity <= min_stock:
                        status = 'low'
                        message = '库存偏低'
                    else:
                        continue

                    alerts.append({
                        'id': product.get('id', 0) or 0,
                        'product_name': name,
                        'sku': sku,
                        'category_id': product.get('category_id'),
                        'category_name': product.get('category_name', ''),
                        'current_quantity': quantity,
                        'min_stock': min_stock,
                        'status': status,
                        'message': message
                    })
                except (ValueError, TypeError) as e:
                    logger.warning("处理产品预警信息时出错 (产品ID: %s): %s", product.get('id'), e)
                    continue

            return alerts
        except Exception as e:
            logger.exception("获取库存预警时发生未预期的错误: %s", e)
            return []

    @staticmethod
    def calculate_bom_cost(bom_items):
        """计算BOM总成本"""
        if not bom_items:
            return 0

        total_cost = 0
        for item in bom_items:
            try:
                total_cost += float(item.get('item_cost', 0) or 0)
            except (ValueError, TypeError) as e:
                logger.warning("计算BOM项成本时出错: %s", e)
                continue

        return total_cost

    @staticmethod
    def calculate_material_cost_with_shipping(bom_items, total_quantity, shipping_cost=0):
        """计算包含快递费用的物料成本"""
        if not bom_items:
            return []

        total_material_cost = 0
        for item in bom_items:
            try:
                total_material_cost += float(item.get('item_cost', 0) or 0)
            except (ValueError, TypeError) as e:
                logger.warning("计算物料成本时出错: %s", e)
                continue

        if total_material_cost <= 0:
            return bom_items

        shipping_cost_per_unit = shipping_cost / total_material_cost if total_material_cost > 0 else 0

        updated_bom_items = []
        for item in bom_items:
            try:
                updated_item = item.copy()
                item_material_cost = float(item.get('item_cost', 0) or 0)
                allocated_shipping_cost = item_material_cost * shipping_cost_per_unit

                updated_item['shipping_cost'] = allocated_shipping_cost
                updated_item['total_cost_with_shipping'] = item_material_cost + allocated_shipping_cost

                updated_bom_items.append(updated_item)
            except (ValueError, TypeError) as e:
                logger.warning("处理BOM项快递费用时出错: %s", e)
                updated_bom_items.append(item)
                continue

        return updated_bom_items
