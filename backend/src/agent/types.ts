export type GenerationMode = "txt2img" | "img2img"

export type ImageToolAction =
  | "generate_image"
  | "super_resolution"
  | "cutout"
  | "outpainting"
  | "chat"
  | "prompt_only"

export type ImageSessionState = {
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
  history: Array<{
    role: "user" | "assistant" | "tool"
    content: string
    createdAt: number
  }>
}

export type AgentIntent =
  | "new_image"
  | "edit_previous_image"
  | "refine_prompt_only"
  | "chat"

export type AgentPlan = {
  toolAction: ImageToolAction
  intent: AgentIntent
  generationMode: GenerationMode
  shouldCallTool: boolean
  customerPrompt: string
  finalPrompt: string
  subject?: string
  style?: string
  scene?: string
  composition?: string
  lighting?: string
  colorPalette?: string
  usePreviousImage: boolean
  requiresImage?: boolean
  reason: string
}

export type GenerateImageToolArgs = {
  prompt: string
  customerPrompt?: string
  generationMode?: GenerationMode
  userIdx?: string
  taskType?: string
  tagName?: string
  numImage?: number
  target?: string
  width?: number
  height?: number
  mode?: string
  loras?: unknown[]
  refImgList?: string[]
  pollIntervalMs?: number
  maxPollCount?: number
  maxCreateRetries?: number
  createTimeoutMs?: number
}

export type OutpaintToolArgs = {
  prompt: string
  imageBase64: string
  left: number
  right: number
  top: number
  bottom: number
  realWidth?: number
  realHeight?: number
  numImage?: number
}

export type GenerateImageToolResult = {
  ok: boolean
  taskId?: string
  toolAction?: ImageToolAction
  generationMode?: GenerationMode
  taskType?: string
  status?: string | number
  progress?: number
  images?: string[]
  imageCount?: number
  primaryImage?: string | null
  nextTurnHint?: string
  result?: unknown
  message?: string
  lastResult?: unknown
}
