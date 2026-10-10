import fs from "node:fs";
import path from "node:path";

/**
 * Copy SQLite database + workspaces into a timestamped backup directory.
 * Usage: npx tsx --env-file=.env.local scripts/backup.ts
 */
const dbPath = process.env.DATABASE_PATH ?? "./data/agency.sqlite";
const workspaceRoot =
  process.env.DELIVERY_WORKSPACE_ROOT ?? "./data/workspaces";
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = path.resolve(
  process.env.BACKUP_DIR ?? "./data/backups",
  `agency-backup-${stamp}`,
);

fs.mkdirSync(outDir, { recursive: true });

const absDb = path.resolve(dbPath);
if (!fs.existsSync(absDb)) {
  console.error(`Database not found: ${absDb}`);
  process.exit(1);
}

fs.copyFileSync(absDb, path.join(outDir, "agency.sqlite"));
for (const suffix of ["-wal", "-shm"]) {
  const side = absDb + suffix;
  if (fs.existsSync(side)) {
    fs.copyFileSync(side, path.join(outDir, `agency.sqlite${suffix}`));
  }
}

const absWs = path.resolve(workspaceRoot);
if (fs.existsSync(absWs)) {
  fs.cpSync(absWs, path.join(outDir, "workspaces"), { recursive: true });
}

fs.writeFileSync(
  path.join(outDir, "manifest.json"),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      databasePath: absDb,
      workspaceRoot: absWs,
      note: "Restore: stop app/worker, replace DATABASE_PATH file, restore workspaces, run db:migrate if needed",
    },
    null,
    2,
  ),
);

console.log(`Backup written to ${outDir}`);
