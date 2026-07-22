"""仪表板页面路由。"""
from flask import Blueprint, render_template


dashboard_page_bp = Blueprint('dashboard_page', __name__)


@dashboard_page_bp.route('/pages/dashboard.html')
def dashboard_page():
    return render_template('pages/dashboard.html')
