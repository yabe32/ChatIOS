import { randomBytes } from "node:crypto";
import process from "node:process";
import { pool } from "../lib/db.js";
import { sha256Hex } from "../lib/crypto.js";

type InviteRow = {
  id: string;
  code: string;
  label: string;
};

function parseArg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (arg) {
    return arg.slice(prefix.length);
  }

  return fallback;
}

function parseBooleanArg(name: string, fallback = false): boolean {
  const value = parseArg(name);
  if (value === undefined) {
    return fallback;
  }

  return value === "true" || value === "1";
}

function parseNumberArg(name: string, fallback: number): number {
  const raw = parseArg(name);
  const parsed = raw === undefined ? fallback : Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid --${name} value`);
  }

  return Math.floor(parsed);
}

function createAccessCode(): string {
  const raw = randomBytes(6).toString("hex");
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
}

async function main(): Promise<void> {
  const count = parseNumberArg("count", 1);
  const labelPrefix = parseArg("label-prefix", "invite") ?? "invite";
  const maxSessions = parseNumberArg("max-sessions", 1);
  const dailyMessageLimit = parseNumberArg("daily-message-limit", 200);
  const dailyImageLimit = parseNumberArg("daily-image-limit", 20);
  const deviceBindingRequired = parseBooleanArg("device-binding-required", false);
  const expiresDaysRaw = parseArg("expires-days");
  const expiresDays = expiresDaysRaw ? parseNumberArg("expires-days", Number(expiresDaysRaw)) : undefined;

  const rows: InviteRow[] = [];

  const client = await pool.connect();
  try {
    await client.query("begin");

    for (let index = 0; index < count; index += 1) {
      const code = createAccessCode();
      const codeHash = sha256Hex(code.toLowerCase());
      const label = `${labelPrefix}-${String(index + 1).padStart(3, "0")}`;
      const expiresAt = expiresDays ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000) : null;

      const { rows: insertedRows } = await client.query<{ id: string }>(
        `insert into invite_codes (
           code_hash,
           label,
           max_sessions,
           current_sessions,
           daily_message_limit,
           daily_image_limit,
           device_binding_required,
           expires_at
         )
         values ($1, $2, $3, 0, $4, $5, $6, $7)
         returning id`,
        [codeHash, label, maxSessions, dailyMessageLimit, dailyImageLimit, deviceBindingRequired, expiresAt]
      );

      rows.push({
        id: insertedRows[0].id,
        code,
        label
      });
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }

  console.log(JSON.stringify({ generated: rows }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
