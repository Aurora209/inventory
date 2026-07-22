"""生产计划页面路由。"""
from flask import Blueprint, render_template


production_page_bp = Blueprint('production_page', __name__)


@production_page_bp.route('/pages/production.html')
def production_page():
    return render_template('pages/production.html')
