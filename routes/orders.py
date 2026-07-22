"""订单相关路由。"""
from flask import Blueprint, request, current_app
import logging
from models.order import Order
from services.order_service import OrderService
from utils.api_response import APIResponse
from utils.error_handler import handle_api_errors, validate_required_fields
from utils.validators import OrderValidator, DataValidator

logger = logging.getLogger(__name__)

orders_bp = Blueprint('orders', __name__)

@orders_bp.route('/orders', methods=['GET'])
@handle_api_errors
def get_orders():
    """获取订单列表"""
    logger.debug("获取订单列表请求: %s", dict(request.args))
    
    order_type = request.args.get('order_type', '').strip() or None
    status = request.args.get('status', '').strip() or None
    search = request.args.get('search', '').strip().lower() or None
    page = DataValidator.validate_integer(request.args.get('page', 1), 'page', min_value=1)
    per_page = DataValidator.validate_integer(request.args.get('per_page', 20), 'per_page', min_value=1, max_value=100)
    
    # 验证订单类型
    if order_type and order_type not in ['purchase', 'sales']:
        return APIResponse.error("订单类型必须是 'purchase' 或 'sales'")
    
    # 验证状态
    if status and status not in ['pending', 'completed', 'cancelled']:
        return APIResponse.error("订单状态无效")
    
    # 获取订单数据
    orders = Order.get_all(
        order_type=order_type,
        status=status
    )
    
    if search:
        orders = [
            o for o in orders
            if search in str(o.get('order_number', '')).lower()
            or search in str(o.get('customer_supplier', '')).lower()
        ]

    # 手动分页（因为原方法不支持分页）
    total = len(orders)
    start_idx = (page - 1) * per_page
    end_idx = start_idx + per_page
    paginated_orders = orders[start_idx:end_idx]
    
    return APIResponse.paginated(
        data=paginated_orders,
        total=total,
        page=page,
        per_page=per_page,
        message="获取订单列表成功"
    )

@orders_bp.route('/orders', methods=['POST'])
@handle_api_errors
@validate_required_fields('order_type', 'customer_supplier', 'order_date')
def create_order():
    """创建订单"""
    logger.info("创建订单请求")
    data = request.get_json()
    
    if not data:
        return APIResponse.error("请求数据不能为空")
    
    current_app.logger.info("收到创建订单请求: %s", data)
    
    # 委托到 OrderService 处理创建、完成状态交易和库存同步，确保写入在同一事务内完成
    order = OrderService.create_order(data)
    
    logger.info("订单创建成功: ID=%s, 订单号=%s", order['id'], order.get('order_number'))
    return APIResponse.created(
        data=order,
        message="订单创建成功",
        location=f"/api/orders/{order['id']}"
    )

@orders_bp.route('/orders/<int:order_id>', methods=['GET'])
@handle_api_errors
def get_order(order_id):
    """获取单个订单详情"""
    logger.debug("获取订单详情: ID=%s", order_id)
    
    DataValidator.validate_integer(order_id, 'order_id', min_value=1)
    
    order = Order.get_by_id(order_id)
    if not order:
        return APIResponse.not_found("订单不存在")
    
    return APIResponse.success(
        data=order,
        message="获取订单详情成功"
    )

@orders_bp.route('/orders/<int:order_id>', methods=['PUT'])
@handle_api_errors
def update_order(order_id):
    """更新订单"""
    logger.info("更新订单请求: ID=%s", order_id)
    data = request.get_json()
    
    DataValidator.validate_integer(order_id, 'order_id', min_value=1)
    
    if not data:
        return APIResponse.error("请求数据不能为空")
    
    current_app.logger.info("更新订单 %s: %s", order_id, data)
    
    # 委托到 OrderService 处理更新逻辑
    order = OrderService.update_order(order_id, data)
    
    logger.info("订单更新成功: ID=%s", order_id)
    return APIResponse.success(
        data=order,
        message="订单更新成功"
    )

def _delete_order_by_id(order_id):
    """删除订单的共享处理逻辑。"""
    logger.info("删除订单请求: ID=%s", order_id)

    DataValidator.validate_integer(order_id, 'order_id', min_value=1)

    result = Order.delete(order_id)

    logger.info("订单删除成功: ID=%s", order_id)
    return APIResponse.success(
        data={'deleted_count': result},
        message="订单删除成功"
    )

@orders_bp.route('/orders/<int:order_id>', methods=['DELETE'])
@handle_api_errors
def delete_order(order_id):
    """删除订单"""
    return _delete_order_by_id(order_id)

@orders_bp.route('/orders/<int:order_id>/delete', methods=['POST'])
@handle_api_errors
def post_delete_order(order_id):
    """删除订单（POST 兼容端点，供前端在 DELETE 被环境拦截时使用）。"""
    return _delete_order_by_id(order_id)

@orders_bp.route('/orders/<int:order_id>/complete', methods=['POST'])
@handle_api_errors
def complete_order(order_id):
    """完成订单"""
    logger.info("完成订单请求: ID=%s", order_id)
    
    DataValidator.validate_integer(order_id, 'order_id', min_value=1)
    
    # 获取订单
    order = Order.get_by_id(order_id)
    if not order:
        return APIResponse.not_found("订单不存在")
    
    if order['status'] == 'completed':
        return APIResponse.error("订单已经是完成状态")
    
    # 更新订单状态为完成
    updated_order = OrderService.update_order(order_id, {'status': 'completed'})
    
    logger.info("订单完成成功: ID=%s", order_id)
    return APIResponse.success(
        data=updated_order,
        message="订单完成成功"
    )

@orders_bp.route('/orders/<int:order_id>/cancel', methods=['POST'])
@handle_api_errors
def cancel_order(order_id):
    """取消订单"""
    logger.info("取消订单请求: ID=%s", order_id)
    
    DataValidator.validate_integer(order_id, 'order_id', min_value=1)
    
    # 获取订单
    order = Order.get_by_id(order_id)
    if not order:
        return APIResponse.not_found("订单不存在")
    
    if order['status'] == 'cancelled':
        return APIResponse.error("订单已经是取消状态")
    
    # 更新订单状态为取消
    updated_order = OrderService.update_order(order_id, {'status': 'cancelled'})
    
    logger.info("订单取消成功: ID=%s", order_id)
    return APIResponse.success(
        data=updated_order,
        message="订单取消成功"
    )

@orders_bp.route('/orders/stats', methods=['GET'])
@handle_api_errors
def get_order_stats():
    """获取订单统计"""
    logger.debug("获取订单统计请求")
    
    # 获取所有订单
    all_orders = Order.get_all()
    
    # 计算统计信息
    total_orders = len(all_orders)
    purchase_orders = [o for o in all_orders if o['order_type'] == 'purchase']
    sales_orders = [o for o in all_orders if o['order_type'] == 'sales']
    
    pending_orders = [o for o in all_orders if o['status'] == 'pending']
    completed_orders = [o for o in all_orders if o['status'] == 'completed']
    cancelled_orders = [o for o in all_orders if o['status'] == 'cancelled']
    purchase_pending_orders = [o for o in purchase_orders if o['status'] == 'pending']
    purchase_completed_orders = [o for o in purchase_orders if o['status'] == 'completed']
    purchase_cancelled_orders = [o for o in purchase_orders if o['status'] == 'cancelled']
    sales_pending_orders = [o for o in sales_orders if o['status'] == 'pending']
    sales_completed_orders = [o for o in sales_orders if o['status'] == 'completed']
    sales_cancelled_orders = [o for o in sales_orders if o['status'] == 'cancelled']
    
    total_amount = sum(float(o.get('total_amount', 0)) for o in all_orders)
    purchase_amount = sum(float(o.get('total_amount', 0)) for o in purchase_orders)
    sales_amount = sum(float(o.get('total_amount', 0)) for o in sales_orders)
    
    stats = {
        'total_orders': total_orders,
        'purchase_orders': len(purchase_orders),
        'sales_orders': len(sales_orders),
        'pending_orders': len(pending_orders),
        'completed_orders': len(completed_orders),
        'cancelled_orders': len(cancelled_orders),
        'purchase_pending_orders': len(purchase_pending_orders),
        'purchase_completed_orders': len(purchase_completed_orders),
        'purchase_cancelled_orders': len(purchase_cancelled_orders),
        'sales_pending_orders': len(sales_pending_orders),
        'sales_completed_orders': len(sales_completed_orders),
        'sales_cancelled_orders': len(sales_cancelled_orders),
        'total_amount': float(total_amount),
        'purchase_amount': float(purchase_amount),
        'sales_amount': float(sales_amount)
    }
    
    return APIResponse.success(
        data=stats,
        message="获取订单统计成功"
    )
