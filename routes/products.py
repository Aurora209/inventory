"""产品相关路由。"""
from flask import Blueprint, request
import logging
from models.product import Product
from services.category_service import CategoryService
from utils.database import get_db_connection, serialize_rows
from utils.api_response import APIResponse
from utils.error_handler import handle_api_errors, validate_required_fields
from utils.validators import DataValidator

logger = logging.getLogger(__name__)

products_bp = Blueprint('products', __name__)

def ensure_product_unit_conversions_table():
    """确保产品自定义单位换算规则表存在。"""
    with get_db_connection() as conn:
        conn.execute('''
            CREATE TABLE IF NOT EXISTS product_unit_conversions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER NOT NULL,
                from_unit TEXT NOT NULL,
                to_unit TEXT NOT NULL,
                conversion_rate DECIMAL(18,6) NOT NULL,
                description TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (product_id) REFERENCES products (id) ON DELETE CASCADE,
                UNIQUE(product_id, from_unit, to_unit)
            )
        ''')
        conn.commit()

def get_conversion_rule(product_id, rule_id):
    ensure_product_unit_conversions_table()
    with get_db_connection() as conn:
        rows = conn.execute(
            'SELECT * FROM product_unit_conversions WHERE id = ? AND product_id = ?',
            (rule_id, product_id)
        ).fetchall()
    return serialize_rows(rows)[0] if rows else None

def parse_conversion_rate(value):
    """解析单位换算率，返回可用于 API 的校验错误。"""
    try:
        rate = float(value)
    except (TypeError, ValueError):
        return None, APIResponse.error("转换率必须是数字", code=400, error_code='VALIDATION_ERROR')
    if rate <= 0:
        return None, APIResponse.error("转换率必须大于0", code=400, error_code='VALIDATION_ERROR')
    return rate, None

@products_bp.route('/products', methods=['GET'])
@handle_api_errors
def get_products():
    """获取产品列表"""
    logger.debug("获取产品列表请求: %s", dict(request.args))
    
    # 获取查询参数
    search = request.args.get('search', '').strip() or None
    category_id = request.args.get('category_id', '').strip() or None
    page = DataValidator.validate_integer(request.args.get('page', 1), 'page', min_value=1)
    per_page = DataValidator.validate_integer(request.args.get('per_page', 50), 'per_page', min_value=1, max_value=100)
    
    # 处理分类过滤
    category_filter = None
    if category_id:
        try:
            category_filter = CategoryService.get_descendant_ids(category_id)
        except Exception as e:
            logger.warning("分类过滤处理失败: %s", e)
            # 回退为原始分类ID
            category_filter = DataValidator.validate_integer(category_id, 'category_id', min_value=1)
    
    # 获取产品数据
    result = Product.get_all(
        search=search,
        category_id=category_filter,
        page=page,
        per_page=per_page
    )
    
    return APIResponse.paginated(
        data=result['products'],
        total=result['pagination']['total'],
        page=page,
        per_page=per_page,
        message="获取产品列表成功"
    )

@products_bp.route('/products/categories', methods=['GET'])
@handle_api_errors
def get_product_categories():
    """获取产品分类"""
    logger.debug("获取产品分类请求")
    
    categories = CategoryService.get_categories_tree()
    
    # 为每个分类添加产品数量
    for category in categories:
        category['product_count'] = Product.count({'category_id': category['id']})
        for sub_category in category.get('children', []):
            sub_category['product_count'] = Product.count({'category_id': sub_category['id']})
    
    return APIResponse.success(
        data={'categories': categories},
        message="获取产品分类成功"
    )

@products_bp.route('/products', methods=['POST'])
@handle_api_errors
@validate_required_fields('sku', 'name')
def create_product():
    """创建产品"""
    logger.info("创建产品请求")
    data = request.get_json()
    
    # 使用验证器处理数据
    product = Product.create(**data)
    
    logger.info("产品创建成功: ID=%s, SKU=%s", product['id'], product['sku'])
    return APIResponse.created(
        data=product,
        message="产品创建成功",
        location=f"/api/products/{product['id']}"
    )

@products_bp.route('/products/<int:product_id>', methods=['GET'])
@handle_api_errors
def get_product(product_id):
    """获取单个产品"""
    logger.debug("获取产品详情: ID=%s", product_id)
    
    DataValidator.validate_integer(product_id, 'product_id', min_value=1)
    
    product = Product.get_by_id(product_id)
    if not product:
        return APIResponse.not_found("产品不存在")
    
    return APIResponse.success(
        data=product,
        message="获取产品详情成功"
    )

@products_bp.route('/products/<int:product_id>/conversions', methods=['GET'])
@handle_api_errors
def get_product_conversions(product_id):
    """获取产品自定义单位换算规则。"""
    DataValidator.validate_integer(product_id, 'product_id', min_value=1)
    if not Product.get_by_id(product_id):
        return APIResponse.not_found("产品不存在")
    ensure_product_unit_conversions_table()
    with get_db_connection() as conn:
        rows = conn.execute(
            'SELECT * FROM product_unit_conversions WHERE product_id = ? ORDER BY from_unit, to_unit',
            (product_id,)
        ).fetchall()
    return APIResponse.success(data=serialize_rows(rows), message="获取产品单位转换规则成功")

@products_bp.route('/products/<int:product_id>/conversions', methods=['POST'])
@handle_api_errors
@validate_required_fields('from_unit', 'to_unit', 'conversion_rate')
def create_product_conversion(product_id):
    """新增产品自定义单位换算规则。"""
    DataValidator.validate_integer(product_id, 'product_id', min_value=1)
    if not Product.get_by_id(product_id):
        return APIResponse.not_found("产品不存在")
    data = request.get_json() or {}
    from_unit = DataValidator.validate_string(data['from_unit'], 'from_unit', min_length=1, max_length=30)
    to_unit = DataValidator.validate_string(data['to_unit'], 'to_unit', min_length=1, max_length=30)
    rate, error_response = parse_conversion_rate(data.get('conversion_rate'))
    if error_response:
        return error_response
    ensure_product_unit_conversions_table()
    with get_db_connection() as conn:
        cursor = conn.execute(
            '''INSERT INTO product_unit_conversions (product_id, from_unit, to_unit, conversion_rate, description)
               VALUES (?, ?, ?, ?, ?)''',
            (product_id, from_unit, to_unit, rate, data.get('description', ''))
        )
        conn.commit()
        rows = conn.execute('SELECT * FROM product_unit_conversions WHERE id = ?', (cursor.lastrowid,)).fetchall()
    return APIResponse.created(data=serialize_rows(rows)[0], message="产品单位转换规则创建成功")

@products_bp.route('/products/<int:product_id>/conversions/<int:rule_id>', methods=['PUT'])
@handle_api_errors
@validate_required_fields('from_unit', 'to_unit', 'conversion_rate')
def update_product_conversion(product_id, rule_id):
    """更新产品自定义单位换算规则。"""
    if not get_conversion_rule(product_id, rule_id):
        return APIResponse.not_found("转换规则不存在")
    data = request.get_json() or {}
    from_unit = DataValidator.validate_string(data['from_unit'], 'from_unit', min_length=1, max_length=30)
    to_unit = DataValidator.validate_string(data['to_unit'], 'to_unit', min_length=1, max_length=30)
    rate, error_response = parse_conversion_rate(data.get('conversion_rate'))
    if error_response:
        return error_response
    with get_db_connection() as conn:
        conn.execute(
            '''UPDATE product_unit_conversions
               SET from_unit = ?, to_unit = ?, conversion_rate = ?, description = ?, updated_at = CURRENT_TIMESTAMP
               WHERE id = ? AND product_id = ?''',
            (from_unit, to_unit, rate, data.get('description', ''), rule_id, product_id)
        )
        conn.commit()
    return APIResponse.success(data=get_conversion_rule(product_id, rule_id), message="产品单位转换规则更新成功")

@products_bp.route('/products/<int:product_id>/conversions/<int:rule_id>', methods=['DELETE'])
@handle_api_errors
def delete_product_conversion(product_id, rule_id):
    """删除产品自定义单位换算规则。"""
    if not get_conversion_rule(product_id, rule_id):
        return APIResponse.not_found("转换规则不存在")
    with get_db_connection() as conn:
        cursor = conn.execute('DELETE FROM product_unit_conversions WHERE id = ? AND product_id = ?', (rule_id, product_id))
        conn.commit()
    return APIResponse.success(data={'deleted_count': cursor.rowcount}, message="产品单位转换规则删除成功")

@products_bp.route('/products/<int:product_id>', methods=['PUT'])
@handle_api_errors
def update_product(product_id):
    """更新产品"""
    logger.info("更新产品请求: ID=%s", product_id)
    data = request.get_json()
    
    DataValidator.validate_integer(product_id, 'product_id', min_value=1)
    
    if not data:
        return APIResponse.error("请求数据不能为空")
    
    product = Product.update(product_id, **data)
    
    logger.info("产品更新成功: ID=%s", product_id)
    return APIResponse.success(
        data=product,
        message="产品更新成功"
    )

@products_bp.route('/products/<int:product_id>', methods=['DELETE'])
@handle_api_errors
def delete_product(product_id):
    """删除产品"""
    logger.info("删除产品请求: ID=%s", product_id)
    
    DataValidator.validate_integer(product_id, 'product_id', min_value=1)
    
    result = Product.delete(product_id)
    
    logger.info("产品删除成功: ID=%s", product_id)
    return APIResponse.success(
        data={'deleted_count': result},
        message="产品删除成功"
    )

@products_bp.route('/products/search', methods=['GET'])
@handle_api_errors
def search_products():
    """搜索产品"""
    keyword = request.args.get('q', '').strip()
    limit = DataValidator.validate_integer(request.args.get('limit', 50), 'limit', min_value=1, max_value=100)
    
    if not keyword:
        return APIResponse.error("搜索关键词不能为空")
    
    products = Product.search_products(keyword, limit)
    
    return APIResponse.success(
        data=products,
        message=f"找到 {len(products)} 个相关产品"
    )

@products_bp.route('/products/low-stock', methods=['GET'])
@handle_api_errors
def get_low_stock_products():
    """获取低库存产品"""
    products = Product.get_low_stock_products()
    
    return APIResponse.success(
        data=products,
        message=f"找到 {len(products)} 个低库存产品"
    )

@products_bp.route('/products/zero-stock', methods=['GET'])
@handle_api_errors
def get_zero_stock_products():
    """获取零库存产品"""
    products = Product.get_zero_stock_products()
    
    return APIResponse.success(
        data=products,
        message=f"找到 {len(products)} 个零库存产品"
    )

@products_bp.route('/products/non-composite', methods=['GET'])
@handle_api_errors
def get_non_composite_products():
    """获取非复合产品（用于采购订单）"""
    keyword = request.args.get('q', '').strip()
    limit = DataValidator.validate_integer(request.args.get('limit', 50), 'limit', min_value=1, max_value=100)
    
    logger.info(f"🔍 get_non_composite_products - keyword: {keyword}, limit: {limit}")
    
    if keyword:
        products = Product.search_non_composite_products(keyword, limit)
    else:
        query = '''
            SELECT * FROM products
            WHERE COALESCE(is_composite, 0) = 0
            ORDER BY name
            LIMIT ?
        '''
        products = Product.execute_query(query, (limit,))
    
    logger.info("get_non_composite_products - 返回 %s 个产品", len(products))
    
    return APIResponse.success(
        data=products,
        message=f"找到 {len(products)} 个非复合产品"
    )
