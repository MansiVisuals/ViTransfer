/**
 * Next.js Instrumentation Hook
 *
 * This file runs automatically when the Next.js server starts.
 * Used for server-side initialization tasks like seeding the database.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on Node.js runtime (not Edge runtime)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log('[INIT] Running server initialization...')

    try {
      const { ensureDefaultAdmin } = await import('./lib/seed')
      await ensureDefaultAdmin()

      // Initialize security settings from environment variables
      const { initializeSecuritySettings } = await import('./lib/settings')
      await initializeSecuritySettings()

      console.log('[INIT] Server initialization complete')
    } catch (error) {
      console.error('[INIT] Initialization error:', error)
      // Don't throw - allow app to start even if initialization fails
      // The admin can be created manually via database if needed
    }
  }
}
