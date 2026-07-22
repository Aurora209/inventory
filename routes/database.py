from flask import Blueprint, request
import logging
from utils.backup import backup_database, list_backups, cleanup_old_backups, restore_database
from utils.api_response import APIResponse
import os
from config import config

logger = logging.getLogger(__name__)

database_bp = Blueprint('database', __name__)

@database_bp.route('/database/backup', methods=['POST'])
def create_backup():
    """创建数据库备份"""
    try:
        logger.debug('create_backup called')
        backup_file = backup_database()
        if backup_file:
            return APIResponse.success(
                data={'backup_file': backup_file},
                message='数据库备份创建成功'
            )
        else:
            return APIResponse.internal_error('数据库备份创建失败')
    except Exception as e:
        logger.exception('Error creating backup: %s', e)
        return APIResponse.internal_error()

@database_bp.route('/database/backups', methods=['GET'])
def get_backups():
    """获取备份列表"""
    try:
        logger.debug('get_backups called')
        backups = list_backups()
        return APIResponse.success(data={'backups': backups}, message='获取备份列表成功')
    except Exception as e:
        logger.exception('Error listing backups: %s', e)
        return APIResponse.internal_error()

@database_bp.route('/database/restore', methods=['POST'])
def restore_backup():
    """恢复数据库备份"""
    try:
        logger.debug('restore_backup called')
        data = request.get_json(silent=True) or {}
        backup_file = data.get('backup_file')
        
        if not backup_file:
            return APIResponse.error('备份文件路径不能为空', code=400, error_code='VALIDATION_ERROR')
        
        backup_dir = os.path.abspath(os.path.join(config.DATA_DIR, 'backups'))
        requested_path = os.path.abspath(backup_file)
        if not requested_path.startswith(backup_dir + os.sep):
            return APIResponse.error('备份文件必须位于备份目录内', code=400, error_code='VALIDATION_ERROR')

        if not os.path.exists(requested_path):
            return APIResponse.error('备份文件不存在', code=400, error_code='VALIDATION_ERROR')
        
        if restore_database(requested_path):
            return APIResponse.success(message='数据库恢复成功')
        else:
            logger.error('restore_database returned False for file: %s', requested_path)
            return APIResponse.internal_error('数据库恢复失败')
    except Exception as e:
        logger.exception('Error restoring backup: %s', e)
        return APIResponse.internal_error()

@database_bp.route('/database/cleanup', methods=['POST'])
def cleanup_backups():
    """清理旧备份"""
    try:
        logger.debug('cleanup_backups called')
        data = request.get_json(silent=True) or {}
        try:
            keep_count = int(data.get('keep_count', 10))
        except (TypeError, ValueError):
            return APIResponse.error('保留数量必须是整数', code=400, error_code='VALIDATION_ERROR')
        if keep_count < 0:
            return APIResponse.error('保留数量不能小于0', code=400, error_code='VALIDATION_ERROR')

        cleanup_old_backups(keep_count)
        return APIResponse.success(message=f'备份清理完成，保留最近 {keep_count} 个备份')
    except Exception as e:
        logger.exception('Error cleaning backups: %s', e)
        return APIResponse.internal_error()