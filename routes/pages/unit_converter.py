"""单位换算页面路由。"""
from flask import Blueprint, render_template


unit_converter_page_bp = Blueprint('unit_converter_page', __name__)


@unit_converter_page_bp.route('/pages/unit-converter.html')
def unit_converter_page():
    return render_template('pages/unit-converter.html')
