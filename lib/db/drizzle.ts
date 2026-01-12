/**
 * Drizzle ORM Client
 *
 * This module provides a Drizzle ORM instance configured for LibSQL/Turso.
 * Used by NextAuth's DrizzleAdapter for authentication.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import * as schema from './schema';

// Create the LibSQL client
const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// Create the Drizzle ORM instance with the schema
export const db = drizzle(client, { schema });

// Export the schema for use in other parts of the application
export { schema };

// Export the raw client for direct SQL queries if needed
export { client };
