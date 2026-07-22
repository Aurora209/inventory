from flask import Blueprint, jsonify, request
import logging

from services.inventory_service import InventoryService
from services.category_service import CategoryService
from models.transaction import Transaction
from models.product import Product
from utils.api_response import APIResponse

logger = logging.getLogger(__name__)

dashboard_bp = Blueprint('dashboard', __name__)


def get_limit(default=10, maximum=50):
    """读取列表条数参数。"""
    try:
        value = int(request.args.get('limit', default) or default)
    except (TypeError, ValueError):
        value = default
    return min(max(value, 1), maximum)


@dashboard_bp.route('/dashboard', methods=['GET'])
def get_dashboard():
    """获取仪表板数据"""
    try:
        logger.debug('get_dashboard called')
        stats = InventoryService.get_dashboard_stats()

        return APIResponse.success(
            data={
                'summary': {
                    'total_products': stats.get('total_products', 0),
                    'total_inventory_value': float(stats.get('total_inventory_value', 0)),
                    'today_incoming': stats.get('today_incoming', 0),
                    'today_outgoing': stats.get('today_outgoing', 0),
                    'low_stock_count': stats.get('low_stock_count', 0)
                }
            },
            message='获取仪表板数据成功'
        )
    except Exception as e:
        logger.exception('Error in get_dashboard: %s', e)
        return APIResponse.internal_error('获取仪表板数据失败')

@dashboard_bp.route('/dashboard/alerts', methods=['GET'])
def get_stock_alerts():
    """获取库存预警"""
    try:
        logger.debug('get_stock_alerts called')
        category_id = request.args.get('category_id', '').strip()
        limit = get_limit()
        category_filter = set(CategoryService.get_descendant_ids(category_id)) if category_id else None
        alerts = InventoryService.get_stock_alerts()

        # 调整数据格式以匹配前端期望
        formatted_alerts = []
        for alert in alerts:
            alert_category_id = alert.get('category_id')
            if category_filter and str(alert_category_id) not in category_filter:
                continue
            name = alert.get('product_name', '未知产品')
            sku = alert.get('sku', '')
            quantity = alert.get('current_quantity', 0) or 0
            min_stock = alert.get('min_stock', 0) or 0

            formatted_alert = {
                'id': alert.get('id', 0) or 0,
                'product_name': name,
                'sku': sku,
                'category_id': alert_category_id,
                'category_name': alert.get('category_name', ''),
                'current_quantity': quantity,
                'min_stock': min_stock,
                'status': 'low' if quantity <= min_stock and quantity > 0 else 'zero'
            }
            formatted_alerts.append(formatted_alert)
            if len(formatted_alerts) >= limit:
                break

        return APIResponse.success(
            data={'alerts': formatted_alerts},
            message='获取库存预警成功'
        )
    except Exception as e:
        logger.exception('Error in get_stock_alerts: %s', e)
        return APIResponse.internal_error('获取库存预警失败')

@dashboard_bp.route('/dashboard/transactions', methods=['GET'])
def get_recent_transactions():
    """获取最近交易记录"""
    try:
        logger.debug('get_recent_transactions called')
        category_id = request.args.get('category_id', '').strip()
        transaction_type = request.args.get('type', '').strip()
        limit = get_limit()
        category_filter = CategoryService.get_descendant_ids(category_id) if category_id else None
        type_filter = transaction_type if transaction_type and transaction_type != 'all' else None
        transactions = Transaction.get_recent(limit, category_filter, type_filter)

        # 调整数据格式以匹配前端期望
        formatted_transactions = []
        for transaction in transactions:
            # 获取产品信息
            product = None
            try:
                if transaction.get('product_id'):
                    product = Product.get_by_id(transaction['product_id'])
            except Exception as e:
                logger.warning("获取产品信息失败 (产品ID: %s): %s", transaction.get('product_id'), e)
            
            current_type = transaction.get('transaction_type', '')

            formatted_transaction = {
                'id': transaction.get('id', 0),
                'product_name': product.get('name', '未知产品') if product else transaction.get('product_name', '未知产品'),
                'category_id': transaction.get('category_id') or (product.get('category_id') if product else None),
                'category_name': transaction.get('category_name') or (product.get('category_name', '') if product else ''),
                'transaction_type': current_type,
                'quantity': transaction.get('quantity', 0),
                'transaction_date': transaction.get('transaction_date', '')
            }
            formatted_transactions.append(formatted_transaction)

        return APIResponse.success(
            data={'transactions': formatted_transactions},
            message='获取最近交易记录成功'
        )
    except Exception as e:
        logger.exception('Error in get_recent_transactions: %s', e)
        return APIResponse.internal_error('获取最近交易记录失败')
