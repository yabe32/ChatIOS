import { pool } from "../lib/db.js";

export async function createImageGeneration(params: {
  conversationId: string;
  sessionId: string;
  prompt: string;
  imageUrl: string;
  provider: string;
  metadata?: Record<string, unknown>;
}): Promise<{ id: string }> {
  const { rows } = await pool.query(
    `insert into image_generations (conversation_id, session_id, prompt, image_url, provider, metadata)
     values ($1, $2, $3, $4, $5, $6)
     returning id`,
    [params.conversationId, params.sessionId, params.prompt, params.imageUrl, params.provider, params.metadata ?? {}]
  );

  await pool.query("update conversations set updated_at = now() where id = $1", [params.conversationId]);
  return rows[0];
}
