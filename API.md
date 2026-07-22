# API 接口清单

本文档整理当前项目的主要 API 与页面路由。

默认服务地址：

```text
http://127.0.0.1:5001
```

API 前缀：

```text
/api
```

## 通用响应格式

### 成功响应

```json
{
  "success": true,
  "message": "操作成功",
  "data": {},
  "timestamp": "2026-04-12T21:00:00"
}
```

### 错误响应

```json
{
  "success": false,
  "error": {
    "message": "参数错误",
    "code": "VALIDATION_ERROR",
    "timestamp": "2026-04-12T21:00:00"
  }
}
```

---

## 系统接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health` | 健康检查 |

---

## 分类 Categories

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/categories` | 获取分类列表；`tree=true` 时返回树结构 |
| POST | `/api/categories` | 创建分类 |
| GET | `/api/categories/tree` | 获取树状分类 |
| GET | `/api/categories/flat` | 获取扁平分类 |
| PUT | `/api/categories/reorder` | 同级分类拖拽排序 |
| GET | `/api/categories/test-db` | 测试数据库连接 |
| GET | `/api/categories/<category_id>` | 获取分类详情 |
| PUT | `/api/categories/<category_id>` | 更新分类 |
| DELETE | `/api/categories/<category_id>` | 删除分类 |
| GET | `/api/categories/<category_id>/products` | 获取分类下产品 |
| GET | `/api/categories/<category_id>/usage` | 获取分类使用情况 |

---

## 产品 Products

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/products` | 获取产品列表（支持分页、搜索、分类过滤） |
| POST | `/api/products` | 创建产品 |
| GET | `/api/products/categories` | 获取产品分类树 |
| GET | `/api/products/low-stock` | 获取低库存产品 |
| GET | `/api/products/zero-stock` | 获取零库存产品 |
| GET | `/api/products/non-composite` | 获取非复合产品 |
| GET | `/api/products/search` | 搜索产品 |
| GET | `/api/products/<product_id>` | 获取产品详情 |
| PUT | `/api/products/<product_id>` | 更新产品 |
| DELETE | `/api/products/<product_id>` | 删除产品 |
| GET | `/api/products/<product_id>/conversions` | 获取产品单位换算规则 |
| POST | `/api/products/<product_id>/conversions` | 创建产品单位换算规则 |
| PUT | `/api/products/<product_id>/conversions/<rule_id>` | 更新产品单位换算规则 |
| DELETE | `/api/products/<product_id>/conversions/<rule_id>` | 删除产品单位换算规则 |

---

## BOM

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/bom` | 获取 BOM 列表，支持按 `product_id` 查询 |
| POST | `/api/bom` | 创建 BOM 项 |
| PUT | `/api/bom/<bom_id>` | 更新 BOM 项 |
| DELETE | `/api/bom/<bom_id>` | 删除 BOM 项 |
| DELETE | `/api/bom/product/<product_id>` | 删除某产品的全部 BOM |

---

## 订单 Orders

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/orders` | 获取订单列表 |
| POST | `/api/orders` | 创建订单 |
| GET | `/api/orders/stats` | 获取订单统计 |
| GET | `/api/orders/<order_id>` | 获取订单详情 |
| PUT | `/api/orders/<order_id>` | 更新订单 |
| DELETE | `/api/orders/<order_id>` | 删除订单 |
| POST | `/api/orders/<order_id>/delete` | 删除订单（DELETE 兼容端点） |
| POST | `/api/orders/<order_id>/complete` | 完成订单 |
| POST | `/api/orders/<order_id>/cancel` | 取消订单 |

> 说明：订单完成、取消、重建时会同步维护交易记录与库存。

---

## 交易 Transactions

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/transactions` | 获取交易记录 |
| POST | `/api/transactions` | 创建交易记录 |
| GET | `/api/transactions/recent` | 获取最近交易记录 |

---

## 生产计划 Production

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/production` | 获取生产计划列表 |
| POST | `/api/production` | 创建生产计划 |
| PUT | `/api/production/<plan_id>` | 更新生产计划 |
| DELETE | `/api/production/<plan_id>` | 删除生产计划 |

---

## 库存 Inventory

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/inventory/check` | 执行库存盘点 |

---

## 仪表板 Dashboard

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard` | 获取仪表板汇总数据 |
| GET | `/api/dashboard/alerts` | 获取库存预警 |
| GET | `/api/dashboard/transactions` | 获取最近交易记录 |

---

## 报表 Reports

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reports/bom/export` | 导出 BOM Excel 报表 |
| GET | `/api/reports/material-requirements` | 获取物料需求计划报表 |
| GET | `/api/reports/cost-analysis` | 获取成本分析报表 |
| GET | `/api/reports/purchase-list` | 获取采购清单报表 |

---

## 数据库 Database

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/database/backup` | 创建数据库备份 |
| GET | `/api/database/backups` | 获取备份列表 |
| POST | `/api/database/restore` | 恢复数据库备份 |
| POST | `/api/database/cleanup` | 清理旧备份 |

---

## 页面路由

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/` | 首页（仪表板） |
| GET | `/pages/dashboard.html` | 仪表板页面 |
| GET | `/pages/products.html` | 产品页面 |
| GET | `/pages/categories.html` | 分类页面 |
| GET | `/pages/inventory.html` | 库存页面 |
| GET | `/pages/bom.html` | BOM 页面 |
| GET | `/pages/purchase-orders.html` | 采购订单页面 |
| GET | `/pages/sales-orders.html` | 销售订单页面 |
| GET | `/pages/orders.html` | 采购订单兼容页面入口 |
| GET | `/pages/packing-list.html` | 装箱单页面 |
| GET | `/pages/labels.html` | 箱唛标签打印页面 |
| GET | `/pages/production.html` | 生产计划页面 |
| GET | `/pages/reports.html` | 报表页面 |
| GET | `/pages/exchange-rate.html` | 汇率工具页面 |
| GET | `/pages/unit-converter.html` | 单位换算页面 |
| GET | `/pages/system-config.html` | 系统配置页面 |

---

## 备注

- `send_file(...)` 类型接口（如 Excel 导出）返回文件流，不使用标准 JSON 成功结构。
- 删除接口通常返回成功 JSON；部分旧接口可能仍以兼容行为为主。
- 当前项目偏本地/内部使用，未引入认证授权，不建议直接暴露公网。
