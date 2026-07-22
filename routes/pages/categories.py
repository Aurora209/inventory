"""分类管理页面路由。"""
from flask import Blueprint, render_template


categories_page_bp = Blueprint('categories_page', __name__)


@categories_page_bp.route('/pages/categories.html')
def categories_page():
    return render_template('pages/categories.html')
