import pg from 'pg';
const { Pool } = pg;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

export function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 11);
}
