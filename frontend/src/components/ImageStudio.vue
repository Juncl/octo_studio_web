<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
import ComposerPanel from "./ComposerPanel.vue"
import StudioEnlarging, {
  type OutpaintGeneratePayload
} from "./studioEnlarging/StudioEnlarging.vue"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  imageUrls?: string[]
  fileName?: string
  generationInfo?: GenerationInfo
  createdAt: string
  typing?: boolean
  pending?: boolean
}

type GenerationInfo = {
  modeId?: string
  styleModel?: string
  aspectRatio?: string
  numImage?: number
  width?: number
  height?: number
  prompt?: string
  taskId?: string
}

type ClientAgentState = {
  sessionId: string

  currentPrompt?: string
  currentUserPrompt?: string
  canonicalPrompt?: string
  lastSuccessfulPrompt?: string

  subject?: string
  style?: string
  scene?: string
  composition?: string
  lighting?: string
  colorPalette?: string

  width: number
  height: number
  numImage: number
  styleModel?: string
  aspectRatio?: string

  lastTaskId?: string
  lastImages: string[]
  primaryImage?: string
}

type StoredConversation = {
  id: string
  title: string
  updatedAt: number
  createdAt: number
  messages: ChatMessage[]
  images: string[]
  primaryImage: string | null
  taskId?: string
  lastPrompt: string
  agentState?: ClientAgentState
}

type AgentApiResponse = {
  ok: boolean
  type?: "chat" | "image_result" | "prompt_updated" | "error"
  text?: string
  toolAction?: ImageToolAction
  images?: string[]
  primaryImage?: string | null
  taskId?: string
  error?: string
  state?: Partial<ClientAgentState>
}

type ImageToolAction =
  | "generate_image"
  | "super_resolution"
  | "cutout"
  | "outpainting"

type ComposerMenu = "mode" | "style" | "settings"
type WorkspaceToolMode = "preview" | "outpaint"

type OutpaintSourceImage = {
  id: string
  name: string
  src: string
  base64: string
  width: number
  height: number
}

type ComposerModeOption = {
  id: string
  label: string
  icon: string
  dividerBefore?: boolean
}

type ComposerStyleOption = {
  id: string
  label: string
  icon: string
}

type ComposerAspectOption = {
  id: string
  label: string
  width: number
  height: number
}

const STORAGE_KEY = "image-agent-conversations-v1"
const ACTIVE_ID_STORAGE_KEY = "image-agent-active-conversation-id-v1"

const composerModeOptions: ComposerModeOption[] = [
  {
    id: "image",
    label: "图片生成",
    icon: "▧"
  },
  {
    id: "video",
    label: "视频生成",
    icon: "▣"
  },
  {
    id: "upscale",
    label: "变清晰",
    icon: "HD",
    dividerBefore: true
  },
  {
    id: "cutout",
    label: "抠图",
    icon: "◌"
  },
  {
    id: "inpaint",
    label: "局部重绘",
    icon: "◒"
  },
  {
    id: "outpaint",
    label: "扩图",
    icon: "□"
  },
  {
    id: "scene",
    label: "场景融合",
    icon: "▨",
    dividerBefore: true
  }
]

const composerStyleOptions: ComposerStyleOption[] = [
  {
    id: "qianwen",
    label: "千问",
    icon: "✦"
  },
  {
    id: "bdicon",
    label: "BDIcon",
    icon: "☁"
  },
  {
    id: "portrait",
    label: "质感人像",
    icon: "人"
  },
  {
    id: "developer",
    label: "开发者人物形象",
    icon: "Dev"
  },
  {
    id: "agent",
    label: "小艺agent",
    icon: "AI"
  },
  {
    id: "smart3d",
    label: "智慧3D",
    icon: "3D"
  },
  {
    id: "abstract",
    label: "抽象几何背景",
    icon: "◍"
  },
  {
    id: "yunbao",
    label: "云宝",
    icon: "云"
  },
  {
    id: "hdesign",
    label: "H Design插画",
    icon: "H"
  },
  {
    id: "harmony",
    label: "鸿蒙插画",
    icon: "鸿"
  },
  {
    id: "abstract3d",
    label: "3D抽象元素",
    icon: "◇"
  }
]

const composerAspectOptions: ComposerAspectOption[] = [
  {
    id: "1:1",
    label: "1:1",
    width: 1024,
    height: 1024
  },
  {
    id: "2:3",
    label: "2:3",
    width: 800,
    height: 1200
  },
  {
    id: "3:4",
    label: "3:4",
    width: 768,
    height: 1024
  },
  {
    id: "9:16",
    label: "9:16",
    width: 720,
    height: 1280
  },
  {
    id: "3:2",
    label: "3:2",
    width: 1200,
    height: 800
  },
  {
    id: "4:3",
    label: "4:3",
    width: 1024,
    height: 768
  },
  {
    id: "16:9",
    label: "16:9",
    width: 1280,
    height: 720
  }
]

const conversations = ref<StoredConversation[]>([])
const activeId = ref("")
const input = ref("")
const loading = ref(false)
const typingMessageId = ref<string | null>(null)
const selectedPreview = ref<string | null>(null)
const selectedPreviewMessageId = ref<string | null>(null)
const scrollRef = ref<HTMLDivElement | null>(null)
const openComposerMenu = ref<ComposerMenu | null>(null)
const selectedComposerModeId = ref("image")
const defaultComposerStyleId = "qianwen"
const defaultAspectId = "1:1"

const activeConversation = computed(() => {
  return conversations.value.find((item) => item.id === activeId.value)
})

const messages = computed(() => activeConversation.value?.messages ?? [])
const images = computed(() => activeConversation.value?.images ?? [])
const primaryImage = computed(() => activeConversation.value?.primaryImage ?? null)
const taskId = computed(() => activeConversation.value?.taskId)
const lastPrompt = computed(() => activeConversation.value?.lastPrompt ?? "")
const activeAgentState = computed(() => {
  if (!activeConversation.value) return null

  return toClientAgentState(activeConversation.value)
})
const selectedAspectId = computed(() => {
  const state = activeAgentState.value

  if (!state) return defaultAspectId
  if (state.aspectRatio) return state.aspectRatio

  return (
    composerAspectOptions.find((option) => {
      return option.width === state.width && option.height === state.height
    })?.id ?? defaultAspectId
  )
})
const selectedImageCount = computed(() => activeAgentState.value?.numImage ?? 2)
const selectedComposerStyleId = computed(() => {
  return activeAgentState.value?.styleModel ?? defaultComposerStyleId
})
const canSubmit = computed(() => {
  if (loading.value || !activeConversation.value) return false

  if (selectedComposerModeId.value === "upscale" || selectedComposerModeId.value === "cutout") {
    return Boolean(currentPreview.value)
  }

  return Boolean(input.value.trim())
})
const detailStyleTags = computed(() => {
  const info = currentPreviewGenerationInfo.value
  const modeLabel = getComposerModeLabel(info.modeId)
  const styleLabel = getComposerStyleLabel(info.styleModel)
  const aspectRatio = info.aspectRatio ?? "-"
  const numImage = info.numImage ?? currentPreviewSet.value.length
  const tags = [
    modeLabel,
    styleLabel,
    aspectRatio,
    `${numImage}张`
  ]

  if (currentPreviewSet.value.length > 0) {
    tags.push(`${currentPreviewSet.value.length}张结果`)
  }

  return tags
})
const selectedComposerMode = computed(() => {
  return (
    composerModeOptions.find((option) => option.id === selectedComposerModeId.value) ??
    composerModeOptions[0]
  )
})
const selectedComposerStyle = computed(() => {
  return (
    composerStyleOptions.find((option) => option.id === selectedComposerStyleId.value) ??
    composerStyleOptions[0]
  )
})

const currentPreview = computed(() => {
  return selectedPreview.value ?? primaryImage.value ?? images.value[0] ?? null
})
const currentPreviewMessageId = computed(() => {
  if (!currentPreview.value) return null

  if (
    selectedPreviewMessageId.value &&
    messages.value.some((message) => {
      return (
        message.id === selectedPreviewMessageId.value &&
        message.imageUrls?.includes(currentPreview.value ?? "")
      )
    })
  ) {
    return selectedPreviewMessageId.value
  }

  return (
    messages.value.find((message) => {
      return message.imageUrls?.includes(currentPreview.value ?? "")
    })?.id ?? null
  )
})
const currentPreviewSourceMessage = computed(() => {
  if (!currentPreview.value) return null

  if (currentPreviewMessageId.value) {
    return (
      messages.value.find((message) => {
        return message.id === currentPreviewMessageId.value
      }) ?? null
    )
  }

  return (
    messages.value.find((message) => {
      return message.imageUrls?.includes(currentPreview.value ?? "")
    }) ?? null
  )
})
const currentPreviewPrompt = computed(() => {
  return (
    currentPreviewSourceMessage.value?.generationInfo?.prompt ??
    getPromptBeforeMessage(currentPreviewSourceMessage.value?.id)
  )
})
const currentPreviewGenerationInfo = computed<GenerationInfo>(() => {
  const sourceMessage = currentPreviewSourceMessage.value
  const fallbackState = activeAgentState.value

  return {
    modeId: sourceMessage?.generationInfo?.modeId ?? selectedComposerModeId.value,
    styleModel:
      sourceMessage?.generationInfo?.styleModel ??
      fallbackState?.styleModel ??
      defaultComposerStyleId,
    aspectRatio:
      sourceMessage?.generationInfo?.aspectRatio ??
      fallbackState?.aspectRatio ??
      selectedAspectId.value,
    numImage:
      sourceMessage?.generationInfo?.numImage ??
      fallbackState?.numImage ??
      currentPreviewSet.value.length,
    width: sourceMessage?.generationInfo?.width ?? fallbackState?.width,
    height: sourceMessage?.generationInfo?.height ?? fallbackState?.height,
    prompt: currentPreviewPrompt.value,
    taskId:
      sourceMessage?.generationInfo?.taskId ??
      fallbackState?.lastTaskId ??
      taskId.value
  }
})
const allConversationImages = computed(() => {
  const urls = new Set<string>()

  for (const message of messages.value) {
    for (const url of message.imageUrls ?? []) {
      urls.add(url)
    }
  }

  for (const url of images.value) {
    urls.add(url)
  }

  return [...urls]
})

const hasStartedConversation = computed(() => {
  return messages.value.some((message) => message.role === "user") || images.value.length > 0
})

const workspaceTitle = computed(() => {
  if (!activeConversation.value) return "骑行图片"
  if (activeConversation.value.title === "新的图片生成对话") return "骑行图片"

  return activeConversation.value.title
})

const groupedHistory = computed(() => {
  return groupConversations(
    [...conversations.value].sort((a, b) => b.updatedAt - a.updatedAt)
  )
})

const sideQuickItems = computed(() => {
  return [...conversations.value]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)
})

function nowText() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  })
}

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function getComposerTargetSize(styleModel: string, aspectRatio: string) {
  if (styleModel === "developer" && aspectRatio === "1:1") {
    return {
      width: 1280,
      height: 1280
    }
  }

  const option =
    composerAspectOptions.find((item) => item.id === aspectRatio) ??
    composerAspectOptions[0]

  return {
    width: option.width,
    height: option.height
  }
}

function getComposerModeLabel(modeId: string | undefined) {
  return (
    composerModeOptions.find((option) => option.id === modeId)?.label ??
    composerModeOptions[0].label
  )
}

function getComposerStyleLabel(styleModel: string | undefined) {
  return (
    composerStyleOptions.find((option) => option.id === styleModel)?.label ??
    composerStyleOptions[0].label
  )
}

function createEmptyAgentState(sessionId: string): ClientAgentState {
  return {
    sessionId,
    styleModel: defaultComposerStyleId,
    aspectRatio: defaultAspectId,
    width: 1024,
    height: 1024,
    numImage: 2,
    lastImages: []
  }
}

function createEmptyConversation(): StoredConversation {
  const id = createId("session")

  return {
    id,
    title: "新的图片生成对话",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [
      {
        id: createId("msg"),
        role: "assistant",
        content:
          "你好，我是图片生成 Agent。你可以上传参考图、输入文字，描述你想生成的图片。",
        createdAt: nowText()
      }
    ],
    images: [],
    primaryImage: null,
    lastPrompt: "",
    agentState: createEmptyAgentState(id)
  }
}

function getConversationTitle(text: string) {
  const cleaned = text.replace(/\s+/g, " ").trim()

  if (!cleaned) return "新的图片生成对话"

  return cleaned.length > 18 ? `${cleaned.slice(0, 18)}...` : cleaned
}

function getFeatureTitle(
  prompt: string,
  state?: Partial<ClientAgentState> | ClientAgentState
) {
  const parts = [
    state?.subject,
    state?.scene,
    state?.style,
    state?.composition,
    state?.lighting,
    state?.colorPalette
  ]
    .map((item) => item?.replace(/\s+/g, " ").trim())
    .filter((item): item is string => Boolean(item))

  const source = parts.length > 0 ? parts.join(" ") : prompt
  const cleaned = source
    .replace(/\s+/g, " ")
    .replace(/[\\/:*?"<>|]/g, "")
    .trim()

  if (!cleaned) return workspaceTitle.value || "Octo Studio"

  return cleaned.length > 22 ? `${cleaned.slice(0, 22)}...` : cleaned
}

function getFeatureFileName(
  prompt: string,
  state?: Partial<ClientAgentState> | ClientAgentState
) {
  return `${getFeatureTitle(prompt, state)}.png`
}

function isPlaceholderFileName(fileName: string | undefined) {
  return !fileName || fileName === "户外骑行图片.png"
}

function normalizeConversation(item: StoredConversation): StoredConversation {
  const itemImages = Array.isArray(item.images) ? item.images : []
  const itemPrimaryImage = item.primaryImage ?? itemImages[0] ?? null
  const itemTaskId = item.taskId
  const itemLastPrompt = item.lastPrompt ?? ""

  const agentState: ClientAgentState = {
    ...createEmptyAgentState(item.id),
    ...(item.agentState ?? {}),
    sessionId: item.id,
    currentPrompt:
      item.agentState?.currentPrompt ??
      item.agentState?.canonicalPrompt ??
      itemLastPrompt ??
      undefined,
    currentUserPrompt: item.agentState?.currentUserPrompt ?? itemLastPrompt,
    canonicalPrompt:
      item.agentState?.canonicalPrompt ??
      item.agentState?.currentPrompt ??
      itemLastPrompt ??
      undefined,
    lastSuccessfulPrompt:
      item.agentState?.lastSuccessfulPrompt ??
      item.agentState?.canonicalPrompt ??
      item.agentState?.currentPrompt ??
      itemLastPrompt ??
      undefined,
    lastTaskId: item.agentState?.lastTaskId ?? itemTaskId,
    lastImages:
      item.agentState?.lastImages && item.agentState.lastImages.length > 0
        ? item.agentState.lastImages
        : itemImages,
    primaryImage: item.agentState?.primaryImage ?? itemPrimaryImage ?? undefined
  }

  return {
    ...item,
    images: itemImages,
    primaryImage: itemPrimaryImage,
    taskId: itemTaskId,
    lastPrompt: itemLastPrompt,
    messages: Array.isArray(item.messages) ? item.messages : [],
    agentState
  }
}

function loadConversations(): StoredConversation[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)

    if (!raw) return []

    const parsed = JSON.parse(raw)

    if (!Array.isArray(parsed)) return []

    return parsed.map(normalizeConversation)
  } catch {
    return []
  }
}

function saveConversations(items: StoredConversation[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

function loadActiveConversationId() {
  return window.localStorage.getItem(ACTIVE_ID_STORAGE_KEY) ?? ""
}

function saveActiveConversationId(id: string) {
  if (!id) return

  window.localStorage.setItem(ACTIVE_ID_STORAGE_KEY, id)
}

function groupConversations(items: StoredConversation[]) {
  const today: StoredConversation[] = []
  const yesterday: StoredConversation[] = []
  const last7Days: StoredConversation[] = []
  const earlier: StoredConversation[] = []

  const now = new Date()
  const todayStart = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const last7Start = todayStart - 7 * 24 * 60 * 60 * 1000

  for (const item of items) {
    if (item.updatedAt >= todayStart) {
      today.push(item)
    } else if (item.updatedAt >= yesterdayStart) {
      yesterday.push(item)
    } else if (item.updatedAt >= last7Start) {
      last7Days.push(item)
    } else {
      earlier.push(item)
    }
  }

  return [
    {
      label: "今天",
      items: today
    },
    {
      label: "昨天",
      items: yesterday
    },
    {
      label: "近七天",
      items: last7Days
    },
    {
      label: "更早",
      items: earlier
    }
  ].filter((group) => group.items.length > 0)
}

function toClientAgentState(conversation: StoredConversation): ClientAgentState {
  const base = conversation.agentState ?? createEmptyAgentState(conversation.id)

  return {
    ...base,
    sessionId: conversation.id,
    currentPrompt:
      base.currentPrompt ??
      base.canonicalPrompt ??
      conversation.lastPrompt ??
      undefined,
    currentUserPrompt: base.currentUserPrompt ?? conversation.lastPrompt,
    canonicalPrompt:
      base.canonicalPrompt ??
      base.currentPrompt ??
      conversation.lastPrompt ??
      undefined,
    lastSuccessfulPrompt:
      base.lastSuccessfulPrompt ??
      base.canonicalPrompt ??
      base.currentPrompt ??
      conversation.lastPrompt ??
      undefined,
    width: base.width ?? 1024,
    height: base.height ?? 1024,
    numImage: base.numImage ?? 2,
    styleModel: base.styleModel ?? defaultComposerStyleId,
    aspectRatio:
      base.aspectRatio ??
      composerAspectOptions.find((option) => {
        return option.width === base.width && option.height === base.height
      })?.id ??
      defaultAspectId,
    lastTaskId: base.lastTaskId ?? conversation.taskId,
    lastImages:
      base.lastImages && base.lastImages.length > 0
        ? base.lastImages
        : conversation.images,
    primaryImage: base.primaryImage ?? conversation.primaryImage ?? undefined
  }
}

function slimAgentStateFromResponse(
  sessionId: string,
  state: Partial<ClientAgentState> | undefined,
  fallback: StoredConversation
): ClientAgentState {
  const base = toClientAgentState(fallback)

  if (!state) return base

  return {
    ...base,
    sessionId,
    currentPrompt: state.currentPrompt ?? base.currentPrompt,
    currentUserPrompt: state.currentUserPrompt ?? base.currentUserPrompt,
    canonicalPrompt: state.canonicalPrompt ?? base.canonicalPrompt,
    lastSuccessfulPrompt:
      state.lastSuccessfulPrompt ?? base.lastSuccessfulPrompt,

    subject: state.subject ?? base.subject,
    style: state.style ?? base.style,
    scene: state.scene ?? base.scene,
    composition: state.composition ?? base.composition,
    lighting: state.lighting ?? base.lighting,
    colorPalette: state.colorPalette ?? base.colorPalette,

    width: typeof state.width === "number" ? state.width : base.width,
    height: typeof state.height === "number" ? state.height : base.height,
    numImage:
      typeof state.numImage === "number" ? state.numImage : base.numImage,
    styleModel: state.styleModel ?? base.styleModel,
    aspectRatio: state.aspectRatio ?? base.aspectRatio,

    lastTaskId: state.lastTaskId ?? base.lastTaskId,
    lastImages: Array.isArray(state.lastImages)
      ? state.lastImages
      : base.lastImages,
    primaryImage: state.primaryImage ?? base.primaryImage
  }
}

async function sendImageAgentMessage(inputValue: {
  sessionId: string
  message: string
  clientState: ClientAgentState
  composerMode?: string
  requestedToolAction?: ImageToolAction
  imageBase64?: string
  outpaintParams?: OutpaintGeneratePayload
}): Promise<AgentApiResponse> {
  const response = await fetch("/api/agent/image", {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(inputValue)
  })

  const data = await response.json()

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? data.message ?? "Agent request failed")
  }

  return data as AgentApiResponse
}

function updateActiveConversation(
  updater: (conversation: StoredConversation) => StoredConversation
) {
  conversations.value = conversations.value.map((item) => {
    if (item.id !== activeId.value) return item

    return normalizeConversation(updater(item))
  })
}

function handleNewChat() {
  const next = createEmptyConversation()

  conversations.value = [next, ...conversations.value]
  activeId.value = next.id
  input.value = ""
  typingMessageId.value = null
  selectedPreview.value = null
  selectedPreviewMessageId.value = null
  closeOutpaintTool()
}

function handleSelectConversation(id: string) {
  if (loading.value) return

  const target = conversations.value.find((item) => item.id === id)

  if (!target) return

  activeId.value = id
  input.value = ""
  typingMessageId.value = null
  selectedPreview.value = target.primaryImage ?? target.images[0] ?? null
  selectedPreviewMessageId.value = null
  closeOutpaintTool()
}

function handleDeleteConversation(id: string) {
  if (loading.value) return

  const next = conversations.value.filter((item) => item.id !== id)

  if (id === activeId.value) {
    if (next[0]) {
      activeId.value = next[0].id
      selectedPreview.value = next[0].primaryImage ?? next[0].images[0] ?? null
      selectedPreviewMessageId.value = null
    } else {
      const created = createEmptyConversation()
      activeId.value = created.id
      selectedPreview.value = null
      selectedPreviewMessageId.value = null
      conversations.value = [created]
      return
    }
  }

  conversations.value = next
}

function toggleComposerMenu(menu: ComposerMenu) {
  openComposerMenu.value = openComposerMenu.value === menu ? null : menu
}

function handleSelectComposerMode(option: ComposerModeOption) {
  selectedComposerModeId.value = option.id
  openComposerMenu.value = null
}

function handleSelectComposerStyle(option: ComposerStyleOption) {
  updateActiveConversation((conversation) => {
    const state = toClientAgentState(conversation)
    const aspectRatio = state.aspectRatio ?? selectedAspectId.value
    const size = getComposerTargetSize(option.id, aspectRatio)

    return {
      ...conversation,
      updatedAt: Date.now(),
      agentState: {
        ...state,
        styleModel: option.id,
        aspectRatio,
        width: size.width,
        height: size.height
      }
    }
  })
  openComposerMenu.value = null
}

function handleSelectAspect(option: ComposerAspectOption) {
  updateActiveConversation((conversation) => {
    const state = toClientAgentState(conversation)
    const styleModel = state.styleModel ?? selectedComposerStyleId.value
    const size = getComposerTargetSize(styleModel, option.id)

    return {
      ...conversation,
      updatedAt: Date.now(),
      agentState: {
        ...state,
        styleModel,
        aspectRatio: option.id,
        width: size.width,
        height: size.height
      }
    }
  })
}

function handleSelectImageCount(count: number) {
  updateActiveConversation((conversation) => {
    return {
      ...conversation,
      updatedAt: Date.now(),
      agentState: {
        ...toClientAgentState(conversation),
        numImage: count
      }
    }
  })
}

async function handleSubmit() {
  const isUpscaleMode = selectedComposerModeId.value === "upscale"
  const isCutoutMode = selectedComposerModeId.value === "cutout"
  const text = input.value.trim() || (isUpscaleMode ? "变清晰" : isCutoutMode ? "抠图" : "")

  await submitAgentRequest({
    text,
    composerMode: selectedComposerModeId.value,
    requestedToolAction: isUpscaleMode
      ? "super_resolution"
      : isCutoutMode
        ? "cutout"
        : undefined
  })
}

async function handleToolAction(action: ImageToolAction) {
  const label =
    action === "super_resolution" ? "变清晰" : action === "cutout" ? "抠图" : "处理图片"

  await submitAgentRequest({
    text: input.value.trim() || label,
    composerMode:
      action === "super_resolution"
        ? "upscale"
        : action === "cutout"
          ? "cutout"
          : selectedComposerModeId.value,
    requestedToolAction: action
  })
}

async function openOutpaintTool() {
  if (!currentPreview.value || loading.value) return

  try {
    const base64 = await getCurrentPreviewBase64()
    const size = await loadImageSize(base64)

    outpaintSourceImage.value = {
      id: currentPreviewMessageId.value ?? createId("outpaint"),
      name: getCurrentFileName() || "当前图片.png",
      src: currentPreview.value,
      base64,
      width: size.width,
      height: size.height
    }
    workspaceToolMode.value = "outpaint"
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    window.alert(message)
  }
}

function closeOutpaintTool() {
  workspaceToolMode.value = "preview"
  outpaintSourceImage.value = null
}

async function handleOutpaintGenerate(params: OutpaintGeneratePayload) {
  await submitAgentRequest({
    text: params.prompt || "扩图",
    composerMode: "outpaint",
    requestedToolAction: "outpainting",
    imageBase64: params.imageBase64,
    outpaintParams: params
  })
}

async function submitAgentRequest(options: {
  text: string
  composerMode?: string
  requestedToolAction?: ImageToolAction
  imageBase64?: string
  outpaintParams?: OutpaintGeneratePayload
}) {
  const text = options.text.trim()

  if (!text || loading.value || !activeConversation.value) return

  let imageBase64: string | undefined

  try {
    if (options.requestedToolAction === "outpainting") {
      imageBase64 = options.imageBase64 ?? options.outpaintParams?.imageBase64
    } else if (
      options.requestedToolAction === "super_resolution" ||
      options.requestedToolAction === "cutout"
    ) {
      imageBase64 = await getCurrentPreviewBase64()
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    window.alert(message)
    return
  }

  const requestConversation = normalizeConversation(activeConversation.value)
  const requestClientState = toClientAgentState(requestConversation)

  input.value = ""
  loading.value = true

  const userMessage: ChatMessage = {
    id: createId("msg"),
    role: "user",
    content: text,
    createdAt: nowText()
  }

  const pendingMessage: ChatMessage = {
    id: createId("msg"),
    role: "assistant",
    content: "",
    pending: true,
    createdAt: nowText()
  }

  updateActiveConversation((conversation) => {
    const isUntitled =
      conversation.title === "新的图片生成对话" ||
      conversation.messages.length <= 1

    const updatedAgentState: ClientAgentState = {
      ...toClientAgentState(conversation),
      currentUserPrompt: text
    }

    return {
      ...conversation,
      title: isUntitled ? getConversationTitle(text) : conversation.title,
      lastPrompt: text,
      updatedAt: Date.now(),
      agentState: updatedAgentState,
      messages: [...conversation.messages, userMessage, pendingMessage]
    }
  })

  try {
    const result = await sendImageAgentMessage({
      sessionId: requestConversation.id,
      message: text,
      clientState: requestClientState,
      composerMode: options.composerMode,
      requestedToolAction: options.requestedToolAction,
      imageBase64,
      outpaintParams: options.outpaintParams
    })

    const nextImages = result.images ?? []
    const assistantText = getMessageBubbleContent(
      result.text ?? "已完成图片生成。"
    )
    const generatedFileName = getFeatureFileName(text, result.state)
    const generationInfo: GenerationInfo | undefined =
      result.type === "image_result"
        ? {
            modeId: options.composerMode ?? selectedComposerModeId.value,
            styleModel:
              result.state?.styleModel ??
              requestClientState.styleModel ??
              defaultComposerStyleId,
            aspectRatio:
              result.state?.aspectRatio ??
              requestClientState.aspectRatio ??
              defaultAspectId,
            numImage:
              options.outpaintParams?.numImage ??
              result.state?.numImage ??
              requestClientState.numImage ??
              nextImages.length,
            width:
              options.outpaintParams?.realWidth ??
              result.state?.width ??
              requestClientState.width,
            height:
              options.outpaintParams?.realHeight ??
              result.state?.height ??
              requestClientState.height,
            prompt: text,
            taskId: result.taskId
          }
        : undefined

    const assistantMessage: ChatMessage = {
      id: createId("msg"),
      role: "assistant",
      content: "",
      imageUrls: result.type === "image_result" ? nextImages : undefined,
      generationInfo,
      fileName:
        result.type === "image_result" && nextImages.length > 0
          ? generatedFileName
          : undefined,
      createdAt: nowText(),
      typing: true
    }

    if (result.type === "image_result" && nextImages.length > 0) {
      selectedPreview.value = result.primaryImage ?? nextImages[0] ?? null
      selectedPreviewMessageId.value = assistantMessage.id
      if (options.requestedToolAction === "outpainting") {
        closeOutpaintTool()
      }
    }

    updateActiveConversation((conversation) => {
      const nextPrimaryImage =
        result.type === "image_result"
          ? result.primaryImage ?? nextImages[0] ?? conversation.primaryImage
          : conversation.primaryImage

      const nextConversation: StoredConversation = {
        ...conversation,
        updatedAt: Date.now(),
        taskId: result.taskId ?? conversation.taskId,
        images:
          result.type === "image_result" && nextImages.length > 0
            ? nextImages
            : conversation.images,
        primaryImage: nextPrimaryImage,
        messages: conversation.messages
          .filter((message) => !message.pending)
          .concat(assistantMessage)
      }

      return {
        ...nextConversation,
        agentState: slimAgentStateFromResponse(
          conversation.id,
          result.state,
          nextConversation
        )
      }
    })

    await nextTick()
    startTypewriter(assistantMessage.id, assistantText)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    const assistantMessage: ChatMessage = {
      id: createId("msg"),
      role: "assistant",
      content: "",
      createdAt: nowText(),
      typing: true
    }

    updateActiveConversation((conversation) => ({
      ...conversation,
      updatedAt: Date.now(),
      messages: conversation.messages
        .filter((item) => !item.pending)
        .concat(assistantMessage)
    }))

    await nextTick()
    startTypewriter(assistantMessage.id, `图片生成失败：${message}`)
  } finally {
    loading.value = false
  }
}

async function getCurrentPreviewBase64(): Promise<string> {
  const preview = currentPreview.value

  if (!preview) {
    throw new Error("请先选择一张需要变清晰的图片。")
  }

  if (preview.startsWith("data:image/")) {
    return preview
  }

  try {
    const response = await fetch(preview)

    if (!response.ok) {
      throw new Error(`图片读取失败：${response.status}`)
    }

    const blob = await response.blob()

    return await blobToDataUrl(blob)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    throw new Error(`当前图片无法转换为 base64：${message}`)
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result)
        return
      }

      reject(new Error("图片 base64 读取失败。"))
    }
    reader.onerror = () => reject(reader.error ?? new Error("图片 base64 读取失败。"))
    reader.readAsDataURL(blob)
  })
}

function loadImageSize(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()

    img.onload = () => {
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight
      })
    }
    img.onerror = () => reject(new Error("图片尺寸读取失败。"))
    img.src = src
  })
}

function startTypewriter(messageId: string, fullText: string) {
  typingMessageId.value = messageId

  let index = 0

  const timer = window.setInterval(() => {
    index += 1

    updateActiveConversation((conversation) => ({
      ...conversation,
      messages: conversation.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              content: fullText.slice(0, index),
              typing: index < fullText.length
            }
          : message
      )
    }))

    if (index >= fullText.length) {
      window.clearInterval(timer)
      typingMessageId.value = null
    }
  }, 16)
}

function getMessageBubbleContent(messageOrContent: ChatMessage | string) {
  if (
    typeof messageOrContent !== "string" &&
    messageOrContent.role === "user"
  ) {
    return messageOrContent.content
  }

  const content =
    typeof messageOrContent === "string"
      ? messageOrContent
      : messageOrContent.content

  return content
    .split("\n")
    .filter((line) => {
      const normalized = line.trim()

      return !normalized.startsWith("主图:") && !normalized.startsWith("主图：")
    })
    .join("\n")
    .trim()
}

function getPreviewGridClass() {
  if (images.value.length === 1) return "preview-grid single"
  if (images.value.length === 2) return "preview-grid two"
  if (images.value.length === 3) return "preview-grid three"

  return "preview-grid multi"
}

function getCurrentPreviewIndex() {
  if (!currentPreview.value) return "-"

  const previewImages = currentPreviewSet.value
  const index = previewImages.findIndex((item) => item === currentPreview.value)

  if (index < 0) return "-"

  return `${index + 1}/${previewImages.length}`
}

function selectPreview(url: string, messageId?: string) {
  selectedPreview.value = url
  selectedPreviewMessageId.value = messageId ?? currentPreviewMessageId.value
}

function isMessagePreviewSelected(message: ChatMessage, url: string) {
  return (
    currentPreview.value === url &&
    currentPreviewMessageId.value === message.id
  )
}

function isDetailPreviewSelected(url: string) {
  return (
    currentPreview.value === url &&
    (!currentPreviewMessageId.value ||
      selectedPreviewMessageId.value === currentPreviewMessageId.value)
  )
}

function getCurrentFileName() {
  if (!currentPreview.value) return ""

  const sourceMessage = messages.value.find((message) => {
    if (currentPreviewMessageId.value) {
      return message.id === currentPreviewMessageId.value
    }

    return message.imageUrls?.includes(currentPreview.value ?? "")
  })

  const prompt = getPromptBeforeMessage(sourceMessage?.id)

  if (sourceMessage?.fileName && !isPlaceholderFileName(sourceMessage.fileName)) {
    return sourceMessage.fileName
  }

  if (prompt || activeAgentState.value) {
    return getFeatureFileName(prompt || lastPrompt.value, activeAgentState.value ?? undefined)
  }

  const urlFileName = getFileNameFromUrl(currentPreview.value)

  if (urlFileName) return urlFileName

  const index = currentPreviewSet.value.findIndex((item) => item === currentPreview.value)
  const suffix = index >= 0 ? index + 1 : 1
  const title = workspaceTitle.value || "Octo Studio"

  return `${title}-${suffix}.png`
}

function getPromptBeforeMessage(messageId: string | undefined) {
  if (!messageId) return lastPrompt.value

  const messageIndex = messages.value.findIndex((message) => message.id === messageId)

  if (messageIndex < 0) return lastPrompt.value

  for (let index = messageIndex - 1; index >= 0; index -= 1) {
    const message = messages.value[index]

    if (message.role === "user" && message.content.trim()) {
      return message.content.trim()
    }
  }

  return lastPrompt.value
}

function getGeneratedTitle(message: ChatMessage) {
  const prompt = getPromptBeforeMessage(message.id)

  if (message.fileName && !isPlaceholderFileName(message.fileName)) {
    return message.fileName.replace(/\.png$/i, "")
  }

  return getFeatureTitle(prompt, activeAgentState.value ?? undefined)
}

const currentPreviewSet = computed(() => {
  if (!currentPreview.value) return images.value

  if (currentPreviewMessageId.value) {
    const selectedMessage = messages.value.find((message) => {
      return message.id === currentPreviewMessageId.value
    })

    if (selectedMessage?.imageUrls && selectedMessage.imageUrls.length > 0) {
      return selectedMessage.imageUrls
    }
  }

  const sourceMessage = messages.value.find((message) => {
    return message.imageUrls?.includes(currentPreview.value ?? "")
  })

  return sourceMessage?.imageUrls && sourceMessage.imageUrls.length > 0
    ? sourceMessage.imageUrls
    : images.value
})

function getFileNameFromUrl(url: string) {
  if (url.startsWith("data:")) return ""

  try {
    const parsed = new URL(url, window.location.href)
    const fileName = decodeURIComponent(parsed.pathname.split("/").pop() ?? "")

    return fileName.includes(".") ? fileName : ""
  } catch {
    const cleanUrl = url.split("?")[0] ?? url
    const fileName = decodeURIComponent(cleanUrl.split("/").pop() ?? "")

    return fileName.includes(".") ? fileName : ""
  }
}

function getResultSummary() {
  if (!lastPrompt.value) {
    return "一位骑行者穿着质感高级的纯黑色骑行服，戴着酷炫的深色运动墨镜，正在黄昏时分的城市公园中骑行。"
  }

  return `根据你的描述生成图片：${lastPrompt.value}`
}

function startDrag(event: MouseEvent) {
  event.preventDefault()
  isDragging.value = true
  document.body.style.cursor = "col-resize"
  document.body.style.userSelect = "none"
}

function onDrag(event: MouseEvent) {
  if (!isDragging.value) return

  const newWidth = Math.round(
    Math.min(Math.max(event.clientX, 160), 360)
  )

  sidebarWidth.value = newWidth
}

function stopDrag() {
  if (!isDragging.value) return

  isDragging.value = false
  document.body.style.cursor = ""
  document.body.style.userSelect = ""
}

onMounted(() => {
  document.addEventListener("mousemove", onDrag)
  document.addEventListener("mouseup", stopDrag)

  const loaded = loadConversations()
  const activeFromStorage = loadActiveConversationId()

  if (loaded.length > 0) {
    const nextActive =
      loaded.find((item) => item.id === activeFromStorage)?.id ?? loaded[0].id

    conversations.value = loaded
    activeId.value = nextActive

    const activeConversationFromStorage =
      loaded.find((item) => item.id === nextActive) ?? loaded[0]

    selectedPreview.value =
      activeConversationFromStorage.primaryImage ??
      activeConversationFromStorage.images[0] ??
      null
    selectedPreviewMessageId.value = null

    return
  }

  const initial = createEmptyConversation()
  conversations.value = [initial]
  activeId.value = initial.id
  selectedPreview.value = null
  selectedPreviewMessageId.value = null
  saveConversations([initial])
  saveActiveConversationId(initial.id)
})

onBeforeUnmount(() => {
  document.removeEventListener("mousemove", onDrag)
  document.removeEventListener("mouseup", stopDrag)
})

watch(
  conversations,
  (value) => {
    if (value.length > 0) {
      saveConversations(value)
    }
  },
  {
    deep: true
  }
)

watch(activeId, (value) => {
  if (value) {
    saveActiveConversationId(value)
  }
})

watch(
  () => [messages.value.length, loading.value, typingMessageId.value],
  async () => {
    await nextTick()

    scrollRef.value?.scrollTo({
      top: scrollRef.value.scrollHeight,
      behavior: "smooth"
    })
  }
)

watch(
  () => [allConversationImages.value, images.value, primaryImage.value, selectedPreview.value],
  () => {
    if (allConversationImages.value.length === 0) {
      selectedPreview.value = null
      selectedPreviewMessageId.value = null
      return
    }

    if (
      !selectedPreview.value ||
      !allConversationImages.value.includes(selectedPreview.value)
    ) {
      selectedPreview.value = primaryImage.value ?? images.value[0] ?? null
      selectedPreviewMessageId.value = null
    }
  },
  {
    deep: true
  }
)
</script>

<template>
  <div class="octo-shell">
    <aside class="octo-sidebar" :style="{ width: sidebarWidth + 'px' }">
      <button
        class="sidebar-drag-handle"
        type="button"
        aria-label="拖拽调整侧边栏"
        @mousedown="startDrag"
      >
        <span class="sidebar-drag-line" />
      </button>
      <button class="new-chat-button" @click="handleNewChat">
        <span class="new-chat-plus">＋</span>
        <span class="new-chat-label">新建对话</span>
      </button>

      <div class="sidebar-divider" />

      <div class="studio-tree">
        <div class="studio-tree-header">
          <div class="studio-brand">
            <span class="studio-brand-icon">✦</span>
            <span class="studio-brand-name">Octo Studio</span>
          </div>
          <div class="studio-tree-actions">
            <button
              class="studio-tree-toggle-button"
              type="button"
              aria-label="展开会话列表"
              title="展开会话列表"
            >
            </button>
          </div>
        </div>

        <div class="studio-tree-list">
          <button
            v-for="conversation in sideQuickItems"
            :key="conversation.id"
            type="button"
            :class="
              conversation.id === activeId
                ? 'studio-tree-item active'
                : 'studio-tree-item'
            "
            @click="
              () => {
                if (!conversation.id.startsWith('display_')) {
                  handleSelectConversation(conversation.id)
                }
              }
            "
          >
            <span class="studio-tree-item-title">{{ conversation.title }}</span>
          </button>
        </div>
      </div>
    </aside>

    <main v-if="!hasStartedConversation" class="welcome-main">
      <section class="welcome-content">
        <div class="octo-logo">
          <span class="logo-piece logo-piece-a" />
          <span class="logo-piece logo-piece-b" />
          <span class="logo-piece logo-piece-c" />
          <span class="logo-piece logo-piece-d" />
        </div>

        <h1 class="welcome-title">Octo Studio</h1>
        <p class="welcome-subtitle">描述你想要的创意效果</p>

        <ComposerPanel
          v-model="input"
          :loading="loading"
          :can-submit="canSubmit"
          :open-menu="openComposerMenu"
          :selected-mode-id="selectedComposerModeId"
          :selected-style-id="selectedComposerStyleId"
          :selected-aspect-id="selectedAspectId"
          :selected-image-count="selectedImageCount"
          @toggle-menu="toggleComposerMenu"
          @select-mode="handleSelectComposerMode"
          @select-style="handleSelectComposerStyle"
          @select-aspect="handleSelectAspect"
          @select-image-count="handleSelectImageCount"
          @submit="handleSubmit"
        />
      </section>
    </main>

    <main v-else class="workspace-main">
      <section class="conversation-panel">
        <header class="conversation-header">
          <h2 class="conversation-title">{{ workspaceTitle }}</h2>
          <button class="conversation-more-button" type="button">⋮</button>
        </header>

        <div ref="scrollRef" class="conversation-scroll">
          <div
            v-for="message in messages.filter((item) => item.role === 'user' || item.pending || getMessageBubbleContent(item))"
            :key="message.id"
            :class="
              message.role === 'user'
                ? 'message-row user-row'
                : 'message-row assistant-row'
            "
          >
            <div v-if="message.pending" class="thinking-card">
              <div class="thinking-title">
                <span class="thinking-dot" />
                <span class="thinking-label">Agent 正在生成</span>
                <span class="typing-dots">
                  <i class="typing-dot typing-dot-first" />
                  <i class="typing-dot typing-dot-second" />
                  <i class="typing-dot typing-dot-third" />
                </span>
              </div>
              <div class="thinking-line thinking-line-main" />
              <div class="thinking-line thinking-line-short short" />
            </div>

            <template v-else>
              <div :class="message.role === 'user' ? 'message-bubble user-bubble' : 'message-bubble assistant-text'">
                <span class="message-content">{{ getMessageBubbleContent(message) }}</span>
                <span
                  v-if="message.id === typingMessageId && message.typing"
                  class="typing-caret"
                />
              </div>

              <div
                v-if="message.imageUrls && message.imageUrls.length > 0"
                class="generated-card"
              >
                <div class="generated-label">图片生成</div>
                <div class="generated-title">
                  {{ getGeneratedTitle(message) }}
                </div>
                <div class="generated-time">
                  创建时间：{{ message.createdAt }}
                </div>

                <div class="generated-thumbs">
                  <button
                    v-for="(url, index) in message.imageUrls"
                    :key="`${message.id}-${index}-${url}`"
                    type="button"
                    :class="isMessagePreviewSelected(message, url) ? 'generated-thumb active' : 'generated-thumb'"
                    @click="selectPreview(url, message.id)"
                  >
                    <img
                      class="generated-thumb-image"
                      :src="url"
                      :alt="`生成图 ${index + 1}`"
                    />
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>

        <div class="workspace-composer-wrap">
          <ComposerPanel
            v-model="input"
            :loading="loading"
            :can-submit="canSubmit"
            :open-menu="openComposerMenu"
            :selected-mode-id="selectedComposerModeId"
            :selected-style-id="selectedComposerStyleId"
            :selected-aspect-id="selectedAspectId"
            :selected-image-count="selectedImageCount"
            @toggle-menu="toggleComposerMenu"
            @select-mode="handleSelectComposerMode"
            @select-style="handleSelectComposerStyle"
            @select-aspect="handleSelectAspect"
            @select-image-count="handleSelectImageCount"
            @submit="handleSubmit"
          />
        </div>
      </section>

      <section
        v-if="workspaceToolMode === 'outpaint' && outpaintSourceImage"
        class="outpaint-workspace-panel"
      >
        <StudioEnlarging
          :image="outpaintSourceImage"
          @close="closeOutpaintTool"
          @generate="handleOutpaintGenerate"
        />
      </section>

      <template v-else>
        <section class="canvas-panel">
          <header class="canvas-tabs">
            <div v-if="currentPreview" class="canvas-tab">
              <span class="canvas-tab-title">{{ getCurrentFileName() }}</span>
              <span class="canvas-tab-close" />
            </div>
          </header>

          <div class="canvas-stage">
            <div v-if="currentPreview" class="selected-preview-card">
              <img
                :src="currentPreview"
                :alt="`当前预览图片 ${getCurrentPreviewIndex()}`"
                class="selected-preview-image"
              />
            </div>

            <div v-else class="empty-canvas">
              <span class="empty-canvas-text">图片生成结果会显示在这里</span>
            </div>
          </div>

        <div class="canvas-floating-actions">
          <button class="canvas-favorite-button" type="button">♡</button>
          <button class="canvas-regenerate-button" type="button">↻</button>
          <a
            :href="currentPreview ?? '#'"
            target="_blank"
            rel="noreferrer"
            :class="currentPreview ? 'canvas-download-link' : 'canvas-download-link disabled-link'"
          >
            下载
          </a>
        </div>
      </section>

        <aside class="detail-panel">
          <div class="detail-cover">
            <template v-if="currentPreviewSet.length > 0">
              <button
                v-for="(url, index) in currentPreviewSet"
                :key="`${currentPreviewMessageId ?? 'latest'}-${index}-${url}`"
                type="button"
                :class="
                  isDetailPreviewSelected(url)
                    ? 'detail-preview-switch-button active'
                    : 'detail-preview-switch-button'
                "
                :aria-label="`预览第 ${index + 1} 张图片`"
                :aria-pressed="isDetailPreviewSelected(url)"
                @click="selectPreview(url, currentPreviewMessageId ?? undefined)"
              >
                <img
                  :src="url"
                  :alt="`生成图片 ${index + 1}`"
                  class="detail-preview-switch-image"
                />
              </button>
            </template>
            <div v-else class="detail-empty">暂无图片</div>
          </div>

          <section class="detail-section">
            <h3 class="detail-section-title">{{ workspaceTitle }}</h3>
            <p class="detail-section-copy">{{ getResultSummary() }}</p>
          </section>

          <section class="detail-section">
            <h3 class="detail-section-title">生成信息</h3>

            <div class="detail-row">
              <span class="detail-row-label">模型</span>
              <strong class="detail-row-value">
                {{ getComposerStyleLabel(currentPreviewGenerationInfo.styleModel) }}
              </strong>
            </div>
            <div class="detail-row">
              <span class="detail-row-label">比例</span>
              <strong class="detail-row-value">
                {{ currentPreviewGenerationInfo.aspectRatio ?? "-" }}
              </strong>
            </div>
            <div class="detail-row">
              <span class="detail-row-label">分辨率</span>
              <strong class="detail-row-value">
                {{
                  currentPreviewGenerationInfo.width && currentPreviewGenerationInfo.height
                    ? `${currentPreviewGenerationInfo.width} x ${currentPreviewGenerationInfo.height}`
                    : "-"
                }}
              </strong>
            </div>
            <div class="detail-row">
              <span class="detail-row-label">数量</span>
              <strong class="detail-row-value">
                {{ currentPreviewGenerationInfo.numImage ?? currentPreviewSet.length }}
              </strong>
            </div>
            <div class="detail-row">
              <span class="detail-row-label">当前</span>
              <strong class="detail-row-value">{{ getCurrentPreviewIndex() }}</strong>
            </div>
          </section>

          <section class="detail-section">
            <h3 class="detail-section-title">提示词</h3>
            <p class="detail-prompt-text">{{ currentPreviewPrompt || "暂无提示词" }}</p>

            <button
              class="regenerate-primary"
              type="button"
              :disabled="loading || !currentPreviewPrompt"
              @click="
                () => {
                  if (currentPreviewPrompt) input = currentPreviewPrompt
                }
              "
            >
              再次生成
            </button>

            <div class="detail-action-grid">
              <button
                class="detail-upscale-button"
                type="button"
                :disabled="loading || !currentPreview"
                @click="handleToolAction('super_resolution')"
              >
                变清晰
              </button>
              <button
                class="detail-cutout-button"
                type="button"
                :disabled="loading || !currentPreview"
                @click="handleToolAction('cutout')"
              >
                抠图
              </button>
              <button class="detail-inpaint-button" type="button">局部重绘</button>
              <button
                class="detail-outpaint-button"
                type="button"
                :disabled="loading || !currentPreview"
                @click="openOutpaintTool"
              >
                扩图
              </button>
            </div>
          </section>

          <section class="detail-section">
            <h3 class="detail-section-title">风格标签</h3>
            <div class="tag-list">
              <span
                v-for="tag in detailStyleTags"
                :key="tag"
                class="style-tag"
              >
                {{ tag }}
              </span>
            </div>
          </section>
        </aside>
      </template>
    </main>
  </div>
</template>
