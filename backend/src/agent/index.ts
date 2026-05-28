import { ImageGenerationAgent } from "./image-generation-agent.js"
import { OpenAICompatibleLLMAdapter } from "./llm-adapter.js"
import { MemorySessionStore } from "./session-store.js"

const env = (key: string, fallback = "") => process.env[key] ?? fallback

const llmApiUrl = env("LLM_API_URL")

if (!llmApiUrl) {
  throw new Error("Missing LLM_API_URL")
}

export const imageAgent = new ImageGenerationAgent({
  llm: new OpenAICompatibleLLMAdapter({
    apiUrl: llmApiUrl,
    apiKey: env("LLM_API_KEY"),
    model: env("LLM_MODEL", "default"),
    temperature: 0.2
  }),

  store: new MemorySessionStore(),

  options: {
    supportsImg2Img: env("IMAGE_SUPPORTS_IMG2IMG", "false") === "true",
    txt2imgTaskType: env("IMAGE_TXT2IMG_TASK_TYPE", "txt2img_qwen"),
    img2imgTaskType: env("IMAGE_IMG2IMG_TASK_TYPE"),
    userIdx: env("IMAGE_USER_IDX", "l00423136"),
    tagName: env("IMAGE_TAG_NAME", "Qwen-Image"),
    target: env("IMAGE_TARGET", "flux1-dev"),
    apiMode: env("IMAGE_API_MODE", "performance"),
    defaultWidth: Number(env("IMAGE_DEFAULT_WIDTH", "1024")),
    defaultHeight: Number(env("IMAGE_DEFAULT_HEIGHT", "1024")),
    defaultNumImage: Number(env("IMAGE_DEFAULT_NUM_IMAGE", "2"))
  }
})
