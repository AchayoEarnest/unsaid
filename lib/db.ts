import { Pool } from "pg";
// Created on first use, not at import: `next build` imports every route while collecting page data, often with no DATABASE_URL.
let p: Pool | undefined;
const get = () => {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set. Run `npm run setup` (or copy .env.example to .env), then restart the server.");
  return (p ??= new Pool({ connectionString: process.env.DATABASE_URL, max: 10 }));
};
export const pool = { connect: () => get().connect() };
export const q = <T = any>(text: string, params: unknown[] = []) => get().query(text, params).then(r => r.rows as T[]);
