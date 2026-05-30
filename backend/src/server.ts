import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { loadConfig } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { chatRoutes } from "./routes/chat.js";
import { imageRoutes } from "./routes/images.js";
import { healthcheck } from "./lib/db.js";
import { pool as dbPool } from "./lib/db.js";

const config = loadConfig();

const app = Fastify({
  logger: true,
  bodyLimit: 1024 * 1024
});

app.decorate("config", config);

declare module "fastify" {
  interface FastifyInstance {
    config: typeof config;
  }
}

await app.register(helmet, {
  global: true,
  contentSecurityPolicy: false
});

await app.register(cors, {
  origin: config.appOrigin,
  credentials: true
});

await app.register(cookie, {
  secret: process.env.COOKIE_SECRET ?? "replace-me-in-production"
});

await app.register(rateLimit, {
  max: config.rateLimitMax,
  timeWindow: config.rateLimitWindowMs
});

app.decorate("pg", dbPool);

declare module "fastify" {
  interface FastifyInstance {
    pg: typeof dbPool;
  }
}

app.get("/healthz", async () => {
  return {
    ok: true,
    database: await healthcheck()
  };
});

await authRoutes(app);
await chatRoutes(app);
await imageRoutes(app);

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  reply.code(500).send({ error: "Internal server error" });
});

await app.listen({ port: config.port, host: "0.0.0.0" });
