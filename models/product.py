"""产品模型。"""
import logging
from typing import List, Dict, Any, Optional, Union
from models.base import BaseModel
from utils.database import serialize_rows
from utils.error_handler import ValidationError, NotFoundError, DatabaseError
from utils.validators import ProductValidator

logger = logging.getLogger(__name__)

class Product(BaseModel):
    """产品模型。"""
    
    TABLE_NAME = 'products'
    
    @classmethod
    def create_table(cls):
        """创建产品表"""
        query = '''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                category_id INTEGER,
                quantity INTEGER DEFAULT 0,
                price DECIMAL(10,2) DEFAULT 0,
                unit TEXT DEFAULT '个',
                min_stock INTEGER,
                max_stock INTEGER,
                description TEXT,
                is_composite BOOLEAN DEFAULT FALSE,
                product_type TEXT DEFAULT 'finished',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE SET NULL
            )
        '''
        cls.execute_query(query)
        columns = cls.execute_query("PRAGMA table_info(products)")
        has_product_type = any((column.get('name') == 'product_type') for column in columns) if columns else False
        if not has_product_type:
            cls.execute_query("ALTER TABLE products ADD COLUMN product_type TEXT DEFAULT 'finished'")
        
        # 创建索引
        indexes = [
            'CREATE INDEX IF NOT EXISTS idx_products_sku ON products (sku)',
            'CREATE INDEX IF NOT EXISTS idx_products_category ON products (category_id)',
            'CREATE INDEX IF NOT EXISTS idx_products_name ON products (name)'
        ]
        
        for index_query in indexes:
            try:
                cls.execute_query(index_query)
            except Exception as e:
                logger.warning("创建索引失败 %s: %s", index_query, e)
    
    # 分页上限常量
    _MIN_PER_PAGE = 1
    _MAX_PER_PAGE = 200
    _MIN_PAGE = 1

    @classmethod
    def get_all(
        cls,
        search: Optional[str] = None,
        category_id: Optional[Union[int, List[int]]] = None,
        page: int = 1,
        per_page: int = 50
    ) -> Dict[str, Any]:
        """获取所有产品（支持分页，已修复分页上限校验）"""
        query_parts = [
            '''
            SELECT p.*, c.name as category_name, c.parent_id as category_parent_id
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE 1=1
            '''
        ]
        params = []
        
        if search:
            query_parts.append(' AND (p.name LIKE ? OR p.sku LIKE ?)')
            params.extend([f'%{search}%', f'%{search}%'])
        
        if category_id:
            if isinstance(category_id, (list, tuple)):
                placeholders = ','.join(['?'] * len(category_id))
                query_parts.append(f' AND p.category_id IN ({placeholders})')
                params.extend([int(x) if x is not None else None for x in category_id])
            else:
                query_parts.append(' AND p.category_id = ?')
                params.append(int(category_id))
        
        # 计数查询
        count_query_parts = ['SELECT COUNT(*) as total FROM products p WHERE 1=1']
        count_params = []
        
        if search:
            count_query_parts.append(' AND (p.name LIKE ? OR p.sku LIKE ?)')
            count_params.extend([f'%{search}%', f'%{search}%'])
        
        if category_id:
            if isinstance(category_id, (list, tuple)):
                placeholders = ','.join(['?'] * len(category_id))
                count_query_parts.append(f' AND p.category_id IN ({placeholders})')
                count_params.extend([int(x) if x is not None else None for x in category_id])
            else:
                count_query_parts.append(' AND p.category_id = ?')
                count_params.append(int(category_id))
        
        count_query = ' '.join(count_query_parts)
        total_result = cls.execute_query(count_query, tuple(count_params))
        total = total_result[0]['total'] if total_result else 0
        
        # 数据查询
        query_parts.append(' ORDER BY p.name')
        
        # 分页 — 严格校验上下限
        safe_page = max(cls._MIN_PAGE, min(int(page), 999999))
        safe_per_page = max(cls._MIN_PER_PAGE, min(int(per_page), cls._MAX_PER_PAGE))
        offset = (safe_page - 1) * safe_per_page
        query_parts.append(f' LIMIT {safe_per_page} OFFSET {offset}')
        
        query = ' '.join(query_parts)
        products = cls.execute_query(query, tuple(params))
        
        return {
            'products': products,
            'pagination': {
                'total': total,
                'page': page,
                'per_page': per_page,
                'total_pages': (total + per_page - 1) // per_page if per_page > 0 else 1
            }
        }
    
    @classmethod
    def get_by_id(cls, product_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取产品"""
        query = '''
            SELECT p.*, c.name as category_name, c.parent_id as category_parent_id
            FROM products p 
            LEFT JOIN categories c ON p.category_id = c.id 
            WHERE p.id = ?
        '''
        rows = cls.execute_query(query, (product_id,))
        return rows[0] if rows else None
    
    @classmethod
    def get_by_sku(cls, sku: str) -> Optional[Dict[str, Any]]:
        """根据SKU获取产品"""
        query = 'SELECT * FROM products WHERE sku = ?'
        rows = cls.execute_query(query, (sku,))
        return rows[0] if rows else None
    
    @classmethod
    def get_by_category(cls, category_id: int) -> List[Dict[str, Any]]:
        """根据分类获取产品"""
        query = 'SELECT * FROM products WHERE category_id = ? ORDER BY name'
        return cls.execute_query(query, (category_id,))
    
    @classmethod
    def create(
        cls, 
        sku: str, 
        name: str, 
        category_id: Optional[int] = None, 
        quantity: int = 0, 
        price: float = 0, 
        unit: str = '个', 
        min_stock: Optional[int] = None, 
        max_stock: Optional[int] = None, 
        description: str = '', 
        is_composite: bool = False,
        product_type: str = 'finished'
    ) -> Dict[str, Any]:
        """创建产品"""
        logger.info("创建产品: sku=%s, name=%s", sku, name)
        
        # 数据验证
        data = {
            'sku': sku,
            'name': name,
            'category_id': category_id,
            'quantity': quantity,
            'price': price,
            'unit': unit,
            'min_stock': min_stock,
            'max_stock': max_stock,
            'description': description,
            'is_composite': is_composite,
            'product_type': product_type
        }
        
        validated_data = ProductValidator.validate_create_data(data)
        
        # 检查SKU是否重复
        existing = cls.get_by_sku(validated_data['sku'])
        if existing:
            raise ValidationError('SKU已存在', field='sku')
        
        # 创建产品
        product = super().create(**validated_data)
        
        logger.info("产品创建成功: ID=%s", product['id'])
        return product
    
    @classmethod
    def update(cls, product_id: int, **kwargs) -> Dict[str, Any]:
        """更新产品"""
        logger.info("更新产品: ID=%s, 数据=%s", product_id, kwargs)
        
        # 检查产品是否存在
        existing = cls.get_by_id(product_id)
        if not existing:
            raise NotFoundError('产品不存在')
        
        # 数据验证
        validated_data = ProductValidator.validate_update_data(kwargs)
        
        # 检查SKU是否重复（排除自己）
        if 'sku' in validated_data and validated_data['sku'] != existing['sku']:
            duplicate = cls.get_by_sku(validated_data['sku'])
            if duplicate and duplicate['id'] != product_id:
                raise ValidationError('SKU已存在', field='sku')
        
        # 更新产品
        product = super().update(product_id, **validated_data)
        
        logger.info("产品更新成功: ID=%s", product_id)
        return product
    
    @classmethod
    def delete(cls, product_id: int) -> int:
        """删除产品"""
        logger.info("删除产品: ID=%s", product_id)
        
        # 检查产品是否存在
        existing = cls.get_by_id(product_id)
        if not existing:
            raise NotFoundError('产品不存在')
        
        # 检查是否被BOM使用
        from models.bom import BOM
        bom_usage = BOM.get_by_product_or_material(product_id)
        if bom_usage:
            raise ValidationError('产品被BOM使用，无法删除')
        
        result = super().delete(product_id)
        logger.info("产品删除成功: ID=%s", product_id)
        return result
    
    @classmethod
    def update_stock(cls, product_id: int, quantity_change: float) -> bool:
        """更新库存"""
        logger.debug("更新产品库存: ID=%s, 变化=%s", product_id, quantity_change)
        
        query = 'UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
        try:
            result = cls.execute_update(query, (float(quantity_change), int(product_id)))
            return result > 0
        except Exception as e:
            logger.error("更新库存失败: ID=%s, 错误=%s", product_id, e)
            raise DatabaseError(f"更新库存失败: {str(e)}")
    
    @classmethod
    def get_low_stock_products(cls) -> List[Dict[str, Any]]:
        """获取低库存产品"""
        query = '''
            SELECT * FROM products 
            WHERE min_stock IS NOT NULL AND quantity <= min_stock
            ORDER BY quantity ASC, name ASC
        '''
        return cls.execute_query(query)
    
    @classmethod
    def get_zero_stock_products(cls) -> List[Dict[str, Any]]:
        """获取零库存产品"""
        query = '''
            SELECT * FROM products 
            WHERE quantity = 0
            ORDER BY name ASC
        '''
        return cls.execute_query(query)
    
    @classmethod
    def search_products(cls, keyword: str, limit: int = 50) -> List[Dict[str, Any]]:
        """搜索产品"""
        query = '''
            SELECT * FROM products 
            WHERE name LIKE ? OR sku LIKE ? OR description LIKE ?
            ORDER BY 
                CASE 
                    WHEN name LIKE ? THEN 1
                    WHEN sku LIKE ? THEN 2
                    ELSE 3
                END,
                name ASC
            LIMIT ?
        '''
        search_pattern = f'%{keyword}%'
        params = [search_pattern, search_pattern, search_pattern, search_pattern, search_pattern, limit]
        
        return cls.execute_query(query, tuple(params))
    
    @classmethod
    def search_non_composite_products(cls, keyword: str, limit: int = 50) -> List[Dict[str, Any]]:
        """搜索非复合产品（用于采购订单）"""
        query = '''
            SELECT * FROM products 
            WHERE (name LIKE ? OR sku LIKE ? OR description LIKE ?)
            AND is_composite = 0
            ORDER BY 
                CASE 
                    WHEN name LIKE ? THEN 1
                    WHEN sku LIKE ? THEN 2
                    ELSE 3
                END,
                name ASC
            LIMIT ?
        '''
        search_pattern = f'%{keyword}%'
        params = [search_pattern, search_pattern, search_pattern, search_pattern, search_pattern, limit]
        
        return cls.execute_query(query, tuple(params))