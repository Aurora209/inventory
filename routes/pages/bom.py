"""BOM 管理页面路由。"""
from flask import Blueprint, render_template


bom_page_bp = Blueprint('bom_page', __name__)


@bom_page_bp.route('/pages/bom.html')
def bom_page():
    return render_template('pages/bom.html')
