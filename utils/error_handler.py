"""统一错误处理工具"""
from functools import wraps
from flask import jsonify, request
import logging
from typing import Callable, Any
from utils.api_response import APIResponse

logger = logging.getLogger(__name__)

class AppError(Exception):
    """应用错误基类"""
    def __init__(self, message: str, status_code: int = 400, error_code: str = None):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code

class ValidationError(AppError):
    """数据验证错误"""
    def __init__(self, message: str, field: str = None):
        super().__init__(message, 400, 'VALIDATION_ERROR')
        self.field = field

class NotFoundError(AppError):
    """资源未找到错误"""
    def __init__(self, message: str):
        super().__init__(message, 404, 'NOT_FOUND')

class DatabaseError(AppError):
    """数据库错误"""
    def __init__(self, message: str):
        super().__init__(message, 500, 'DATABASE_ERROR')

def handle_api_errors(func: Callable) -> Callable:
    """API错误处理装饰器"""
    @wraps(func)
    def wrapper(*args, **kwargs) -> Any:
        try:
            return func(*args, **kwargs)
        except ValidationError as e:
            logger.warning("验证错误: %s", e.message)
            return APIResponse.error(
                message=e.message,
                code=e.status_code,
                error_code=e.error_code,
                details={'field': e.field} if e.field else None
            )
        except NotFoundError as e:
            logger.warning("资源未找到: %s", e.message)
            return APIResponse.error(
                message=e.message,
                code=e.status_code,
                error_code=e.error_code
            )
        except DatabaseError as e:
            logger.error("数据库错误: %s", e.message)
            return APIResponse.error(
                message="数据库操作失败",
                code=500,
                error_code='DATABASE_ERROR'
            )
        except Exception as e:
            logger.exception("未处理的异常: %s", e)
            return APIResponse.error(
                message="服务器内部错误",
                code=500,
                error_code='INTERNAL_ERROR'
            )
    
    return wrapper

def validate_required_fields(*required_fields: str) -> Callable:
    """验证必需字段装饰器"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            data = request.get_json() or {}
            missing_fields = []
            
            for field in required_fields:
                if field not in data or data[field] in (None, ""):
                    missing_fields.append(field)
            
            if missing_fields:
                raise ValidationError(
                    f"缺少必需字段: {', '.join(missing_fields)}",
                    field=missing_fields[0] if len(missing_fields) == 1 else None
                )
            
            return func(*args, **kwargs)
        return wrapper
    return decorator

def validate_field_type(field: str, expected_type: type, optional: bool = False) -> Callable:
    """验证字段类型装饰器"""
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            data = request.get_json() or {}
            
            if field in data and data[field] is not None:
                try:
                    if expected_type == int:
                        data[field] = int(data[field])
                    elif expected_type == float:
                        data[field] = float(data[field])
                    elif expected_type == bool:
                        if isinstance(data[field], str):
                            data[field] = data[field].lower() in ('true', '1', 'yes')
                except (ValueError, TypeError):
                    raise ValidationError(
                        f"字段 '{field}' 类型错误，期望 {expected_type.__name__}",
                        field=field
                    )
            elif not optional:
                raise ValidationError(f"字段 '{field}' 不能为空", field=field)
            
            # 更新请求数据
            request._cached_json = data
            return func(*args, **kwargs)
        return wrapper
    return decorator