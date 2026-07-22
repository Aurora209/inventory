"""基础模型类与通用数据库操作。"""
from typing import Any, Dict, List, Optional, Union, Set
from contextlib import contextmanager
import logging
import re
from utils.database import db_manager, serialize_rows, serialize_row
from utils.error_handler import DatabaseError, NotFoundError

logger = logging.getLogger(__name__)

# 安全标识符正则
_IDENT_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')

# 各表的合法列名白名单（运行时填充）
_TABLE_COLUMNS: Dict[str, Set[str]] = {}


def register_table_columns(table_name: str, columns: List[str]):
    """注册表的合法列名白名单。"""
    _TABLE_COLUMNS[table_name] = set(columns)


def _safe_ident(name: str) -> str:
    """校验 SQL 标识符安全，防注入。"""
    if not name or not _IDENT_RE.match(str(name)):
        raise ValueError(f"非法标识符: {name!r}")
    return str(name)


class BaseModel:
    """基础模型类。"""

    # 表名，子类需要重写
    TABLE_NAME: str = None

    @classmethod
    def get_table_name(cls) -> str:
        """获取表名"""
        if cls.TABLE_NAME is None:
            raise NotImplementedError("子类必须定义 TABLE_NAME")
        return cls.TABLE_NAME

    @classmethod
    def _safe_col(cls, col: str) -> str:
        """安全列名校验：先走白名单，再走标识符正则。"""
        cols = _TABLE_COLUMNS.get(cls.TABLE_NAME)
        if cols and col not in cols:
            raise ValueError(f"列名 {col!r} 不在表 {cls.TABLE_NAME} 的白名单中")
        return _safe_ident(col)

    @classmethod
    def execute_query(cls, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """执行查询并返回结果"""
        try:
            rows = db_manager.execute_query(query, params)
            return serialize_rows(rows)
        except Exception as e:
            logger.error("查询执行失败: %s, 参数: %s", query, params)
            raise DatabaseError(f"数据库查询失败: {str(e)}")

    @classmethod
    def execute_update(cls, query: str, params: tuple = ()) -> int:
        """执行更新操作并返回影响的行数"""
        try:
            return db_manager.execute_update(query, params)
        except Exception as e:
            logger.error("更新执行失败: %s, 参数: %s", query, params)
            raise DatabaseError(f"数据库更新失败: {str(e)}")

    @classmethod
    def execute_many(cls, query: str, params_list: List[tuple]) -> int:
        """执行批量操作"""
        try:
            return db_manager.execute_many(query, params_list)
        except Exception as e:
            logger.error("批量操作失败: %s, 参数数量: %s", query, len(params_list))
            raise DatabaseError(f"数据库批量操作失败: {str(e)}")

    @classmethod
    def get_last_insert_id(cls) -> Optional[int]:
        """获取最后插入的行ID"""
        try:
            with db_manager.get_connection() as conn:
                cursor = conn.execute("SELECT last_insert_rowid()")
                result = cursor.fetchone()
                return result[0] if result else None
        except Exception as e:
            logger.error("获取最后插入ID失败: %s", e)
            return None

    @classmethod
    def get_by_id(cls, record_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取记录"""
        if not cls.TABLE_NAME:
            raise NotImplementedError("子类必须定义 TABLE_NAME")

        safe_table = _safe_ident(cls.TABLE_NAME)
        query = f'SELECT * FROM {safe_table} WHERE id = ?'
        rows = cls.execute_query(query, (record_id,))

        if not rows:
            return None

        return rows[0]

    @classmethod
    def get_all(cls, where: Dict[str, Any] = None, order_by: List[str] = None) -> List[Dict[str, Any]]:
        """获取所有记录（已修复列名注入）"""
        if not cls.TABLE_NAME:
            raise NotImplementedError("子类必须定义 TABLE_NAME")

        safe_table = _safe_ident(cls.TABLE_NAME)
        query_parts = [f'SELECT * FROM {safe_table}']
        params = []

        if where:
            where_conditions = []
            for key, value in where.items():
                safe_key = cls._safe_col(key)
                if value is None:
                    where_conditions.append(f"{safe_key} IS NULL")
                else:
                    where_conditions.append(f"{safe_key} = ?")
                    params.append(value)
            query_parts.append(f"WHERE {' AND '.join(where_conditions)}")

        if order_by:
            safe_orders = []
            for field in order_by:
                parts = field.split()
                col = parts[0]
                direction = parts[1].upper() if len(parts) > 1 else 'ASC'
                if direction not in ('ASC', 'DESC'):
                    direction = 'ASC'
                safe_col = cls._safe_col(col)
                safe_orders.append(f"{safe_col} {direction}")
            query_parts.append(f"ORDER BY {', '.join(safe_orders)}")

        query = ' '.join(query_parts)
        return cls.execute_query(query, tuple(params))

    @classmethod
    def create(cls, **kwargs) -> Dict[str, Any]:
        """创建记录（已修复列名校验）"""
        if not cls.TABLE_NAME:
            raise NotImplementedError("子类必须定义 TABLE_NAME")

        # 校验所有列名
        columns = []
        for key in kwargs.keys():
            columns.append(cls._safe_col(key))
        placeholders = ['?'] * len(columns)
        values = [kwargs.get(col) for col in columns]

        safe_table = _safe_ident(cls.TABLE_NAME)
        query = f'INSERT INTO {safe_table} ({", ".join(columns)}) VALUES ({", ".join(placeholders)})'

        try:
            with db_manager.get_connection() as conn:
                cursor = conn.execute(query, tuple(values))
                record_id = cursor.lastrowid
                conn.commit()

            if record_id:
                record = cls.get_by_id(record_id)
                if record:
                    return record
                raise DatabaseError("创建记录失败，无法查询到刚创建的记录")
            else:
                raise DatabaseError("创建记录失败，无法获取记录ID")
        except Exception as e:
            logger.error("创建记录失败: %s", e)
            raise DatabaseError(f"创建记录失败: {str(e)}")

    @classmethod
    def update(cls, record_id: int, **kwargs) -> Dict[str, Any]:
        """更新记录（已修复列名校验）"""
        if not cls.TABLE_NAME:
            raise NotImplementedError("子类必须定义 TABLE_NAME")

        # 检查记录是否存在
        existing = cls.get_by_id(record_id)
        if not existing:
            raise NotFoundError(f"记录不存在 (ID: {record_id})")

        # 校验列名
        set_parts = []
        values = []
        for key in kwargs.keys():
            safe_key = cls._safe_col(key)
            set_parts.append(f"{safe_key} = ?")
            values.append(kwargs[key])
        values.append(record_id)

        safe_table = _safe_ident(cls.TABLE_NAME)
        query = f'UPDATE {safe_table} SET {", ".join(set_parts)} WHERE id = ?'

        try:
            cls.execute_update(query, tuple(values))
            return cls.get_by_id(record_id)
        except Exception as e:
            logger.error("更新记录失败: %s", e)
            raise DatabaseError(f"更新记录失败: {str(e)}")

    @classmethod
    def delete(cls, record_id: int) -> int:
        """删除记录"""
        if not cls.TABLE_NAME:
            raise NotImplementedError("子类必须定义 TABLE_NAME")

        # 检查记录是否存在
        existing = cls.get_by_id(record_id)
        if not existing:
            raise NotFoundError(f"记录不存在 (ID: {record_id})")

        safe_table = _safe_ident(cls.TABLE_NAME)
        query = f'DELETE FROM {safe_table} WHERE id = ?'

        try:
            return cls.execute_update(query, (record_id,))
        except Exception as e:
            logger.error("删除记录失败: %s", e)
            raise DatabaseError(f"删除记录失败: {str(e)}")

    @classmethod
    def count(cls, where: Dict[str, Any] = None) -> int:
        """统计记录数量（已修复列名校验）"""
        if not cls.TABLE_NAME:
            raise NotImplementedError("子类必须定义 TABLE_NAME")

        safe_table = _safe_ident(cls.TABLE_NAME)
        query_parts = [f'SELECT COUNT(*) as count FROM {safe_table}']
        params = []

        if where:
            where_conditions = []
            for key, value in where.items():
                safe_key = cls._safe_col(key)
                if value is None:
                    where_conditions.append(f"{safe_key} IS NULL")
                else:
                    where_conditions.append(f"{safe_key} = ?")
                    params.append(value)
            query_parts.append(f"WHERE {' AND '.join(where_conditions)}")

        query = ' '.join(query_parts)
        rows = cls.execute_query(query, tuple(params))

        return rows[0]['count'] if rows else 0

    @classmethod
    def exists(cls, record_id: int) -> bool:
        """检查记录是否存在"""
        return cls.get_by_id(record_id) is not None

    # 向后兼容的方法
    @classmethod
    @contextmanager
    def get_db_connection(cls):
        """获取数据库连接（向后兼容）"""
        with db_manager.get_connection() as conn:
            yield conn
