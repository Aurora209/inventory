import os
import shutil
import sqlite3
import datetime
import logging
from contextlib import closing

from config import config
from utils.database import db_manager

logger = logging.getLogger(__name__)


def _ensure_backup_dir():
    backup_dir = os.path.join(config.DATA_DIR, 'backups')
    os.makedirs(backup_dir, exist_ok=True)
    return backup_dir


def backup_database():
    """备份数据库文件。

    使用 SQLite backup API，从当前在线数据库连接生成一致性快照，
    兼容 WAL 模式，避免仅复制主数据库文件导致遗漏 wal 中未 checkpoint 的数据。
    """
    try:
        if not os.path.exists(config.DATABASE_PATH):
            logger.info("数据库文件不存在，无需备份")
            return None

        backup_dir = _ensure_backup_dir()
        timestamp = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_file = os.path.join(backup_dir, f'inventory_backup_{timestamp}.db')

        with db_manager.get_connection() as source_conn:
            try:
                source_conn.execute('PRAGMA wal_checkpoint(PASSIVE)')
            except Exception:
                logger.debug('WAL checkpoint skipped', exc_info=True)

            with closing(sqlite3.connect(backup_file)) as dest_conn:
                source_conn.backup(dest_conn)
                dest_conn.commit()

        logger.info("数据库备份完成: %s", backup_file)
        return backup_file

    except Exception as e:
        logger.error("数据库备份失败: %s", e, exc_info=True)
        return None


def restore_database(backup_file):
    """恢复数据库文件。"""
    try:
        if not os.path.exists(backup_file):
            logger.warning("备份文件不存在: %s", backup_file)
            return False

        config.ensure_data_dir()

        db_manager.close_all_connections()

        for suffix in ('', '-wal', '-shm'):
            target = f"{config.DATABASE_PATH}{suffix}"
            if suffix == '':
                shutil.copy2(backup_file, target)
            elif os.path.exists(target):
                os.remove(target)

        db_manager.reset_pool()
        logger.info("数据库恢复完成: %s", config.DATABASE_PATH)
        return True

    except Exception as e:
        logger.error("数据库恢复失败: %s", e, exc_info=True)
        try:
            db_manager.reset_pool()
        except Exception:
            logger.debug('failed to reset pool after restore failure', exc_info=True)
        return False


def list_backups():
    """列出所有备份文件"""
    backup_dir = os.path.join(config.DATA_DIR, 'backups')
    if not os.path.exists(backup_dir):
        return []

    backups = []
    for file in os.listdir(backup_dir):
        if file.startswith('inventory_backup_') and file.endswith('.db'):
            file_path = os.path.join(backup_dir, file)
            file_time = os.path.getmtime(file_path)
            backups.append({
                'filename': file,
                'path': file_path,
                'size': os.path.getsize(file_path),
                'created_time': datetime.datetime.fromtimestamp(file_time)
            })

    backups.sort(key=lambda x: x['created_time'], reverse=True)
    return backups


def cleanup_old_backups(keep_count=10):
    """清理旧的备份文件，只保留指定数量的最新备份"""
    backups = list_backups()
    if len(backups) <= keep_count:
        return

    for backup in backups[keep_count:]:
        try:
            os.remove(backup['path'])
            logger.info("删除旧备份: %s", backup['filename'])
        except Exception as e:
            logger.error("删除备份文件失败 %s: %s", backup['filename'], e)
