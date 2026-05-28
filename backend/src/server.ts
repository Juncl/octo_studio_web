import "dotenv/config"
import express from "express"
import cors from "cors"
import { agentImageRouter } from "./routes/agent-image.js"
import { generateImageRouter } from "./routes/generate-image.js"

const app = express()
const port = Number(process.env.PORT ?? 3001)
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173"

app.use(
  cors({
    origin: frontendOrigin,
    credentials: true
  })
)
app.use(express.json({ limit: "2mb" }))

app.get("/api/health", (_req, res) => {
  res.json({ ok: true })
})

app.use("/api/agent/image", agentImageRouter)
app.use("/api/tools/generate-image", generateImageRouter)

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : String(err)
  res.status(500).json({ ok: false, error: message })
})

app.listen(port, () => {
  console.log(`Image Agent backend listening on http://localhost:${port}`)
})
