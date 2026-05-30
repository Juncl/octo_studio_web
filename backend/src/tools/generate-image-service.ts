import type {
  GenerationMode,
  GenerateImageToolArgs,
  GenerateImageToolResult,
  ImageToolAction
} from "../agent/types.js"

type TargetSize = {
  width: number
  height: number
}

type CreateTaskPayload = {
  user: {
    idx: string
  }
  task_type: string
  args: Record<string, unknown>
}

type RunImageTaskOptions = {
  createPayload: CreateTaskPayload
  toolAction: ImageToolAction
  generationMode?: GenerationMode
  taskType: string
  pollIntervalMs?: number
  maxPollCount?: number
  maxCreateRetries?: number
  createTimeoutMs?: number
}

type CreateTaskResponse = {
  resp_code?: number
  resp_msg?: string
  task_id?: string | number
  taskId?: string | number
  id?: string | number
  data?: {
    task_id?: string | number
    taskId?: string | number
    id?: string | number
    [key: string]: unknown
  }
  result?:
    | {
        task_id?: string | number
        taskId?: string | number
        id?: string | number
        [key: string]: unknown
      }
    | string
    | number
  [key: string]: unknown
}

type QueryTaskResponse = {
  resp_code?: number
  resp_msg?: string
  code?: number
  msg?: string
  message?: string
  status?: string | number
  task_status?: string | number
  state?: string | number
  progress?: number
  data?: any
  result?: {
    task_id?: string
    task_type?: string
    status?: number
    order?: number
    progress?: number
    results?: string[]
    results_clean_bg?: string[]
    results_v2?: Array<{
      timestamp?: {
        start?: number
        end?: number
        duration?: number
        pool_name?: string
      }
      status?: number
      progress?: number
      output?: {
        image?: string
        clean_bg?: string
      }
      execution_id?: string
    }>
    estimated_completion_time?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetriableHttpStatus(status: number): boolean {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(status)
}

function isRetriableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)

  return [
    "fetch failed",
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_BODY_TIMEOUT",
    "socket hang up",
    "The operation was aborted",
    "AbortError"
  ].some((keyword) => message.includes(keyword))
}

function getBackoffMs(attempt: number): number {
  const base = 1000
  const max = 8000
  const jitter = Math.floor(Math.random() * 500)

  return Math.min(base * Math.pow(2, attempt - 1), max) + jitter
}

function getTaskId(response: CreateTaskResponse): string {
  let taskId: unknown =
    response.task_id ?? response.taskId ?? response.id ?? response.data?.task_id

  if (!taskId && response.data?.taskId) {
    taskId = response.data.taskId
  }

  if (!taskId && response.data?.id) {
    taskId = response.data.id
  }

  if (!taskId && typeof response.result === "object" && response.result) {
    taskId =
      response.result.task_id ?? response.result.taskId ?? response.result.id
  }

  if (!taskId && typeof response.result === "string") {
    taskId = response.result
  }

  if (!taskId && typeof response.result === "number") {
    taskId = response.result
  }

  if (taskId === undefined || taskId === null || taskId === "") {
    throw new Error(
      `create_task succeeded but no task_id was found in response:\n${JSON.stringify(
        response,
        null,
        2
      )}`
    )
  }

  return String(taskId)
}

function getTaskStatus(response: QueryTaskResponse): number | string {
  return (
    response.result?.status ??
    response.data?.status ??
    response.status ??
    response.task_status ??
    response.state ??
    ""
  )
}

function getTaskProgress(response: QueryTaskResponse): number {
  const progress =
    response.result?.progress ?? response.data?.progress ?? response.progress ?? 0

  return Number(progress)
}

function isSuccessResponse(response: QueryTaskResponse): boolean {
  const respCode = response.resp_code
  const status = Number(getTaskStatus(response))
  const progress = getTaskProgress(response)

  return respCode === 200 && status === 2 && progress >= 100
}

function isFailureResponse(response: QueryTaskResponse): boolean {
  const status = Number(getTaskStatus(response))

  if (response.resp_code !== undefined && response.resp_code !== 200) {
    return true
  }

  return [3, 4, -1].includes(status)
}

function extractImages(response: QueryTaskResponse): string[] {
  const directResults = response.result?.results

  if (Array.isArray(directResults)) {
    return directResults.filter(
      (item): item is string => typeof item === "string" && item.length > 0
    )
  }

  const cleanBgResults = response.result?.results_clean_bg

  if (Array.isArray(cleanBgResults)) {
    return cleanBgResults.filter(
      (item): item is string => typeof item === "string" && item.length > 0
    )
  }

  const resultsV2 = response.result?.results_v2

  if (Array.isArray(resultsV2)) {
    return resultsV2
      .map((item) => item?.output?.clean_bg ?? item?.output?.image)
      .filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
  }

  return []
}

async function createTaskWithRetry(
  createTaskUrl: string,
  createPayload: unknown,
  maxCreateRetries: number,
  createTimeoutMs: number
): Promise<CreateTaskResponse> {
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxCreateRetries; attempt++) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), createTimeoutMs)

      const response = await fetch(createTaskUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(createPayload),
        signal: controller.signal
      }).finally(() => {
        clearTimeout(timeout)
      })

      const text = await response.text()

      if (!response.ok) {
        const errorMessage = [
          "create_task failed.",
          `attempt=${attempt}/${maxCreateRetries}`,
          `status=${response.status}`,
          `statusText=${response.statusText}`,
          `body=${text}`
        ].join("\n")

        if (
          isRetriableHttpStatus(response.status) &&
          attempt < maxCreateRetries
        ) {
          await sleep(getBackoffMs(attempt))
          continue
        }

        throw new Error(errorMessage)
      }

      let json: CreateTaskResponse

      try {
        json = JSON.parse(text)
      } catch {
        throw new Error(`create_task returned non-JSON response:\n${text}`)
      }

      if (json.resp_code !== undefined && json.resp_code !== 200) {
        const errorMessage = [
          "create_task returned business failure.",
          `attempt=${attempt}/${maxCreateRetries}`,
          `resp_code=${json.resp_code}`,
          `resp_msg=${json.resp_msg ?? ""}`,
          `body=${JSON.stringify(json, null, 2)}`
        ].join("\n")

        if (attempt < maxCreateRetries) {
          await sleep(getBackoffMs(attempt))
          continue
        }

        throw new Error(errorMessage)
      }

      return json
    } catch (error) {
      lastError = error

      if (attempt < maxCreateRetries && isRetriableError(error)) {
        await sleep(getBackoffMs(attempt))
        continue
      }

      throw error
    }
  }

  throw new Error(`create_task failed after retries: ${String(lastError)}`)
}

async function queryTask(
  queryTaskBaseUrl: string,
  taskId: string
): Promise<QueryTaskResponse> {
  const queryUrl = `${queryTaskBaseUrl}?task_id=${encodeURIComponent(taskId)}`

  const response = await fetch(queryUrl, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*"
    }
  })

  const text = await response.text()

  if (!response.ok) {
    throw new Error(
      [
        "query_task failed.",
        `status=${response.status}`,
        `statusText=${response.statusText}`,
        `body=${text}`
      ].join("\n")
    )
  }

  try {
    return JSON.parse(text) as QueryTaskResponse
  } catch {
    throw new Error(`query_task returned non-JSON response:\n${text}`)
  }
}

export async function generateImageService(
  args: GenerateImageToolArgs
): Promise<GenerateImageToolResult> {
  const createTaskUrl = process.env.IMAGE_CREATE_TASK_URL ?? "https://xx/create_task"
  const queryTaskBaseUrl =
    process.env.IMAGE_QUERY_TASK_BASE_URL ??
    "https://octoai-api.ucd.huawei.com/octoai-web-api/prod/aiImageGeneration/query_task"
  const userIdx = args.userIdx ?? process.env.IMAGE_USER_IDX ?? "l00423136"
  const generationMode: GenerationMode = args.generationMode ?? "txt2img"
  const refImgList = args.refImgList ?? []

  if (generationMode === "txt2img" && refImgList.length > 0) {
    throw new Error(
      [
        "Invalid image generation arguments.",
        "generationMode is txt2img, but refImgList is not empty.",
        "Use generationMode='img2img' with a backend-supported img2img taskType,",
        "or remove refImgList and regenerate with a complete txt2img prompt.",
        `refImgList=${JSON.stringify(refImgList)}`
      ].join("\n")
    )
  }

  const defaultTxt2ImgTaskType =
    process.env.IMAGE_TXT2IMG_TASK_TYPE ?? "txt2img_qwen"
  const defaultImg2ImgTaskType =
    process.env.IMAGE_IMG2IMG_TASK_TYPE ?? "img2img_qwen"
  const taskType =
    args.taskType ??
    (generationMode === "img2img"
      ? defaultImg2ImgTaskType
      : defaultTxt2ImgTaskType)

  const targetSize: TargetSize = {
    width: args.width ?? 1024,
    height: args.height ?? 1024
  }

  const finalPrompt = args.prompt
  const customerPrompt = args.customerPrompt ?? args.prompt

  const createPayload: CreateTaskPayload = {
    user: {
      idx: userIdx
    },
    task_type: taskType,
    args: {
      tag_name: args.tagName ?? "Qwen-Image",
      num_image: args.numImage ?? 2,
      target: args.target ?? "flux1-dev",
      target_size: targetSize,
      loras: args.loras ?? [],
      mode: args.mode ?? "performance",
      ref_img_list: refImgList,
      customer_prompt: customerPrompt,
      prompt: finalPrompt
    }
  }

  return runImageTask({
    createPayload,
    toolAction: "generate_image",
    generationMode,
    taskType,
    pollIntervalMs: args.pollIntervalMs,
    maxPollCount: args.maxPollCount,
    maxCreateRetries: args.maxCreateRetries,
    createTimeoutMs: args.createTimeoutMs
  })
}

export async function superResolutionService(args: {
  imageBase64: string
  userIdx?: string
  pollIntervalMs?: number
  maxPollCount?: number
  maxCreateRetries?: number
  createTimeoutMs?: number
}): Promise<GenerateImageToolResult> {
  if (!args.imageBase64.startsWith("data:image/")) {
    throw new Error("super_resolution requires imageBase64 as a data URL.")
  }

  const userIdx = args.userIdx ?? process.env.IMAGE_USER_IDX ?? "l00423136"
  const createPayload: CreateTaskPayload = {
    user: {
      idx: userIdx
    },
    task_type: "magnify",
    args: {
      mode: "super_resolution",
      image_base64: args.imageBase64
    }
  }

  return runImageTask({
    createPayload,
    toolAction: "super_resolution",
    taskType: "magnify",
    pollIntervalMs: args.pollIntervalMs,
    maxPollCount: args.maxPollCount,
    maxCreateRetries: args.maxCreateRetries,
    createTimeoutMs: args.createTimeoutMs
  })
}

export async function cutoutImageService(args: {
  imageBase64: string
  userIdx?: string
  pollIntervalMs?: number
  maxPollCount?: number
  maxCreateRetries?: number
  createTimeoutMs?: number
}): Promise<GenerateImageToolResult> {
  if (!args.imageBase64.startsWith("data:image/")) {
    throw new Error("cutout requires imageBase64 as a data URL.")
  }

  const userIdx = args.userIdx ?? process.env.IMAGE_USER_IDX ?? "l00423136"
  const createPayload: CreateTaskPayload = {
    user: {
      idx: userIdx
    },
    task_type: "remove_bg",
    args: {
      num_image: 1,
      image_list: [
        {
          mode: "new",
          image_base64: args.imageBase64
        }
      ]
    }
  }

  return runImageTask({
    createPayload,
    toolAction: "cutout",
    taskType: "remove_bg",
    pollIntervalMs: args.pollIntervalMs,
    maxPollCount: args.maxPollCount,
    maxCreateRetries: args.maxCreateRetries,
    createTimeoutMs: args.createTimeoutMs
  })
}

export async function outpaintingImageService(args: {
  prompt: string
  imageBase64: string
  left: number
  right: number
  top: number
  bottom: number
  numImage?: number
  userIdx?: string
  pollIntervalMs?: number
  maxPollCount?: number
  maxCreateRetries?: number
  createTimeoutMs?: number
}): Promise<GenerateImageToolResult> {
  if (!args.imageBase64.startsWith("data:image/")) {
    throw new Error("outpainting requires imageBase64 as a data URL.")
  }

  const distances = [args.left, args.right, args.top, args.bottom]

  if (
    distances.some((value) => {
      return !Number.isFinite(value) || value < 0
    })
  ) {
    throw new Error("outpainting distances must be non-negative numbers.")
  }

  if (distances.every((value) => value === 0)) {
    throw new Error("outpainting requires at least one expanded direction.")
  }

  const userIdx = args.userIdx ?? process.env.IMAGE_USER_IDX ?? "l00423136"
  const createPayload: CreateTaskPayload = {
    user: {
      idx: userIdx
    },
    task_type: "outpainting",
    args: {
      prompt: args.prompt,
      image_base64: args.imageBase64,
      left: args.left,
      right: args.right,
      top: args.top,
      bottom: args.bottom,
      num_image: args.numImage ?? 1
    }
  }

  return runImageTask({
    createPayload,
    toolAction: "outpainting",
    taskType: "outpainting",
    pollIntervalMs: args.pollIntervalMs,
    maxPollCount: args.maxPollCount,
    maxCreateRetries: args.maxCreateRetries,
    createTimeoutMs: args.createTimeoutMs
  })
}

async function runImageTask(
  options: RunImageTaskOptions
): Promise<GenerateImageToolResult> {
  const createTaskUrl = process.env.IMAGE_CREATE_TASK_URL ?? "https://xx/create_task"
  const queryTaskBaseUrl =
    process.env.IMAGE_QUERY_TASK_BASE_URL ??
    "https://octoai-api.ucd.huawei.com/octoai-web-api/prod/aiImageGeneration/query_task"

  const createJson = await createTaskWithRetry(
    createTaskUrl,
    options.createPayload,
    options.maxCreateRetries ?? 3,
    options.createTimeoutMs ?? 30000
  )

  const taskId = getTaskId(createJson)
  const pollIntervalMs = options.pollIntervalMs ?? 2000
  const maxPollCount = options.maxPollCount ?? 60
  let lastQueryJson: QueryTaskResponse | null = null

  for (let i = 1; i <= maxPollCount; i++) {
    const queryJson = await queryTask(queryTaskBaseUrl, taskId)
    lastQueryJson = queryJson
    const status = getTaskStatus(queryJson)
    const progress = getTaskProgress(queryJson)

    if (isSuccessResponse(queryJson)) {
      const images = extractImages(queryJson)

      return {
        ok: true,
        taskId,
        toolAction: options.toolAction,
        generationMode: options.generationMode,
        taskType: options.taskType,
        status,
        progress,
        images,
        imageCount: images.length,
        primaryImage: images[0] ?? null,
        nextTurnHint:
          images.length > 0
            ? "For future edits, pass primaryImage or selected images as refImgList with generationMode='img2img'."
            : "No image URL extracted from result.",
        result: queryJson
      }
    }

    if (isFailureResponse(queryJson)) {
      throw new Error(
        [
          "Image generation task failed.",
          `taskId=${taskId}`,
          `toolAction=${options.toolAction}`,
          `generationMode=${options.generationMode ?? ""}`,
          `taskType=${options.taskType}`,
          `status=${status}`,
          `progress=${progress}`,
          `response=${JSON.stringify(queryJson, null, 2)}`
        ].join("\n")
      )
    }

    await sleep(pollIntervalMs)
  }

  return {
    ok: false,
    taskId,
    toolAction: options.toolAction,
    generationMode: options.generationMode,
    taskType: options.taskType,
    status: "poll_timeout",
    message: `Task was created but did not finish after ${maxPollCount} polls.`,
    lastResult: lastQueryJson
  }
}
