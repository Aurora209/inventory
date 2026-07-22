"""数据库工具与连接管理。"""
import sqlite3
import os
import logging
from contextlib import contextmanager
from typing import Iterator, List, Dict, Any, Optional
from config import config
import threading
from queue import Queue, Empty

logger = logging.getLogger(__name__)

class DatabaseManager:
    """数据库管理器"""
    
    _instance = None
    
    def __init__(self):
        self.db_path = config.DATABASE_PATH
        self._ensure_database_dir()
        # 初始化连接池
        self._connection_pool = Queue()
        self._pool_lock = threading.Lock()
        self._pool_size = 5
        self._initialize_pool()
    
    def _initialize_pool(self):
        """初始化连接池"""
        for _ in range(self._pool_size):
            conn = self._create_connection()
            self._connection_pool.put(conn)
    
    def _create_connection(self):
        """创建新的数据库连接"""
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA foreign_keys = ON")  # 启用外键约束
        conn.execute("PRAGMA journal_mode = WAL")  # 启用WAL模式提高并发性能
        return conn
    
    def _ensure_database_dir(self):
        """确保数据库目录存在"""
        config.ensure_data_dir()
    
    @contextmanager
    def get_connection(self) -> Iterator[sqlite3.Connection]:
        """获取数据库连接（带连接池）"""
        conn = None
        try:
            # 尝试从连接池获取连接
            try:
                conn = self._connection_pool.get_nowait()
            except Empty:
                # 如果连接池为空，创建新连接
                conn = self._create_connection()
            
            yield conn
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error("数据库连接错误: %s", e)
            raise
        finally:
            if conn:
                # 将连接返回到连接池
                try:
                    # 清理连接状态
                    conn.rollback()
                    self._connection_pool.put(conn)
                except:
                    # 如果返回连接池失败，关闭连接
                    conn.close()
    
    def execute_query(self, query: str, params: tuple = ()) -> List[sqlite3.Row]:
        """执行查询语句"""
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            return cursor.fetchall()
    
    def execute_update(self, query: str, params: tuple = ()) -> int:
        """执行更新语句"""
        with self.get_connection() as conn:
            cursor = conn.execute(query, params)
            conn.commit()
            return cursor.rowcount
    
    def execute_many(self, query: str, params_list: List[tuple]) -> int:
        """执行批量操作"""
        with self.get_connection() as conn:
            cursor = conn.executemany(query, params_list)
            conn.commit()
            return cursor.rowcount

    def close_all_connections(self):
        """关闭连接池中的所有连接。"""
        while True:
            try:
                conn = self._connection_pool.get_nowait()
            except Empty:
                break
            try:
                conn.close()
            except Exception:
                pass

    def reset_pool(self):
        """重置连接池，供数据库恢复后重新建立连接。"""
        with self._pool_lock:
            self.close_all_connections()
            self._initialize_pool()

# 全局数据库管理器实例
db_manager = DatabaseManager()

# 向后兼容的函数
def get_db_connection() -> Iterator[sqlite3.Connection]:
    """获取数据库连接（向后兼容）"""
    return db_manager.get_connection()

def serialize_row(row: Optional[sqlite3.Row]) -> Optional[Dict[str, Any]]:
    """将数据库行转换为字典"""
    if row is None:
        return None
    return dict(row)

def serialize_rows(rows: List[sqlite3.Row]) -> List[Dict[str, Any]]:
    """将多行数据库记录转换为字典列表"""
    return [serialize_row(row) for row in rows]

def init_database():
    """初始化数据库"""
    from models.category import Category
    from models.product import Product
    from models.bom import BOM
    from models.transaction import Transaction
    from models.order import Order
    from models.order_item import OrderItem
    from models.production import ProductionPlan
    
    # 确保数据目录存在
    config.ensure_data_dir()
    
    logger.info("开始初始化数据库...")
    logger.debug("数据库路径: %s", config.DATABASE_PATH)
    
    # 创建所有表
    tables = [
        Category,
        Product,
        BOM,
        Transaction,
        Order,
        OrderItem,
        ProductionPlan
    ]
    
    for table_class in tables:
        try:
            table_class.create_table()
            logger.debug("创建表: %s", table_class.__name__)
        except Exception as e:
            logger.error("创建表 %s 失败: %s", table_class.__name__, e)
            raise

    try:
        repaired = Category.rebuild_levels_from_parent()
        if repaired:
            logger.info("修复分类层级数据: %s 条", repaired)
        sorted_count = Category.normalize_sort_orders()
        if sorted_count:
            logger.info("初始化分类排序数据: %s 条", sorted_count)
        recalculated_orders = Order.recalculate_totals()
        if recalculated_orders:
            logger.info("修复订单总金额数据: %s 条", recalculated_orders)
    except Exception as e:
        logger.error("修复分类/订单结构数据失败: %s", e)
        raise

    # 创建缺失的索引
    additional_indexes = [
        'CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions (reference_no)',
        'CREATE INDEX IF NOT EXISTS idx_transactions_product_date ON transactions (product_id, transaction_date)',
        'CREATE INDEX IF NOT EXISTS idx_orders_status_date ON orders (status, order_date)',
        'CREATE INDEX IF NOT EXISTS idx_products_min_stock ON products (min_stock, quantity)',
    ]
    for idx_sql in additional_indexes:
        try:
            db_manager.execute_query(idx_sql)
            logger.debug("创建索引: %s", idx_sql)
        except Exception as e:
            logger.warning("创建索引失败 %s: %s", idx_sql, e)

    # 注册各表的列名白名单（用于 BaseModel 列名校验）
    for model_class in tables:
        try:
            table_name = model_class.TABLE_NAME
            col_rows = model_class.execute_query(f"PRAGMA table_info({table_name})")
            if col_rows:
                col_names = [c['name'] for c in col_rows]
                from models.base import _TABLE_COLUMNS
                _TABLE_COLUMNS[table_name] = set(col_names)
        except Exception as e:
            logger.warning("注册表 %s 列白名单失败: %s", table_name, e)

    logger.info("数据库初始化完成")

def get_last_insert_id(conn: sqlite3.Connection) -> Optional[int]:
    """获取最后插入的行ID"""
    try:
        cursor = conn.execute("SELECT last_insert_rowid()")
        result = cursor.fetchone()
        if result:
            return result[0]
        return None
    except Exception as e:
        logger.error("获取最后插入ID时出错: %s", e)
        return None

# 查询构建工具
import re
from typing import List, Dict, Any, Optional, Tuple

_IDENT_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
_MAX_QUERY_LIMIT = 1000
_MAX_QUERY_OFFSET = 100000

def _safe_ident(name: str) -> str:
    if not name or not _IDENT_RE.match(str(name)):
        raise ValueError(f"非法标识符: {name!r}")
    return str(name)

class QueryBuilder:
    """安全的SQL查询构建器（已修复注入）"""
    
    @staticmethod
    def build_select(
        table: str,
        columns: List[str] = None,
        where: Dict[str, Any] = None,
        order_by: List[str] = None,
        limit: int = None,
        offset: int = None
    ) -> tuple:
        """构建SELECT查询（已修复注入）"""
        safe_table = _safe_ident(table)
        safe_columns = [_safe_ident(c) for c in (columns or ['*'])]
        
        query_parts = [f"SELECT {', '.join(safe_columns)} FROM {safe_table}"]
        params = []
        
        if where:
            where_conditions = []
            for key, value in where.items():
                safe_key = _safe_ident(key)
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
                col = _safe_ident(parts[0])
                direction = parts[1].upper() if len(parts) > 1 and parts[1].upper() in ('ASC', 'DESC') else 'ASC'
                safe_orders.append(f"{col} {direction}")
            query_parts.append(f"ORDER BY {', '.join(safe_orders)}")
        
        # 分页 — 严格整数校验
        safe_limit = min(int(limit), _MAX_QUERY_LIMIT) if limit is not None else _MAX_QUERY_LIMIT
        safe_offset = min(int(offset), _MAX_QUERY_OFFSET) if offset is not None else 0
        query_parts.append(f"LIMIT {safe_limit}")
        if safe_offset > 0:
            query_parts.append(f"OFFSET {safe_offset}")
        
        return " ".join(query_parts), tuple(params)
    
    @staticmethod
    def build_insert(table: str, data: Dict[str, Any]) -> tuple:
        """构建INSERT查询（已修复列名校验）"""
        safe_columns = [_safe_ident(k) for k in data.keys()]
        placeholders = ["?"] * len(safe_columns)
        values = [data.get(k) for k in data.keys()]
        
        safe_table = _safe_ident(table)
        query = f"INSERT INTO {safe_table} ({', '.join(safe_columns)}) VALUES ({', '.join(placeholders)})"
        return query, tuple(values)
    
    @staticmethod
    def build_update(table: str, data: Dict[str, Any], where: Dict[str, Any]) -> tuple:
        """构建UPDATE查询（已修复注入）"""
        safe_table = _safe_ident(table)
        
        set_parts = []
        values = []
        for key in data.keys():
            safe_key = _safe_ident(key)
            set_parts.append(f"{safe_key} = ?")
            values.append(data[key])
        
        where_conditions = []
        for key in where.keys():
            safe_key = _safe_ident(key)
            where_conditions.append(f"{safe_key} = ?")
            values.append(where[key])
        
        query = f"UPDATE {safe_table} SET {', '.join(set_parts)} WHERE {' AND '.join(where_conditions)}"
        return query, tuple(values)