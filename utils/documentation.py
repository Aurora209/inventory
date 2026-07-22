"""API文档生成工具"""
from typing import Dict, List, Any, Optional
from functools import wraps
import inspect
import json

class APIDoc:
    """API文档生成器"""
    
    _docs = {}
    
    @classmethod
    def document(
        cls,
        summary: str,
        description: str = "",
        parameters: List[Dict] = None,
        responses: Dict[int, str] = None,
        tags: List[str] = None
    ):
        """API文档装饰器"""
        def decorator(func):
            # 存储文档信息
            cls._docs[func.__name__] = {
                'summary': summary,
                'description': description,
                'parameters': parameters or [],
                'responses': responses or {},
                'tags': tags or [],
                'function': func.__name__,
                'module': func.__module__
            }
            
            @wraps(func)
            def wrapper(*args, **kwargs):
                return func(*args, **kwargs)
            
            return wrapper
        return decorator
    
    @classmethod
    def generate_openapi_spec(cls, title: str = "Inventory Management API", version: str = "1.0.0") -> Dict[str, Any]:
        """生成OpenAPI规范文档"""
        openapi_spec = {
            "openapi": "3.0.0",
            "info": {
                "title": title,
                "version": version,
                "description": "库存管理系统API文档"
            },
            "servers": [
                {
                    "url": "http://localhost:5000",
                    "description": "开发服务器"
                }
            ],
            "paths": {},
            "components": {
                "schemas": {
                    "ErrorResponse": {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean", "example": False},
                            "error": {
                                "type": "object",
                                "properties": {
                                    "message": {"type": "string"},
                                    "code": {"type": "string"},
                                    "timestamp": {"type": "string"}
                                }
                            }
                        }
                    },
                    "SuccessResponse": {
                        "type": "object",
                        "properties": {
                            "success": {"type": "boolean", "example": True},
                            "message": {"type": "string"},
                            "data": {"type": "object"},
                            "timestamp": {"type": "string"}
                        }
                    }
                }
            }
        }
        
        # 这里可以根据实际路由信息生成完整的OpenAPI文档
        # 由于篇幅限制，这里只提供框架
        
        return openapi_spec
    
    @classmethod
    def get_documentation(cls) -> Dict[str, Any]:
        """获取所有API文档"""
        return cls._docs

# 示例使用
class ProductAPIDocs:
    """产品API文档"""
    
    @staticmethod
    @APIDoc.document(
        summary="获取产品列表",
        description="分页获取所有产品，支持搜索和分类过滤",
        parameters=[
            {
                "name": "search",
                "in": "query",
                "description": "搜索关键词",
                "required": False,
                "schema": {"type": "string"}
            },
            {
                "name": "category_id",
                "in": "query",
                "description": "分类ID",
                "required": False,
                "schema": {"type": "integer"}
            },
            {
                "name": "page",
                "in": "query",
                "description": "页码",
                "required": False,
                "schema": {"type": "integer", "default": 1}
            },
            {
                "name": "per_page",
                "in": "query",
                "description": "每页数量",
                "required": False,
                "schema": {"type": "integer", "default": 50}
            }
        ],
        responses={
            200: "成功获取产品列表",
            500: "服务器内部错误"
        },
        tags=["products"]
    )
    def get_products():
        pass  # 实际实现在路由中