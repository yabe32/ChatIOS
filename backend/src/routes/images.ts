import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateSession } from "../services/securityService.js";
import { config } from "../lib/db.js";
import { generateImageViaProvider } from "../services/providerClient.js";
import { createConversation, getConversationById } from "../repositories/chatRepository.js";
import { createImageGeneration } from "../repositories/imageRepository.js";
import { reserveUsageSlot, releaseUsageSlot } from "../repositories/usageRepository.js";

const imageSchema = z.object({
  conversationId: z.string().uuid().optional(),
  prompt: z.string().min(1).max(2000)
});

export async function imageRoutes(app: FastifyInstance): Promise<void> {
  app.post("/images/generate", async (request, reply) => {
    const session = await authenticateSession(request.cookies[app.config.cookieName], request.headers["x-device-id"]?.toString());
    if (!session) {
      reply.code(401);
      return { error: "Unauthorized" };
    }

    const body = imageSchema.parse(request.body ?? {});

    const conversation = body.conversationId
      ? await getConversationById(body.conversationId, session.id)
      : await createConversation(session.id, body.prompt.slice(0, 48));

    if (!conversation) {
      reply.code(404);
      return { error: "Conversation not found" };
    }

    const inviteLimit = await app.pg.query(
      `select daily_image_limit as "dailyImageLimit" from invite_codes where id = $1`,
      [session.inviteCodeId]
    );
    const dailyImageLimit = Number(inviteLimit.rows[0]?.dailyImageLimit ?? 0);

    const inviteReserved = await reserveUsageSlot({
      subjectType: "invite",
      subjectId: session.inviteCodeId,
      kind: "image",
      limit: dailyImageLimit
    });
    const sessionReserved = await reserveUsageSlot({
      subjectType: "session",
      subjectId: session.id,
      kind: "image",
      limit: dailyImageLimit
    });

    if (!inviteReserved || !sessionReserved) {
      if (inviteReserved) {
        await releaseUsageSlot({ subjectType: "invite", subjectId: session.inviteCodeId, kind: "image" });
      }
      if (sessionReserved) {
        await releaseUsageSlot({ subjectType: "session", subjectId: session.id, kind: "image" });
      }
      reply.code(429);
      return { error: "Daily image limit reached" };
    }

    try {
      const result = await generateImageViaProvider(config.aiProviderBaseUrl, config.aiProviderApiKey, {
        model: config.aiImageModel,
        prompt: body.prompt
      });

      const image = await createImageGeneration({
        conversationId: conversation.id,
        sessionId: session.id,
        prompt: body.prompt,
        imageUrl: result.url,
        provider: "openai-compatible",
        metadata: { providerJobId: result.providerJobId ?? null }
      });

      return {
        conversationId: conversation.id,
        imageId: image.id,
        imageUrl: result.url
      };
    } catch (error) {
      await releaseUsageSlot({ subjectType: "invite", subjectId: session.inviteCodeId, kind: "image" });
      await releaseUsageSlot({ subjectType: "session", subjectId: session.id, kind: "image" });
      reply.code(500);
      return { error: error instanceof Error ? error.message : "Image generation failed" };
    }
  });
}
