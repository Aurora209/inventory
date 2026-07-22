"""汇率工具页面路由。"""
from flask import Blueprint, render_template


exchange_rate_page_bp = Blueprint('exchange_rate_page', __name__)


@exchange_rate_page_bp.route('/pages/exchange-rate.html')
def exchange_rate_page():
    return render_template('pages/exchange-rate.html')
