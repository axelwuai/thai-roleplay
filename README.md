# 泰语开口练习

一个面向中文用户的 AI 泰语口语练习软件。输入一个生活场景，AI 会立刻进入角色扮演，用短句、罗马音和中文提示带你把对话自然说下去。

## 适合谁

- 想练日常开口而不是背课文的中文用户
- 不熟悉泰文、主要依赖罗马音的泰语初学者
- 想用餐厅、打车、医院、购物等真实场景反复练习的人

## 当前版本包含什么

- 首页输入场景并一键开始练习
- 练习页固定输入区，聊天内容像微信一样在中间滚动
- AI 先开口，始终停留在当前场景内继续推进
- 用户可以直接输入中文、简单泰语、拼音式泰语或混合表达
- 遇到“我不会 / 给我提示 / 再说一遍”时，AI 会立刻切到教学模式
- 每条 AI 回复都包含：泰文、罗马音、中文、可选教练提示
- 支持隐藏泰文，只看罗马音和中文
- 泰文和中文后面都有小喇叭，点击可播放对应泰语
- 练习页支持四种模式切换：场景对话 / 词汇笔记 / 听力复习 / 口语复习
- 词汇笔记会从当前场景对话里自动提炼高频词和短语
- 听力复习会把刚才的对话拆成可回放的小段练习
- 口语复习会把这段对话总结成几条可重复开口的关键句
- 真实 SQLite 持久化保存练习会话
- 邮箱注册 / 登录，登录后会把设备内练习记录并入账号
- 右侧场景记录面板可回到旧场景继续练

## 技术栈

- Next.js App Router
- TypeScript
- React
- Utility-first styling + 自定义 CSS 变量
- SQLite（Node 内置 `node:sqlite`）
- 阿里云百炼 Qwen（OpenAI 兼容接口）

## 运行要求

- Node.js `22+`
- 推荐使用 `pnpm`

说明：项目使用了 Node 内置的 `node:sqlite`，所以需要较新的 Node 版本。

## 快速开始

1. 安装依赖

```bash
pnpm install
```

如果你更习惯 `npm`，也可以使用：

```bash
npm install
```

2. 复制环境变量

```bash
cp .env.example .env.local
```

3. 填写 `.env.local`

```bash
DASHSCOPE_API_KEY=your_dashscope_api_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
QWEN_MODEL=qwen-plus
```

4. 启动开发环境

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 可用脚本

```bash
pnpm dev
pnpm typecheck
pnpm lint
pnpm build
pnpm start
```

当前脚本默认使用 `--webpack`，这是为了兼容部分本地环境里原生 SWC 不稳定的问题。

## 环境变量

| 变量名 | 必填 | 说明 |
| --- | --- | --- |
| `DASHSCOPE_API_KEY` | 是 | 阿里云百炼 API Key |
| `DASHSCOPE_BASE_URL` | 否 | 百炼 OpenAI 兼容接口地址 |
| `QWEN_MODEL` | 否 | 使用的 Qwen 模型，默认 `qwen-plus` |
| `OPENAI_API_KEY` | 否 | 如果不走百炼，可作为兼容备用 |

## 数据与账号

- 数据库文件：`data/practice.sqlite`
- 浏览器本地只保留：
  - 匿名设备 id
  - 可选的临时 API key 覆盖
- 登录前，练习记录归属匿名设备
- 登录后，练习记录归属账号，并自动合并当前设备已有记录

核心表：

- `users`
- `auth_sessions`
- `practice_session_records`

核心接口：

- `POST /api/chat`
- `POST /api/practice-materials`
- `GET /api/sessions`
- `GET /api/sessions?scenario=...`
- `PUT /api/sessions`
- `GET /api/auth/me`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

## 部署说明

这个仓库现在更适合：

- 本地运行
- 单机部署
- 单实例云服务器部署

推荐部署形态：

- Docker 单容器部署
- Railway / Render / 云服务器上的单实例 Node 服务

### Docker 部署

1. 构建镜像

```bash
docker build -t thai-speaking-coach .
```

2. 启动容器

```bash
docker run -d \
  --name thai-speaking-coach \
  -p 3000:3000 \
  -e DASHSCOPE_API_KEY=your_dashscope_api_key \
  -e DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1 \
  -e QWEN_MODEL=qwen-plus \
  -v $(pwd)/data:/app/data \
  thai-speaking-coach
```

说明：

- `data` 目录需要挂载出来，否则 SQLite 数据不会持久保存
- 生产环境下 cookie 会自动使用 `secure`
- 发布前建议先本地执行 `npm run build`

### 云服务器部署

1. 把代码拉到服务器

```bash
git clone https://github.com/axelwuai/thai-roleplay.git
cd thai-roleplay
```

2. 复制生产环境变量

```bash
cp .env.production.example .env.production
```

3. 编辑 `.env.production`

至少需要填写：

```bash
DASHSCOPE_API_KEY=your_dashscope_api_key
QWEN_MODEL=qwen-plus
AUTH_COOKIE_SECURE=false
```

说明：

- 如果你先用服务器 IP 和 `http` 调试，`AUTH_COOKIE_SECURE=false`
- 如果你已经配好域名和 `https`，建议改成 `AUTH_COOKIE_SECURE=true`

4. 启动服务

```bash
docker compose up -d --build
```

5. 查看状态

```bash
docker compose ps
docker compose logs -f
```

默认访问地址：

- `http://你的服务器IP:3000`

如果你要把它部署成多实例生产服务，建议把 SQLite 替换成真正的服务端数据库，例如 PostgreSQL，并补上：

- 邮箱验证
- 找回密码
- 更完整的用户资料与审计日志

## 项目结构

```text
app/
  api/auth/*
  api/chat/route.ts
  api/practice-materials/route.ts
  api/sessions/route.ts
  icon.svg
  layout.tsx
  manifest.ts
  page.tsx
  practice/page.tsx

components/
  AuthControls.tsx
  ChatWindow.tsx
  Header.tsx
  MessageBubble.tsx
  PracticePageContent.tsx
  PracticePanel.tsx
  PracticeStudyPanel.tsx
  QuickActions.tsx
  ScenarioHistoryPanel.tsx
  ScenarioInput.tsx

lib/
  auth.ts
  openai.ts
  practice-store.ts
  prompt.ts
  types.ts
  utils.ts
```

## License

[MIT](./LICENSE)
