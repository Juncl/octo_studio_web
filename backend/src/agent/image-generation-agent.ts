import type { LLMAdapter } from "./llm-adapter.js"
import type {
  AgentPlan,
  GenerateImageToolArgs,
  GenerateImageToolResult,
  GenerationMode,
  ImageToolAction,
  ImageSessionState
} from "./types.js"
import {
  createDefaultImageSession,
  type SessionStore
} from "./session-store.js"
import {
  cutoutImageService,
  generateImageService,
  superResolutionService
} from "../tools/generate-image-service.js"

export type ImageGenerationAgentOptions = {
  supportsImg2Img: boolean
  txt2imgTaskType: string
  img2imgTaskType?: string
  userIdx?: string
  tagName: string
  target: string
  apiMode: string
  defaultWidth: number
  defaultHeight: number
  defaultNumImage: number
}

export type AgentReply = {
  type: "chat" | "image_result" | "prompt_updated" | "error"
  text: string
  taskId?: string
  toolAction?: ImageToolAction
  images?: string[]
  primaryImage?: string | null
  state: ImageSessionState
  debug?: {
    plan?: AgentPlan
    toolArgs?: GenerateImageToolArgs
    toolResult?: GenerateImageToolResult
  }
}

type AgentComposerMode = "image" | "upscale" | string

type ImageStyleConfig = {
  taskType: string
  tagName: string
  target: string
  loras: Array<{
    name: string
    weight: number | string
  }>
  mode: string
}

const defaultStyleModel = "qianwen"
const defaultAspectRatio = "1:1"

const imageStyleConfigs: Record<string, ImageStyleConfig> = {
  qianwen: {
    taskType: "txt2img_qwen",
    tagName: "Qwen-Image",
    target: "flux1-dev",
    loras: [],
    mode: "performance"
  },
  bdicon: {
    taskType: "txt2img_v2_performance",
    tagName: "BDIcon",
    target: "flux1-dev",
    loras: [{ name: "F.1_BDicon", weight: 0.8 }],
    mode: "performance"
  },
  portrait: {
    taskType: "txt2img_v2_performance",
    tagName: "质感人像",
    target: "flux1-krea-dev-fp8",
    loras: [{ name: "F.1_textured_portrait", weight: 0.8 }],
    mode: "performance"
  },
  developer: {
    taskType: "txt2img_v2_performance",
    tagName: "开发者人物形象",
    target: "flux1-dev",
    loras: [{ name: "F.1_hwc3dcharacter_latest", weight: "0.8" }],
    mode: "performance"
  },
  agent: {
    taskType: "txt2img_qwen",
    tagName: "小艺agent",
    target: "flux1-dev",
    loras: [{ name: "F.1_xiaoyi_agent", weight: 0.85 }],
    mode: "performance"
  },
  smart3d: {
    taskType: "txt2img_v2_performance",
    tagName: "智慧3D",
    target: "flux1-dev",
    loras: [{ name: "F.1_intelligent3d", weight: 1 }],
    mode: "hd"
  },
  abstract: {
    taskType: "txt2img_v2_performance",
    tagName: "抽象几何背景",
    target: "flux1-dev",
    loras: [{ name: "F.1_abstract_wallpaper", weight: 1 }],
    mode: "performance"
  },
  yunbao: {
    taskType: "txt2img_v2_performance",
    tagName: "云宝",
    target: "flux1-dev",
    loras: [{ name: "yunbao", weight: 1 }],
    mode: "performance"
  },
  hdesign: {
    taskType: "txt2img_v2_performance",
    tagName: "H Design插画",
    target: "flux1-dev",
    loras: [{ name: "F.1_hdesign", weight: 1 }],
    mode: "performance"
  },
  harmony: {
    taskType: "txt2img_v2_performance",
    tagName: "鸿蒙插画",
    target: "flux1-dev",
    loras: [{ name: "F.1_harmonyOSIllustration", weight: 1 }],
    mode: "performance"
  },
  abstract3d: {
    taskType: "txt2img_v2_performance",
    tagName: "3D抽象元素",
    target: "flux1-dev",
    loras: [{ name: "F.1_hwcbanner", weight: 0.8 }],
    mode: "performance"
  }
}

const aspectTargetSizes: Record<string, { width: number; height: number }> = {
  "1:1": { width: 1024, height: 1024 },
  "2:3": { width: 800, height: 1200 },
  "3:4": { width: 768, height: 1024 },
  "9:16": { width: 720, height: 1280 },
  "3:2": { width: 1200, height: 800 },
  "4:3": { width: 1024, height: 768 },
  "16:9": { width: 1280, height: 720 }
}

function getImageStyleConfig(styleModel?: string): ImageStyleConfig {
  return imageStyleConfigs[styleModel ?? ""] ?? imageStyleConfigs[defaultStyleModel]
}

function getTargetSizeForAspect(styleModel?: string, aspectRatio?: string) {
  const normalizedStyle = imageStyleConfigs[styleModel ?? ""]
    ? styleModel
    : defaultStyleModel
  const normalizedAspect = aspectTargetSizes[aspectRatio ?? ""]
    ? aspectRatio
    : defaultAspectRatio

  if (normalizedStyle === "developer" && normalizedAspect === "1:1") {
    return { width: 1280, height: 1280 }
  }

  return aspectTargetSizes[normalizedAspect ?? defaultAspectRatio]
}

export class ImageGenerationAgent {
  constructor(
    private deps: {
      llm: LLMAdapter
      store: SessionStore
      options: ImageGenerationAgentOptions
    }
  ) {}

  async hydrateSession(input: {
    sessionId: string
    clientState?: Partial<ImageSessionState>
  }): Promise<void> {
    const { sessionId, clientState } = input

    if (!clientState) return

    const existing =
      (await this.deps.store.get(sessionId)) ??
      createDefaultImageSession(sessionId)

    const hydrated: ImageSessionState = {
      ...existing,
      sessionId,
      currentPrompt: clientState.currentPrompt ?? existing.currentPrompt,
      currentUserPrompt:
        clientState.currentUserPrompt ?? existing.currentUserPrompt,
      canonicalPrompt: clientState.canonicalPrompt ?? existing.canonicalPrompt,
      lastSuccessfulPrompt:
        clientState.lastSuccessfulPrompt ?? existing.lastSuccessfulPrompt,
      subject: clientState.subject ?? existing.subject,
      style: clientState.style ?? existing.style,
      scene: clientState.scene ?? existing.scene,
      composition: clientState.composition ?? existing.composition,
      lighting: clientState.lighting ?? existing.lighting,
      colorPalette: clientState.colorPalette ?? existing.colorPalette,
      width:
        typeof clientState.width === "number"
          ? clientState.width
          : existing.width || this.deps.options.defaultWidth,
      height:
        typeof clientState.height === "number"
          ? clientState.height
          : existing.height || this.deps.options.defaultHeight,
      numImage:
        typeof clientState.numImage === "number"
          ? clientState.numImage
          : existing.numImage || this.deps.options.defaultNumImage,
      styleModel: clientState.styleModel ?? existing.styleModel ?? defaultStyleModel,
      aspectRatio:
        clientState.aspectRatio ?? existing.aspectRatio ?? defaultAspectRatio,
      lastTaskId: clientState.lastTaskId ?? existing.lastTaskId,
      lastImages: Array.isArray(clientState.lastImages)
        ? clientState.lastImages
        : existing.lastImages ?? [],
      primaryImage: clientState.primaryImage ?? existing.primaryImage,
      history: Array.isArray(clientState.history)
        ? clientState.history
        : existing.history ?? []
    }
    const targetSize = getTargetSizeForAspect(
      hydrated.styleModel,
      hydrated.aspectRatio
    )
    hydrated.width = targetSize.width
    hydrated.height = targetSize.height

    await this.deps.store.set(sessionId, hydrated)
  }

  async handleUserMessage(input: {
    sessionId: string
    message: string
    composerMode?: AgentComposerMode
    requestedToolAction?: ImageToolAction
    imageBase64?: string
  }): Promise<AgentReply> {
    const state =
      (await this.deps.store.get(input.sessionId)) ??
      createDefaultImageSession(input.sessionId)

    state.width = state.width || this.deps.options.defaultWidth
    state.height = state.height || this.deps.options.defaultHeight
    state.numImage = state.numImage || this.deps.options.defaultNumImage
    state.styleModel = state.styleModel ?? defaultStyleModel
    state.aspectRatio = state.aspectRatio ?? defaultAspectRatio
    state.lastImages = state.lastImages ?? []
    state.history = state.history ?? []
    const targetSize = getTargetSizeForAspect(state.styleModel, state.aspectRatio)
    state.width = targetSize.width
    state.height = targetSize.height

    state.history.push({
      role: "user",
      content: input.message,
      createdAt: Date.now()
    })

    const plan = await this.planNextStep(state, input.message, {
      composerMode: input.composerMode,
      requestedToolAction: input.requestedToolAction,
      hasImageBase64: Boolean(input.imageBase64)
    })
    this.applyPlanToState(state, plan)

    if (!plan.shouldCallTool) {
      const text =
        plan.intent === "refine_prompt_only"
          ? `已更新图片需求：${plan.finalPrompt}`
          : "我已理解你的图片需求。需要出图时，可以说“生成图片”或“按这个生成”。"

      state.history.push({
        role: "assistant",
        content: text,
        createdAt: Date.now()
      })

      await this.deps.store.set(input.sessionId, state)

      return {
        type: plan.intent === "refine_prompt_only" ? "prompt_updated" : "chat",
        text,
        state,
        debug: {
          plan
        }
      }
    }

    const toolArgs =
      plan.toolAction === "generate_image"
        ? this.buildToolArgs(state, plan)
        : undefined

    try {
      const toolResult =
        plan.toolAction === "super_resolution"
          ? await superResolutionService({
              imageBase64: input.imageBase64 ?? "",
              userIdx: this.deps.options.userIdx,
              pollIntervalMs: 2000,
              maxPollCount: 60,
              maxCreateRetries: 3,
              createTimeoutMs: 30000
            })
          : plan.toolAction === "cutout"
            ? await cutoutImageService({
                imageBase64: input.imageBase64 ?? "",
                userIdx: this.deps.options.userIdx,
                pollIntervalMs: 2000,
                maxPollCount: 60,
                maxCreateRetries: 3,
                createTimeoutMs: 30000
              })
          : await generateImageService(toolArgs as GenerateImageToolArgs)
      const images = toolResult.images ?? []
      const primaryImage = toolResult.primaryImage ?? images[0] ?? null

      state.lastTaskId = toolResult.taskId
      state.lastImages = images
      state.primaryImage = primaryImage ?? undefined
      if (plan.toolAction === "generate_image") {
        state.lastSuccessfulPrompt = plan.finalPrompt
        state.canonicalPrompt = plan.finalPrompt
        state.currentPrompt = plan.finalPrompt
      }
      state.currentUserPrompt = plan.customerPrompt

      state.history.push({
        role: "tool",
        content: JSON.stringify({
          ok: toolResult.ok,
          toolAction: toolResult.toolAction,
          taskId: toolResult.taskId,
          images: toolResult.images,
          primaryImage: toolResult.primaryImage,
          status: toolResult.status,
          progress: toolResult.progress
        }),
        createdAt: Date.now()
      })

      const text = this.buildSuccessText(plan, toolResult)

      state.history.push({
        role: "assistant",
        content: text,
        createdAt: Date.now()
      })

      await this.deps.store.set(input.sessionId, state)

      return {
        type: "image_result",
        text,
        taskId: toolResult.taskId,
        toolAction: plan.toolAction,
        images,
        primaryImage,
        state,
        debug: {
          plan,
          ...(toolArgs ? { toolArgs } : {}),
          toolResult
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      const text = [
        "图片生成失败。",
        "",
        "可能原因：",
        "1. create_task 服务瞬时失败；",
        "2. 当前任务类型不支持 ref_img_list；",
        "3. img2img 任务类型配置不正确；",
        "4. 后端任务超时或返回结构异常。",
        "",
        `错误信息：${message}`
      ].join("\n")

      state.history.push({
        role: "assistant",
        content: text,
        createdAt: Date.now()
      })

      await this.deps.store.set(input.sessionId, state)

      return {
        type: "error",
        text,
        state,
        debug: {
          plan,
          toolArgs
        }
      }
    }
  }

  private async planNextStep(
    state: ImageSessionState,
    userMessage: string,
    requestContext: {
      composerMode?: AgentComposerMode
      requestedToolAction?: ImageToolAction
      hasImageBase64: boolean
    }
  ): Promise<AgentPlan> {
    const systemPrompt = this.buildPlannerSystemPrompt()
    const userPrompt = [
      "你需要根据当前图片会话状态和用户新输入，输出下一步计划。",
      "",
      "当前图片状态：",
      JSON.stringify(
        {
          currentPrompt: state.currentPrompt,
          currentUserPrompt: state.currentUserPrompt,
          canonicalPrompt: state.canonicalPrompt,
          lastSuccessfulPrompt: state.lastSuccessfulPrompt,
          subject: state.subject,
          style: state.style,
          scene: state.scene,
          composition: state.composition,
          lighting: state.lighting,
          colorPalette: state.colorPalette,
          width: state.width,
          height: state.height,
          numImage: state.numImage,
          styleModel: state.styleModel,
          aspectRatio: state.aspectRatio,
          lastTaskId: state.lastTaskId,
          lastImages: state.lastImages,
          primaryImage: state.primaryImage
        },
        null,
        2
      ),
      "",
      "当前 UI / 工具上下文：",
      JSON.stringify(
        {
          composerMode: requestContext.composerMode ?? "image",
          requestedToolAction: requestContext.requestedToolAction,
          hasImageBase64: requestContext.hasImageBase64
        },
        null,
        2
      ),
      "",
      "用户新输入：",
      userMessage,
      "",
      "请只输出 JSON。"
    ].join("\n")

    try {
      const plan = await this.deps.llm.generateJson<AgentPlan>([
        {
          role: "system",
          content: systemPrompt
        },
        {
          role: "user",
          content: userPrompt
        }
      ])

      return this.normalizePlan(plan, state, userMessage, requestContext)
    } catch {
      return this.heuristicPlan(state, userMessage, requestContext)
    }
  }

  private buildPlannerSystemPrompt(): string {
    return `
你是一个图片生成 Agent，不是视频生成 Agent。

你的任务：
1. 理解用户的图片生成或图片修改需求。
2. 维护多轮图片上下文。
3. 判断本轮是否需要调用图片生成工具。
4. 把用户的短指令改写成完整、清晰、适合生图模型的 prompt。
5. 不要生成视频，不要使用视频相关词，如“视频生成”“帧率”“时长”“1920x1080”等。
6. 如果用户说“再加一个苹果”“背景换成公园”“让它更可爱”，这通常是修改上一张图片。
7. 如果当前没有上一张图，则把修改请求转成完整文生图请求。
8. 如果只是讨论想法，没有明确要求生成或修改，则 shouldCallTool=false。
9. 你只输出工具计划，不要输出 create_task payload。

工具动作规则：
- toolAction=generate_image：普通文生图或图片编辑，会由后端组装普通生图 payload。
- toolAction=super_resolution：变清晰、高清、超分、提升分辨率，会由后端固定组装 magnify payload。
- toolAction=cutout：抠图、去背景、移除背景，会由后端固定组装 remove_bg payload。
- 如果当前 UI 模式 composerMode=upscale，toolAction 必须是 super_resolution，shouldCallTool=true，requiresImage=true。
- 如果当前 UI 模式 composerMode=cutout，toolAction 必须是 cutout，shouldCallTool=true，requiresImage=true。
- 如果用户说“变清晰、高清、超分、提升分辨率”，并且有当前图片，toolAction 应为 super_resolution。
- 如果用户说“抠图、去背景、移除背景、透明背景”，并且有当前图片，toolAction 应为 cutout。
- super_resolution 不需要 prompt，不要为它生成普通生图 payload。
- super_resolution 的后端 payload 固定为 task_type="magnify"，args.mode="super_resolution"，args.image_base64=当前图片 base64。
- cutout 不需要 prompt，不要为它生成普通生图 payload。
- cutout 的后端 payload 固定为 task_type="remove_bg"，args.num_image=1，args.image_list=[{ mode:"new", image_base64:当前图片 base64 }]。

多轮图片生成规则：
- 如果用户第二轮、第三轮说“加一个苹果”“换成蓝色”“背景改成公园”“再可爱一点”，这不是新图，而是对上一张图的增量修改。
- 增量修改时，必须继承上一轮图片的主体、风格、场景、构图、光影、色彩和氛围。
- 不允许只把用户本轮输入作为 finalPrompt。
- finalPrompt 必须是“上一轮完整设定 + 本轮修改要求”的合并结果。
- 如果后端不支持 img2img，也必须通过完整 txt2img prompt 继承上一轮特征。

必须输出 JSON，格式如下：

{
  "toolAction": "generate_image | super_resolution | cutout | chat | prompt_only",
  "intent": "new_image | edit_previous_image | refine_prompt_only | chat",
  "generationMode": "txt2img | img2img",
  "shouldCallTool": true,
  "customerPrompt": "用户原始需求或精简后的需求",
  "finalPrompt": "完整图片 prompt",
  "subject": "主体",
  "style": "风格",
  "scene": "场景",
  "composition": "构图",
  "lighting": "光照",
  "colorPalette": "颜色",
  "usePreviousImage": true,
  "requiresImage": false,
  "reason": "为什么这样判断"
}

判断规则：
- 用户说“生成、画、出图、做一张、创建图片、按这个生成”，intent=new_image 或 edit_previous_image，shouldCallTool=true。
- 用户基于上一张图说“加、换、改、去掉、变成、旁边放、背景改”，intent=edit_previous_image。
- 如果有上一张图，并且是修改上一张图，generationMode=img2img，usePreviousImage=true。
- 如果没有上一张图，即使用户说“改”，也要 generationMode=txt2img，usePreviousImage=false。
- finalPrompt 必须是完整图片描述，不能只写“加一个苹果”。
- 如果 generationMode=txt2img，finalPrompt 要能独立生成完整图片。
- 如果 generationMode=img2img，finalPrompt 要描述如何在参考图基础上修改。
`.trim()
  }

  private normalizePlan(
    plan: Partial<AgentPlan>,
    state: ImageSessionState,
    userMessage: string,
    requestContext: {
      composerMode?: AgentComposerMode
      requestedToolAction?: ImageToolAction
      hasImageBase64: boolean
    }
  ): AgentPlan {
    const hasPreviousImage = Boolean(state.primaryImage || state.lastImages?.[0])
    const hasContext = this.hasImageContext(state)
    const isIncrementalEdit = this.looksLikeIncrementalEdit(userMessage)

    const normalized: AgentPlan = {
      toolAction: plan.toolAction ?? "chat",
      intent: plan.intent ?? "chat",
      generationMode: plan.generationMode ?? "txt2img",
      shouldCallTool: Boolean(plan.shouldCallTool),
      customerPrompt: plan.customerPrompt || userMessage,
      finalPrompt: plan.finalPrompt || userMessage,
      subject: plan.subject || state.subject,
      style: plan.style || state.style,
      scene: plan.scene || state.scene,
      composition: plan.composition || state.composition,
      lighting: plan.lighting || state.lighting,
      colorPalette: plan.colorPalette || state.colorPalette,
      usePreviousImage: Boolean(plan.usePreviousImage),
      requiresImage: Boolean(plan.requiresImage),
      reason: plan.reason || ""
    }

    if (normalized.shouldCallTool && normalized.toolAction === "chat") {
      normalized.toolAction = "generate_image"
    }

    if (normalized.intent === "refine_prompt_only") {
      normalized.toolAction = "prompt_only"
    }

    if (requestContext.requestedToolAction) {
      normalized.toolAction = requestContext.requestedToolAction
    }

    if (requestContext.composerMode === "upscale") {
      normalized.toolAction = "super_resolution"
    }

    if (requestContext.composerMode === "cutout") {
      normalized.toolAction = "cutout"
    }

    if (
      normalized.toolAction === "super_resolution" ||
      normalized.toolAction === "cutout"
    ) {
      normalized.intent = "edit_previous_image"
      normalized.generationMode = "img2img"
      normalized.shouldCallTool = true
      normalized.requiresImage = true
      normalized.usePreviousImage = false
      normalized.finalPrompt = ""
      normalized.reason +=
        normalized.toolAction === "super_resolution"
          ? "；当前请求被路由到变清晰工具。"
          : "；当前请求被路由到抠图工具。"

      return normalized
    }

    if (hasContext && isIncrementalEdit) {
      normalized.intent = "edit_previous_image"
      normalized.shouldCallTool = true
      normalized.toolAction = "generate_image"
    }

    if (normalized.intent === "edit_previous_image" && hasPreviousImage) {
      normalized.usePreviousImage = true
      normalized.generationMode = "img2img"
    }

    if (normalized.intent === "edit_previous_image" && !hasPreviousImage) {
      normalized.usePreviousImage = false
      normalized.generationMode = "txt2img"
    }

    if (normalized.generationMode === "img2img" && !hasPreviousImage) {
      normalized.generationMode = "txt2img"
      normalized.usePreviousImage = false
    }

    if (
      normalized.generationMode === "img2img" &&
      !this.deps.options.supportsImg2Img
    ) {
      normalized.generationMode = "txt2img"
      normalized.usePreviousImage = false
      normalized.finalPrompt = this.buildMergedPrompt(
        state,
        userMessage,
        "txt2img"
      )
      normalized.reason +=
        "；当前后端未启用 img2img，已基于上一轮 prompt 合并成本轮完整文生图 prompt。"

      return normalized
    }

    if (normalized.intent === "edit_previous_image") {
      normalized.finalPrompt = this.buildMergedPrompt(
        state,
        userMessage,
        normalized.generationMode
      )
    }

    return normalized
  }

  private heuristicPlan(
    state: ImageSessionState,
    userMessage: string,
    requestContext: {
      composerMode?: AgentComposerMode
      requestedToolAction?: ImageToolAction
      hasImageBase64: boolean
    }
  ): AgentPlan {
    if (
      requestContext.requestedToolAction === "super_resolution" ||
      requestContext.requestedToolAction === "cutout" ||
      requestContext.composerMode === "upscale" ||
      requestContext.composerMode === "cutout"
    ) {
      const toolAction =
        requestContext.requestedToolAction ??
        (requestContext.composerMode === "cutout" ? "cutout" : "super_resolution")

      return this.normalizePlan(
        {
          toolAction,
          intent: "edit_previous_image",
          generationMode: "img2img",
          shouldCallTool: true,
          customerPrompt: userMessage,
          finalPrompt: "",
          requiresImage: true,
          usePreviousImage: false,
          reason: "启发式规则根据 UI 模式判断为图片工具处理。"
        },
        state,
        userMessage,
        requestContext
      )
    }

    const hasContext = this.hasImageContext(state)
    const looksLikeEdit = this.looksLikeIncrementalEdit(userMessage)
    const generateKeywords = [
      "生成",
      "画",
      "出图",
      "做一张",
      "创建",
      "来一张",
      "按这个生成"
    ]
    const shouldGenerate = generateKeywords.some((word) =>
      userMessage.includes(word)
    )

    if (looksLikeEdit && hasContext) {
      const mode: GenerationMode =
        this.deps.options.supportsImg2Img &&
        Boolean(state.primaryImage || state.lastImages?.[0])
          ? "img2img"
          : "txt2img"

      return this.normalizePlan(
        {
          intent: "edit_previous_image",
          toolAction: "generate_image",
          generationMode: mode,
          shouldCallTool: true,
          customerPrompt: userMessage,
          finalPrompt: this.buildMergedPrompt(state, userMessage, mode),
          usePreviousImage: mode === "img2img",
          reason: "启发式规则判断为基于上一张图片修改。"
        },
        state,
        userMessage,
        requestContext
      )
    }

    if (shouldGenerate || looksLikeEdit) {
      const finalPrompt = this.buildRegeneratePrompt(state, userMessage)

      return {
        intent: "new_image",
        toolAction: "generate_image",
        generationMode: "txt2img",
        shouldCallTool: true,
        customerPrompt: userMessage,
        finalPrompt,
        subject: state.subject,
        style: state.style,
        scene: state.scene,
        composition: state.composition,
        lighting: state.lighting,
        colorPalette: state.colorPalette,
        usePreviousImage: false,
        reason: "启发式规则判断为文生图。"
      }
    }

    return {
      intent: "chat",
      toolAction: "chat",
      generationMode: "txt2img",
      shouldCallTool: false,
      customerPrompt: userMessage,
      finalPrompt: userMessage,
      subject: state.subject,
      style: state.style,
      scene: state.scene,
      composition: state.composition,
      lighting: state.lighting,
      colorPalette: state.colorPalette,
      usePreviousImage: false,
      reason: "未检测到明确生成或修改图片意图。"
    }
  }

  private looksLikeIncrementalEdit(userMessage: string): boolean {
    const editKeywords = [
      "加",
      "增加",
      "添加",
      "放",
      "旁边",
      "左边",
      "右边",
      "上面",
      "下面",
      "换",
      "改",
      "修改",
      "调整",
      "去掉",
      "删除",
      "变成",
      "背景",
      "颜色",
      "更",
      "再",
      "保持",
      "保留"
    ]

    return editKeywords.some((keyword) => userMessage.includes(keyword))
  }

  private hasImageContext(state: ImageSessionState): boolean {
    return Boolean(
      state.canonicalPrompt ||
        state.lastSuccessfulPrompt ||
        state.currentPrompt ||
        state.primaryImage ||
        state.lastImages?.[0]
    )
  }

  private buildMergedPrompt(
    state: ImageSessionState,
    userMessage: string,
    mode: GenerationMode
  ): string {
    const basePrompt =
      state.canonicalPrompt ??
      state.lastSuccessfulPrompt ??
      state.currentPrompt ??
      ""
    const preservedParts = [
      state.style ? `风格：${state.style}` : "",
      state.subject ? `主体：${state.subject}` : "",
      state.scene ? `场景：${state.scene}` : "",
      state.composition ? `构图：${state.composition}` : "",
      state.lighting ? `光照：${state.lighting}` : "",
      state.colorPalette ? `色彩：${state.colorPalette}` : ""
    ].filter(Boolean)
    const preservedText =
      preservedParts.length > 0 ? preservedParts.join("，") : ""

    if (mode === "img2img") {
      return [
        "基于参考图进行图片修改。",
        basePrompt ? `原图核心特征：${basePrompt}` : "",
        preservedText ? `需要保留的视觉特征：${preservedText}` : "",
        `本轮修改要求：${userMessage}`,
        "请保持上一张图的主体、风格、构图、光影、色彩一致，只自然加入或调整用户指定的元素。",
        "生成结果必须是一张完整、自然、画面统一的图片。"
      ]
        .filter(Boolean)
        .join("\n")
    }

    return [
      basePrompt ? `延续上一张图片的完整设定：${basePrompt}` : "",
      preservedText ? `需要保留的视觉特征：${preservedText}` : "",
      `本轮新增或修改要求：${userMessage}`,
      "请把以上内容合并成一张完整图片。",
      "必须保留上一轮的主体、风格、构图、光影、色彩和整体氛围。",
      "不要只生成新增元素，新增元素要自然融入原画面。"
    ]
      .filter(Boolean)
      .join("\n")
  }

  private buildRegeneratePrompt(
    state: ImageSessionState,
    userMessage: string
  ): string {
    const basePrompt =
      state.canonicalPrompt ??
      state.lastSuccessfulPrompt ??
      state.currentPrompt ??
      ""
    const parts = [
      state.style,
      state.subject,
      state.scene,
      state.composition,
      state.lighting,
      state.colorPalette
    ].filter(Boolean)
    const base = parts.length > 0 ? parts.join("，") : basePrompt

    if (base) {
      return `${base}。在此基础上满足新的要求：${userMessage}。生成一张完整、自然、画面统一的图片。`
    }

    return `生成一张图片，要求：${userMessage}。画面完整、主体清晰、风格统一。`
  }

  private applyPlanToState(state: ImageSessionState, plan: AgentPlan): void {
    if (plan.toolAction === "super_resolution" || plan.toolAction === "cutout") {
      state.currentUserPrompt = plan.customerPrompt
      return
    }

    state.currentPrompt = plan.finalPrompt
    state.currentUserPrompt = plan.customerPrompt
    state.canonicalPrompt = plan.finalPrompt

    if (plan.subject) state.subject = plan.subject
    if (plan.style) state.style = plan.style
    if (plan.scene) state.scene = plan.scene
    if (plan.composition) state.composition = plan.composition
    if (plan.lighting) state.lighting = plan.lighting
    if (plan.colorPalette) state.colorPalette = plan.colorPalette
  }

  private buildToolArgs(
    state: ImageSessionState,
    plan: AgentPlan
  ): GenerateImageToolArgs {
    const refImgList =
      plan.generationMode === "img2img" && plan.usePreviousImage
        ? [state.primaryImage ?? state.lastImages?.[0]].filter(
            (item): item is string => Boolean(item)
          )
        : []
    const styleConfig = getImageStyleConfig(state.styleModel)
    const targetSize = getTargetSizeForAspect(
      state.styleModel,
      state.aspectRatio
    )
    const taskType =
      plan.generationMode === "img2img"
        ? this.deps.options.img2imgTaskType
        : styleConfig.taskType

    if (plan.generationMode === "img2img" && !taskType) {
      throw new Error(
        "generationMode=img2img but img2imgTaskType is not configured."
      )
    }

    state.width = targetSize.width
    state.height = targetSize.height

    return {
      prompt: plan.finalPrompt,
      customerPrompt: plan.customerPrompt,
      generationMode: plan.generationMode,
      userIdx: this.deps.options.userIdx,
      taskType,
      tagName: styleConfig.tagName,
      numImage: state.numImage || this.deps.options.defaultNumImage,
      target: styleConfig.target,
      width: targetSize.width,
      height: targetSize.height,
      mode: styleConfig.mode,
      loras: styleConfig.loras,
      refImgList,
      pollIntervalMs: 2000,
      maxPollCount: 60,
      maxCreateRetries: 3,
      createTimeoutMs: 30000
    }
  }

  private buildSuccessText(
    plan: AgentPlan,
    result: GenerateImageToolResult
  ): string {
    const imageCount = result.images?.length ?? 0

    if (plan.generationMode === "img2img") {
      if (plan.toolAction === "super_resolution") {
        return [
          "已完成图片变清晰。",
          `处理方式：${plan.customerPrompt || "超分辨率"}`,
          `生成数量：${imageCount}`,
          result.primaryImage ? `主图：${result.primaryImage}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      }

      if (plan.toolAction === "cutout") {
        return [
          "已完成图片抠图。",
          `处理方式：${plan.customerPrompt || "移除背景"}`,
          `生成数量：${imageCount}`,
          result.primaryImage ? `主图：${result.primaryImage}` : ""
        ]
          .filter(Boolean)
          .join("\n")
      }

      return [
        "已基于上一张图片完成修改。",
        `修改需求：${plan.customerPrompt}`,
        `生成数量：${imageCount}`,
        result.primaryImage ? `主图：${result.primaryImage}` : ""
      ]
        .filter(Boolean)
        .join("\n")
    }

    return [
      "已生成图片。",
      `图片需求：${plan.customerPrompt}`,
      `生成数量：${imageCount}`,
      result.primaryImage ? `主图：${result.primaryImage}` : ""
    ]
      .filter(Boolean)
      .join("\n")
  }
}
