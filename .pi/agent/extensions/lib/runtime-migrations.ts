import type { DatabaseSync } from "node:sqlite";

export interface RuntimeMigration {
  /**
   * Stable identifier of the migration. Must match `NNN_snake_case`. The
   * name is recorded in `schema_migrations(name)` so re-application is a
   * no-op. Never rename a shipped migration; write a new one instead.
   */
  readonly name: string;
  /**
   * Forward-only schema/data change. Runs inside the caller's transaction.
   * Must be idempotent only at the SQLite-DDL level (e.g.,
   * `CREATE TABLE IF NOT EXISTS`); the migrations framework guarantees the
   * function body itself runs at most once per database via the
   * `schema_migrations` row.
   */
  up(handle: DatabaseSync): void;
}

/**
 * Ordered, forward-only list of migrations applied on every
 * `openRuntimeDb`. Names follow `NNN_snake_case` so lexical order is
 * application order. Existing entries are immutable once shipped — append
 * new migrations, never edit the body of a published one.
 */
export const RUNTIME_MIGRATIONS: readonly RuntimeMigration[] = [
  {
    name: "001_add_queue_jobs_linked_task_id",
    up(handle) {
      // ALTER TABLE ADD COLUMN ... REFERENCES is supported by SQLite as
      // long as the new column defaults to NULL. The FK is enforced
      // for subsequent INSERT/UPDATE under `PRAGMA foreign_keys = ON`,
      // which `openRuntimeDb` sets unconditionally.
      const columns = handle
        .prepare(`PRAGMA table_info(queue_jobs)`)
        .all() as Array<{ name: string }>;
      const hasColumn = columns.some((c) => c.name === "linked_task_id");
      if (!hasColumn) {
        handle.exec(
          `ALTER TABLE queue_jobs ADD COLUMN linked_task_id TEXT DEFAULT NULL REFERENCES tasks(id) ON DELETE SET NULL`,
        );
      }
    },
  },
  {
    name: "002_add_active_task_fk",
    up(handle) {
      // active_task.task_id has always been a logical reference into
      // tasks(id); promote it to a real FK with cascade-clear so a task
      // delete (e.g., archive) cannot leave a dangling active pointer.
      //
      // SQLite cannot ALTER an existing column to add a REFERENCES
      // clause. The supported recipe is: create a temp table with the
      // desired schema, copy rows, drop the old table, rename. This is
      // safe because `active_task` is a singleton with at most one row.
      handle.exec(`CREATE TABLE active_task_new (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL
      )`);
      // Copy any existing pointer that still references a real task.
      // Stale references (left over from JSON-era inserts) are dropped
      // to NULL so the rebuild itself does not trip the new FK.
      handle.exec(`INSERT INTO active_task_new (singleton, task_id)
        SELECT a.singleton,
               CASE WHEN t.id IS NULL THEN NULL ELSE a.task_id END
          FROM active_task a
     LEFT JOIN tasks t ON t.id = a.task_id`);
      handle.exec(`DROP TABLE active_task`);
      handle.exec(`ALTER TABLE active_task_new RENAME TO active_task`);
    },
  },
];

const SCHEMA_MIGRATIONS_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
`;

export interface ApplyRuntimeMigrationsOptions {
  /**
   * Override the migration list. Production callers should leave this
   * unset; tests use it to inject custom migrations or to elide the
   * built-in set for fault-injection scenarios.
   */
  readonly migrations?: readonly RuntimeMigration[];
}

interface RuntimeDbLike {
  readonly handle: DatabaseSync;
}

/**
 * Applies any migrations whose `name` is not already in
 * `schema_migrations`. Returns the names of migrations actually
 * applied this call (empty on a fully-migrated DB).
 *
 * Cross-process safety: this function takes a `BEGIN IMMEDIATE` write
 * lock for the duration. Two processes racing to bootstrap the same
 * DB queue behind SQLite's `busy_timeout` (set by `openRuntimeDb`).
 */
export function applyRuntimeMigrations(
  db: RuntimeDbLike,
  options: ApplyRuntimeMigrationsOptions = {},
): string[] {
  const migrations = options.migrations ?? RUNTIME_MIGRATIONS;
  const handle = db.handle;
  handle.exec(SCHEMA_MIGRATIONS_DDL);

  // Read-side fast path: if every migration in the list is already
  // recorded, return without taking a write lock. This is the common
  // case on every `openRuntimeDb` after the first ever — taking
  // `BEGIN IMMEDIATE` here would block any caller already holding the
  // write lock (e.g., a nested open inside
  // `withAtomicQueueAndTasksMutation`) until `busy_timeout` expires.
  const appliedRows = handle
    .prepare(`SELECT name FROM schema_migrations`)
    .all() as Array<{ name: string }>;
  const applied = new Set(appliedRows.map((r) => r.name));
  if (migrations.every((m) => applied.has(m.name))) {
    return [];
  }

  handle.exec("BEGIN IMMEDIATE");
  try {
    // Re-read inside the transaction. Another process may have
    // applied some or all of these migrations between the fast-path
    // read above and us acquiring the write lock.
    const appliedAfterLock = new Set(
      (
        handle
          .prepare(`SELECT name FROM schema_migrations`)
          .all() as Array<{ name: string }>
      ).map((r) => r.name),
    );

    const newlyApplied: string[] = [];
    const insert = handle.prepare(
      `INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)`,
    );
    for (const migration of migrations) {
      if (appliedAfterLock.has(migration.name)) continue;
      migration.up(handle);
      insert.run(migration.name, Date.now());
      newlyApplied.push(migration.name);
    }
    handle.exec("COMMIT");
    return newlyApplied;
  } catch (error) {
    handle.exec("ROLLBACK");
    throw error;
  }
}

/**
 * Returns the names of migrations already applied to this DB, in
 * application order (`applied_at` ASC, then `name` ASC as a stable
 * tiebreaker for migrations that happened in the same millisecond).
 */
export function appliedMigrationNames(db: RuntimeDbLike): string[] {
  const rows = db.handle
    .prepare(`SELECT name FROM schema_migrations ORDER BY applied_at ASC, name ASC`)
    .all() as Array<{ name: string }>;
  return rows.map((r) => r.name);
}
