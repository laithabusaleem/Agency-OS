/**
 * Persistent agent worker process.
 * Usage: npm run worker
 */
import { openDatabase } from "../src/db/factory";
import { AgentCoordinator } from "../src/agent/coordinator";
import { getAgentEnv } from "../src/agent/config";

async function main() {
  const databasePath = process.env.DATABASE_PATH ?? "./data/agency.sqlite";
  const handle = openDatabase(databasePath);
  const coordinator = new AgentCoordinator(handle.db);
  await coordinator.init();

  const env = getAgentEnv();
  console.log(
    JSON.stringify({
      msg: "agent worker starting",
      defaultProvider: env.AGENT_DEFAULT_PROVIDER,
      pollMs: env.AGENT_WORKER_POLL_MS,
      killSwitch: env.AGENT_KILL_SWITCH,
    }),
  );

  const controller = new AbortController();
  const shutdown = () => {
    console.log(JSON.stringify({ msg: "agent worker shutting down" }));
    controller.abort();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await coordinator.startWorker(controller.signal);
  handle.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
