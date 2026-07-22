from flask import Blueprint, request, jsonify
import logging

from models.bom import BOM
from models.product import Product
from services.inventory_service import InventoryService
from utils.api_response import APIResponse

logger = logging.getLogger(__name__)

bom_bp = Blueprint('bom', __name__)

@bom_bp.route('/bom', methods=['GET'])
def get_bom():
    """获取BOM列表"""
    try:
        logger.debug('get_bom called with args: %s', dict(request.args))
        product_id = request.args.get('product_id')
        expand = request.args.get('expand', '').lower() == 'true'
        shipping_cost_str = request.args.get('shipping_cost', '0')
        
        # 安全地转换shipping_cost为浮点数
        try:
            shipping_cost = float(shipping_cost_str) if shipping_cost_str else 0
        except (ValueError, TypeError):
            shipping_cost = 0
        
        if product_id:
            # 确保product_id是整数
            try:
                product_id = int(product_id)
            except (ValueError, TypeError):
                return APIResponse.error('无效的产品ID', code=400, error_code='VALIDATION_ERROR')
                
            if expand:
                bom_items = BOM.get_by_product_with_components(product_id)
            else:
                bom_items = BOM.get_by_product(product_id)
            # 计算总成本
            total_cost = InventoryService.calculate_bom_cost(bom_items)
            
            # 如果提供了快递费用，则计算包含快递费用的BOM成本
            if shipping_cost > 0:
                bom_items = InventoryService.calculate_material_cost_with_shipping(
                    bom_items, 
                    1,  # 默认数量为1，因为BOM是单位用量
                    shipping_cost
                )
                total_cost = sum(item.get('total_cost_with_shipping', 0) for item in bom_items)
            
            return APIResponse.success(
                data={
                    'items': bom_items,
                    'total_cost': float(total_cost)
                },
                message='获取BOM成功'
            )
        else:
            # 获取所有产品的BOM信息
            products_data = Product.get_all()
            products = products_data.get('products', []) if isinstance(products_data, dict) else products_data
            result = []
            for product in products:
                try:
                    # 确保产品ID是整数
                    product_id = int(product['id']) if product.get('id') else None
                    if not product_id:
                        continue
                        
                    if expand:
                        bom_items = BOM.get_by_product_with_components(product_id)
                    else:
                        bom_items = BOM.get_by_product(product_id)
                    # 计算总成本（基于物料项的小计）
                    total_cost = sum(float(item.get('item_cost', 0)) for item in bom_items)
                    
                    # 格式化产品信息
                    formatted_product = {
                        'id': product_id,
                        'sku': product.get('sku', ''),
                        'name': product.get('name', ''),
                        'category_id': product.get('category_id', None),
                        'category_name': product.get('category_name', ''),
                        'category_parent_id': product.get('category_parent_id', None),
                        'description': product.get('description', ''),
                        'is_composite': product.get('is_composite', False),
                        'product_type': product.get('product_type', 'finished'),
                        'totalCost': float(total_cost),
                        'updated_at': product.get('updated_at', ''),
                        'bomItems': []
                    }
                    
                    # 格式化BOM项
                    for item in bom_items:
                        formatted_item = {
                            'id': item.get('id', 0),
                            'materialId': item.get('material_id', 0),
                            'materialName': item.get('material_name', ''),
                            'materialSku': item.get('material_sku', ''),
                            'materialCategoryId': item.get('material_category_id', None),
                            'materialCategoryName': item.get('material_category_name', ''),
                            'materialCategoryParentId': item.get('material_category_parent_id', None),
                            'materialProductType': item.get('material_product_type', ''),
                            'quantityRequired': float(item.get('quantity_required', 0)),
                            'unit': item.get('unit', '个'),
                            'currentStock': float(item.get('current_stock', 0)),
                            'materialPrice': float(item.get('material_price', 0)),
                            'itemCost': float(item.get('item_cost', 0))
                        }
                        formatted_product['bomItems'].append(formatted_item)
                    
                    result.append(formatted_product)
                except Exception as e:
                    logger.error("处理产品BOM时出错 (产品ID: %s): %s", product.get('id'), str(e), exc_info=True)
                    # 继续处理下一个产品，而不是中断整个过程
                    continue
            
            return APIResponse.success(data=result, message='获取BOM列表成功')
    except Exception as e:
        logger.error("获取BOM列表时出错: %s", str(e), exc_info=True)
        return APIResponse.internal_error('获取BOM列表失败')

@bom_bp.route('/bom', methods=['POST'])
def create_bom_item():
    """创建BOM项"""
    try:
        logger.debug('create_bom_item called')
        data = request.get_json(silent=True) or {}
        
        required_fields = ['product_id', 'material_id', 'quantity_required']
        for field in required_fields:
            if data.get(field) in (None, ''):
                return APIResponse.error(f'{field}不能为空', code=400, error_code='VALIDATION_ERROR')
        
        # 确保quantity_required是数值类型
        try:
            quantity_required = float(data['quantity_required'])
            product_id = int(data['product_id'])
            material_id = int(data['material_id'])
            unit = data.get('unit', '个')  # 获取单位，默认为'个'
        except (ValueError, TypeError) as e:
            return APIResponse.error('数据类型错误，请检查输入值', code=400, error_code='VALIDATION_ERROR')
        
        bom_item = BOM.create(
            product_id=product_id,
            material_id=material_id,
            quantity_required=quantity_required,
            unit=unit  # 保存单位
        )
        
        return APIResponse.created(data=bom_item, message='创建BOM项成功')
    except ValueError as e:
        logger.warning('ValueError in create_bom_item: %s', e)
        return APIResponse.error(str(e), code=400, error_code='VALIDATION_ERROR')
    except Exception as e:
        logger.exception('Error in create_bom_item: %s', e)
        return APIResponse.internal_error()

@bom_bp.route('/bom/<int:bom_id>', methods=['PUT'])
def update_bom_item(bom_id):
    """更新BOM项"""
    try:
        logger.debug('update_bom_item called with id: %s', bom_id)
        data = request.get_json(silent=True) or {}
        
        if 'quantity_required' not in data:
            return APIResponse.error('用量不能为空', code=400, error_code='VALIDATION_ERROR')
        
        bom_item = BOM.update(bom_id, data['quantity_required'])
        
        # 格式化返回数据
        formatted_item = {
            'id': bom_item['id'],
            'materialId': bom_item.get('material_id', 0),
            'materialName': bom_item['material_name'],
            'materialSku': bom_item['material_sku'],
            'materialCategoryId': bom_item.get('material_category_id', None),
            'materialCategoryName': bom_item.get('material_category_name', ''),
            'materialCategoryParentId': bom_item.get('material_category_parent_id', None),
            'materialProductType': bom_item.get('material_product_type', ''),
            'quantityRequired': bom_item['quantity_required'],
            'unit': bom_item.get('unit', '个'),
            'currentStock': bom_item.get('material_quantity', 0),
            'materialPrice': float(bom_item.get('material_price', 0)),
            'itemCost': float(bom_item.get('item_cost', 0))
        }
        
        return APIResponse.success(data=formatted_item, message='更新BOM项成功')
    except ValueError as e:
        logger.warning('ValueError in update_bom_item: %s', e)
        return APIResponse.error(str(e), code=400, error_code='VALIDATION_ERROR')
    except Exception as e:
        logger.exception('Error in update_bom_item: %s', e)
        return APIResponse.internal_error()

@bom_bp.route('/bom/<int:bom_id>', methods=['DELETE'])
def delete_bom_item(bom_id):
    """删除BOM项"""
    try:
        logger.debug('delete_bom_item called with id: %s', bom_id)
        BOM.delete(bom_id)
        return '', 204
    except ValueError as e:
        logger.warning('ValueError in delete_bom_item: %s', e)
        return APIResponse.error(str(e), code=400, error_code='VALIDATION_ERROR')
    except Exception as e:
        logger.exception('Error in delete_bom_item: %s', e)
        return APIResponse.internal_error()


@bom_bp.route('/bom/product/<int:product_id>', methods=['DELETE'])
def delete_product_bom(product_id):
    """删除产品的整个BOM"""
    try:
        logger.debug('delete_product_bom called for product_id: %s', product_id)
        # 删除产品相关的所有BOM项
        query = 'DELETE FROM bom WHERE product_id = ?'
        result = BOM.execute_update(query, (product_id,))
        return APIResponse.success(data={'deleted_count': result}, message='产品BOM删除成功')
    except Exception as e:
        logger.exception('Error in delete_product_bom: %s', e)
        return APIResponse.internal_error()
