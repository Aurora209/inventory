"""箱唛标签页面路由。"""
from flask import Blueprint, render_template


labels_page_bp = Blueprint('labels_page', __name__)


@labels_page_bp.route('/pages/labels.html')
def labels_page():
    return render_template('pages/labels.html')
