"""数据库查询优化工具"""
import logging
import re
from typing import List, Dict, Any, Optional, Union, Set
from functools import wraps
from models.base import BaseModel
from utils.performance import measure_performance, cache

logger = logging.getLogger(__name__)

# 安全标识符校验：只允许字母、数字、下划线
_IDENT_RE = re.compile(r'^[a-zA-Z_][a-zA-Z0-9_]*$')
_MAX_LIMIT = 1000
_MAX_OFFSET = 100000


def _safe_ident(name: str) -> str:
    """校验 SQL 标识符安全，防注入。"""
    if not name or not _IDENT_RE.match(str(name)):
        raise ValueError(f"非法标识符: {name!r}")
    return str(name)


class QueryOptimizer:
    """查询优化器"""

    @staticmethod
    def _validate_order_by(fields: List[str], table_columns: Optional[List[str]] = None) -> List[str]:
        """校验排序字段白名单。"""
        result = []
        for field in fields:
            field = field.strip()
            parts = field.split()
            col_name = parts[0]
            direction = parts[1].upper() if len(parts) > 1 else 'ASC'
            if direction not in ('ASC', 'DESC'):
                direction = 'ASC'
            _safe_ident(col_name)
            if table_columns and col_name not in table_columns:
                logger.warning("排序字段 %s 不在表列白名单中，跳过", col_name)
                continue
            result.append(f"{_safe_ident(col_name)} {direction}")
        return result

    @staticmethod
    @measure_performance("database_query")
    def optimized_get_all(
        model_class: BaseModel,
        filters: Dict[str, Any] = None,
        order_by: List[str] = None,
        limit: int = None,
        offset: int = None,
        include_related: List[str] = None
    ) -> List[Dict[str, Any]]:
        """优化的获取所有记录方法（已修复 SQL 注入）"""
        safe_table = _safe_ident(model_class.TABLE_NAME)
        base_query = f"SELECT * FROM {safe_table}"
        params = []

        # 构建WHERE条件 — 列名白名单校验
        where_conditions = []
        if filters:
            for key, value in filters.items():
                safe_key = _safe_ident(key)
                if value is None:
                    where_conditions.append(f"{safe_key} IS NULL")
                else:
                    where_conditions.append(f"{safe_key} = ?")
                    params.append(value)

        if where_conditions:
            base_query += f" WHERE {' AND '.join(where_conditions)}"

        # 排序 — 白名单校验
        if order_by:
            safe_orders = QueryOptimizer._validate_order_by(order_by)
            if safe_orders:
                base_query += f" ORDER BY {', '.join(safe_orders)}"

        # 分页 — 严格整数校验 + 上限
        safe_limit = min(int(limit), _MAX_LIMIT) if limit is not None else _MAX_LIMIT
        if safe_limit < 0:
            safe_limit = _MAX_LIMIT
        safe_offset = min(int(offset), _MAX_OFFSET) if offset is not None else 0
        if safe_offset < 0:
            safe_offset = 0
        base_query += f" LIMIT {safe_limit} OFFSET {safe_offset}"

        # 执行查询
        results = model_class.execute_query(base_query, tuple(params))

        # 处理关联数据
        if include_related and results:
            results = QueryOptimizer._include_related_data(
                model_class, results, include_related
            )

        return results

    @staticmethod
    def _include_related_data(
        model_class: BaseModel,
        results: List[Dict[str, Any]],
        include_related: List[str]
    ) -> List[Dict[str, Any]]:
        """包含关联数据"""
        for result in results:
            for relation in include_related:
                safe_rel = _safe_ident(relation)
                result[f'{safe_rel}_info'] = None
        return results

    @staticmethod
    @cache(ttl=60)
    def get_with_cache(
        model_class: BaseModel,
        record_id: int,
        include_related: List[str] = None
    ) -> Optional[Dict[str, Any]]:
        """带缓存的获取单个记录方法"""
        return model_class.get_by_id(record_id)


class BatchProcessor:
    """批量处理器"""

    @staticmethod
    def batch_insert(
        model_class: BaseModel,
        data_list: List[Dict[str, Any]],
        batch_size: int = 100
    ) -> int:
        """批量插入数据（已修复列名校验）"""
        if not data_list:
            return 0

        total_inserted = 0
        safe_table = _safe_ident(model_class.TABLE_NAME)

        for i in range(0, len(data_list), batch_size):
            batch = data_list[i:i + batch_size]
            inserted = BatchProcessor._insert_batch(safe_table, batch)
            total_inserted += inserted

        logger.info("批量插入完成: 总数=%s, 批次大小=%s", total_inserted, batch_size)
        return total_inserted

    @staticmethod
    def _insert_batch(table_name: str, batch: List[Dict[str, Any]]) -> int:
        """插入单个批次"""
        if not batch:
            return 0

        # 获取所有字段 — 白名单校验
        all_keys = set()
        for item in batch:
            all_keys.update(item.keys())

        safe_columns = [_safe_ident(k) for k in all_keys]
        # 去重保持顺序
        seen = set()
        unique_columns = []
        for c in safe_columns:
            if c not in seen:
                seen.add(c)
                unique_columns.append(c)

        placeholders = ['?'] * len(unique_columns)

        query = f"""
            INSERT INTO {table_name}
            ({', '.join(unique_columns)})
            VALUES ({', '.join(placeholders)})
        """

        # 准备参数
        params_list = []
        for item in batch:
            params = [item.get(col) for col in unique_columns]
            params_list.append(tuple(params))

        try:
            from models.base import BaseModel
            return BaseModel.execute_many(query, params_list)
        except Exception as e:
            logger.error("批量插入失败: %s", e)
            return BatchProcessor._insert_individual(table_name, batch)

    @staticmethod
    def _insert_individual(table_name: str, batch: List[Dict[str, Any]]) -> int:
        """逐条插入（回退方法）"""
        inserted_count = 0
        for item in batch:
            try:
                from models.base import BaseModel
                columns = list(item.keys())
                safe_cols = [_safe_ident(c) for c in columns]
                placeholders = ['?'] * len(safe_cols)
                query = f"INSERT INTO {table_name} ({', '.join(safe_cols)}) VALUES ({', '.join(placeholders)})"
                params = tuple(item.get(col) for col in columns)
                with db_manager.get_connection() as conn:
                    cursor = conn.execute(query, params)
                    conn.commit()
                    inserted_count += 1
            except Exception as e:
                logger.error("单条插入失败: %s, 数据: %s", e, item)
        return inserted_count


# 需要在文件顶部导入 db_manager
from utils.database import db_manager


class IndexManager:
    """索引管理器"""

    @staticmethod
    def create_indexes():
        """创建必要的索引"""
        indexes = {
            'products': [
                'CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku)',
                'CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id)',
                'CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)',
                'CREATE INDEX IF NOT EXISTS idx_products_composite ON products (is_composite)',
                'CREATE INDEX IF NOT EXISTS idx_products_quantity ON products (quantity)',
            ],
            'categories': [
                'CREATE INDEX IF NOT EXISTS idx_categories_parent ON categories (parent_id)',
                'CREATE INDEX IF NOT EXISTS idx_categories_level ON categories (level)',
            ],
            'transactions': [
                'CREATE INDEX IF NOT EXISTS idx_transactions_product ON transactions (product_id)',
                'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions (transaction_date)',
                'CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions (transaction_type)',
                'CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions (reference_no)',
            ],
            'orders': [
                'CREATE INDEX IF NOT EXISTS idx_orders_number ON orders (order_number)',
                'CREATE INDEX IF NOT EXISTS idx_orders_type ON orders (order_type)',
                'CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status)',
                'CREATE INDEX IF NOT EXISTS idx_orders_date ON orders (order_date)',
            ],
            'order_items': [
                'CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items (order_id)',
                'CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items (product_id)',
            ],
            'bom': [
                'CREATE INDEX IF NOT EXISTS idx_bom_product ON bom (product_id)',
                'CREATE INDEX IF NOT EXISTS idx_bom_material ON bom (material_id)',
            ]
        }

        for table, table_indexes in indexes.items():
            for index_query in table_indexes:
                try:
                    BaseModel.execute_query(index_query)
                    logger.debug("创建索引: %s", index_query)
                except Exception as e:
                    logger.warning("创建索引失败 %s: %s", index_query, e)
