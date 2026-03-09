import pino from 'pino'

// Avoid pino-pretty transport in Turbopack — it uses worker_threads
// which can cause module resolution failures in bundled environments.
// Use pino's built-in formatting instead.
export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
})
