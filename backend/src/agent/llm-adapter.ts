export type LLMMessage = {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LLMAdapter {
  generateJson<T>(messages: LLMMessage[]): Promise<T>
}

export class OpenAICompatibleLLMAdapter implements LLMAdapter {
  constructor(
    private options: {
      apiUrl: string
      apiKey?: string
      model: string
      temperature?: number
    }
  ) {}

  async generateJson<T>(messages: LLMMessage[]): Promise<T> {
    const response = await fetch(this.options.apiUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.apiKey
          ? {
              authorization: `Bearer ${this.options.apiKey}`
            }
          : {})
      },
      body: JSON.stringify({
        model: this.options.model,
        temperature: this.options.temperature ?? 0.2,
        messages,
        response_format: {
          type: "json_object"
        }
      })
    })

    const text = await response.text()

    if (!response.ok) {
      throw new Error(
        `LLM request failed: ${response.status} ${response.statusText}\n${text}`
      )
    }

    let json: any

    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`LLM returned non-JSON HTTP body:\n${text}`)
    }

    const content = json?.choices?.[0]?.message?.content

    if (!content || typeof content !== "string") {
      throw new Error(`LLM response missing message content:\n${text}`)
    }

    try {
      return JSON.parse(content) as T
    } catch {
      throw new Error(`LLM message content is not valid JSON:\n${content}`)
    }
  }
}
