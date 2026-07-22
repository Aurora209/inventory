"""统一API响应格式"""
from flask import jsonify
from datetime import datetime
from typing import Any, Dict, List, Optional, Union

class APIResponse:
    """API响应工具类"""
    
    @staticmethod
    def success(
        data: Optional[Union[Dict, List, Any]] = None,
        message: str = "操作成功",
        meta: Optional[Dict] = None
    ) -> tuple:
        """成功响应"""
        response = {
            'success': True,
            'message': message,
            'data': data,
            'timestamp': datetime.now().isoformat()
        }
        
        if meta:
            response['meta'] = meta
            
        return jsonify(response)
    
    @staticmethod
    def created(
        data: Optional[Union[Dict, List, Any]] = None,
        message: str = "创建成功",
        location: Optional[str] = None
    ) -> tuple:
        """创建成功响应"""
        response = {
            'success': True,
            'message': message,
            'data': data,
            'timestamp': datetime.now().isoformat()
        }
        
        headers = {}
        if location:
            headers['Location'] = location
            
        return jsonify(response), 201, headers
    
    @staticmethod
    def paginated(
        data: List,
        total: int,
        page: int,
        per_page: int,
        message: str = "获取成功"
    ) -> tuple:
        """分页响应"""
        total_pages = (total + per_page - 1) // per_page if per_page > 0 else 1
        
        meta = {
            'pagination': {
                'total': total,
                'count': len(data),
                'per_page': per_page,
                'current_page': page,
                'total_pages': total_pages,
                'has_next': page < total_pages,
                'has_prev': page > 1
            }
        }
        
        return APIResponse.success(data, message, meta)
    
    @staticmethod
    def error(
        message: str = "操作失败",
        code: int = 400,
        error_code: Optional[str] = None,
        details: Optional[Dict] = None
    ) -> tuple:
        """错误响应"""
        response = {
            'success': False,
            'error': {
                'message': message,
                'code': error_code,
                'timestamp': datetime.now().isoformat()
            }
        }
        
        if details:
            response['error']['details'] = details
            
        return jsonify(response), code
    
    @staticmethod
    def validation_error(errors: Dict[str, List[str]]) -> tuple:
        """验证错误响应"""
        return APIResponse.error(
            message="数据验证失败",
            code=422,
            error_code="VALIDATION_FAILED",
            details={'errors': errors}
        )
    
    @staticmethod
    def not_found(message: str = "资源未找到") -> tuple:
        """未找到响应"""
        return APIResponse.error(
            message=message,
            code=404,
            error_code="NOT_FOUND"
        )
    
    @staticmethod
    def unauthorized(message: str = "未授权访问") -> tuple:
        """未授权响应"""
        return APIResponse.error(
            message=message,
            code=401,
            error_code="UNAUTHORIZED"
        )
    
    @staticmethod
    def forbidden(message: str = "禁止访问") -> tuple:
        """禁止访问响应"""
        return APIResponse.error(
            message=message,
            code=403,
            error_code="FORBIDDEN"
        )
    
    @staticmethod
    def internal_error(message: str = "服务器内部错误") -> tuple:
        """内部错误响应"""
        return APIResponse.error(
            message=message,
            code=500,
            error_code="INTERNAL_ERROR"
        )