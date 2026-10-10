import { NextResponse } from "next/server";
import { listProviderStatus } from "@/agent/providers/registry";
import { ensureRuntimeSettings, getKillSwitchEnabled } from "@/agent/budgets";
import { checkDatabaseHealth, getDb } from "@/db/client";
import { logger } from "@/lib/logger";

/**
 * Public liveness/readiness probe.
 * Does not expose budget amounts or secret material.
 */
export async function GET() {
  const started = Date.now();
  const db = checkDatabaseHealth();
  let agent:
    | {
        ok: boolean;
        killSwitchEnabled: boolean;
        providersConfigured: number;
      }
    | { ok: false; error: string } = { ok: false, error: "not checked" };

  try {
    const handle = getDb();
    await ensureRuntimeSettings(handle);
    const killSwitchEnabled = await getKillSwitchEnabled(handle);
    const providers = listProviderStatus().filter((p) => p.configured);
    agent = {
      ok: true,
      killSwitchEnabled,
      providersConfigured: providers.length,
    };
  } catch (error) {
    agent = {
      ok: false,
      error: error instanceof Error ? error.message : "agent health failed",
    };
  }

  const healthy = db.ok && agent.ok;
  const status = healthy ? 200 : 503;
  const payload = {
    status: healthy ? "ok" : "degraded",
    checks: {
      database: {
        ok: db.ok,
        dialect: "sqlite",
        error: db.error ?? null,
      },
      agent,
    },
    uptimeMs: Math.round(process.uptime() * 1000),
    latencyMs: Date.now() - started,
    timestamp: new Date().toISOString(),
  };

  logger.info({ health: payload.status }, "health check");
  return NextResponse.json(payload, { status });
}
