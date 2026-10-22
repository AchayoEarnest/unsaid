import { Pool } from "pg";
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Run `npm run setup` (or copy .env.example to .env), then restart the server.");
export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
export const q = <T = any>(text: string, params: unknown[] = []) => pool.query(text, params).then(r => r.rows as T[]);
