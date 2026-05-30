import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticateSession, issueSessionFromAccessCode, logoutSession } from "../services/securityService.js";
import { sendNoCache } from "../lib/http.js";

const loginSchema = z.object({
  code: z.string().min(4).max(128),
  deviceId: z.string().min(8).max(256).optional()
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body ?? {});
    const result = await issueSessionFromAccessCode({
      accessCode: body.code,
      deviceId: body.deviceId,
      userAgent: request.headers["user-agent"],
      ip: request.ip
    });

    reply.setCookie(app.config.cookieName, result.token, {
      httpOnly: true,
      secure: app.config.cookieSecure,
      sameSite: "strict",
      path: "/",
      domain: app.config.cookieDomain,
      expires: new Date(result.session.expiresAt)
    });

    sendNoCache(reply);
    return {
      session: {
        id: result.session.id,
        expiresAt: result.session.expiresAt
      }
    };
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[app.config.cookieName];
    const session = await authenticateSession(token, request.headers["x-device-id"]?.toString());

    if (session) {
      await logoutSession(session);
    }

    reply.clearCookie(app.config.cookieName, {
      path: "/",
      domain: app.config.cookieDomain
    });

    sendNoCache(reply);
    return { ok: true };
  });

  app.get("/auth/me", async (request, reply) => {
    const session = await authenticateSession(request.cookies[app.config.cookieName], request.headers["x-device-id"]?.toString());

    sendNoCache(reply);

    if (!session) {
      reply.code(401);
      return { authenticated: false };
    }

    return {
      authenticated: true,
      session: {
        id: session.id,
        expiresAt: session.expiresAt
      }
    };
  });
}
