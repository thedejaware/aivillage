import { makeDb, type DB } from "./client.js";

let db: DB | null = null;

/** Singleton app DB connection from DATABASE_URL (set in .env). */
export function getDb(): DB {
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see apps/backend/.env)");
    db = makeDb(url);
  }
  return db;
}
