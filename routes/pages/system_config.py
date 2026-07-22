"""系统配置页面路由。"""
from flask import Blueprint, render_template


system_config_page_bp = Blueprint('system_config_page', __name__)


@system_config_page_bp.route('/pages/system-config.html')
def system_config_page():
    return render_template('pages/system-config.html')
