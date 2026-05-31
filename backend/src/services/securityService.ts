import type { PoolClient } from "pg";
import { config, pool } from "../lib/db.js";
import { createToken, sha256Hex } from "../lib/crypto.js";
import { decrementInviteSessionCount, findInviteByCodeHash, findSessionByTokenHash, touchSession } from "../repositories/authRepository.js";
import type { SessionRecord } from "../types.js";

export function hashAccessCode(code: string): string {
  return sha256Hex(code.trim().toLowerCase());
}

export function hashSessionToken(token: string): string {
  return sha256Hex(token);
}

export function hashDeviceId(deviceId: string | undefined): string | null {
  if (!deviceId) {
    return null;
  }

  return sha256Hex(deviceId.trim());
}

export function hashIpAddress(ip: string | undefined): string | null {
  if (!ip) {
    return null;
  }

  return sha256Hex(ip);
}

export async function issueSessionFromAccessCode(params: {
  accessCode: string;
  deviceId?: string;
  userAgent?: string;
  ip?: string;
}): Promise<{ token: string; session: SessionRecord }> {
  const invite = await findInviteByCodeHash(hashAccessCode(params.accessCode));

  if (!invite) {
    throw new Error("Invalid access code");
  }

  if (invite.disabledAt) {
    throw new Error("Access code disabled");
  }

  if (invite.deviceBindingRequired && !params.deviceId) {
    throw new Error("Device binding required");
  }

  if (invite.expiresAt && new Date(invite.expiresAt) <= new Date()) {
    throw new Error("Access code expired");
  }

  if (invite.maxSessions > 0 && invite.currentSessions >= invite.maxSessions) {
    throw new Error("Access code session limit reached");
  }

  const token = createToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + config.defaultSessionTtlDays * 24 * 60 * 60 * 1000);

  const session = await pool.connect().then(async (client: PoolClient) => {
    try {
      await client.query("begin");
      const lockedInvite = await client.query(
        `select id, max_sessions as "maxSessions", current_sessions as "currentSessions"
         from invite_codes
         where id = $1
         for update`,
        [invite.id]
      );

      const inviteRow = lockedInvite.rows[0] as { id: string; maxSessions: number; currentSessions: number } | undefined;
      if (!inviteRow || (inviteRow.maxSessions > 0 && inviteRow.currentSessions >= inviteRow.maxSessions)) {
        throw new Error("Access code session limit reached");
      }

      const created = await client.query(
        `insert into sessions (invite_code_id, token_hash, device_id_hash, ip_hash, user_agent, expires_at)
         values ($1, $2, $3, $4, $5, $6)
         returning id, invite_code_id as "inviteCodeId", token_hash as "tokenHash",
                   device_id_hash as "deviceIdHash", ip_hash as "ipHash", user_agent as "userAgent",
                   created_at as "createdAt", last_seen_at as "lastSeenAt", expires_at as "expiresAt",
                   revoked_at as "revokedAt"`,
        [
          invite.id,
          tokenHash,
          hashDeviceId(params.deviceId),
          hashIpAddress(params.ip),
          params.userAgent ?? null,
          expiresAt
        ]
      );

      await client.query("update invite_codes set current_sessions = current_sessions + 1 where id = $1", [invite.id]);
      await client.query("commit");
      return created.rows[0] as SessionRecord;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  });

  return { token, session };
}

export async function authenticateSession(token: string | undefined, deviceId?: string): Promise<SessionRecord | null> {
  if (!token) {
    return null;
  }

  const session = await findSessionByTokenHash(hashSessionToken(token));
  if (!session || session.revokedAt) {
    return null;
  }

  if (new Date(session.expiresAt) <= new Date()) {
    return null;
  }

  if (session.deviceIdHash && !deviceId) {
    return null;
  }

  if (session.deviceIdHash && deviceId && session.deviceIdHash !== hashDeviceId(deviceId)) {
    return null;
  }

  await touchSession(session.id);
  return session;
}

export async function logoutSession(session: SessionRecord): Promise<void> {
  await pool.query("update sessions set revoked_at = now() where id = $1", [session.id]);
  await decrementInviteSessionCount(session.inviteCodeId);
}
