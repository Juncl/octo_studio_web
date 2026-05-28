<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from "vue"

type ChatMessage = {
  id: string
  role: "user" | "assistant"
  content: string
  imageUrls?: string[]
  fileName?: string
  createdAt: string
  typing?: boolean
  pending?: boolean
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
  images?: string[]
  primaryImage?: string | null
  taskId?: string
  error?: string
  state?: Partial<ClientAgentState>
}

type ComposerMenu = "mode" | "style" | "settings"

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
    label: "HDesign",
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
    width: 768,
    height: 1152
  },
  {
    id: "3:4",
    label: "3:4",
    width: 864,
    height: 1152
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
    width: 1152,
    height: 768
  },
  {
    id: "4:3",
    label: "4:3",
    width: 1152,
    height: 864
  },
  {
    id: "16:9",
    label: "16:9",
    width: 1280,
    height: 720
  }
]

const composerImageCountOptions = [1, 2, 3, 4]

const conversations = ref<StoredConversation[]>([])
const activeId = ref("")
const input = ref("")
const loading = ref(false)
const typingMessageId = ref<string | null>(null)
const selectedPreview = ref<string | null>(null)
const scrollRef = ref<HTMLDivElement | null>(null)
const openComposerMenu = ref<ComposerMenu | null>(null)
const selectedComposerModeId = ref("image")
const selectedComposerStyleId = ref("qianwen")

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

  if (!state) return composerAspectOptions[0].id

  return (
    composerAspectOptions.find((option) => {
      return option.width === state.width && option.height === state.height
    })?.id ?? composerAspectOptions[0].id
  )
})
const selectedImageCount = computed(() => activeAgentState.value?.numImage ?? 2)
const detailStyleTags = computed(() => {
  const tags = [
    selectedComposerMode.value.label,
    selectedComposerStyle.value.label,
    selectedAspectId.value,
    `${selectedImageCount.value}张`
  ]

  if (images.value.length > 0) {
    tags.push(`${images.value.length}张结果`)
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
  const realConversations = [...conversations.value]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 5)

  const hasVisibleConversation =
    realConversations.length > 1 ||
    realConversations.some((item) => {
      return (
        item.images.length > 0 ||
        item.messages.some((message) => message.role === "user")
      )
    })

  if (hasVisibleConversation) return realConversations

  return [
    createDisplayConversation("户外骑行图片"),
    createDisplayConversation("生成一张胶片质感人像"),
    createDisplayConversation("模拟无人机穿越雪山森林的长镜头"),
    createDisplayConversation("静态风景图转化为 4K 竖向图片"),
    createDisplayConversation("将背景单车替换为复古款")
  ]
})

function createDisplayConversation(title: string): StoredConversation {
  return {
    id: `display_${title}`,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    messages: [],
    images: [],
    primaryImage: null,
    lastPrompt: ""
  }
}

function nowText() {
  return new Date().toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit"
  })
}

function createId(prefix = "id") {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function createEmptyAgentState(sessionId: string): ClientAgentState {
  return {
    sessionId,
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
}

function handleSelectConversation(id: string) {
  if (loading.value) return

  const target = conversations.value.find((item) => item.id === id)

  if (!target) return

  activeId.value = id
  input.value = ""
  typingMessageId.value = null
  selectedPreview.value = target.primaryImage ?? target.images[0] ?? null
}

function handleDeleteConversation(id: string) {
  if (loading.value) return

  const next = conversations.value.filter((item) => item.id !== id)

  if (id === activeId.value) {
    if (next[0]) {
      activeId.value = next[0].id
      selectedPreview.value = next[0].primaryImage ?? next[0].images[0] ?? null
    } else {
      const created = createEmptyConversation()
      activeId.value = created.id
      selectedPreview.value = null
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
  selectedComposerStyleId.value = option.id
  openComposerMenu.value = null
}

function handleSelectAspect(option: ComposerAspectOption) {
  updateActiveConversation((conversation) => {
    return {
      ...conversation,
      updatedAt: Date.now(),
      agentState: {
        ...toClientAgentState(conversation),
        width: option.width,
        height: option.height
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
  const text = input.value.trim()

  if (!text || loading.value || !activeConversation.value) return

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
      clientState: requestClientState
    })

    const nextImages = result.images ?? []
    const assistantText = result.text ?? "已完成图片生成。"
    const generatedFileName = getFeatureFileName(text, result.state)

    const assistantMessage: ChatMessage = {
      id: createId("msg"),
      role: "assistant",
      content: "",
      imageUrls: result.type === "image_result" ? nextImages : undefined,
      fileName:
        result.type === "image_result" && nextImages.length > 0
          ? generatedFileName
          : undefined,
      createdAt: nowText(),
      typing: true
    }

    if (result.type === "image_result" && nextImages.length > 0) {
      selectedPreview.value = result.primaryImage ?? nextImages[0] ?? null
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

function handleKeyDown(event: KeyboardEvent) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault()
    handleSubmit()
  }
}

function getPreviewGridClass() {
  if (images.value.length === 1) return "preview-grid single"
  if (images.value.length === 2) return "preview-grid two"
  if (images.value.length === 3) return "preview-grid three"

  return "preview-grid multi"
}

function getCurrentPreviewIndex() {
  if (!currentPreview.value) return "-"

  const index = images.value.findIndex((item) => item === currentPreview.value)

  if (index < 0) return "-"

  return `${index + 1}/${images.value.length}`
}

function getCurrentFileName() {
  if (!currentPreview.value) return ""

  const sourceMessage = messages.value.find((message) => {
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

  const index = images.value.findIndex((item) => item === currentPreview.value)
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

onMounted(() => {
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

    return
  }

  const initial = createEmptyConversation()
  conversations.value = [initial]
  activeId.value = initial.id
  selectedPreview.value = null
  saveConversations([initial])
  saveActiveConversationId(initial.id)
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
  () => [images.value, primaryImage.value, selectedPreview.value],
  () => {
    if (images.value.length === 0) {
      selectedPreview.value = null
      return
    }

    if (!selectedPreview.value || !images.value.includes(selectedPreview.value)) {
      selectedPreview.value = primaryImage.value ?? images.value[0] ?? null
    }
  },
  {
    deep: true
  }
)
</script>

<template>
  <div class="octo-shell">
    <aside class="octo-sidebar">
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
              class="studio-tree-add-session-button"
              type="button"
              aria-label="添加会话"
              title="添加会话"
              @click="handleNewChat"
            >
              ＋
            </button>
            <button
              class="studio-tree-toggle-button"
              type="button"
              aria-label="展开会话列表"
              title="展开会话列表"
            >
              ⌄
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

        <div class="welcome-composer">
          <div
            v-if="openComposerMenu === 'mode'"
            class="workspace-composer-menu workspace-mode-menu"
          >
            <button
              v-for="option in composerModeOptions"
              :key="option.id"
              type="button"
              :class="
                option.id === selectedComposerModeId
                  ? 'workspace-menu-option workspace-mode-option active'
                  : 'workspace-menu-option workspace-mode-option'
              "
              @click="handleSelectComposerMode(option)"
            >
              <span
                v-if="option.dividerBefore"
                class="workspace-menu-divider"
              />
              <span class="workspace-menu-option-content">
                <span class="workspace-menu-option-icon workspace-mode-option-icon">
                  {{ option.icon }}
                </span>
                <span class="workspace-menu-option-label">{{ option.label }}</span>
                <span
                  v-if="option.id === selectedComposerModeId"
                  class="workspace-menu-option-check"
                >
                  ✓
                </span>
              </span>
            </button>
          </div>

          <div
            v-if="openComposerMenu === 'style'"
            class="workspace-composer-menu workspace-style-menu"
          >
            <header class="workspace-style-menu-header">
              <h3 class="workspace-style-menu-title">风格模型</h3>
            </header>

            <div class="workspace-style-menu-grid">
              <button
                v-for="option in composerStyleOptions"
                :key="option.id"
                type="button"
                :class="
                  option.id === selectedComposerStyleId
                    ? 'workspace-style-option active'
                    : 'workspace-style-option'
                "
                @click="handleSelectComposerStyle(option)"
              >
                <span
                  :class="`workspace-style-option-icon workspace-style-option-icon-${option.id}`"
                >
                  {{ option.icon }}
                </span>
                <span class="workspace-style-option-label">{{ option.label }}</span>
                <span
                  v-if="option.id === selectedComposerStyleId"
                  class="workspace-style-option-check"
                >
                  ✓
                </span>
              </button>
            </div>
          </div>

          <div
            v-if="openComposerMenu === 'settings'"
            class="workspace-composer-menu workspace-settings-menu"
          >
            <header class="workspace-settings-menu-header">
              <h3 class="workspace-settings-menu-title">图片设置</h3>
            </header>

            <section class="workspace-settings-section">
              <h4 class="workspace-settings-section-title">选择比例</h4>

              <div class="workspace-aspect-options">
                <button
                  v-for="option in composerAspectOptions"
                  :key="option.id"
                  type="button"
                  :class="
                    option.id === selectedAspectId
                      ? 'workspace-aspect-option active'
                      : 'workspace-aspect-option'
                  "
                  @click="handleSelectAspect(option)"
                >
                  <span
                    class="workspace-aspect-preview"
                    :style="{ aspectRatio: `${option.width} / ${option.height}` }"
                  />
                  <span class="workspace-aspect-label">{{ option.label }}</span>
                </button>
              </div>
            </section>

            <section class="workspace-settings-section workspace-count-section">
              <h4 class="workspace-settings-section-title">图片数量</h4>

              <div class="workspace-count-options">
                <button
                  v-for="count in composerImageCountOptions"
                  :key="count"
                  type="button"
                  :class="
                    count === selectedImageCount
                      ? 'workspace-count-option active'
                      : 'workspace-count-option'
                  "
                  @click="handleSelectImageCount(count)"
                >
                  {{ count }}张
                </button>
              </div>
            </section>
          </div>

          <div class="welcome-composer-body">
            <button class="reference-card welcome-reference-button" type="button">
              ＋
            </button>

            <textarea
              v-model="input"
              class="welcome-input"
              :disabled="loading"
              placeholder="上传参考图、输入文字，描述你想生成的图片。"
              @keydown="handleKeyDown"
            />

            <button
              class="welcome-send"
              type="button"
              :disabled="loading || !input.trim()"
              @click="handleSubmit"
            >
              <span v-if="loading" class="send-spinner" />
              <span v-else class="welcome-send-icon">➤</span>
            </button>
          </div>

          <div class="welcome-toolbar">
            <button
              class="welcome-toolbar-mode-button"
              type="button"
              :aria-expanded="openComposerMenu === 'mode'"
              @click="toggleComposerMenu('mode')"
            >
              {{ selectedComposerMode.label }} ⌄
            </button>
            <button
              class="welcome-toolbar-prompt-button"
              type="button"
              :aria-expanded="openComposerMenu === 'style'"
              @click="toggleComposerMenu('style')"
            >
              {{ selectedComposerStyle.label }} ⌄
            </button>
            <button
              class="welcome-toolbar-layout-button"
              type="button"
              aria-label="图片设置"
              title="图片设置"
              :aria-expanded="openComposerMenu === 'settings'"
              @click="toggleComposerMenu('settings')"
            >
              ☷
            </button>
            <button class="welcome-toolbar-grid-button" type="button">▣</button>
          </div>
        </div>
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
            v-for="message in messages.filter((item) => item.role === 'user' || item.pending || item.content)"
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
                <span class="message-content">{{ message.content }}</span>
                <span
                  v-if="message.id === typingMessageId && message.typing"
                  class="typing-caret"
                />
              </div>

              <div
                v-if="message.imageUrls && message.imageUrls.length > 0"
                class="generated-card"
              >
                <div class="generated-label">▧ 图片生成</div>
                <div class="generated-title">
                  {{ getGeneratedTitle(message) }}
                </div>
                <div class="generated-time">
                  创建时间：{{ message.createdAt }}
                </div>

                <div class="generated-thumbs">
                  <button
                    v-for="(url, index) in message.imageUrls"
                    :key="url"
                    type="button"
                    :class="currentPreview === url ? 'generated-thumb active' : 'generated-thumb'"
                    @click="selectedPreview = url"
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
          <div class="welcome-composer workspace-composer">
            <div
              v-if="openComposerMenu === 'mode'"
              class="workspace-composer-menu workspace-mode-menu"
            >
              <button
                v-for="option in composerModeOptions"
                :key="option.id"
                type="button"
                :class="
                  option.id === selectedComposerModeId
                    ? 'workspace-menu-option workspace-mode-option active'
                    : 'workspace-menu-option workspace-mode-option'
                "
                @click="handleSelectComposerMode(option)"
              >
                <span
                  v-if="option.dividerBefore"
                  class="workspace-menu-divider"
                />
                <span class="workspace-menu-option-content">
                  <span class="workspace-menu-option-icon workspace-mode-option-icon">
                    {{ option.icon }}
                  </span>
                  <span class="workspace-menu-option-label">{{ option.label }}</span>
                  <span
                    v-if="option.id === selectedComposerModeId"
                    class="workspace-menu-option-check"
                  >
                    ✓
                  </span>
                </span>
              </button>
            </div>

            <div
              v-if="openComposerMenu === 'style'"
              class="workspace-composer-menu workspace-style-menu"
            >
              <header class="workspace-style-menu-header">
                <h3 class="workspace-style-menu-title">风格模型</h3>
              </header>

              <div class="workspace-style-menu-grid">
                <button
                  v-for="option in composerStyleOptions"
                  :key="option.id"
                  type="button"
                  :class="
                    option.id === selectedComposerStyleId
                      ? 'workspace-style-option active'
                      : 'workspace-style-option'
                  "
                  @click="handleSelectComposerStyle(option)"
                >
                  <span
                    :class="`workspace-style-option-icon workspace-style-option-icon-${option.id}`"
                  >
                    {{ option.icon }}
                  </span>
                  <span class="workspace-style-option-label">{{ option.label }}</span>
                  <span
                    v-if="option.id === selectedComposerStyleId"
                    class="workspace-style-option-check"
                  >
                    ✓
                  </span>
                </button>
              </div>
            </div>

            <div
              v-if="openComposerMenu === 'settings'"
              class="workspace-composer-menu workspace-settings-menu"
            >
              <header class="workspace-settings-menu-header">
                <h3 class="workspace-settings-menu-title">图片设置</h3>
              </header>

              <section class="workspace-settings-section">
                <h4 class="workspace-settings-section-title">选择比例</h4>

                <div class="workspace-aspect-options">
                  <button
                    v-for="option in composerAspectOptions"
                    :key="option.id"
                    type="button"
                    :class="
                      option.id === selectedAspectId
                        ? 'workspace-aspect-option active'
                        : 'workspace-aspect-option'
                    "
                    @click="handleSelectAspect(option)"
                  >
                    <span
                      class="workspace-aspect-preview"
                      :style="{ aspectRatio: `${option.width} / ${option.height}` }"
                    />
                    <span class="workspace-aspect-label">{{ option.label }}</span>
                  </button>
                </div>
              </section>

              <section class="workspace-settings-section workspace-count-section">
                <h4 class="workspace-settings-section-title">图片数量</h4>

                <div class="workspace-count-options">
                  <button
                    v-for="count in composerImageCountOptions"
                    :key="count"
                    type="button"
                    :class="
                      count === selectedImageCount
                        ? 'workspace-count-option active'
                        : 'workspace-count-option'
                    "
                    @click="handleSelectImageCount(count)"
                  >
                    {{ count }}张
                  </button>
                </div>
              </section>
            </div>

            <div class="workspace-composer-input-row">
              <button class="reference-card workspace-reference-button small" type="button">＋</button>

              <textarea
                v-model="input"
                class="workspace-input"
                :disabled="loading"
                placeholder="上传参考图、输入文字，描述你想生成的图片。"
                @keydown="handleKeyDown"
              />

              <button
                class="workspace-send"
                type="button"
                :disabled="loading || !input.trim()"
                @click="handleSubmit"
              >
                <span v-if="loading" class="send-spinner" />
                <span v-else class="workspace-send-icon">➤</span>
              </button>
            </div>

            <div class="workspace-toolbar">
              <button
                class="workspace-toolbar-mode-button workspace-toolbar-menu-button"
                type="button"
                :aria-expanded="openComposerMenu === 'mode'"
                @click="toggleComposerMenu('mode')"
              >
                <span class="workspace-toolbar-button-label">
                  {{ selectedComposerMode.label }}
                </span>
                <span class="workspace-toolbar-button-caret">⌄</span>
              </button>
              <button
                class="workspace-toolbar-prompt-button workspace-toolbar-menu-button"
                type="button"
                :aria-expanded="openComposerMenu === 'style'"
                @click="toggleComposerMenu('style')"
              >
                <span class="workspace-toolbar-button-label">
                  {{ selectedComposerStyle.label }}
                </span>
                <span class="workspace-toolbar-button-caret">⌄</span>
              </button>
              <button
                class="workspace-toolbar-settings-button workspace-toolbar-icon-button"
                type="button"
                aria-label="生成参数"
                title="生成参数"
                :aria-expanded="openComposerMenu === 'settings'"
                @click="toggleComposerMenu('settings')"
              >
                <span class="workspace-toolbar-icon">⌘</span>
              </button>
              <button
                class="workspace-toolbar-preset-button workspace-toolbar-icon-button"
                type="button"
                aria-label="预设面板"
                title="预设面板"
              >
                <span class="workspace-toolbar-icon">▣</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <section class="canvas-panel">
        <header class="canvas-tabs">
          <div v-if="currentPreview" class="canvas-tab">
            <span class="canvas-tab-title">{{ getCurrentFileName() }}</span>
            <span class="canvas-tab-close">×</span>
          </div>
        </header>

        <div class="canvas-stage">
          <div v-if="images.length > 0" :class="getPreviewGridClass()">
            <button
              v-for="(url, index) in images"
              :key="url"
              type="button"
              :class="currentPreview === url ? 'preview-card active' : 'preview-card'"
              @click="selectedPreview = url"
            >
              <img
                :src="url"
                :alt="`生成图片 ${index + 1}`"
                class="preview-grid-image"
              />
            </button>
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
          <img
            v-if="currentPreview"
            class="detail-cover-image"
            :src="currentPreview"
            alt="生成图预览"
          />
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
            <strong class="detail-row-value">{{ selectedComposerStyle.label }}</strong>
          </div>
          <div class="detail-row">
            <span class="detail-row-label">比例</span>
            <strong class="detail-row-value">{{ selectedAspectId }}</strong>
          </div>
          <div class="detail-row">
            <span class="detail-row-label">分辨率</span>
            <strong class="detail-row-value">2K</strong>
          </div>
          <div class="detail-row">
            <span class="detail-row-label">数量</span>
            <strong class="detail-row-value">{{ selectedImageCount }}</strong>
          </div>
          <div class="detail-row">
            <span class="detail-row-label">当前</span>
            <strong class="detail-row-value">{{ getCurrentPreviewIndex() }}</strong>
          </div>
        </section>

        <section class="detail-section">
          <h3 class="detail-section-title">提示词</h3>
          <p class="detail-prompt-text">{{ lastPrompt || "暂无提示词" }}</p>

          <button
            class="regenerate-primary"
            type="button"
            :disabled="loading || !lastPrompt"
            @click="
              () => {
                if (lastPrompt) input = lastPrompt
              }
            "
          >
            ✨ 再次生成
          </button>

          <div class="detail-action-grid">
            <button class="detail-upscale-button" type="button">▱ 变清晰</button>
            <button class="detail-cutout-button" type="button">◎ 抠图</button>
            <button class="detail-inpaint-button" type="button">◒ 局部重绘</button>
            <button class="detail-outpaint-button" type="button">⛶ 扩图</button>
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
    </main>
  </div>
</template>
