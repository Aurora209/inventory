"""订单兼容入口页面路由。"""
from flask import Blueprint, render_template


orders_page_bp = Blueprint('orders_page', __name__)


@orders_page_bp.route('/pages/orders.html')
def orders_page():
    return render_template('pages/purchase-orders.html')
