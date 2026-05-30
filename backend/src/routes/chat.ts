import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { appendMessage, createConversation, getConversationById, listConversations, listMessages } from "../repositories/chatRepository.js";
import { reserveUsageSlot, releaseUsageSlot } from "../repositories/usageRepository.js";
import { moderateUserInput } from "../services/moderationService.js";
import { authenticateSession } from "../services/securityService.js";
import { config } from "../lib/db.js";
import { sseHeaders, writeSseEvent } from "../lib/http.js";
import { streamChatCompletion } from "../services/providerClient.js";

const streamSchema = z.object({
  conversationId: z.string().uuid().optional(),
  message: z.string().min(1).max(8000)
});

export async function chatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/chat/threads", async (request, reply) => {
    const session = await authenticateSession(request.cookies[app.config.cookieName], request.headers["x-device-id"]?.toString());
    if (!session) {
      reply.code(401);
      return { items: [] };
    }

    return { items: await listConversations(session.id) };
  });

  app.get("/chat/threads/:conversationId/messages", async (request, reply) => {
    const session = await authenticateSession(request.cookies[app.config.cookieName], request.headers["x-device-id"]?.toString());
    if (!session) {
      reply.code(401);
      return { items: [] };
    }

    const params = z.object({ conversationId: z.string().uuid() }).parse(request.params);
    const conversation = await getConversationById(params.conversationId, session.id);
    if (!conversation) {
      reply.code(404);
      return { items: [] };
    }

    return { items: await listMessages(conversation.id) };
  });

  app.post("/chat/stream", async (request, reply) => {
    const session = await authenticateSession(request.cookies[app.config.cookieName], request.headers["x-device-id"]?.toString());
    if (!session) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const body = streamSchema.parse(request.body ?? {});
    const moderation = moderateUserInput(body.message);
    if (!moderation.allowed) {
      reply.code(400);
      return { error: moderation.reason ?? "Blocked" };
    }

    const conversation = body.conversationId
      ? await getConversationById(body.conversationId, session.id)
      : await createConversation(session.id, body.message.slice(0, 48));

    if (!conversation) {
      reply.code(404);
      return { error: "Conversation not found" };
    }

    const inviteLimitResult = await app.pg.query(
      `select daily_message_limit as "dailyMessageLimit" from invite_codes where id = $1`,
      [session.inviteCodeId]
    );
    const dailyMessageLimit = Number(inviteLimitResult.rows[0]?.dailyMessageLimit ?? 0);

    const inviteReserved = await reserveUsageSlot({
      subjectType: "invite",
      subjectId: session.inviteCodeId,
      kind: "chat",
      limit: dailyMessageLimit
    });
    const sessionReserved = await reserveUsageSlot({
      subjectType: "session",
      subjectId: session.id,
      kind: "chat",
      limit: dailyMessageLimit
    });

    if (!inviteReserved || !sessionReserved) {
      if (inviteReserved) {
        await releaseUsageSlot({ subjectType: "invite", subjectId: session.inviteCodeId, kind: "chat" });
      }
      if (sessionReserved) {
        await releaseUsageSlot({ subjectType: "session", subjectId: session.id, kind: "chat" });
      }
      reply.code(429);
      return { error: "Daily message limit reached" };
    }

    try {
      await appendMessage({ conversationId: conversation.id, role: "user", content: body.message });

      sseHeaders(reply);
      writeSseEvent(reply, "conversation", { conversationId: conversation.id });

      const assistantParts: string[] = [];
      const history = await listMessages(conversation.id);

      for await (const delta of streamChatCompletion(config.aiProviderBaseUrl, config.aiProviderApiKey, {
        systemPrompt: config.systemPrompt,
        model: config.aiChatModel,
        temperature: 0.4,
        messages: history.map((message) => ({ role: message.role, content: message.content }))
      })) {
        assistantParts.push(delta);
        writeSseEvent(reply, "delta", { text: delta });
      }

      const assistantText = assistantParts.join("");
      const assistantMessage = await appendMessage({
        conversationId: conversation.id,
        role: "assistant",
        content: assistantText,
        metadata: { model: config.aiChatModel }
      });

      writeSseEvent(reply, "done", {
        conversationId: conversation.id,
        messageId: assistantMessage.id
      });
      reply.raw.end();
    } catch (error) {
      await releaseUsageSlot({ subjectType: "invite", subjectId: session.inviteCodeId, kind: "chat" });
      await releaseUsageSlot({ subjectType: "session", subjectId: session.id, kind: "chat" });

      if (reply.raw.headersSent) {
        writeSseEvent(reply, "error", {
          message: error instanceof Error ? error.message : "Streaming failed"
        });
        reply.raw.end();
      } else {
        reply.code(500);
        return { error: error instanceof Error ? error.message : "Streaming failed" };
      }
    }

    return reply;
  });
}
