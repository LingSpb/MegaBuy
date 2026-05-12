#!/usr/bin/env node
/**
 * Database Migration Runner for MegaBuy
 *
 * Reads SQL patch files from supabase/ directory and applies them in order.
 * Tracks applied migrations in a _migrations table.
 *
 * Usage:
 *   npm run migrate           # Run pending migrations
 *   npm run migrate -- --list # List all migrations and their status
 */

require("dotenv").config();
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

// Parse DATABASE_URL from Supabase connection string
// Format: postgresql://postgres:[password]@[host]:[port]/postgres
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("Missing DATABASE_URL in environment variables.");
  console.error("Add your Supabase PostgreSQL connection string to .env");
  console.error(
    "Find it in: Supabase Dashboard > Project Settings > Database > Connection string > URI",
  );
  console.error(
    "Use the 'Session pooler' connection string (port 6543) for best compatibility.",
  );
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
  // Force IPv4 to avoid connection issues
  family: 4,
});

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase");

// Files to skip (not migrations)
const SKIP_FILES = ["migration.sql", "seed.sql"];

async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  `);
}

async function getAppliedMigrations(client) {
  const result = await client.query(
    "SELECT name FROM _migrations ORDER BY name",
  );
  return new Set(result.rows.map((row) => row.name));
}

function getPatchFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR);
  return files
    .filter(
      (f) =>
        f.endsWith(".sql") && f.startsWith("patch_") && !SKIP_FILES.includes(f),
    )
    .sort(); // Sort alphabetically (by date prefix)
}

async function applyMigration(client, filename) {
  const filepath = path.join(MIGRATIONS_DIR, filename);
  const sql = fs.readFileSync(filepath, "utf-8");

  console.log(`  Applying: ${filename}`);

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO _migrations (name) VALUES ($1)", [
      filename,
    ]);
    await client.query("COMMIT");
    console.log(`  ✓ Applied successfully`);
    return true;
  } catch (error) {
    await client.query("ROLLBACK");
    console.error(`  ✗ Failed: ${error.message}`);
    return false;
  }
}

async function listMigrations() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const patchFiles = getPatchFiles();

    console.log("\nMigration Status:");
    console.log("=================\n");

    for (const file of patchFiles) {
      const status = applied.has(file) ? "✓ Applied" : "○ Pending";
      console.log(`  ${status}  ${file}`);
    }

    const pendingCount = patchFiles.filter((f) => !applied.has(f)).length;
    console.log(
      `\n  Total: ${patchFiles.length} migrations, ${pendingCount} pending\n`,
    );
  } finally {
    client.release();
  }
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    const patchFiles = getPatchFiles();

    const pending = patchFiles.filter((f) => !applied.has(f));

    if (pending.length === 0) {
      console.log("\n✓ All migrations are up to date.\n");
      return;
    }

    console.log(`\nRunning ${pending.length} pending migration(s):\n`);

    let successCount = 0;
    for (const file of pending) {
      const success = await applyMigration(client, file);
      if (success) {
        successCount++;
      } else {
        console.error("\nMigration failed. Stopping.\n");
        process.exit(1);
      }
    }

    console.log(`\n✓ Applied ${successCount} migration(s) successfully.\n`);
  } finally {
    client.release();
  }
}

async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes("--list") || args.includes("-l")) {
      await listMigrations();
    } else {
      await runMigrations();
    }
  } catch (error) {
    console.error("Migration error:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
