import { config } from 'dotenv';

// Load .env.local first (Next.js convention); then .env so scripts get DATABASE_URL etc.
config({ path: '.env.local' });
config({ path: '.env' });
