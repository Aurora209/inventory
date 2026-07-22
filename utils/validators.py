"""数据验证工具"""
from typing import Any, Dict, List, Optional, Union
from decimal import Decimal
import re
from utils.error_handler import ValidationError
from utils.api_response import APIResponse

class DataValidator:
    """数据验证器"""
    
    @staticmethod
    def validate_required(data: Dict[str, Any], required_fields: List[str]) -> None:
        """验证必需字段"""
        missing_fields = []
        for field in required_fields:
            if field not in data or data[field] in (None, ""):
                missing_fields.append(field)
        
        if missing_fields:
            raise ValidationError(
                f"缺少必需字段: {', '.join(missing_fields)}",
                field=missing_fields[0] if len(missing_fields) == 1 else None
            )
    
    @staticmethod
    def validate_string(value: Any, field: str, min_length: int = 1, max_length: int = 255) -> str:
        """验证字符串字段"""
        if value is None:
            raise ValidationError(f"字段 '{field}' 不能为空", field=field)
        
        if not isinstance(value, str):
            raise ValidationError(f"字段 '{field}' 必须是字符串", field=field)
        
        value = value.strip()
        if len(value) < min_length:
            raise ValidationError(f"字段 '{field}' 长度不能少于 {min_length} 个字符", field=field)
        
        if len(value) > max_length:
            raise ValidationError(f"字段 '{field}' 长度不能超过 {max_length} 个字符", field=field)
        
        return value
    
    @staticmethod
    def validate_integer(value: Any, field: str, min_value: int = None, max_value: int = None) -> int:
        """验证整数字段"""
        if value is None:
            raise ValidationError(f"字段 '{field}' 不能为空", field=field)
        
        try:
            int_value = int(value)
        except (ValueError, TypeError):
            raise ValidationError(f"字段 '{field}' 必须是整数", field=field)
        
        if min_value is not None and int_value < min_value:
            raise ValidationError(f"字段 '{field}' 不能小于 {min_value}", field=field)
        
        if max_value is not None and int_value > max_value:
            raise ValidationError(f"字段 '{field}' 不能大于 {max_value}", field=field)
        
        return int_value
    
    @staticmethod
    def validate_float(value: Any, field: str, min_value: float = None, max_value: float = None) -> float:
        """验证浮点数字段"""
        if value is None:
            raise ValidationError(f"字段 '{field}' 不能为空", field=field)
        
        try:
            float_value = float(value)
        except (ValueError, TypeError):
            raise ValidationError(f"字段 '{field}' 必须是数字", field=field)
        
        if min_value is not None and float_value < min_value:
            raise ValidationError(f"字段 '{field}' 不能小于 {min_value}", field=field)
        
        if max_value is not None and float_value > max_value:
            raise ValidationError(f"字段 '{field}' 不能大于 {max_value}", field=field)
        
        return float_value
    
    @staticmethod
    def validate_decimal(value: Any, field: str, min_value: Decimal = None, max_value: Decimal = None) -> Decimal:
        """验证Decimal字段"""
        if value is None:
            raise ValidationError(f"字段 '{field}' 不能为空", field=field)
        
        try:
            decimal_value = Decimal(str(value))
        except (ValueError, TypeError):
            raise ValidationError(f"字段 '{field}' 必须是有效的数字", field=field)
        
        if min_value is not None and decimal_value < min_value:
            raise ValidationError(f"字段 '{field}' 不能小于 {min_value}", field=field)
        
        if max_value is not None and decimal_value > max_value:
            raise ValidationError(f"字段 '{field}' 不能大于 {max_value}", field=field)
        
        return decimal_value
    
    @staticmethod
    def validate_positive_number(value: Any, field: str) -> Union[int, float]:
        """验证正数"""
        if value is None:
            value = 0
            
        try:
            num_value = float(value)
        except (ValueError, TypeError):
            raise ValidationError(f"字段 '{field}' 必须是数字", field=field)
            
        if num_value < 0:
            raise ValidationError(f"字段 '{field}' 不能为负数", field=field)
            
        return num_value
    
    @staticmethod
    def validate_order_items(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """验证订单项列表"""
        if not items:
            raise ValidationError("订单项不能为空", field='items')
        
        validated_items = []
        for i, item in enumerate(items):
            try:
                validated_item = {}
                
                if 'product_id' in item and item['product_id'] is not None:
                    validated_item['product_id'] = DataValidator.validate_integer(item['product_id'], f'items[{i}].product_id', min_value=1)
                
                DataValidator.validate_required(item, ['description'])
                validated_item['description'] = DataValidator.validate_string(item['description'], f'items[{i}].description', min_length=1, max_length=200)
                
                validated_item['quantity'] = DataValidator.validate_positive_number(item.get('quantity', 1), f'items[{i}].quantity')
                validated_item['unit_price'] = float(DataValidator.validate_decimal(item.get('unit_price', 0), f'items[{i}].unit_price', min_value=Decimal('0')))
                if 'total_price' in item:
                    validated_item['total_price'] = float(DataValidator.validate_decimal(item.get('total_price', 0), f'items[{i}].total_price', min_value=Decimal('0')))
                if 'unit' in item:
                    validated_item['unit'] = DataValidator.validate_string(item.get('unit') or '个', f'items[{i}].unit', min_length=1, max_length=20)

                if 'units_per_box' in item:
                    value = item.get('units_per_box')
                    validated_item['units_per_box'] = 1 if value in ('', None) else DataValidator.validate_integer(value, f'items[{i}].units_per_box', min_value=1)

                if 'packaging' in item:
                    validated_item['packaging'] = DataValidator.validate_string(item.get('packaging') or '', f'items[{i}].packaging', min_length=0, max_length=200)

                if 'notes' in item:
                    validated_item['notes'] = DataValidator.validate_string(item.get('notes') or '', f'items[{i}].notes', min_length=0, max_length=500)
                
                validated_items.append(validated_item)
            except ValidationError as e:
                # 为错误添加更具体的字段路径
                # 结合原始错误信息和当前项的索引，确保字段路径正确嵌套
                detail_field = f'items[{i}].{e.field}' if e.field else f'items[{i}]'
                raise ValidationError(f"订单项 {i+1}: {e.message}", field=detail_field)
        
        return validated_items


class ProductValidator:
    """产品数据验证器"""
    
    @staticmethod
    def validate_create_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """验证创建产品数据"""
        DataValidator.validate_required(data, ['sku', 'name'])
        
        validated_data = {}
        
        # 验证SKU
        validated_data['sku'] = DataValidator.validate_string(data['sku'], 'sku', min_length=1, max_length=50)
        
        # 验证名称
        validated_data['name'] = DataValidator.validate_string(data['name'], 'name', min_length=1, max_length=100)
        
        # 验证分类ID
        if 'category_id' in data and data['category_id'] is not None:
            validated_data['category_id'] = DataValidator.validate_integer(data['category_id'], 'category_id', min_value=1)
        else:
            validated_data['category_id'] = None
        
        # 验证数量
        validated_data['quantity'] = DataValidator.validate_integer(data.get('quantity', 0), 'quantity', min_value=0)
        
        # 验证价格
        validated_data['price'] = float(DataValidator.validate_decimal(data.get('price', 0), 'price', min_value=Decimal('0')))
        
        # 验证单位
        validated_data['unit'] = DataValidator.validate_string(data.get('unit', '个'), 'unit', min_length=1, max_length=20)
        
        # 验证最小库存
        if 'min_stock' in data and data['min_stock'] is not None:
            validated_data['min_stock'] = DataValidator.validate_integer(data['min_stock'], 'min_stock', min_value=0)
        else:
            validated_data['min_stock'] = None
        
        # 验证最大库存
        if 'max_stock' in data and data['max_stock'] is not None:
            validated_data['max_stock'] = DataValidator.validate_integer(data['max_stock'], 'max_stock', min_value=0)
        else:
            validated_data['max_stock'] = None
        
        # 验证描述
        validated_data['description'] = DataValidator.validate_string(data.get('description', ''), 'description', min_length=0, max_length=500)
        
        # 验证是否为复合产品
        validated_data['is_composite'] = bool(data.get('is_composite', False))

        product_type = DataValidator.validate_string(data.get('product_type', 'finished'), 'product_type', min_length=3, max_length=30)
        if product_type not in ['finished', 'raw_material']:
            raise ValidationError("product_type 必须是 finished 或 raw_material", field='product_type')
        validated_data['product_type'] = product_type
        
        return validated_data
    
    @staticmethod
    def validate_update_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """验证更新产品数据"""
        validated_data = {}
        
        # 可更新的字段列表
        updatable_fields = ['sku', 'name', 'category_id', 'quantity', 'price', 'unit', 'min_stock', 'max_stock', 'description', 'is_composite', 'product_type']
        
        for field in updatable_fields:
            if field in data:
                if field == 'sku':
                    validated_data[field] = DataValidator.validate_string(data[field], field, min_length=1, max_length=50)
                elif field == 'name':
                    validated_data[field] = DataValidator.validate_string(data[field], field, min_length=1, max_length=100)
                elif field in ['category_id', 'quantity', 'min_stock', 'max_stock']:
                    if data[field] is not None:
                        validated_data[field] = DataValidator.validate_integer(data[field], field, min_value=0)
                    else:
                        validated_data[field] = None
                elif field == 'price':
                    validated_data[field] = float(DataValidator.validate_decimal(data[field], field, min_value=Decimal('0')))
                elif field == 'unit':
                    validated_data[field] = DataValidator.validate_string(data[field], field, min_length=1, max_length=20)
                elif field == 'description':
                    validated_data[field] = DataValidator.validate_string(data[field], field, min_length=0, max_length=500)
                elif field == 'is_composite':
                    validated_data[field] = bool(data[field])
                elif field == 'product_type':
                    product_type = DataValidator.validate_string(data[field], field, min_length=3, max_length=30)
                    if product_type not in ['finished', 'raw_material']:
                        raise ValidationError("product_type 必须是 finished 或 raw_material", field='product_type')
                    validated_data[field] = product_type
        
        return validated_data


class OrderValidator:
    """订单数据验证器"""
    
    @staticmethod
    def validate_create_data(data: Dict[str, Any]) -> Dict[str, Any]:
        """验证创建订单数据"""
        DataValidator.validate_required(data, ['order_type', 'customer_supplier', 'order_date'])
        
        validated_data = {}
        
        # 验证订单类型
        order_type = DataValidator.validate_string(data['order_type'], 'order_type')
        if order_type not in ['purchase', 'sales']:
            raise ValidationError("订单类型必须是 'purchase' 或 'sales'", field='order_type')
        validated_data['order_type'] = order_type
        
        # 验证客户/供应商
        validated_data['customer_supplier'] = DataValidator.validate_string(data['customer_supplier'], 'customer_supplier', min_length=1, max_length=100)
        
        # 验证订单日期
        validated_data['order_date'] = DataValidator.validate_string(data['order_date'], 'order_date')
        # 这里可以添加更严格的日期格式验证
        
        # 验证可选字段
        if 'total_amount' in data:
            validated_data['total_amount'] = float(DataValidator.validate_decimal(data.get('total_amount', 0), 'total_amount', min_value=Decimal('0')))
        
        if 'shipping_cost' in data:
            validated_data['shipping_cost'] = float(DataValidator.validate_decimal(data.get('shipping_cost', 0), 'shipping_cost', min_value=Decimal('0')))
        
        if 'status' in data:
            status = DataValidator.validate_string(data.get('status', 'pending'), 'status')
            if status not in ['pending', 'completed', 'cancelled']:
                raise ValidationError("订单状态无效", field='status')
            validated_data['status'] = status
        
        if 'notes' in data:
            validated_data['notes'] = DataValidator.validate_string(data.get('notes', ''), 'notes', min_length=0, max_length=500)
        
        # 验证订单项
        if 'items' in data:
            validated_data['items'] = DataValidator.validate_order_items(data['items'])
        
        # 验证其他可选字段
        for field in ['order_number', 'seller_name', 'seller_address', 'seller_phone', 'seller_taxNo', 'seller_note']:
            if field in data:
                validated_data[field] = DataValidator.validate_string(data[field], field, min_length=0, max_length=200)
        
        return validated_data