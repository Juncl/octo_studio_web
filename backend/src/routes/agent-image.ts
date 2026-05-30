import { Router } from "express"
import { imageAgent } from "../agent/index.js"

export const agentImageRouter = Router()

agentImageRouter.post("/", async (req, res, next) => {
  try {
    const {
      sessionId,
      message,
      clientState,
      composerMode,
      requestedToolAction,
      imageBase64,
      outpaintParams
    } = req.body ?? {}

    if (!sessionId || typeof sessionId !== "string") {
      res.status(400).json({ ok: false, error: "Missing sessionId" })
      return
    }

    if (!message || typeof message !== "string") {
      res.status(400).json({ ok: false, error: "Missing message" })
      return
    }

    await imageAgent.hydrateSession({ sessionId, clientState })

    const result = await imageAgent.handleUserMessage({
      sessionId,
      message,
      composerMode,
      requestedToolAction,
      imageBase64,
      outpaintParams
    })

    res.json({ ok: true, ...result })
  } catch (error) {
    next(error)
  }
})
