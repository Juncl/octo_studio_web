# Image Tool Action Architecture

本文整理一套可扩展的图片工具动作方案，用于支持“变清晰、抠图、局部重绘、扩图、场景融合”等能力。核心目标是：可以走 LLM 做意图规划，但最终 `create_task payload` 必须由后端代码严格组装，避免 LLM 直接控制接口参数。

## 背景

当前普通生图链路是：

```text
前端 ImageStudio.vue
  -> POST /api/agent/image
  -> ImageGenerationAgent
  -> LLM 规划 prompt
  -> generateImageService()
  -> create_task
  -> query_task 轮询
  -> 前端展示结果
```

这个链路适合普通文生图和基于上下文的图片修改。但右侧详情区和左侧输入区还有多个工具模式，例如：

- 变清晰
- 抠图
- 局部重绘
- 扩图
- 场景融合

这些按钮和模式后续都可能需要不同的 `create_task payload`。如果为每个按钮在 Agent 主流程里写独立 `if` 分支，会很快变得难维护。

因此推荐引入统一的工具动作架构。

## 核心原则

1. LLM 负责判断用户意图和选择工具动作。
2. LLM 不直接组装 `create_task payload`。
3. 后端根据 `toolAction` 从工具注册表中找到对应工具。
4. 每个工具由后端代码负责校验输入和组装 payload。
5. 所有工具共享统一的 create_task + query_task 任务执行器。
6. 前端左侧模式和右侧按钮都走同一套工具动作入口。

整体流程：

```text
UI 模式 / 用户输入 / 当前图片
  -> LLM 产出 toolAction + toolInput
  -> 后端 normalizePlan 做确定性校正
  -> imageToolRegistry 找到工具定义
  -> validate 输入
  -> buildPayload
  -> runImageTask
  -> 返回 image_result
  -> 前端统一展示
```

## 工具动作定义

新增统一的工具动作类型：

```ts
export type ImageToolAction =
  | "generate_image"
  | "super_resolution"
  | "cutout"
  | "inpaint"
  | "outpaint"
  | "scene_fusion"
  | "chat"
  | "prompt_only"
```

含义：

- `generate_image`：普通图片生成或基于 prompt 的图片编辑。
- `super_resolution`：变清晰 / 高清放大 / 超分辨率。
- `cutout`：抠图。
- `inpaint`：局部重绘。
- `outpaint`：扩图。
- `scene_fusion`：场景融合。
- `chat`：普通对话，不调用工具。
- `prompt_only`：只更新提示词，不调用工具。

## AgentPlan 扩展

当前 `AgentPlan` 偏向普通生图 prompt。建议扩展为工具计划：

```ts
export type AgentPlan = {
  toolAction: ImageToolAction
  intent: "new_image" | "edit_previous_image" | "refine_prompt_only" | "chat"
  generationMode?: "txt2img" | "img2img"
  shouldCallTool: boolean

  customerPrompt: string
  finalPrompt?: string

  requiresImage?: boolean
  usePreviousImage?: boolean

  toolInput?: {
    imageBase64?: string
    maskBase64?: string
    direction?: "left" | "right" | "top" | "bottom" | "all"
    strength?: number
    [key: string]: unknown
  }

  subject?: string
  style?: string
  scene?: string
  composition?: string
  lighting?: string
  colorPalette?: string

  reason: string
}
```

普通生图需要 `finalPrompt`。工具动作不一定需要 prompt，例如 `super_resolution` 只需要当前图片 base64。

## 前端请求扩展

前端请求 `/api/agent/image` 时，除了当前已有的 `sessionId / message / clientState`，建议补充：

```ts
type AgentImageRequest = {
  sessionId: string
  message: string
  clientState: ClientAgentState

  composerMode?: string
  requestedToolAction?: ImageToolAction

  imageBase64?: string
  maskBase64?: string
}
```

字段说明：

- `composerMode`：左侧输入区当前选择的模式，例如 `image / upscale / cutout / inpaint / outpaint / scene`。
- `requestedToolAction`：右侧按钮可以直接传明确动作，例如 `super_resolution`。
- `imageBase64`：当前查看图片的完整 data URL，包含前缀，例如 `data:image/png;base64,...`。
- `maskBase64`：局部重绘等需要蒙版的工具使用。

## 左侧输入区与右侧按钮统一

左侧输入区模式和右侧详情按钮都映射到工具动作。

示例映射：

```ts
const composerModeActionMap = {
  image: "generate_image",
  upscale: "super_resolution",
  cutout: "cutout",
  inpaint: "inpaint",
  outpaint: "outpaint",
  scene: "scene_fusion"
}
```

右侧按钮可以调用统一入口：

```ts
handleToolAction("super_resolution")
handleToolAction("cutout")
handleToolAction("inpaint")
handleToolAction("outpaint")
```

左侧提交时也走同样逻辑：

```ts
if (selectedComposerModeId.value !== "image") {
  return handleToolAction(composerModeActionMap[selectedComposerModeId.value])
}

return handleSubmitGenerateImage()
```

如果产品要求所有模式都走 Agent，则也可以统一调用 `/api/agent/image`，但请求中必须携带 `composerMode` 和必要图片输入。

## LLM 的职责边界

LLM 可以做：

- 根据用户输入和 UI 模式判断 `toolAction`。
- 判断是否需要当前图片。
- 为 `inpaint / outpaint / scene_fusion` 等工具补充 prompt、方向、强度等软参数。
- 为普通生图生成 `finalPrompt`。

LLM 不可以做：

- 直接输出完整 `create_task payload`。
- 自由决定 `task_type`。
- 自由增删 payload 字段。
- 决定敏感固定参数，例如 `user.idx`。

系统提示词需要明确说明：

```text
你只负责输出工具计划，不要输出 create_task payload。
后端会根据 toolAction 使用固定工具定义组装 payload。

当 UI 模式为 upscale，或用户明确要求“变清晰、高清、超分、提升分辨率”，且存在当前图片时，toolAction 应为 super_resolution。

super_resolution 不需要 prompt。
super_resolution requiresImage=true。
super_resolution 的最终 payload 由后端固定组装：
task_type="magnify"
args.mode="super_resolution"
args.image_base64=当前图片 base64
```

## 后端确定性校正

LLM 输出后，后端必须做 `normalizePlan()`。

原因是 UI 模式和按钮点击是强信号，不能完全依赖 LLM。

示例：

```ts
const modeActionMap = {
  image: "generate_image",
  upscale: "super_resolution",
  cutout: "cutout",
  inpaint: "inpaint",
  outpaint: "outpaint",
  scene: "scene_fusion"
}

if (input.requestedToolAction) {
  normalized.toolAction = input.requestedToolAction
}

if (input.composerMode && input.composerMode !== "image") {
  normalized.toolAction = modeActionMap[input.composerMode]
}
```

对于 `super_resolution`：

```ts
if (normalized.toolAction === "super_resolution") {
  normalized.shouldCallTool = true
  normalized.requiresImage = true
  normalized.finalPrompt = undefined
}
```

这样即使 LLM 输出错误，后端也会按 UI 模式修正。

## 工具注册表

新增 `imageToolRegistry`，将 `toolAction` 映射到工具定义。

示例：

```ts
type ImageToolDefinition = {
  action: ImageToolAction
  requiresImage: boolean
  validate(input: ImageToolRuntimeInput): void
  buildPayload(input: ImageToolRuntimeInput): CreateTaskPayload
  buildSuccessText(result: ImageTaskResult, plan: AgentPlan): string
}

export const imageToolRegistry: Record<ImageToolAction, ImageToolDefinition> = {
  generate_image: generateImageTool,
  super_resolution: superResolutionTool,
  cutout: cutoutTool,
  inpaint: inpaintTool,
  outpaint: outpaintTool,
  scene_fusion: sceneFusionTool
}
```

主流程只做统一调度：

```ts
const tool = imageToolRegistry[plan.toolAction]

if (!tool) {
  return chatResult
}

const runtimeInput = buildRuntimeInput({
  plan,
  state,
  requestInput,
  options
})

tool.validate(runtimeInput)

const payload = tool.buildPayload(runtimeInput)
const toolResult = await runImageTask(payload)
```

## Payload Builder

每个工具有自己的 payload builder。不要复用普通生图 payload 后再删除字段，这样容易误传字段。

### 普通生图

```ts
function buildGenerateImagePayload(input: ImageToolRuntimeInput) {
  return {
    user: {
      idx: input.userIdx
    },
    task_type: input.taskType,
    args: {
      tag_name: input.tagName,
      num_image: input.numImage,
      target: input.target,
      target_size: {
        width: input.width,
        height: input.height
      },
      loras: input.loras ?? [],
      mode: input.mode,
      ref_img_list: input.refImgList ?? [],
      customer_prompt: input.customerPrompt,
      prompt: input.finalPrompt
    }
  }
}
```

### 变清晰

当前要实现的“变清晰”固定为：

```ts
function buildSuperResolutionPayload(input: ImageToolRuntimeInput) {
  return {
    user: {
      idx: input.userIdx
    },
    task_type: "magnify",
    args: {
      mode: "super_resolution",
      image_base64: input.imageBase64
    }
  }
}
```

要求：

- `user` 不变。
- `task_type` 固定为 `magnify`。
- `args` 只包含 `mode` 和 `image_base64`。
- `mode` 固定为 `super_resolution`。
- `image_base64` 使用完整 data URL，包含 `data:image/...;base64,` 前缀。

### 后续工具示例

抠图：

```ts
function buildCutoutPayload(input: ImageToolRuntimeInput) {
  return {
    user: {
      idx: input.userIdx
    },
    task_type: "cutout",
    args: {
      image_base64: input.imageBase64
    }
  }
}
```

局部重绘：

```ts
function buildInpaintPayload(input: ImageToolRuntimeInput) {
  return {
    user: {
      idx: input.userIdx
    },
    task_type: "inpaint",
    args: {
      image_base64: input.imageBase64,
      mask_base64: input.maskBase64,
      prompt: input.finalPrompt
    }
  }
}
```

扩图：

```ts
function buildOutpaintPayload(input: ImageToolRuntimeInput) {
  return {
    user: {
      idx: input.userIdx
    },
    task_type: "outpaint",
    args: {
      image_base64: input.imageBase64,
      direction: input.direction,
      prompt: input.finalPrompt
    }
  }
}
```

这些示例里的字段需要以后根据真实后端接口协议再精确调整。

## 统一任务执行器

将 create_task + query_task 轮询抽成通用函数：

```ts
async function runImageTask(input: {
  createPayload: CreateTaskPayload
  pollIntervalMs?: number
  maxPollCount?: number
  maxCreateRetries?: number
  createTimeoutMs?: number
}): Promise<ImageTaskResult> {
  const createJson = await createTaskWithRetry(...)
  const taskId = getTaskId(createJson)

  for (...) {
    const queryJson = await queryTask(...)

    if (isSuccessResponse(queryJson)) {
      const images = extractImages(queryJson)
      return {
        ok: true,
        taskId,
        images,
        imageCount: images.length,
        primaryImage: images[0] ?? null,
        result: queryJson
      }
    }

    if (isFailureResponse(queryJson)) {
      throw new Error(...)
    }
  }

  return {
    ok: false,
    taskId,
    status: "poll_timeout",
    lastResult
  }
}
```

这样普通生图、变清晰、抠图、局部重绘都共用任务执行逻辑，只差 payload。

## 变清晰完整链路

左侧输入区切到“变清晰”或点击右侧“变清晰”按钮：

```text
前端读取 currentPreview
  -> 确认 currentPreview 是 data:image/...;base64,...
  -> POST /api/agent/image
     {
       sessionId,
       message: "变清晰",
       clientState,
       composerMode: "upscale",
       requestedToolAction: "super_resolution",
       imageBase64: currentPreview
     }

后端 Agent
  -> hydrateSession
  -> planNextStep，把 composerMode 和 hasImageBase64 提供给 LLM
  -> LLM 输出 toolAction="super_resolution"
  -> normalizePlan 根据 composerMode/requestedToolAction 做强校正
  -> imageToolRegistry.super_resolution.validate()
  -> buildSuperResolutionPayload()
  -> runImageTask()
  -> 返回 image_result

前端
  -> 移除 pending 消息
  -> 追加 assistant 结果消息
  -> 将高清结果加入 images
  -> selectedPreview 切换到高清图
  -> 右侧详情和中间画布同步刷新
```

## 前端展示策略

工具任务成功后建议统一返回：

```ts
{
  ok: true,
  type: "image_result",
  text: "已完成图片变清晰。",
  taskId,
  images,
  primaryImage,
  state
}
```

普通生图可以继续覆盖当前结果；工具动作建议追加结果，方便用户对比原图和处理后图片：

```ts
images: [...conversation.images, ...result.images]
primaryImage: result.primaryImage ?? conversation.primaryImage
selectedPreview = result.primaryImage ?? result.images[0]
```

也可以根据产品要求改成覆盖，但建议工具类动作默认追加。

## 输入校验

不同工具在 `validate()` 中做自己的校验。

`super_resolution`：

```ts
if (!input.imageBase64?.startsWith("data:image/")) {
  throw new Error("变清晰需要当前图片 base64。")
}
```

`inpaint`：

```ts
if (!input.imageBase64?.startsWith("data:image/")) {
  throw new Error("局部重绘需要原图。")
}

if (!input.maskBase64?.startsWith("data:image/")) {
  throw new Error("局部重绘需要蒙版。")
}
```

## 请求体大小

因为工具会传完整 base64，当前后端：

```ts
app.use(express.json({ limit: "2mb" }))
```

很可能不够。建议调整为：

```ts
app.use(express.json({ limit: "20mb" }))
```

如果上传图片尺寸较大，可以考虑 `50mb`，但最好结合实际业务限制控制图片大小。

## 推荐文件结构

建议逐步拆分：

```text
backend/src/agent/image-generation-agent.ts
backend/src/agent/image-tool-registry.ts
backend/src/tools/image-task-runner.ts
backend/src/tools/image-payload-builders.ts
```

职责：

- `image-generation-agent.ts`：负责会话状态、LLM 规划、状态更新和统一响应。
- `image-tool-registry.ts`：维护 `toolAction -> tool definition` 映射。
- `image-payload-builders.ts`：维护不同工具的 payload builder。
- `image-task-runner.ts`：负责 `create_task + query_task`。

现有 `generate-image-service.ts` 可以先保留，逐步抽取公共逻辑，避免一次性大改。

## 分阶段落地建议

### 第一阶段：支持变清晰

1. 扩展前端请求，传 `composerMode / requestedToolAction / imageBase64`。
2. 扩展 Agent 入参。
3. 扩展 `AgentPlan.toolAction`。
4. 增加 LLM prompt 规则。
5. 增加 `super_resolution` 工具定义。
6. 增加 `buildSuperResolutionPayload()`。
7. 抽出或复用任务轮询逻辑。
8. 前端将返回高清图追加到当前会话。

### 第二阶段：抽通用注册表

1. 把普通生图也注册为 `generate_image` 工具。
2. Agent 主流程统一成工具调度。
3. 删除散落在主流程里的工具分支。

### 第三阶段：扩展其他按钮

按工具逐个补：

- `cutout`
- `inpaint`
- `outpaint`
- `scene_fusion`

每个工具只需要增加：

1. 工具定义。
2. payload builder。
3. 输入校验。
4. 前端必要输入，例如蒙版、方向、参考图。

## 结论

最终方案不是为“变清晰”写一个孤立接口，而是把它作为图片工具体系中的第一个工具动作。

LLM 仍然参与 Agent 规划，但只负责选择工具和补充软参数；后端通过工具注册表和 payload builder 严格控制 `create_task payload`。这样既满足“左侧输入区走 LLM”的产品形态，也为后续“抠图、局部重绘、扩图、场景融合”等按钮扩展留出稳定结构。

