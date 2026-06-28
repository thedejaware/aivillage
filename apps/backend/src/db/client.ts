import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type DB = ReturnType<typeof makeDb>;

export function makeDb(connectionString: string) {
  const sql = postgres(connectionString, { max: 5 });
  return drizzle(sql, { schema });
}
