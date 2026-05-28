import type { ImageSessionState } from "./types.js"

export interface SessionStore {
  get(sessionId: string): Promise<ImageSessionState | undefined>
  set(sessionId: string, state: ImageSessionState): Promise<void>
}

export class MemorySessionStore implements SessionStore {
  private sessions = new Map<string, ImageSessionState>()

  async get(sessionId: string): Promise<ImageSessionState | undefined> {
    return this.sessions.get(sessionId)
  }

  async set(sessionId: string, state: ImageSessionState): Promise<void> {
    this.sessions.set(sessionId, state)
  }
}

export function createDefaultImageSession(sessionId: string): ImageSessionState {
  return {
    sessionId,
    width: 1024,
    height: 1024,
    numImage: 2,
    lastImages: [],
    history: []
  }
}
