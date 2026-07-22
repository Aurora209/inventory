from models.base import BaseModel
from utils.database import serialize_rows

class ProductionPlan(BaseModel):
    """生产计划模型"""
    
    @classmethod
    def create_table(cls):
        """创建生产计划表"""
        query = '''
            CREATE TABLE IF NOT EXISTS production_plans (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                quantity INTEGER NOT NULL,
                produced_quantity INTEGER DEFAULT 0,
                scheduled_date DATE NOT NULL,
                status TEXT DEFAULT 'pending',
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
        '''
        cls.execute_query(query)
    
    @classmethod
    def get_all(cls, status=None):
        """获取所有生产计划"""
        query = '''
            SELECT pp.*, p.name as product_name, p.sku as product_sku
            FROM production_plans pp
            JOIN products p ON pp.product_id = p.id
            WHERE 1=1
        '''
        params = []
        
        if status:
            query += ' AND pp.status = ?'
            params.append(status)
        
        query += ' ORDER BY pp.scheduled_date DESC, pp.created_at DESC'
        
        rows = cls.execute_query(query, params)
        return serialize_rows(rows)
    
    @classmethod
    def create(cls, product_id, quantity, scheduled_date, notes=None):
        """创建生产计划"""
        query = '''
            INSERT INTO production_plans (product_id, quantity, scheduled_date, notes)
            VALUES (?, ?, ?, ?)
        '''
        from utils.database import get_db_connection
        with get_db_connection() as conn:
            try:
                cursor = conn.execute(query, (product_id, quantity, scheduled_date, notes))
                plan_id = cursor.lastrowid
                conn.commit()
            except Exception:
                conn.rollback()
                raise
        return cls.get_by_id(plan_id)
    
    @classmethod
    def get_by_id(cls, plan_id):
        """根据ID获取生产计划"""
        query = '''
            SELECT pp.*, p.name as product_name, p.sku as product_sku
            FROM production_plans pp
            JOIN products p ON pp.product_id = p.id
            WHERE pp.id = ?
        '''
        rows = cls.execute_query(query, (plan_id,))
        return serialize_rows(rows)[0] if rows else None
    
    @classmethod
    def delete(cls, plan_id):
        """删除生产计划"""
        # 检查生产计划是否存在
        existing = cls.get_by_id(plan_id)
        if not existing:
            raise ValueError('生产计划不存在')
        
        query = 'DELETE FROM production_plans WHERE id = ?'
        return cls.execute_update(query, (plan_id,))
    
    @classmethod
    def update(cls, plan_id, product_id=None, quantity=None, scheduled_date=None, status=None, notes=None, produced_quantity=None):
        """更新生产计划"""
        # 检查生产计划是否存在
        existing = cls.get_by_id(plan_id)
        if not existing:
            raise ValueError('生产计划不存在')
        
        # 构建更新查询
        updates = []
        params = []
        
        if product_id is not None:
            updates.append('product_id = ?')
            params.append(product_id)
        
        if quantity is not None:
            updates.append('quantity = ?')
            params.append(quantity)
        
        if scheduled_date is not None:
            updates.append('scheduled_date = ?')
            params.append(scheduled_date)
        
        if status is not None:
            updates.append('status = ?')
            params.append(status)
        
        if notes is not None:
            updates.append('notes = ?')
            params.append(notes)
            
        if produced_quantity is not None:
            updates.append('produced_quantity = ?')
            params.append(produced_quantity)
        
        # 添加更新时间
        updates.append('updated_at = CURRENT_TIMESTAMP')
        
        query = f'UPDATE production_plans SET {", ".join(updates)} WHERE id = ?'
        params.append(plan_id)
        
        cls.execute_update(query, params)
        return cls.get_by_id(plan_id)
