/**
 * Drizzle ORM Client
 *
 * This module provides a Drizzle ORM instance configured for LibSQL/Turso.
 * Used by NextAuth's DrizzleAdapter for authentication.
 */

import { drizzle, LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, Client } from '@libsql/client';
import * as schema from './schema';

// Create the LibSQL client - use dummy URL during build if not available
const url = process.env.TURSO_DATABASE_URL || 'file:local.db';
const client: Client = createClient({
  url,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create the Drizzle ORM instance with the schema
export const db: LibSQLDatabase<typeof schema> = drizzle(client, { schema });

// Export the schema for use in other parts of the application
export { schema };

// Export the raw client for direct SQL queries if needed
export { client };
