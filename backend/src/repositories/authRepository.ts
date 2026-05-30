import { pool } from "../lib/db.js";
import type { InviteRecord, SessionRecord } from "../types.js";

export async function findInviteByCodeHash(codeHash: string): Promise<InviteRecord | null> {
  const { rows } = await pool.query(
    `select id, code_hash as "codeHash", label, disabled_at as "disabledAt", disabled_reason as "disabledReason",
            max_sessions as "maxSessions", current_sessions as "currentSessions",
            daily_message_limit as "dailyMessageLimit", daily_image_limit as "dailyImageLimit",
            device_binding_required as "deviceBindingRequired", expires_at as "expiresAt"
     from invite_codes
     where code_hash = $1`,
    [codeHash]
  );

  return rows[0] ?? null;
}

export async function findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null> {
  const { rows } = await pool.query(
    `select id, invite_code_id as "inviteCodeId", token_hash as "tokenHash",
            device_id_hash as "deviceIdHash", ip_hash as "ipHash",
            user_agent as "userAgent", created_at as "createdAt",
            last_seen_at as "lastSeenAt", expires_at as "expiresAt",
            revoked_at as "revokedAt"
     from sessions
     where token_hash = $1`,
    [tokenHash]
  );

  return rows[0] ?? null;
}

export async function touchSession(sessionId: string): Promise<void> {
  await pool.query("update sessions set last_seen_at = now() where id = $1", [sessionId]);
}

export async function revokeSession(sessionId: string): Promise<void> {
  await pool.query("update sessions set revoked_at = now() where id = $1", [sessionId]);
}

export async function decrementInviteSessionCount(inviteCodeId: string): Promise<void> {
  await pool.query(
    "update invite_codes set current_sessions = greatest(current_sessions - 1, 0) where id = $1",
    [inviteCodeId]
  );
}
