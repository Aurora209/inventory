"""页面路由注册入口。"""
from routes.pages.bom import bom_page_bp
from routes.pages.categories import categories_page_bp
from routes.pages.dashboard import dashboard_page_bp
from routes.pages.exchange_rate import exchange_rate_page_bp
from routes.pages.index import index_page_bp
from routes.pages.inventory import inventory_page_bp
from routes.pages.labels import labels_page_bp
from routes.pages.orders import orders_page_bp
from routes.pages.packing_list import packing_list_page_bp
from routes.pages.production import production_page_bp
from routes.pages.products import products_page_bp
from routes.pages.purchase_orders import purchase_orders_page_bp
from routes.pages.reports import reports_page_bp
from routes.pages.sales_orders import sales_orders_page_bp
from routes.pages.system_config import system_config_page_bp
from routes.pages.unit_converter import unit_converter_page_bp


PAGE_BLUEPRINTS = (
    index_page_bp,
    system_config_page_bp,
    orders_page_bp,
    purchase_orders_page_bp,
    sales_orders_page_bp,
    packing_list_page_bp,
    labels_page_bp,
    dashboard_page_bp,
    products_page_bp,
    categories_page_bp,
    inventory_page_bp,
    bom_page_bp,
    production_page_bp,
    reports_page_bp,
    exchange_rate_page_bp,
    unit_converter_page_bp,
)


def register_page_routes(app):
    """注册前端页面路由。"""
    for blueprint in PAGE_BLUEPRINTS:
        app.register_blueprint(blueprint)
