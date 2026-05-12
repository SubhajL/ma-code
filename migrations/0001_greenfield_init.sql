-- greenfield-scaffold migration: 0001_greenfield_init
-- queue-readiness: not_ready
-- apply-mode: validate_only
-- purpose: initial greenfield user/project persistence scaffold
-- note: validate the SQL scaffold without applying production data
BEGIN;

CREATE TABLE IF NOT EXISTS greenfield_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS greenfield_projects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES greenfield_users(id)
);

ROLLBACK;
