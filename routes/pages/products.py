"""产品管理页面路由。"""
from flask import Blueprint, render_template


products_page_bp = Blueprint('products_page', __name__)


@products_page_bp.route('/pages/products.html')
def products_page():
    return render_template('pages/products.html')
