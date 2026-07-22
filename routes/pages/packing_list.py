"""装箱单页面路由。"""
from flask import Blueprint, render_template


packing_list_page_bp = Blueprint('packing_list_page', __name__)


@packing_list_page_bp.route('/pages/packing-list.html')
def packing_list_page():
    return render_template('pages/packing-list.html')
