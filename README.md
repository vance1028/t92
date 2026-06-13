# 城市排水管网防汛运维管理平台 - 后端 API

一个纯后端的 REST API 服务，面向城市市政排水管网的防汛运维场景：管理运维人员账号、排水管段（雨水/污水/合流）台账与泵站台账。
本项目作为「功能迭代」类评测题目的基础工程：结构清晰、登录鉴权与基础 CRUD 已就绪，开箱即跑，无需任何外部服务。

## 技术栈

- Node.js（≥ 18）+ Express 4
- 数据库：SQLite（`better-sqlite3`，单文件、免装服务）
- 鉴权：JWT（`jsonwebtoken`）+ 基于角色的访问控制
- 密码：Node 内置 `crypto` scrypt 加盐哈希
- 测试：Node 内置 `node:test` + `supertest`（用内存库，零外部依赖）

## 快速开始

```bash
npm install
npm start          # 启动服务，默认端口 6147；空库会自动写入种子数据
```

启动后默认管理员账号：`admin / admin123`（另有 `operator / operator123`、`viewer / viewer123`）。

数据库文件默认生成在 `data/app.db`。重置种子数据：

```bash
npm run seed       # 清空并重新写入种子数据
```

运行测试（使用内存库，互不污染）：

```bash
npm test
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `6147` | API 监听端口 |
| `DB_FILE` | `data/app.db` | SQLite 文件路径；设为 `:memory:` 使用内存库 |
| `JWT_SECRET` | `urban-drainage-dev-secret` | JWT 签名密钥 |
| `TOKEN_TTL` | `8h` | 令牌有效期 |
| `SEED_ON_START` | - | 设为 `false` 可禁用启动时的空库自动播种 |

## 目录结构

```
src/
├── app.js              # 组装 Express 应用（路由、中间件、错误处理）
├── server.js           # 启动入口（建表 + 空库自动播种）
├── db.js               # better-sqlite3 连接与建表
├── seed.js             # 种子数据
├── auth.js             # JWT 签发、鉴权中间件、角色校验
├── data/
│   └── store.js        # 数据仓储层（集中所有 SQL）
├── routes/
│   ├── auth.js         # 登录 / 当前用户
│   ├── users.js        # 用户管理（仅 admin）
│   ├── pipes.js        # 排水管段台账
│   └── stations.js     # 泵站台账
└── utils/
    ├── http.js         # 统一响应与字段校验辅助
    └── password.js     # scrypt 密码哈希
scripts/
└── seed.js             # 手动重置种子数据
test/
└── api.test.js         # 接口测试（21 个用例）
```

## 角色与权限

| 角色 | 说明 | 权限 |
| --- | --- | --- |
| `admin` | 管理员 | 全部，含用户管理、删除管段/泵站 |
| `operator` | 运维员 | 管段/泵站的新建与更新 |
| `viewer` | 只读 | 仅查询 |

## 数据模型

- **users 用户**：`id, username(唯一), password_hash, name, role(admin/operator/viewer), active, created_at, updated_at`
- **pipe_segments 排水管段**：`id, code(唯一), district, type(rain/sewage/combined), material, diameter_mm, length_m, status(normal/warning/maintenance/abandoned), installed_at, remark, created_at, updated_at`
- **pump_stations 泵站**：`id, code(唯一), name, district, capacity_m3h, pump_count, status(running/standby/fault/maintenance), location, created_at, updated_at`

## API 一览

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/health` | 公开 | 健康检查 |
| POST | `/api/auth/login` | 公开 | 登录，返回 `{ token, user }` |
| GET | `/api/auth/me` | 登录 | 当前登录用户 |
| GET | `/api/users` | admin | 用户列表 |
| POST | `/api/users` | admin | 新建用户 |
| PUT | `/api/users/:id` | admin | 更新用户（姓名/角色/启用/重置密码） |
| DELETE | `/api/users/:id` | admin | 删除用户（不可删自己） |
| GET | `/api/pipes` | 登录 | 管段列表（`district`/`type`/`status`/`keyword` 过滤） |
| GET | `/api/pipes/:id` | 登录 | 管段详情 |
| POST | `/api/pipes` | admin/operator | 新建管段 |
| PUT | `/api/pipes/:id` | admin/operator | 更新管段（编号不可改） |
| DELETE | `/api/pipes/:id` | admin | 删除管段 |
| GET | `/api/stations` | 登录 | 泵站列表（`district`/`status`/`keyword` 过滤） |
| GET | `/api/stations/:id` | 登录 | 泵站详情 |
| POST | `/api/stations` | admin/operator | 新建泵站 |
| PUT | `/api/stations/:id` | admin/operator | 更新泵站（编号不可改） |
| DELETE | `/api/stations/:id` | admin | 删除泵站 |

## 响应约定

- 成功：`{ "data": ... }`，列表附带 `total`
- 失败：`{ "error": { "message": "...", "details": ... } }`，配合对应 HTTP 状态码

## 关于本项目作为评测基座

登录、鉴权、用户管理与两类核心台账（管段、泵站）的 CRUD + 过滤已完整可用，适合在其上做「功能迭代」类任务，例如：防汛工单/巡检记录、汛情告警与阈值规则、按区域的运维看板统计、台账批量导入导出等。
