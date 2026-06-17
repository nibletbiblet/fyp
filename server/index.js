import { app } from './app.js'
import { env } from './config/env.js'

const server = app.listen(env.port, () => {
  console.log(`Backend server listening on port ${env.port}`)
})

const shutdown = (signal) => {
  console.log(`${signal} received, shutting down backend server`)
  server.close(() => {
    process.exit(0)
  })
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
