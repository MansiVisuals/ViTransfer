import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

/**
 * Set the database user context for Row Level Security (RLS)
 * This sets PostgreSQL session variables that RLS policies use to determine access
 *
 * @param userId - The current user's ID (must be valid CUID)
 * @param userRole - The current user's role (must be valid UserRole enum)
 */
export async function setDatabaseUserContext(
  userId: string,
  userRole: string
): Promise<void> {
  // Validate userId format (CUID: starts with 'c', followed by 24 alphanumeric chars)
  if (!/^c[a-z0-9]{24}$/.test(userId)) {
    throw new Error('Invalid userId format - must be valid CUID')
  }

  // Validate userRole is a known enum value
  const validRoles = ['ADMIN']
  if (!validRoles.includes(userRole)) {
    throw new Error(`Invalid userRole - must be one of: ${validRoles.join(', ')}`)
  }

  try {
    // Set PostgreSQL session variables for RLS
    // Input validation above prevents SQL injection via set_config parameters
    await prisma.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`
    await prisma.$executeRaw`SELECT set_config('app.current_user_role', ${userRole}, true)`
  } catch (error) {
    // Don't throw - RLS might not be configured yet, and app should still work
  }
}

/**
 * Clear the database user context
 */
export async function clearDatabaseUserContext(): Promise<void> {
  try {
    await prisma.$executeRaw`SELECT set_config('app.current_user_id', '', true)`
    await prisma.$executeRaw`SELECT set_config('app.current_user_role', '', true)`
  } catch (error) {
    // Don't throw - this is just cleanup
  }
}

