"""采购订单页面路由。"""
from flask import Blueprint, render_template


purchase_orders_page_bp = Blueprint('purchase_orders_page', __name__)


@purchase_orders_page_bp.route('/pages/purchase-orders.html')
def purchase_orders_page():
    return render_template('pages/purchase-orders.html')
