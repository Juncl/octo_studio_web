# Image Agent Studio - Vite + Vue 3 + Express

这是一个前后端分离的多轮图片生成 Agent Demo：

- frontend：Vite + Vue 3
- backend：Express + TypeScript
- 图片生成：异步 create_task + query_task 轮询
- 会话持久化：浏览器 localStorage 保存前端会话和 agentState
- 多轮能力：下一轮请求会带 clientState，后端恢复上下文后继续生成

## 启动

```bash
cp .env.example .env
npm run install:all
npm run dev
```

默认地址：

- 前端：http://localhost:5173
- 后端：http://localhost:3001

## 关键配置

`.env` 里至少需要配置：

```env
IMAGE_CREATE_TASK_URL=
IMAGE_QUERY_TASK_BASE_URL=
LLM_API_URL=
LLM_API_KEY=
LLM_MODEL=
```

如果图片后端不支持图生图，保持：

```env
IMAGE_SUPPORTS_IMG2IMG=false
```

这样第二轮“加一个苹果”会退化为完整文生图 prompt，不会传 ref_img_list。
