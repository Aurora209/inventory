from models.base import BaseModel
from utils.database import serialize_rows
from datetime import datetime

class Transaction(BaseModel):
    """交易记录模型"""

    @classmethod
    def create_table(cls):
        """创建交易记录表"""
        query = '''
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                transaction_type TEXT NOT NULL,
                quantity INTEGER NOT NULL,
                unit_price DECIMAL(10,2) NOT NULL,
                total_value DECIMAL(10,2) NOT NULL,
                reference_no TEXT,
                customer_supplier TEXT,
                transaction_date DATE NOT NULL,
                notes TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products (id)
            )
        '''
        cls.execute_query(query)

    @classmethod
    def delete_by_reference(cls, reference_no):
        """删除指定来源单号关联的交易记录。"""
        if not reference_no:
            return 0
        return cls.execute_update(
            "DELETE FROM transactions WHERE TRIM(COALESCE(reference_no, '')) = TRIM(?)",
            (str(reference_no),)
        )

    @classmethod
    def cleanup_orphaned_order_transactions(cls):
        """清理订单已不存在但仍残留的订单交易记录。"""
        query = '''
            DELETE FROM transactions
            WHERE TRIM(COALESCE(reference_no, '')) <> ''
              AND (notes LIKE '采购订单 #%' OR notes LIKE '销售订单 #%')
              AND NOT EXISTS (
                SELECT 1 FROM orders o
                WHERE TRIM(o.order_number) = TRIM(transactions.reference_no)
              )
        '''
        return cls.execute_update(query)

    @classmethod
    def get_all(cls, product_id=None, transaction_type=None):
        """获取所有交易记录"""
        cls.cleanup_orphaned_order_transactions()
        query = '''
            SELECT t.*, p.name as product_name, p.sku as product_sku, p.unit as unit
            FROM transactions t
            JOIN products p ON t.product_id = p.id
            WHERE 1=1
        '''
        params = []

        if product_id:
            query += ' AND t.product_id = ?'
            params.append(product_id)

        if transaction_type:
            query += ' AND t.transaction_type = ?'
            params.append(transaction_type)

        query += ' ORDER BY t.transaction_date DESC, t.created_at DESC'

        rows = cls.execute_query(query, params)
        return serialize_rows(rows)

    @classmethod
    def get_recent(cls, limit=10, category_id=None, transaction_type=None):
        """获取最近交易记录，可按产品分类和交易类型筛选。"""
        cls.cleanup_orphaned_order_transactions()
        query = '''
            SELECT t.*, p.name as product_name, p.sku as product_sku, p.unit as unit,
                   p.category_id, c.name as category_name
            FROM transactions t
            JOIN products p ON t.product_id = p.id
            LEFT JOIN categories c ON p.category_id = c.id
            WHERE 1=1
        '''
        params = []

        if category_id:
            if isinstance(category_id, (list, tuple)):
                placeholders = ','.join(['?'] * len(category_id))
                query += f' AND p.category_id IN ({placeholders})'
                params.extend([int(item) for item in category_id])
            else:
                query += ' AND p.category_id = ?'
                params.append(int(category_id))

        if transaction_type:
            query += ' AND t.transaction_type = ?'
            params.append(transaction_type)

        query += '''
            ORDER BY t.transaction_date DESC, t.created_at DESC
            LIMIT ?
        '''
        params.append(int(limit))
        rows = cls.execute_query(query, tuple(params))
        return serialize_rows(rows)

    @classmethod
    def create(cls, product_id, transaction_type, quantity, unit_price, transaction_date,
               reference_no=None, customer_supplier=None, notes=None, update_stock=True):
        """创建交易记录。

        已修复：销售出库时检查库存是否充足，防止负库存。
        默认会同步增减产品库存；库存盘点等需要自行控制库存写入的场景可传
        update_stock=False，只记录交易，避免重复更新。
        """
        from utils.database import get_db_connection

        product_id = int(product_id)
        quantity = float(quantity)
        unit_price = float(unit_price)
        total_value = quantity * unit_price
        quantity_change = quantity if transaction_type == 'in' else -quantity

        with get_db_connection() as conn:
            try:
                cursor = conn.execute(
                    '''
                    INSERT INTO transactions (product_id, transaction_type, quantity, unit_price, total_value,
                                              reference_no, customer_supplier, transaction_date, notes)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ''',
                    (
                        product_id, transaction_type, quantity, unit_price, total_value,
                        reference_no, customer_supplier, transaction_date, notes
                    )
                )
                transaction_id = cursor.lastrowid

                if update_stock:
                    if transaction_type == 'in':
                        product = conn.execute('SELECT quantity, price FROM products WHERE id = ?', (product_id,)).fetchone()
                        current_qty = float(product['quantity'] or 0) if product else 0.0
                        current_price = float(product['price'] or 0) if product else 0.0
                        new_qty = current_qty + quantity
                        if new_qty > 0:
                            new_price = ((current_qty * current_price) + (quantity * unit_price)) / new_qty
                            conn.execute(
                                'UPDATE products SET quantity = ?, price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                                (new_qty, new_price, product_id)
                            )
                        else:
                            conn.execute(
                                'UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                                (quantity_change, product_id)
                            )
                    else:
                        # 销售出库：先检查库存是否充足
                        product = conn.execute('SELECT quantity FROM products WHERE id = ?', (product_id,)).fetchone()
                        current_qty = float(product['quantity'] or 0) if product else 0.0
                        if current_qty < quantity:
                            raise ValueError(
                                f"产品 {product_id} 库存不足: 当前 {current_qty}, 需要 {quantity}"
                            )
                        conn.execute(
                            'UPDATE products SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                            (quantity_change, product_id)
                        )

                conn.commit()
            except Exception:
                conn.rollback()
                raise

        return cls.get_by_id(transaction_id)

    @classmethod
    def get_by_id(cls, transaction_id):
        """根据ID获取交易记录"""
        query = '''
            SELECT t.*, p.name as product_name, p.sku as product_sku, p.unit as unit
            FROM transactions t
            JOIN products p ON t.product_id = p.id
            WHERE t.id = ?
        '''
        rows = cls.execute_query(query, (transaction_id,))
        return serialize_rows(rows)[0] if rows else None

    @classmethod
    def get_today_stats(cls):
        """获取今日交易统计"""
        today = datetime.now().date().isoformat()

        query = '''
            SELECT
                COALESCE(SUM(CASE WHEN transaction_type = 'in' THEN quantity ELSE 0 END), 0) AS incoming,
                COALESCE(SUM(CASE WHEN transaction_type = 'out' THEN quantity ELSE 0 END), 0) AS outgoing
            FROM transactions
            WHERE transaction_date = ?
        '''
        rows = cls.execute_query(query, (today,))
        row = rows[0] if rows else {}
        today_incoming = int(row.get('incoming') or 0)
        today_outgoing = int(row.get('outgoing') or 0)

        return today_incoming, today_outgoing
