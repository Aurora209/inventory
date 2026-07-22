from flask import Blueprint, request, jsonify
import logging
from models.transaction import Transaction
from utils.api_response import APIResponse

logger = logging.getLogger(__name__)

transactions_bp = Blueprint('transactions', __name__)

@transactions_bp.route('/transactions', methods=['GET'])
def get_transactions():
    """获取交易记录"""
    try:
        logger.debug('get_transactions called with args: %s', dict(request.args))
        product_id = request.args.get('product_id')
        transaction_type = request.args.get('type')

        transactions = Transaction.get_all(
            product_id=product_id if product_id else None,
            transaction_type=transaction_type if transaction_type else None
        )

        return APIResponse.success(data=transactions, message='获取交易记录成功')
    except Exception as e:
        logger.exception('Error in get_transactions: %s', e)
        return APIResponse.internal_error()

@transactions_bp.route('/transactions/recent', methods=['GET'])
def get_recent_transactions():
    """获取最近交易记录"""
    try:
        logger.debug('get_recent_transactions called with args: %s', dict(request.args))
        limit = request.args.get('limit', 10, type=int)
        transactions = Transaction.get_recent(limit)
        return APIResponse.success(data={'transactions': transactions}, message='获取最近交易记录成功')
    except Exception as e:
        logger.exception('Error in get_recent_transactions: %s', e)
        return APIResponse.internal_error()

@transactions_bp.route('/transactions', methods=['POST'])
def create_transaction():
    """创建交易记录"""
    try:
        logger.debug('create_transaction called')
        data = request.get_json()

        required_fields = ['product_id', 'transaction_type', 'quantity', 'unit_price', 'transaction_date']
        for field in required_fields:
            if not data.get(field):
                logger.warning('Missing required field for transaction: %s', field)
                return APIResponse.error(f'{field}不能为空', code=400, error_code='VALIDATION_ERROR')

        transaction = Transaction.create(
            product_id=data['product_id'],
            transaction_type=data['transaction_type'],
            quantity=data['quantity'],
            unit_price=data['unit_price'],
            transaction_date=data['transaction_date'],
            reference_no=data.get('reference_no'),
            customer_supplier=data.get('customer_supplier'),
            notes=data.get('notes')
        )

        return APIResponse.created(data=transaction, message='创建交易记录成功')
    except Exception as e:
        logger.exception('Error in create_transaction: %s', e)
        return APIResponse.internal_error()