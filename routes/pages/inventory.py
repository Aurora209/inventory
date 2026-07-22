"""库存盘点页面路由。"""
from flask import Blueprint, render_template


inventory_page_bp = Blueprint('inventory_page', __name__)


@inventory_page_bp.route('/pages/inventory.html')
def inventory_page():
    return render_template('pages/inventory.html')
