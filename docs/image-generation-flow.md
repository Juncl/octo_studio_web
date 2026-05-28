# Image Generation Flow

本文梳理当前页面从发送生图任务请求、后端接口处理、任务轮询，到最终图片完成并在页面展示的完整链路。

## 总览

当前页面并不是直接调用生图工具接口，而是先请求 Agent 接口：

```text
ImageStudio.vue
  -> POST /api/agent/image
  -> imageAgent.hydrateSession()
  -> imageAgent.handleUserMessage()
  -> LLM 规划或启发式兜底
  -> generateImageService()
  -> create_task
  -> query_task 轮询
  -> 返回 images / primaryImage / taskId / state
  -> 前端更新会话、画布和详情面板
```

相关文件：

- `frontend/src/components/ImageStudio.vue`
- `backend/src/routes/agent-image.ts`
- `backend/src/agent/image-generation-agent.ts`
- `backend/src/tools/generate-image-service.ts`
- `backend/src/agent/types.ts`

## 1. 前端提交请求

入口是 `ImageStudio.vue` 中的 `handleSubmit()`。

用户点击发送按钮或按下 Enter 后，前端会：

1. 读取输入框文本 `input.value.trim()`。
2. 如果文本为空、正在生成中，或没有当前会话，则直接返回。
3. 生成当前会话快照：

```ts
const requestConversation = normalizeConversation(activeConversation.value)
const requestClientState = toClientAgentState(requestConversation)
```

4. 清空输入框并设置 `loading = true`。
5. 把用户消息加入当前会话。
6. 插入一个 `pending` 状态的 assistant 消息，用于显示“Agent 正在生成”。
7. 调用 `sendImageAgentMessage()` 请求后端。

请求地址：

```text
POST /api/agent/image
```

请求体结构大致如下：

```json
{
  "sessionId": "当前会话 id",
  "message": "用户输入",
  "clientState": {
    "sessionId": "当前会话 id",
    "currentPrompt": "当前提示词",
    "currentUserPrompt": "当前用户原始需求",
    "canonicalPrompt": "规范化后的完整提示词",
    "lastSuccessfulPrompt": "上一次成功生图提示词",
    "width": 1024,
    "height": 1024,
    "numImage": 2,
    "lastTaskId": "上一次任务 id",
    "lastImages": ["上一次图片 URL"],
    "primaryImage": "当前主图 URL"
  }
}
```

`clientState` 的作用是把前端本地会话状态同步给后端，确保刷新页面或恢复本地缓存后，后端仍能拿到多轮上下文。

## 2. 后端 Agent 路由

路由文件是 `backend/src/routes/agent-image.ts`。

接口会先校验：

- `sessionId` 必须存在且是字符串。
- `message` 必须存在且是字符串。

然后执行：

```ts
await imageAgent.hydrateSession({ sessionId, clientState })
const result = await imageAgent.handleUserMessage({ sessionId, message })
res.json({ ok: true, ...result })
```

其中：

- `hydrateSession()` 用前端传来的 `clientState` 合并后端内存会话状态。
- `handleUserMessage()` 负责理解用户意图、决定是否生图、调用生图服务并返回结果。

## 3. Agent 理解和规划

核心逻辑在 `backend/src/agent/image-generation-agent.ts`。

`handleUserMessage()` 会：

1. 从 `MemorySessionStore` 中读取当前 `sessionId` 对应的会话。
2. 初始化默认参数，例如 `width`、`height`、`numImage`、`lastImages`、`history`。
3. 把用户消息写入 `state.history`。
4. 调用 `planNextStep()` 规划下一步。

`planNextStep()` 会优先调用 LLM，要求输出 JSON 格式的 `AgentPlan`：

```ts
{
  intent: "new_image" | "edit_previous_image" | "refine_prompt_only" | "chat",
  generationMode: "txt2img" | "img2img",
  shouldCallTool: boolean,
  customerPrompt: string,
  finalPrompt: string,
  subject?: string,
  style?: string,
  scene?: string,
  composition?: string,
  lighting?: string,
  colorPalette?: string,
  usePreviousImage: boolean,
  reason: string
}
```

如果 LLM 调用失败，会进入 `heuristicPlan()`，用关键词做兜底判断，例如：

- “生成”“画”“出图”“做一张”“创建”“来一张”“按这个生成”会被识别为生图请求。
- “加”“换”“改”“去掉”“背景”“颜色”“更”“再”等可能被识别为基于上一张图修改。

如果 `shouldCallTool=false`，Agent 不会调用生图服务，只返回聊天或提示词更新结果。

如果需要生图，则进入工具参数构造阶段。

## 4. 构造生图工具参数

构造逻辑在 `buildToolArgs()`。

最终传给 `generateImageService()` 的参数大致如下：

```ts
{
  prompt: plan.finalPrompt,
  customerPrompt: plan.customerPrompt,
  generationMode: plan.generationMode,
  userIdx,
  taskType,
  tagName,
  numImage,
  target,
  width,
  height,
  mode,
  loras: [],
  refImgList,
  pollIntervalMs: 2000,
  maxPollCount: 60,
  maxCreateRetries: 3,
  createTimeoutMs: 30000
}
```

如果是 `img2img` 并且 `usePreviousImage=true`，会把上一张主图作为参考图：

```ts
refImgList: [state.primaryImage ?? state.lastImages?.[0]]
```

当前默认配置中 `IMAGE_SUPPORTS_IMG2IMG=false`，因此多数“修改上一张图”的请求不会真正传参考图，而是把上一轮完整设定和本轮修改要求合并成新的 `txt2img` prompt。

## 5. create_task 创建任务

生图服务逻辑在 `backend/src/tools/generate-image-service.ts`。

它会读取这些环境变量：

- `IMAGE_CREATE_TASK_URL`
- `IMAGE_QUERY_TASK_BASE_URL`
- `IMAGE_USER_IDX`
- `IMAGE_TXT2IMG_TASK_TYPE`
- `IMAGE_IMG2IMG_TASK_TYPE`

随后组装 create_task payload：

```ts
{
  user: {
    idx: userIdx
  },
  task_type: taskType,
  args: {
    tag_name,
    num_image,
    target,
    target_size: {
      width,
      height
    },
    loras,
    mode,
    ref_img_list,
    customer_prompt,
    prompt
  }
}
```

`createTaskWithRetry()` 会发起：

```text
POST IMAGE_CREATE_TASK_URL
```

默认策略：

- 最多重试 3 次。
- 单次请求超时 30 秒。
- HTTP `408 / 409 / 425 / 429 / 500 / 502 / 503 / 504` 会触发重试。
- 网络类错误如 `fetch failed`、`ECONNRESET`、`ETIMEDOUT` 等也会触发重试。

创建成功后，会从返回体中提取任务 ID。

支持的字段包括：

```text
task_id
taskId
id
data.task_id
data.taskId
data.id
result.task_id
result.taskId
result.id
result as string/number
```

如果 create_task 成功但无法提取任务 ID，会抛出错误。

## 6. query_task 轮询任务

拿到 `taskId` 后，服务进入轮询：

```text
GET IMAGE_QUERY_TASK_BASE_URL?task_id=xxx
```

默认轮询参数：

- 每 2 秒查询一次。
- 最多查询 60 次。
- 总等待时间约 120 秒。

成功条件：

```ts
resp_code === 200 && status === 2 && progress >= 100
```

失败条件：

```ts
resp_code !== 200
```

或任务状态为：

```text
3 / 4 / -1
```

图片提取规则：

1. 优先读取 `response.result.results`。
2. 如果没有，再读取 `response.result.results_v2[].output.image`。

成功后返回：

```ts
{
  ok: true,
  taskId,
  generationMode,
  taskType,
  status,
  progress,
  images,
  imageCount: images.length,
  primaryImage: images[0] ?? null,
  nextTurnHint,
  result: queryJson
}
```

如果达到最大轮询次数仍未完成，会返回：

```ts
{
  ok: false,
  taskId,
  generationMode,
  taskType,
  status: "poll_timeout",
  message: "Task was created but did not finish after 60 polls.",
  lastResult
}
```

需要注意：当前 `ImageGenerationAgent` 在收到 `toolResult` 后没有显式检查 `toolResult.ok`。因此轮询超时时，仍可能按 `image_result` 类型返回，只是 `images` 为空。

## 7. Agent 返回结果

生图服务返回后，Agent 会更新后端会话状态：

```ts
state.lastTaskId = toolResult.taskId
state.lastImages = images
state.primaryImage = primaryImage ?? undefined
state.lastSuccessfulPrompt = plan.finalPrompt
state.canonicalPrompt = plan.finalPrompt
state.currentPrompt = plan.finalPrompt
state.currentUserPrompt = plan.customerPrompt
```

然后构造返回给前端的数据：

```ts
{
  ok: true,
  type: "image_result",
  text: "已生成图片...\n图片需求：...\n生成数量：...\n主图：...",
  taskId,
  images,
  primaryImage,
  state,
  debug: {
    plan,
    toolArgs,
    toolResult
  }
}
```

前端当前主要消费这些字段：

- `type`
- `text`
- `images`
- `primaryImage`
- `taskId`
- `state`
- `error`

`debug` 后端会返回，但前端类型和页面目前没有展示。

## 8. 前端接收和更新会话

前端收到结果后，会执行：

```ts
const nextImages = result.images ?? []
const assistantText = result.text ?? "已完成图片生成。"
```

然后创建新的 assistant 消息：

```ts
{
  role: "assistant",
  content: "",
  imageUrls: result.type === "image_result" ? nextImages : undefined,
  fileName,
  createdAt,
  typing: true
}
```

如果返回的是 `image_result` 且有图片，会设置当前预览：

```ts
selectedPreview.value = result.primaryImage ?? nextImages[0] ?? null
```

随后更新当前会话：

```ts
{
  taskId: result.taskId ?? conversation.taskId,
  images: nextImages,
  primaryImage: result.primaryImage ?? nextImages[0],
  messages: conversation.messages
    .filter((message) => !message.pending)
    .concat(assistantMessage),
  agentState: slimAgentStateFromResponse(...)
}
```

最后通过 `startTypewriter()` 把 `assistantText` 逐字写入页面消息。

无论成功或失败，最终都会在 `finally` 中设置：

```ts
loading.value = false
```

## 9. 页面最终展示内容

### 左侧对话区

左侧对话区展示：

- 用户输入消息。
- assistant 返回文案。
- 生成中状态卡片。
- 生图完成后的图片生成卡片。

当 assistant 消息里有 `imageUrls` 时，会展示：

- “图片生成”标签。
- 生成标题。
- 创建时间。
- 缩略图列表。

点击缩略图会更新：

```ts
selectedPreview = url
```

### 中间画布

中间画布展示当前选中的图片。

当前预览图来自：

```ts
selectedPreview ?? primaryImage ?? images[0] ?? null
```

如果有图片，显示 `<img class="selected-preview-image" />`。

如果没有图片，显示：

```text
图片生成结果会显示在这里
```

下载按钮使用当前图片 URL：

```html
<a :href="currentPreview ?? '#'" target="_blank">下载</a>
```

### 右侧详情面板

右侧详情面板展示：

- 当前会话的所有生成图缩略图。
- 标题 `workspaceTitle`。
- 结果摘要 `getResultSummary()`。
- 生成信息：
  - 模型：当前前端选择的风格，例如“千问”。
  - 比例：根据 `agentState.width / height` 映射。
  - 分辨率：目前写死为 `2K`。
  - 数量：`selectedImageCount`。
  - 当前：当前预览图序号 / 总数。
- 提示词：`lastPrompt`。

## 10. 当前实现中的注意点

1. 前端调用的是 `/api/agent/image`，不是 `/api/tools/generate-image`。
2. `/api/tools/generate-image` 也存在，但它是直接调用 `generateImageService()` 的工具接口，当前页面主流程没有使用它。
3. 后端会话存储是 `MemorySessionStore`，服务重启后会丢失。
4. 前端通过 localStorage 保存会话，并通过 `clientState` 回灌后端。
5. 当前默认不启用 img2img，修改上一张图时大多走完整 prompt 合并后的 txt2img。
6. 轮询超时会返回 `ok:false`，但 Agent 当前没有显式把它作为失败处理。
7. 后端返回的 `debug.plan / debug.toolArgs / debug.toolResult` 当前没有在前端展示。
8. 右侧“分辨率”目前是写死的 `2K`，不是从接口返回值动态计算。

