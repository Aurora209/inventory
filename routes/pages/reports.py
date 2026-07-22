"""报表中心页面路由。"""
from flask import Blueprint, render_template


reports_page_bp = Blueprint('reports_page', __name__)


@reports_page_bp.route('/pages/reports.html')
def reports_page():
    return render_template('pages/reports.html')
