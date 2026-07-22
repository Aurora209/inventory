# Inventory

本项目是一个基于 **Flask + SQLite** 的本地库存管理系统，用于管理产品、分类、BOM、采购订单、销售订单、库存盘点、生产计划、报表和辅助打印工具。

默认运行地址：

```text
http://127.0.0.1:5001
```

## 技术栈

- Python 3
- Flask
- Flask-CORS
- SQLite
- openpyxl
- pandas

## 项目结构

```text
inventory/
├── app.py                  # Flask 应用工厂
├── run.py                  # 本地启动脚本
├── config.py               # 项目配置
├── logging_config.py       # 日志配置
├── requirements.txt        # 运行依赖
│
├── data/                   # SQLite 数据库与备份
├── logs/                   # 运行日志
├── models/                 # 数据模型
├── routes/                 # 路由层
│   ├── *.py                # API 路由，按业务模块拆分
│   └── pages/              # 页面路由，一个页面一个模块
├── services/               # 业务服务层
├── utils/                  # 通用工具
├── static/                 # 前端静态资源
└── templates/              # 页面模板
```

## 安装与启动

在项目根目录执行：

```bash
cd /home/zhou/inventory
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python run.py
```

健康检查：

```text
GET /health
```

## 页面路由

页面路由位于 `routes/pages/`，每个页面对应一个独立路由模块。

- `/`：仪表板首页
- `/pages/dashboard.html`：仪表板
- `/pages/products.html`：产品管理
- `/pages/categories.html`：分类管理
- `/pages/bom.html`：BOM 管理
- `/pages/purchase-orders.html`：采购订单
- `/pages/sales-orders.html`：销售订单
- `/pages/orders.html`：采购订单兼容入口
- `/pages/inventory.html`：库存盘点
- `/pages/production.html`：生产计划
- `/pages/reports.html`：报表中心
- `/pages/packing-list.html`：装箱单工具
- `/pages/labels.html`：箱唛标签打印
- `/pages/exchange-rate.html`：汇率工具
- `/pages/unit-converter.html`：单位换算
- `/pages/system-config.html`：系统配置

## API 路由

API 路由统一使用 `/api` 前缀，按业务模块拆分在 `routes/` 下。

- `categories.py`：分类管理
- `products.py`：产品管理、单位换算规则
- `bom.py`：BOM 管理
- `orders.py`：采购 / 销售订单
- `transactions.py`：交易记录
- `production.py`：生产计划
- `inventory.py`：库存盘点
- `dashboard.py`：仪表板统计
- `reports.py`：报表与导出
- `database.py`：数据库备份与恢复

完整接口清单见 [API.md](./API.md)。

## 核心功能

- 产品分页、搜索、分类过滤
- 分类树管理与同级排序
- 产品单位换算规则
- BOM 维护、展开与成本计算
- 采购订单 / 销售订单管理
- 订单完成、取消、修改时同步库存与交易记录
- 库存盘点
- 生产计划
- BOM 导出、物料需求、成本分析、采购清单报表
- 数据库备份、恢复、旧备份清理

## 数据与日志

- 主数据库：`data/inventory.db`
- 备份目录：`data/backups/`
- 日志目录：`logs/`

## 基础检查

```bash
python -m compileall -q app.py config.py logging_config.py models routes services utils
```

也可以启动服务后访问：

```text
http://127.0.0.1:5001/health
```

## 说明

项目面向本地或内部环境使用，当前未引入登录认证。
