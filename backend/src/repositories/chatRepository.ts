import { pool } from "../lib/db.js";
import type { ConversationRecord, MessageRecord } from "../types.js";

export async function listConversations(sessionId: string): Promise<ConversationRecord[]> {
  const { rows } = await pool.query(
    `select id, session_id as "sessionId", title, created_at as "createdAt", updated_at as "updatedAt"
     from conversations
     where session_id = $1
     order by updated_at desc`,
    [sessionId]
  );

  return rows;
}

export async function createConversation(sessionId: string, title: string | null = null): Promise<ConversationRecord> {
  const { rows } = await pool.query(
    `insert into conversations (session_id, title)
     values ($1, $2)
     returning id, session_id as "sessionId", title, created_at as "createdAt", updated_at as "updatedAt"`,
    [sessionId, title]
  );

  return rows[0];
}

export async function getConversationById(conversationId: string, sessionId: string): Promise<ConversationRecord | null> {
  const { rows } = await pool.query(
    `select id, session_id as "sessionId", title, created_at as "createdAt", updated_at as "updatedAt"
     from conversations
     where id = $1 and session_id = $2`,
    [conversationId, sessionId]
  );

  return rows[0] ?? null;
}

export async function listMessages(conversationId: string): Promise<MessageRecord[]> {
  const { rows } = await pool.query(
    `select id, conversation_id as "conversationId", role, content, message_type as "messageType",
            metadata, created_at as "createdAt"
     from messages
     where conversation_id = $1
     order by created_at asc`,
    [conversationId]
  );

  return rows;
}

export async function appendMessage(params: {
  conversationId: string;
  role: MessageRecord["role"];
  content: string;
  messageType?: MessageRecord["messageType"];
  metadata?: Record<string, unknown>;
}): Promise<MessageRecord> {
  const { rows } = await pool.query(
    `insert into messages (conversation_id, role, content, message_type, metadata)
     values ($1, $2, $3, $4, $5)
     returning id, conversation_id as "conversationId", role, content, message_type as "messageType",
               metadata, created_at as "createdAt"`,
    [params.conversationId, params.role, params.content, params.messageType ?? "text", params.metadata ?? {}]
  );

  await pool.query("update conversations set updated_at = now() where id = $1", [params.conversationId]);

  return rows[0];
}

export async function renameConversation(conversationId: string, title: string): Promise<void> {
  await pool.query("update conversations set title = $2, updated_at = now() where id = $1", [conversationId, title]);
}
