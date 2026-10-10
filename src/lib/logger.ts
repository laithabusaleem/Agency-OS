import "server-only";
import pino from "pino";
import { getServerEnv } from "@/lib/env";

function createLogger() {
  const env = getServerEnv();
  return pino({
    level: env.NODE_ENV === "production" ? "info" : "debug",
    ...(env.LOG_PRETTY && env.NODE_ENV !== "production"
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:standard" },
          },
        }
      : {}),
    base: { service: "agency-os" },
    redact: {
      paths: [
        "password",
        "passwordHash",
        "SESSION_SECRET",
        "OUTREACH_UNSUBSCRIBE_SECRET",
        "RESEND_API_KEY",
        "RESEND_WEBHOOK_SECRET",
        "GEMINI_API_KEY",
        "GROQ_API_KEY",
        "OPENROUTER_API_KEY",
        "BRAVE_SEARCH_API_KEY",
        "STRIPE_SECRET_KEY",
        "SLACK_BOT_TOKEN",
        "GOOGLE_CALENDAR_CLIENT_SECRET",
        "req.headers.cookie",
        "req.headers.authorization",
        "headers.authorization",
        "headers.Authorization",
        "authorization",
        "stripeSecret",
        "apiKey",
        "*.apiKey",
        "token",
        "*.token",
      ],
      remove: true,
    },
  });
}

const globalForLogger = globalThis as unknown as {
  __agencyLogger?: pino.Logger;
};

export const logger = globalForLogger.__agencyLogger ?? createLogger();

if (process.env.NODE_ENV !== "production") {
  globalForLogger.__agencyLogger = logger;
}
