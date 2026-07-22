"""Flask 应用入口与应用工厂。"""
from flask import Flask, jsonify
from flask_cors import CORS
from werkzeug.exceptions import HTTPException
import os
import logging

# 加载项目配置
from config import config, config_dict_legacy
from utils.api_response import APIResponse

def create_app(config_name=None):
    app = Flask(__name__, template_folder='templates', static_folder='static')

    # 初始化日志配置
    try:
        from logging_config import setup_logging
        setup_logging(False)
    except Exception:
        pass

    # 根据环境变量或参数选择配置
    if not config_name:
        config_name = os.getenv('FLASK_CONFIG', 'production')
    
    # 根据环境名称加载配置
    if config_name in ['development', 'production', 'testing']:
        selected_config = config_dict_legacy[config_name]
    else:
        selected_config = config_dict_legacy['production']
    app.config.from_object(selected_config)

    # 使用配置中的 DEBUG 值设置日志
    try:
        from logging_config import setup_logging
        setup_logging(app.config.get('DEBUG', False))
    except Exception as e:
        logging.getLogger(__name__).warning(f"无法加载日志配置: {e}")

    # 确保当前环境的数据和日志目录存在
    selected_config.ensure_data_dir()

    # 初始化扩展
    cors_origins = app.config.get('CORS_ORIGINS', '*')
    if isinstance(cors_origins, str) and cors_origins != '*':
        cors_origins = [origin.strip() for origin in cors_origins.split(',') if origin.strip()]
    CORS(app, resources={r"/api/*": {"origins": cors_origins}})

    # 注册路由
    from routes.categories import categories_bp
    from routes.products import products_bp
    from routes.bom import bom_bp
    from routes.dashboard import dashboard_bp
    from routes.orders import orders_bp
    from routes.production import production_bp
    from routes.transactions import transactions_bp
    from routes.inventory import inventory_bp
    from routes.reports import reports_bp
    from routes.database import database_bp
    from routes.exchange_rates import exchange_rates_bp
    from routes.pages import register_page_routes
    
    app.register_blueprint(categories_bp, url_prefix='/api')
    app.register_blueprint(products_bp, url_prefix='/api')
    app.register_blueprint(bom_bp, url_prefix='/api')
    app.register_blueprint(dashboard_bp, url_prefix='/api')
    app.register_blueprint(orders_bp, url_prefix='/api')
    app.register_blueprint(production_bp, url_prefix='/api')
    app.register_blueprint(transactions_bp, url_prefix='/api')
    app.register_blueprint(inventory_bp, url_prefix='/api')
    app.register_blueprint(reports_bp, url_prefix='/api')
    app.register_blueprint(database_bp, url_prefix='/api')
    app.register_blueprint(exchange_rates_bp, url_prefix='/api')
    register_page_routes(app)

    # 初始化数据库
    try:
        from utils.database import init_database
        init_database()
        logging.getLogger(__name__).info("数据库初始化完成")
    except Exception as e:
        logging.getLogger(__name__).error(f"数据库初始化失败: {e}")
    
    # 错误处理
    @app.errorhandler(HTTPException)
    def handle_http_exception(error):
        return APIResponse.error(
            message=error.description or '请求处理失败',
            code=error.code or 500,
            error_code=error.name.upper().replace(' ', '_') if getattr(error, 'name', None) else 'HTTP_ERROR'
        )

    @app.errorhandler(Exception)
    def handle_unexpected_exception(error):
        logging.getLogger(__name__).exception("未处理异常: %s", error)
        return APIResponse.internal_error()
    
    # 健康检查
    @app.route('/health')
    def health_check():
        return jsonify({
            'status': 'healthy',
            'message': '库存管理系统API运行正常'
        })
    
    return app

if __name__ == '__main__':
    app = create_app()
    
    app.run(
        host=os.environ.get('FLASK_RUN_HOST', '0.0.0.0'),
        port=int(os.environ.get('FLASK_RUN_PORT', '5001')),
        debug=app.config['DEBUG'],
        use_reloader=False
    )
