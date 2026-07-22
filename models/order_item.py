from models.base import BaseModel
from utils.database import serialize_rows

class OrderItem(BaseModel):
    """订单项模型"""
    
    @classmethod
    def create_table(cls):
        """创建订单项表"""
        query = '''
            CREATE TABLE IF NOT EXISTS order_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER NOT NULL,
                product_id INTEGER,
                description TEXT NOT NULL,
                quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
                unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
                total_price DECIMAL(10,2) NOT NULL DEFAULT 0,
                unit TEXT DEFAULT '个',
                units_per_box INTEGER NOT NULL DEFAULT 1,
                packaging TEXT,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
            )
        '''
        cls.execute_query(query)
        
        # 确保旧数据库在表存在的情况下也能添加新的列（向后兼容）
        try:
            cols = [r.get('name') for r in cls.execute_query("PRAGMA table_info(order_items)")]
            if 'total_price' not in cols:
                alter_sql = 'ALTER TABLE order_items ADD COLUMN total_price DECIMAL(10,2) NOT NULL DEFAULT 0'
                try:
                    cls.execute_query(alter_sql)
                except Exception:
                    # 如果失败（例如并发或权限问题），忽略以保持兼容性
                    pass
                    
            # 添加notes字段（向后兼容）
            if 'notes' not in cols:
                alter_sql = 'ALTER TABLE order_items ADD COLUMN notes TEXT'
                try:
                    cls.execute_query(alter_sql)
                except Exception:
                    # 如果失败（例如并发或权限问题），忽略以保持兼容性
                    pass
                    
            # 添加单位字段（向后兼容）
            if 'unit' not in cols:
                alter_sql = "ALTER TABLE order_items ADD COLUMN unit TEXT DEFAULT '个'"
                try:
                    cls.execute_query(alter_sql)
                except Exception:
                    # 如果失败（例如并发或权限问题），忽略以保持兼容性
                    pass
        except Exception:
            # 如果无法查询表结构（例如表不存在），忽略，这种情况会在下一次创建时被覆盖
            pass
    
    @classmethod
    def create(cls, order_id, product_id, description, quantity, unit_price, total_price=None, unit='个', units_per_box=1, packaging=None, notes=None):
        """创建订单项"""
        # 校验 description 是否有效
        if not description or not description.strip():
            raise ValueError("订单项描述 (description) 不能为空")
        description = description.strip()  # 去除首尾空格

        # 如果未提供 total_price，则自动计算
        if total_price is None:
            total_price = float(quantity) * float(unit_price)
        
        query = '''
            INSERT INTO order_items 
            (order_id, product_id, description, quantity, unit_price, total_price, unit, units_per_box, packaging, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        '''
        from utils.database import get_db_connection
        with get_db_connection() as conn:
            try:
                cursor = conn.execute(query, (order_id, product_id, description, quantity, unit_price, total_price, unit, units_per_box, packaging, notes))
                item_id = cursor.lastrowid
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return cls.get_by_id(item_id)
    
    @classmethod
    def get_by_id(cls, item_id):
        """根据ID获取订单项"""
        query = 'SELECT * FROM order_items WHERE id = ?'
        rows = cls.execute_query(query, (item_id,))
        return serialize_rows(rows)[0] if rows else None
    
    @classmethod
    def get_by_order_id(cls, order_id):
        """根据订单ID获取所有订单项"""
        # 优先返回订单项中存储的单位（oi.unit），若为空则回退到产品表中的单位（p.unit）
        query = '''
            SELECT oi.*, p.name as product_name, p.sku as product_sku,
                   COALESCE(oi.unit, p.unit, '个') as unit
            FROM order_items oi
            LEFT JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = ?
            ORDER BY oi.id
        '''
        rows = cls.execute_query(query, (order_id,))
        return serialize_rows(rows)
    
    @classmethod
    def delete_by_order_id(cls, order_id):
        """根据订单ID删除所有订单项"""
        from utils.database import get_db_connection
        with get_db_connection() as conn:
            try:
                query = 'DELETE FROM order_items WHERE order_id = ?'
                cursor = conn.execute(query, (order_id,))
                conn.commit()
                return cursor.rowcount
            except Exception as e:
                conn.rollback()
                raise e
