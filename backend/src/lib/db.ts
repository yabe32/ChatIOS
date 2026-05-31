import { Pool } from "pg";
import { loadConfig } from "../config.js";

export const config = loadConfig();

export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10
});

export async function healthcheck(): Promise<boolean> {
  const result = await pool.query("select 1 as ok");
  return result.rows[0]?.ok === 1;
}
