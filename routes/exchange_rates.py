"""汇率接口。"""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from flask import Blueprint, current_app, request

from utils.api_response import APIResponse


exchange_rates_bp = Blueprint('exchange_rates', __name__)

SUPPORTED_CURRENCIES = (
    'USD', 'EUR', 'JPY', 'GBP', 'HKD', 'AUD', 'CAD',
    'SGD', 'CHF', 'KRW', 'THB', 'MYR',
)


@exchange_rates_bp.route('/exchange-rates/latest', methods=['GET'])
def latest_exchange_rates():
    """从免账号公开接口拉取最新汇率。"""
    base = request.args.get('base', 'CNY').upper()
    symbols = request.args.get('symbols')
    to_currencies = [
        item.strip().upper()
        for item in (symbols.split(',') if symbols else SUPPORTED_CURRENCIES)
        if item.strip().upper() != base
    ]
    api_base_url = current_app.config.get('EXCHANGE_RATE_API_BASE_URL')
    url = f'{api_base_url.rstrip("/")}/v6/latest/{base}'
    req = Request(
        url,
        headers={
            'Accept': 'application/json',
            'User-Agent': 'inventory-exchange-rate/1.0',
        },
    )

    try:
        with urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode('utf-8'))
    except HTTPError as exc:
        current_app.logger.warning('汇率接口 HTTP 错误: %s', exc.code)
        return APIResponse.error(
            message='实时汇率接口请求失败',
            code=502,
            error_code='EXCHANGE_RATE_API_HTTP_ERROR',
            details={'status': exc.code},
        )
    except (URLError, TimeoutError, json.JSONDecodeError) as exc:
        current_app.logger.warning('汇率接口不可用: %s', exc)
        return APIResponse.error(
            message='实时汇率接口暂时不可用',
            code=502,
            error_code='EXCHANGE_RATE_API_UNAVAILABLE',
        )

    if payload.get('result') and payload.get('result') != 'success':
        return APIResponse.error(
            message='实时汇率接口返回失败',
            code=502,
            error_code='EXCHANGE_RATE_API_FAILED',
            details={'result': payload.get('result')},
        )

    source_rates = payload.get('rates') or {}
    rates = {
        code: float(source_rates[code])
        for code in to_currencies
        if code in source_rates and source_rates[code] is not None
    }
    if not rates:
        return APIResponse.error(
            message='实时汇率响应为空',
            code=502,
            error_code='EXCHANGE_RATE_API_EMPTY_RATES',
        )

    return APIResponse.success({
        'base': base,
        'source': 'open.er-api.com',
        'timestamp': payload.get('time_last_update_unix'),
        'updated_at': payload.get('time_last_update_utc'),
        'rates': rates,
    }, message='实时汇率已加载')
