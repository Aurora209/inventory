"""分类相关路由。"""
from flask import Blueprint, request
import logging
from services.category_service import CategoryService
from models.product import Product
from models.category import Category
from utils.api_response import APIResponse
from utils.error_handler import handle_api_errors, validate_required_fields
from utils.validators import DataValidator

logger = logging.getLogger(__name__)

categories_bp = Blueprint('categories', __name__)

@categories_bp.route('/categories', methods=['GET'])
@handle_api_errors
def get_categories():
    """获取分类列表"""
    logger.debug("获取分类列表请求")
    
    tree = request.args.get('tree', 'false').lower() == 'true'
    
    if tree:
        categories = CategoryService.get_categories_tree()
        return APIResponse.success(
            data={'categories': categories},
            message="获取树状分类成功"
        )
    else:
        categories = CategoryService.get_categories_flat()
        return APIResponse.success(
            data=categories,
            message="获取扁平分类成功"
        )

@categories_bp.route('/categories/tree', methods=['GET'])
@handle_api_errors
def get_categories_tree():
    """获取树状分类结构"""
    logger.debug("获取树状分类请求")
    
    categories = CategoryService.get_categories_tree()
    
    return APIResponse.success(
        data={'categories': categories},
        message="获取树状分类成功"
    )

@categories_bp.route('/categories/flat', methods=['GET'])
@handle_api_errors
def get_categories_flat():
    """获取扁平分类结构"""
    logger.debug("获取扁平分类请求")
    
    categories = CategoryService.get_categories_flat()
    
    return APIResponse.success(
        data=categories,
        message="获取扁平分类成功"
    )

@categories_bp.route('/categories', methods=['POST'])
@handle_api_errors
@validate_required_fields('name')
def create_category():
    """创建分类"""
    logger.info("创建分类请求")
    data = request.get_json()
    
    name = DataValidator.validate_string(data['name'], 'name', min_length=1, max_length=50)
    parent_id = data.get('parent_id')
    
    if parent_id is not None:
        parent_id = DataValidator.validate_integer(parent_id, 'parent_id', min_value=1)
        # 验证父分类是否存在
        parent_category = Category.get_by_id(parent_id)
        if not parent_category:
            return APIResponse.error("父分类不存在", code=400)
    
    # 创建分类
    category = CategoryService.create_category(name=name, parent_id=parent_id)
    
    logger.info("分类创建成功: ID=%s, 名称=%s", category['id'], category['name'])
    return APIResponse.created(
        data=category,
        message="分类创建成功",
        location=f"/api/categories/{category['id']}"
    )

@categories_bp.route('/categories/reorder', methods=['PUT'])
@handle_api_errors
def reorder_categories():
    """重排同一父级下的分类顺序"""
    data = request.get_json() or {}
    parent_id = data.get('parent_id')
    ordered_ids = data.get('ordered_ids') or []

    if parent_id is not None:
        parent_id = DataValidator.validate_integer(parent_id, 'parent_id', min_value=1)
        if not Category.get_by_id(parent_id):
            return APIResponse.error("父分类不存在", code=400)

    if not isinstance(ordered_ids, list) or not ordered_ids:
        return APIResponse.error("排序列表不能为空", code=400)

    ordered_ids = [DataValidator.validate_integer(item, 'ordered_ids', min_value=1) for item in ordered_ids]
    updated = CategoryService.reorder_siblings(parent_id, ordered_ids)

    return APIResponse.success(
        data={'updated_count': updated},
        message="分类排序已保存"
    )

@categories_bp.route('/categories/<int:category_id>', methods=['GET'])
@handle_api_errors
def get_category(category_id):
    """获取单个分类"""
    logger.debug("获取分类详情: ID=%s", category_id)
    
    DataValidator.validate_integer(category_id, 'category_id', min_value=1)
    
    category = Category.get_by_id(category_id)
    if not category:
        return APIResponse.not_found("分类不存在")
    
    return APIResponse.success(
        data=category,
        message="获取分类详情成功"
    )

@categories_bp.route('/categories/<int:category_id>/usage', methods=['GET'])
@handle_api_errors
def get_category_usage(category_id):
    """获取分类使用情况"""
    logger.debug("获取分类使用情况: ID=%s", category_id)
    
    DataValidator.validate_integer(category_id, 'category_id', min_value=1)
    
    # 验证分类是否存在
    category = Category.get_by_id(category_id)
    if not category:
        return APIResponse.not_found("分类不存在")
    
    # 获取使用该分类的产品
    products = Product.get_by_category(category_id)
    
    return APIResponse.success(
        data={
            'category': category,
            'products': products,
            'product_count': len(products)
        },
        message="获取分类使用情况成功"
    )

@categories_bp.route('/categories/<int:category_id>', methods=['PUT'])
@handle_api_errors
@validate_required_fields('name')
def update_category(category_id):
    """更新分类"""
    logger.info("更新分类请求: ID=%s", category_id)
    data = request.get_json()
    
    DataValidator.validate_integer(category_id, 'category_id', min_value=1)
    
    # 验证分类是否存在
    existing_category = Category.get_by_id(category_id)
    if not existing_category:
        return APIResponse.not_found("分类不存在")
    
    name = DataValidator.validate_string(data['name'], 'name', min_length=1, max_length=50)
    
    category = Category.update(category_id, name=name)
    
    logger.info("分类更新成功: ID=%s, 新名称=%s", category_id, name)
    return APIResponse.success(
        data=category,
        message="分类更新成功"
    )

@categories_bp.route('/categories/<int:category_id>', methods=['DELETE'])
@handle_api_errors
def delete_category(category_id):
    """删除分类"""
    logger.info("删除分类请求: ID=%s", category_id)
    
    DataValidator.validate_integer(category_id, 'category_id', min_value=1)
    
    result = CategoryService.delete_category(category_id)
    
    logger.info("分类删除成功: ID=%s", category_id)
    return APIResponse.success(
        data={'deleted_count': result},
        message="分类删除成功"
    )

@categories_bp.route('/categories/<int:category_id>/products', methods=['GET'])
@handle_api_errors
def get_category_products(category_id):
    """获取分类下的所有产品"""
    logger.debug("获取分类产品: ID=%s", category_id)
    
    DataValidator.validate_integer(category_id, 'category_id', min_value=1)
    
    # 验证分类是否存在
    category = Category.get_by_id(category_id)
    if not category:
        return APIResponse.not_found("分类不存在")
    
    # 获取分类及其子分类的所有产品
    category_ids = CategoryService.get_descendant_ids(category_id)
    products = []
    
    for cat_id in category_ids:
        cat_products = Product.get_by_category(int(cat_id))
        products.extend(cat_products)
    
    return APIResponse.success(
        data={
            'category': category,
            'products': products,
            'product_count': len(products)
        },
        message="获取分类产品成功"
    )

@categories_bp.route('/categories/test-db', methods=['GET'])
@handle_api_errors
def test_database():
    """测试数据库连接"""
    logger.debug("测试数据库连接")
    
    try:
        # 测试数据库连接和基本操作
        categories_count = Category.count()
        products_count = Product.count()
        
        return APIResponse.success(
            data={
                'status': 'healthy',
                'categories_count': categories_count,
                'products_count': products_count,
                'database_tables': ['categories', 'products', 'bom', 'transactions', 'orders', 'order_items', 'production_plans']
            },
            message="数据库连接正常"
        )
    except Exception as e:
        logger.error("数据库测试失败: %s", e)
        return APIResponse.internal_error("数据库连接异常")