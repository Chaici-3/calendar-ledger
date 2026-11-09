# 📅 Calendar Ledger（日历记账本）

> 你的智能个人财务管家 —— 不只是一个记账本，更是一套会「管住你」的日常消费系统。

![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-better--sqlite3-003B57?logo=sqlite&logoColor=white)
![LLM](https://img.shields.io/badge/LLM-OpenAI%20Compatible-10A37F)

Calendar Ledger 把「记账」和「控预算」合成了一件事。你在日历上记录每一笔收支，系统按自然日结算你的每日额度：超了就进「待填补队列」，省了就自动去填最早的那个坑，跨天的空白日同样结算。再加上按自然月结算的兴趣预算，以及一位会先劝你冷静三天的 AI 助手，冲动消费在掏钱之前就被拦了一道。

## ✨ 三大核心亮点

### 1️⃣ 每日限额与超支跨天填补引擎

- 每天有且只有一个固定额度，超支不会消失，而是进入 **FIFO 待填补队列**。
- 之后任何一天花得比额度少，省下的钱自动优先填补**最早**的超支，直到填平。
- 相邻两次记账之间的**空白日**也按额度结算为结余，单段最多折算 **30 天**，避免「几个月不记账 → 凭空多出几万结余」。
- 「记账基准日」显式锁定计算起点：删除最早记录也不会让起点漂移。

### 2️⃣ 爱好兴趣预算监控

- 按月设置兴趣消费预算，只统计**带「爱好」标签的支出**，收入与其他标签不计入。
- 自然月结算，跨月自动刷新为全新额度。
- 超额时**仍然允许存入**（不阻塞你的记录），但接口返回 `warning`，页面顶部弹出红色提示条，大盘同步显示红色负数余额。

### 3️⃣ AI 冲动消费拦截助手

- 在聊天里说出想买的东西和价格，助手会结合你的**总余额、待填补超支、兴趣预算、愿望单**先劝你冷静。
- 劝阻无效？引导你加入**愿望单**，并进入 3 天冷静期。
- 愿望单会算出「如果买下，每天需要省多少钱」；你可以「买下」（自动生成一笔记账）或「放弃」。
- 支持任意 OpenAI 格式 API，默认接入 DeepSeek；未配置 Key 时前后端优雅降级，不影响记账功能。

## 🚀 功能特性

### 📒 记账

- ➕ 收入 / 支出双类型，金额按「分」存储，杜绝浮点误差
- 🏷️ 多标签体系，预置「餐饮 / 交通 / 爱好 / 购物 / 其他」，支持自定义标签
- 🗓️ 日历弹窗选日 + 左侧时间轴快速跳转，标出今天与超支日
- ✏️ 单条记录可改金额、备注、类型、标签，可删除

### 📊 总览大盘

- 💰 当前总余额（总收入 − 总支出）
- 📏 每日固定额度
- 📈 今日结余（今日收入 − 今日支出）
- ⚠️ 待填补超支（红色高亮，填平即消失）
- 🎯 本月兴趣预算剩余（未设置显示「未设置」，超额显示红色负数）

### 🧮 超支填补引擎

- 按自然日聚合「净流出 = 当日支出 − 当日收入」，只有超过额度的那部分才入队
- 结余优先填最早超支（FIFO），填不完顺延，填完剩余转入结转池
- 中间空白日与末尾空白日均参与结算，单段上限 30 天
- 起点由「记账基准日」与「最早记录日」中较晚者决定，基准日前的记录只计入总余额
- 今日尚未结束，不参与结余折算，当天是否超支实时可见

### 🎯 兴趣预算

- 一条 SQL 完成「月份 + 标签 + 支出类型」三重条件的聚合，不受多对多标签表拖累
- 保存时按**该记录自身日期所在月份**判定是否超额，补记历史月份不会误报当月

### 🤖 AI 助手与愿望单

- 💬 对话记录持久化（`impulse_messages`），按会话续聊
- 🧊 冷静期倒计时：还剩几天才「解冻」
- 💸 每日需省金额：`ceil(价格 ÷ 本月剩余天数)`，随日期自动变化
- 🛒 「买下」在事务内同时写账单与更新状态，保证账实一致
- 🛡️ 未配置 API Key：接口返回 503 与明确文案，前端禁用输入框并提示，服务不崩溃

## 🧱 技术栈

| 层次 | 技术 |
| --- | --- |
| 前端 | React 18、Vite 6、原生 CSS（零 UI 库） |
| 后端 | Node.js 18+、Express 4、ES Modules |
| 数据库 | SQLite3（better-sqlite3，同步 API + 预编译语句 + 事务） |
| 大模型 | 任意 OpenAI 兼容 `chat/completions` 接口，默认 DeepSeek |
| 配置 | dotenv（`.env` 本地加载，已被 `.gitignore` 忽略） |

## 📁 项目结构

```
calendar-ledger/
├── client/                    # 前端
│   ├── src/
│   │   ├── App.jsx            # 数据加载与页面编排
│   │   ├── App.css            # 全部样式
│   │   └── components/
│   │       ├── SummaryBar.jsx       # 总览大盘
│   │       ├── Timeline.jsx         # 左侧时间轴（含超支标红）
│   │       ├── CalendarModal.jsx    # 日历选日（含超支标红）
│   │       ├── SettingsModal.jsx    # 设置：每日额度 / 基准日 / 兴趣预算
│   │       └── AssistantDrawer.jsx  # 愿望单 + AI 聊天抽屉
│   └── vite.config.js         # /api 代理到 3001
├── server/                    # 后端
│   ├── index.js               # Express 入口
│   ├── db.js                  # 建表、索引、预置标签
│   ├── settings.js            # 配置读写与校验
│   ├── dates.js               # 本地日期、月份边界、日期差
│   ├── overview.js            # 大盘汇总 + 超支填补算法
│   ├── impulse.js             # 愿望单查询与派生值
│   ├── agent.js               # Prompt 组装与 LLM 调用
│   └── routes/                # summary / records / tags / settings / impulse / agent
├── .env.example               # 环境变量模板
└── package.json               # npm workspaces 根
```

## 🏃 本地运行

### 环境要求

- **Node.js ≥ 18**（后端使用内置 `fetch`）
- npm ≥ 9（`better-sqlite3` 安装时会编译原生模块，Windows 若失败需安装 VS Build Tools）

### 1. 安装依赖

```bash
npm install
```

项目使用 npm workspaces，根目录一次安装会同时装好 `server` 与 `client`。

### 2. 配置环境变量

```bash
# macOS / Linux
cp .env.example .env

# Windows (PowerShell)
Copy-Item .env.example .env
```

打开 `.env` 填入：

```dotenv
LLM_API_KEY=sk-xxxxxxxxxxxxxxxx
LLM_API_URL=https://api.deepseek.com/v1/chat/completions
LLM_MODEL=deepseek-chat
```

> 不填也能跑：记账、大盘、超支计算、兴趣预算全部可用，仅 AI 助手会提示「请先配置 API Key」。

### 3. 启动

```bash
npm run dev
```

- 前端：<http://localhost:5173>
- 后端：<http://localhost:3001>
- 数据库：首次启动自动创建 `server/data/ledger.db`，并写入 5 个预置标签

### 4. 生产构建（可选）

```bash
npm run build -w client   # 产物在 client/dist
npm start -w server       # 以非 watch 模式启动后端
```

## ⚙️ 环境变量

| 变量 | 必填 | 说明 | 示例 |
| --- | :---: | --- | --- |
| `LLM_API_KEY` | 是（仅 AI 功能） | LLM 服务密钥 | `sk-...` |
| `LLM_API_URL` | 是（仅 AI 功能） | OpenAI 兼容的 chat/completions 完整地址 | `https://api.deepseek.com/v1/chat/completions` |
| `LLM_MODEL` | 否 | 模型名称，留空默认 `deepseek-chat` | `deepseek-chat` |

## 🗄️ 数据库

- 位置：`server/data/ledger.db`（已在 `.gitignore` 中忽略，不会上传）
- 初始化：启动时 `CREATE TABLE IF NOT EXISTS` 自动建表，并补齐索引与预置标签，无需手动迁移
- 重置：停止服务 → 删除 `server/data/ledger.db*` → 重新 `npm run dev`

主要数据表：

| 表 | 用途 |
| --- | --- |
| `records` | 收支记录（金额、备注、日期、类型） |
| `tags` / `record_tags` | 标签与多对多关联 |
| `settings` | 通用 key/value 配置（每日额度、记账基准日、兴趣预算） |
| `impulse_records` | 愿望单（`waiting` / `purchased` / `abandoned`） |
| `impulse_messages` | 与助手的对话记录 |

## 🔌 API 一览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/api/summary` | 大盘数据：总余额、今日结余、每日额度、待填补超支、`overBudgetDates`、兴趣预算 |
| `GET` | `/api/records?date=YYYY-MM-DD` | 按日查询记录（省略 `date` 返回全部） |
| `POST` | `/api/records` | 新增记录（含 `warning` 超额提示） |
| `PATCH` | `/api/records/:id` | 修改金额 / 备注 / 类型 / 标签 |
| `DELETE` | `/api/records/:id` | 删除记录 |
| `GET` | `/api/tags` | 标签列表 |
| `GET` / `PUT` | `/api/settings` | 读取 / 保存每日额度、记账基准日、兴趣预算 |
| `GET` / `POST` | `/api/impulse` | 查询 / 新增愿望单条目 |
| `PATCH` / `DELETE` | `/api/impulse/:id` | 修改状态 / 删除 |
| `POST` | `/api/impulse/:id/purchase` | 买下：写账单并标记 `purchased` |
| `GET` | `/api/agent/status` | LLM 是否已配置 |
| `GET` | `/api/agent/messages` | 历史对话 |
| `POST` | `/api/agent/chat` | 与助手对话 |

## 🔒 隐私说明

- 所有数据只保存在本地 SQLite 文件中，不上传任何服务器。
- `.env`、`node_modules/`、`server/data/*.db`（含 `-wal` / `-shm`）均已在 `.gitignore` 中忽略。
- 请在推送前确认自己从未使用 `git add -f` 强制添加这些文件。

---

用日历记账，用额度自律，用冷静期省钱。祝你每一笔都花得值得。 💙
