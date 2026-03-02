import { defineConfig } from 'drizzle-kit';
import { config } from 'dotenv';

// Drizzle Kit doesn't load .env.local; load it so DATABASE_URL is set
config({ path: '.env.local' });

export default defineConfig({
  schema: './db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
});