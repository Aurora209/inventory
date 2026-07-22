"""安全增强工具"""
import re
import logging
import threading
from typing import Optional, Dict, List
from urllib.parse import urlparse
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# 仅对明确危险的 SQL 模式进行拦截（用于参数值检查，不应用于普通文本字段）
_SQL_INJECTION_PATTERNS = [
    r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC)\b\s.*\bFROM\b)",
    r"(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|EXEC)\b\s.*\bINTO\b)",
    r"(\-\-)",           # SQL 注释
    r"(\/\*)",           # C 风格注释开头
    r"(;\s*DROP\b)",     # 分号后跟危险语句
    r"(;\s*DELETE\b)",
    r"(;\s*UPDATE\b)",
    r"(;\s*INSERT\b)",
]


class SQLInjectionProtector:
    """SQL注入防护"""

    @staticmethod
    def sanitize_input(input_str: str, max_length: int = 255) -> Optional[str]:
        """清理输入字符串（仅截断长度和去空格，不做危险关键字匹配以免误杀业务数据）。

        如需检测 SQL 注入，请使用 is_safe_query_value() 针对查询参数单独检查。
        """
        if input_str is None:
            return None

        cleaned = input_str.strip()

        if len(cleaned) > max_length:
            cleaned = cleaned[:max_length]
            logger.warning("输入字符串被截断: 原长度=%s, 截断后=%s", len(input_str), max_length)

        return cleaned

    @staticmethod
    def is_safe_query_value(value: str) -> bool:
        """检查查询参数值是否包含 SQL 注入特征（用于数值/条件字段）。"""
        if not value:
            return True
        for pattern in _SQL_INJECTION_PATTERNS:
            if re.search(pattern, value, re.IGNORECASE):
                logger.warning("检测到潜在的SQL注入: %s", value)
                return False
        return True

    @staticmethod
    def validate_table_name(table_name: str) -> bool:
        """验证表名是否安全"""
        if not table_name or not isinstance(table_name, str):
            return False
        if not re.match(r'^[a-zA-Z_][a-zA-Z0-9_]*$', table_name):
            return False
        blacklist = {'sqlite_master', 'sqlite_sequence', 'admin', 'system'}
        return table_name.lower() not in blacklist

    @staticmethod
    def validate_column_name(column_name: str) -> bool:
        """验证列名是否安全"""
        return SQLInjectionProtector.validate_table_name(column_name)


class InputValidator:
    """输入验证器"""

    @staticmethod
    def validate_email(email: str) -> bool:
        if not email:
            return False
        pattern = r'^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$'
        return bool(re.match(pattern, email))

    @staticmethod
    def validate_phone(phone: str) -> bool:
        if not phone:
            return False
        pattern = r'^1[3-9]\d{9}$'
        return bool(re.match(pattern, phone))

    @staticmethod
    def validate_url(url: str) -> bool:
        if not url:
            return False
        try:
            result = urlparse(url)
            return all([result.scheme, result.netloc])
        except Exception:
            return False

    @staticmethod
    def validate_file_extension(filename: str, allowed_extensions: set) -> bool:
        if not filename:
            return False
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in allowed_extensions


class RateLimiter:
    """简单的速率限制器（已修复内存泄漏 + 线程安全）"""

    _requests: Dict[str, List[datetime]] = {}
    _lock = threading.Lock()

    @staticmethod
    def is_rate_limited(identifier: str, max_requests: int, window_seconds: int) -> bool:
        """检查是否超过速率限制。线程安全，自动清理过期记录。"""
        now = datetime.now()
        window_start = now - timedelta(seconds=window_seconds)

        with RateLimiter._lock:
            # 清理当前 identifier 的过期记录
            if identifier in RateLimiter._requests:
                RateLimiter._requests[identifier] = [
                    t for t in RateLimiter._requests[identifier] if t > window_start
                ]
            else:
                RateLimiter._requests[identifier] = []

            current = RateLimiter._requests[identifier]
            if len(current) >= max_requests:
                return True

            current.append(now)
            return False

    @staticmethod
    def cleanup_expired(window_seconds: int = 3600) -> int:
        """清理所有过期的速率限制记录，防止内存泄漏。返回清理的 identifier 数量。"""
        now = datetime.now()
        cutoff = now - timedelta(seconds=window_seconds)
        cleaned = 0
        with RateLimiter._lock:
            expired_ids = [
                ident for ident, times in RateLimiter._requests.items()
                if all(t <= cutoff for t in times)
            ]
            for ident in expired_ids:
                del RateLimiter._requests[ident]
                cleaned += 1
        return cleaned


def rate_limit(max_requests: int = 100, window_seconds: int = 3600):
    """速率限制装饰器"""
    def decorator(func):
        import functools
        @functools.wraps(func)
        def wrapper(*args, **kwargs):
            identifier = f"{func.__module__}.{func.__name__}"
            if RateLimiter.is_rate_limited(identifier, max_requests, window_seconds):
                logger.warning("速率限制触发: %s", identifier)
                from utils.api_response import APIResponse
                return APIResponse.error(
                    "请求过于频繁，请稍后重试",
                    code=429,
                    error_code="RATE_LIMITED"
                )
            return func(*args, **kwargs)
        return wrapper
    return decorator
