import { Router } from "express"
import { generateImageService } from "../tools/generate-image-service.js"

export const generateImageRouter = Router()

generateImageRouter.post("/", async (req, res, next) => {
  try {
    const result = await generateImageService(req.body)
    res.json(result)
  } catch (error) {
    next(error)
  }
})
