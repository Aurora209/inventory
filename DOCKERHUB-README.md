# 📦 Inventory 库存管理系统

基于 Flask + SQLite 的轻量级进销存管理系统，支持 Docker 一键部署。

---

## 🚀 快速开始

### 方式一：docker run

```bash
docker run -d \
  --name inventory \
  --restart unless-stopped \
  -p 5001:5001 \
  -v inventory-data:/data \
  -e SECRET_KEY=your-secret-key \
  aurora209/inventory:latest
```

浏览器访问 `http://本机IP:5001`

### 方式二：docker-compose.yml（推荐）

```yaml
services:
  inventory:
    image: aurora209/inventory:latest
    container_name: inventory
    restart: unless-stopped
    ports:
      - "5001:5001"
    environment:
      - FLASK_CONFIG=production
      - FLASK_RUN_HOST=0.0.0.0
      - FLASK_RUN_PORT=5001
      - SECRET_KEY=change-me-to-a-strong-key
      - CORS_ORIGINS=*
      - INVENTORY_DATA_DIR=/data
      - LOG_DIR=/logs
    volumes:
      - inventory-data:/data
      - inventory-logs:/logs
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:5001/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

volumes:
  inventory-data:
  inventory-logs:
```

```bash
docker compose up -d
```

---

## 🖥️ Docker Desktop（Docker GUI）使用方法

### 1. 启动容器

1. 打开 **Docker Desktop**
2. 左侧点击 **Images** → 找到 `aurora209/inventory`
3. 点击右侧 **Run** 按钮
4. 填写配置：
   - **Container name**: `inventory`
   - **Port mapping**: `5001` → `5001`
   - **Volume**: 添加 bind mount，宿主机路径 `/path/to/data` → 容器路径 `/data`
   - **Environment**:
     - `SECRET_KEY=your-secret-key`
     - `FLASK_CONFIG=production`
   - 勾选 **Restart unless stopped**
5. 点击 **Run**

### 2. 查看运行状态

左侧点击 **Containers** → 找到 `inventory`：
- ✅ **Up** = 运行中
- 🟡 **Unhealthy** = 健康检查失败
- ❌ **Exited** = 已停止

### 3. 查看日志

点击容器 → **Logs** 标签页，实时查看运行日志和错误信息。

### 4. 停止 / 重启

容器列表中点击 ⏸️ 停止 / 🔄 重启。

### 5. 持久化数据

⚠️ **重要**：不使用 volume 挂载的话，删除容器后数据会丢失。

Docker Desktop 中设置 volume：
1. **Images** → 点击 `Run` 按钮
2. 展开 **Volumes** 区域
3. 添加 bind mount：`宿主机路径/data` → `/data`
4. 添加 bind mount：`宿主机路径/logs` → `/logs`

---

## 📂 目录结构

```
/data/            # 数据目录（SQLite 数据库）
/logs/            # 日志目录
```

### 环境变量

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `FLASK_CONFIG` | `production` | 运行模式：`production` / `development` |
| `FLASK_RUN_HOST` | `0.0.0.0` | 监听地址 |
| `FLASK_RUN_PORT` | `5001` | 监听端口 |
| `SECRET_KEY` | `local-inventory-change-me` | Flask 密钥，生产环境请修改 |
| `CORS_ORIGINS` | `*` | 允许跨域的源 |
| `INVENTORY_DATA_DIR` | `/data` | 数据目录 |
| `LOG_DIR` | `/logs` | 日志目录 |

### 健康检查

```bash
curl http://localhost:5001/health
```

---

## 🔧 常见问题

**Q: 容器启动后访问不到页面？**
A: 检查端口映射是否正确，确认防火墙允许 5001 端口。

**Q: 数据丢失怎么办？**
A: 确保使用 volume 或 bind mount 挂载 `/data` 目录。

**Q: 如何升级到新版本？**
A: `docker pull aurora209/inventory:latest && docker compose up -d`
