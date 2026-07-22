#!/usr/bin/env python3
import os
import sys

from logging import getLogger
from logging import Logger

from logging_config import setup_logging

# 确保项目路径在 Python 路径中
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

# 模块级 app 对象，供 gunicorn 导入 (run:app)
app = None


def create_app_instance():
    """创建并返回 Flask 应用实例"""
    global app
    if app is None:
        os.environ.setdefault('FLASK_CONFIG', 'production')
        setup_logging(debug=False)
        from app import create_app as _create_app
        app = _create_app()
    return app


if __name__ == '__main__':
    # 设置环境变量
    os.environ.setdefault('FLASK_CONFIG', 'production')

    # 初始化日志
    debug_mode = os.environ.get('FLASK_DEBUG', '0') in ('1', 'true', 'True') or os.environ.get('FLASK_CONFIG') == 'development'
    setup_logging(debug=debug_mode)

    logger: Logger = getLogger(__name__)
    logger.info("=== 开始启动Flask应用 ===")
    logger.info("当前工作目录: %s", os.getcwd())
    logger.info("Python路径: %s", sys.path)

    try:
        logger.info("正在创建Flask应用实例...")
        flask_app = create_app_instance()

        logger.info("=== Flask应用创建成功 ===")
        logger.info("应用名称: %s", flask_app.name)
        logger.info("调试模式: %s", flask_app.config['DEBUG'])
        logger.info("数据库文件位置: %s", flask_app.config['DATABASE_PATH'])
        logger.info("API前缀: %s", flask_app.config.get('API_PREFIX', '/api'))

        host = os.environ.get('FLASK_RUN_HOST', '0.0.0.0')
        port = int(os.environ.get('FLASK_RUN_PORT', '5001'))
        display_host = '127.0.0.1' if host in ('0.0.0.0', '::') else host
        logger.info("服务将启动在: http://%s:%s", display_host, port)

        # 打印所有注册的路由
        logger.info("已注册的路由:")
        has_routes = False
        for rule in flask_app.url_map.iter_rules():
            if not rule.rule.startswith('/static/'):
                logger.info("  %s -> %s [%s]", rule.rule, rule.endpoint, ', '.join(rule.methods))
                has_routes = True
        if not has_routes:
            logger.warning("  警告: 没有找到任何路由!")

        logger.info("=" * 50)
        logger.info("按 Ctrl+C 停止服务")

        # 在 Windows 上禁用重载器
        logger.info("启动Flask开发服务器...")
        flask_app.run(host=host, port=port, debug=flask_app.config['DEBUG'], use_reloader=False)

    except ImportError as e:
        logger.exception("导入错误: %s", e)
        logger.error("可能的原因:\n1. 依赖包未安装 - 请运行: pip install -r requirements.txt\n2. Python路径问题\n3. 文件不存在或路径错误")
        input("按回车键退出...")

    except Exception as e:
        logger.exception("启动失败: %s", e)
        input("按回车键退出...")
