from flask import Blueprint, request
import logging
from datetime import datetime
from utils.api_response import APIResponse
from utils.database import get_db_connection

logger = logging.getLogger(__name__)

inventory_bp = Blueprint('inventory', __name__)

@inventory_bp.route('/inventory/check', methods=['POST'])
def inventory_check():
    """库存盘点"""
    try:
        logger.debug('inventory_check called')
        data = request.get_json(silent=True) or {}
        items = data.get('items', [])

        if not isinstance(items, list) or not items:
            logger.warning('盘点项目为空')
            return APIResponse.error('盘点项目不能为空', code=400, error_code='VALIDATION_ERROR')
        
        check_results = []
        with get_db_connection() as conn:
            try:
                for item in items:
                    if not isinstance(item, dict):
                        return APIResponse.error('盘点项目格式错误', code=400, error_code='VALIDATION_ERROR')

                    product_id = item.get('product_id')
                    submitted_system_quantity = item.get('system_quantity')
                    actual_quantity = item.get('actual_quantity')
                    
                    if product_id is None or actual_quantity is None:
                        continue
                    
                    try:
                        product_id = int(product_id)
                        actual_quantity = float(actual_quantity)
                    except (TypeError, ValueError):
                        return APIResponse.error('实际库存数量必须为数字', code=400, error_code='VALIDATION_ERROR')
                    
                    # 更新产品库存：以后端当前库存为准，避免前端显示值过期导致盘点不生效或重复累加
                    product = conn.execute('SELECT id, quantity, price FROM products WHERE id = ?', (product_id,)).fetchone()
                    if product:
                        system_quantity = float(product['quantity'] or 0)
                        adjust_quantity = actual_quantity - system_quantity
                        
                        # 如果有差异，创建调整交易记录并按差额更新库存；两步必须在同一事务内完成。
                        if adjust_quantity != 0:
                            transaction_type = 'in' if adjust_quantity > 0 else 'out'
                            abs_quantity = abs(adjust_quantity)
                            unit_price = float(product['price'] or 0)
                            now = datetime.now()
                            conn.execute(
                                '''
                                INSERT INTO transactions (product_id, transaction_type, quantity, unit_price, total_value,
                                                          reference_no, transaction_date, notes)
                                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                                ''',
                                (
                                    product_id,
                                    transaction_type,
                                    abs_quantity,
                                    unit_price,
                                    abs_quantity * unit_price,
                                    f'CHECK-{now.strftime("%Y%m%d%H%M%S")}',
                                    now.strftime('%Y-%m-%d'),
                                    f'库存盘点调整: 系统数量 {system_quantity}, 实际数量 {actual_quantity}'
                                )
                            )
                            conn.execute(
                                'UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                                (adjust_quantity, product_id)
                            )
                        
                        check_results.append({
                            'product_id': product_id,
                            'submitted_system_quantity': submitted_system_quantity,
                            'system_quantity': system_quantity,
                            'actual_quantity': actual_quantity,
                            'difference': adjust_quantity
                        })
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        
        return APIResponse.success(
            data={'results': check_results},
            message='库存盘点完成'
        )

    except Exception as e:
        logger.exception('Error in inventory_check: %s', e)
        return APIResponse.internal_error()
