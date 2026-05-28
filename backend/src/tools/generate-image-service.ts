import type {
  GenerationMode,
  GenerateImageToolArgs,
  GenerateImageToolResult
} from "../agent/types.js"

type TargetSize = {
  width: number
  height: number
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

  const resultsV2 = response.result?.results_v2

  if (Array.isArray(resultsV2)) {
    return resultsV2
      .map((item) => item?.output?.image)
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

  const createPayload = {
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

  const createJson = await createTaskWithRetry(
    createTaskUrl,
    createPayload,
    args.maxCreateRetries ?? 3,
    args.createTimeoutMs ?? 30000
  )

  const taskId = getTaskId(createJson)
  const pollIntervalMs = args.pollIntervalMs ?? 2000
  const maxPollCount = args.maxPollCount ?? 60
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
        generationMode,
        taskType,
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
          `generationMode=${generationMode}`,
          `taskType=${taskType}`,
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
    generationMode,
    taskType,
    status: "poll_timeout",
    message: `Task was created but did not finish after ${maxPollCount} polls.`,
    lastResult: lastQueryJson
  }
}
