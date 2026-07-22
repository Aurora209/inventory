#!/usr/bin/env python3
import os
import sys
import logging

# 添加项目根目录到Python路径
sys.path.append(os.path.join(os.path.dirname(__file__), '..'))

# 初始化日志（确保后续模块导入中使用的日志可用）
from logging_config import setup_logging
setup_logging(debug=False)

from utils.database import init_database
from config import config

logger = logging.getLogger(__name__)

def main():
    """初始化数据目录和数据库"""
    logger.info("正在初始化数据目录和数据库...")
    
    try:
        # 初始化数据库
        init_database()
        logger.info("初始化完成！")
        logger.info("数据库文件位置: %s", config['default'].DATABASE_PATH)
        logger.info("数据目录位置: %s", config['default'].DATA_DIR)
    except Exception as e:
        logger.exception("初始化失败: %s", e)
        sys.exit(1)

if __name__ == '__main__':
    main()