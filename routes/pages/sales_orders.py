"""销售订单页面路由。"""
from flask import Blueprint, render_template


sales_orders_page_bp = Blueprint('sales_orders_page', __name__)


@sales_orders_page_bp.route('/pages/sales-orders.html')
def sales_orders_page():
    return render_template('pages/sales-orders.html')
