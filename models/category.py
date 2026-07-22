from models.base import BaseModel
from utils.database import serialize_rows
from contextlib import contextmanager
import logging

logger = logging.getLogger(__name__)

class Category(BaseModel):
    """分类模型"""
    
    @classmethod
    def create_table(cls):
        """创建分类表"""
        # 创建主表
        create_table_query = '''
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                parent_id INTEGER,
                level INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (parent_id) REFERENCES categories (id)
            )
        '''
        cls.execute_query(create_table_query)

        columns = cls.execute_query('PRAGMA table_info(categories)')
        column_names = {column['name'] for column in columns}
        if 'sort_order' not in column_names:
            cls.execute_query('ALTER TABLE categories ADD COLUMN sort_order INTEGER DEFAULT 0')

        # 为 parent_id 创建索引以提高查询性能
        create_index_query = 'CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories (parent_id)'
        cls.execute_query(create_index_query)

        create_sort_index_query = 'CREATE INDEX IF NOT EXISTS idx_categories_parent_sort ON categories (parent_id, sort_order, id)'
        cls.execute_query(create_sort_index_query)

        # 为顶级分类（level=1）的名称创建唯一索引，防止重复
        create_unique_index_query = 'CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_level ON categories (name, level) WHERE level = 1'
        cls.execute_query(create_unique_index_query)
    
    @classmethod
    def get_all_flat(cls):
        """获取所有分类（扁平结构）"""
        query = 'SELECT * FROM categories ORDER BY COALESCE(parent_id, 0), sort_order, id'
        rows = cls.execute_query(query)
        return serialize_rows(rows)
    
    @classmethod
    def get_all_tree(cls):
        """获取所有分类（树状结构）"""
        categories = cls.get_all_flat()
        
        # 以 parent_id 为准构建树，避免旧数据 level 错误时被误判为一级分类。
        by_parent = {}
        for cat in categories:
            cat['children'] = []
            by_parent.setdefault(cat.get('parent_id'), []).append(cat)

        for siblings in by_parent.values():
            siblings.sort(key=lambda cat: (int(cat.get('sort_order') or 0), int(cat.get('id') or 0)))

        def attach_children(parent, level):
            parent['level'] = level
            children = by_parent.get(parent['id'], [])
            for child in children:
                attach_children(child, level + 1)
            parent['children'] = children

        root_categories = by_parent.get(None, [])
        # 兼容 parent_id 指向已删除分类的孤儿数据：作为顶级显示，避免丢失。
        known_ids = {cat['id'] for cat in categories}
        root_categories.extend(cat for cat in categories if cat.get('parent_id') is not None and cat.get('parent_id') not in known_ids)

        for root in root_categories:
            attach_children(root, 1)
        
        return root_categories
    
    @classmethod
    def get_by_id(cls, category_id):
        """根据ID获取分类"""
        query = 'SELECT * FROM categories WHERE id = ?'
        rows = cls.execute_query(query, (category_id,))
        return serialize_rows(rows)[0] if rows else None
    
    @classmethod
    def create(cls, name, parent_id=None, level=None):
        """创建分类"""
        try:
            if parent_id:
                parent = cls.get_by_id(parent_id)
                if not parent:
                    raise ValueError('父分类不存在')
                level = int(parent.get('level') or 1) + 1
            elif level is None:
                level = 1

            # 检查是否已存在相同名称和层级的分类
            if level == 1:
                existing = cls.execute_query(
                    'SELECT id FROM categories WHERE name = ? AND parent_id IS NULL',
                    (name,)
                )
            else:
                existing = cls.execute_query(
                    'SELECT id FROM categories WHERE name = ? AND parent_id = ? AND level = ?',
                    (name, parent_id, level)
                )
            
            if existing:
                raise ValueError('同级分类名称已存在')
            
            order_row = cls.execute_query(
                'SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM categories WHERE parent_id IS ?',
                (parent_id,)
            )
            sort_order = int(order_row[0]['next_order'] or 0)

            query = '''
                INSERT INTO categories (name, parent_id, level, sort_order)
                VALUES (?, ?, ?, ?)
            '''
            
            # 使用数据库连接上下文管理器确保操作在同一连接中完成
            with cls.get_db_connection() as conn:
                cursor = conn.execute(query, (name, parent_id, level, sort_order))
                conn.commit()
                
                # 获取最后插入的ID
                cursor = conn.execute("SELECT last_insert_rowid()")
                result = cursor.fetchone()
                if result:
                    if isinstance(result, (list, tuple)):
                        category_id = int(result[0])
                    elif hasattr(result, '__getitem__'):
                        category_id = int(result[0])
                    else:
                        category_id = int(result)
                else:
                    category_id = None
                    
                if category_id is None or category_id <= 0:
                    raise ValueError('创建分类失败，无法获取分类ID')
                
                # 直接查询新创建的分类数据
                result_query = '''
                    SELECT id, name, parent_id, level, sort_order,
                           created_at, updated_at 
                    FROM categories 
                    WHERE id = ?
                '''
                result = conn.execute(result_query, (category_id,)).fetchall()
                
                if not result:
                    raise ValueError('创建分类失败，无法查询到刚创建的分类')
                
                # 返回新创建的分类
                category_data = serialize_rows(result)[0]
                return category_data
            
        except Exception as e:
            logger.error("创建分类失败: %s", str(e))
            raise

    @classmethod
    def rebuild_levels_from_parent(cls):
        """根据 parent_id 重新计算 level，修复历史创建子分类时 level 被写成 1 的数据。"""
        categories = cls.get_all_flat()
        by_id = {cat['id']: cat for cat in categories}
        children_by_parent = {}
        for cat in categories:
            children_by_parent.setdefault(cat.get('parent_id'), []).append(cat)

        updates = []

        def visit(category, level):
            if int(category.get('level') or 1) != level:
                updates.append((level, category['id']))
            for child in children_by_parent.get(category['id'], []):
                visit(child, level + 1)

        for root in children_by_parent.get(None, []):
            visit(root, 1)

        # 孤儿分类作为一级分类处理。
        for cat in categories:
            if cat.get('parent_id') is not None and cat.get('parent_id') not in by_id:
                visit(cat, 1)

        if not updates:
            return 0

        with cls.get_db_connection() as conn:
            conn.executemany(
                'UPDATE categories SET level = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                updates
            )
            conn.commit()
        return len(updates)

    @classmethod
    def normalize_sort_orders(cls):
        """为同级分类补齐连续排序值。"""
        categories = cls.get_all_flat()
        children_by_parent = {}
        for cat in categories:
            children_by_parent.setdefault(cat.get('parent_id'), []).append(cat)

        updates = []
        for siblings in children_by_parent.values():
            siblings.sort(key=lambda cat: (int(cat.get('sort_order') or 0), int(cat.get('id') or 0)))
            for index, cat in enumerate(siblings):
                if int(cat.get('sort_order') or 0) != index:
                    updates.append((index, cat['id']))

        if not updates:
            return 0

        with cls.get_db_connection() as conn:
            conn.executemany(
                'UPDATE categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                updates
            )
            conn.commit()
        return len(updates)

    @classmethod
    def reorder_siblings(cls, parent_id, ordered_ids):
        """重排同一父级下的分类顺序。"""
        normalized_parent_id = int(parent_id) if parent_id not in (None, '', 'null') else None
        ids = [int(category_id) for category_id in ordered_ids]
        if not ids:
            raise ValueError('排序列表不能为空')

        if normalized_parent_id is None:
            siblings = cls.execute_query(
                'SELECT id FROM categories WHERE parent_id IS NULL ORDER BY sort_order, id'
            )
        else:
            siblings = cls.execute_query(
                'SELECT id FROM categories WHERE parent_id = ? ORDER BY sort_order, id',
                (normalized_parent_id,)
            )

        sibling_ids = [int(row['id']) for row in siblings]
        if set(ids) != set(sibling_ids):
            raise ValueError('只能重排同一父级下的全部分类')

        updates = [(index, category_id) for index, category_id in enumerate(ids)]
        with cls.get_db_connection() as conn:
            conn.executemany(
                'UPDATE categories SET sort_order = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                updates
            )
            conn.commit()
        return len(updates)
    
    @classmethod
    def update(cls, category_id, name):
        """更新分类"""
        query = 'UPDATE categories SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        cls.execute_update(query, (name, category_id))
        return cls.get_by_id(category_id)
    
    @classmethod
    def delete(cls, category_id):
        """删除分类"""
        # 检查是否有子分类
        children = cls.execute_query('SELECT id FROM categories WHERE parent_id = ?', (category_id,))
        if children:
            raise ValueError('该分类下有子分类，无法删除')
        
        # 检查是否有产品使用该分类
        from models.product import Product
        products = Product.get_by_category(category_id)
        if products:
            raise ValueError('有产品使用该分类，无法删除')
        
        query = 'DELETE FROM categories WHERE id = ?'
        return cls.execute_update(query, (category_id,))

    # 添加获取数据库连接的方法
    @classmethod
    @contextmanager
    def get_db_connection(cls):
        """获取数据库连接"""
        from utils.database import get_db_connection
        with get_db_connection() as conn:
            yield conn
