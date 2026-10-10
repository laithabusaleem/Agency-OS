import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const DATABASE_PATH = process.env.DATABASE_PATH ?? "./data/agency.sqlite";
const MIGRATIONS_DIR = path.join(process.cwd(), "src/db/migrations");

function resolveDbPath() {
  if (path.isAbsolute(DATABASE_PATH)) return DATABASE_PATH;
  const relative = DATABASE_PATH.replace(/^\.\/?/, "");
  const scoped = relative.startsWith("data/")
    ? relative
    : path.posix.join("data", path.posix.basename(relative));
  return path.join(process.cwd(), scoped);
}

function main() {
  const dbPath = resolveDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS __drizzle_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hash TEXT NOT NULL,
      created_at NUMERIC
    );
  `);

  const applied = new Set(
    (
      sqlite.prepare("SELECT hash FROM __drizzle_migrations").all() as Array<{
        hash: string;
      }>
    ).map((row) => row.hash),
  );

  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
    const statements = sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter(Boolean);

    const tx = sqlite.transaction(() => {
      for (const statement of statements) {
        sqlite.exec(statement);
      }
      sqlite
        .prepare(
          "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
        )
        .run(file, Date.now());
    });
    tx();
    console.log(`Applied migration ${file}`);
  }

  console.log("Migrations complete.");
  sqlite.close();
}

main();
