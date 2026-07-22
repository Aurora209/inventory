"""首页路由。"""
from flask import Blueprint, render_template


index_page_bp = Blueprint('index_page', __name__)


@index_page_bp.route('/')
def index():
    return render_template('pages/dashboard.html')
