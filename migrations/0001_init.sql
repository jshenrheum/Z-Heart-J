-- Z ♥ J — initial schema (D1 / SQLite).
--
-- Every row carries household_id, and every query the Worker makes filters on it.
-- Ordinary household data lives in `records` as validated JSON (one allowlist per
-- kind, enforced by the Worker before anything is written). Protected values
-- (credential numbers and similar) never appear in `records`: they live only in
-- `protected_values`, encrypted with AES-GCM under the Worker secret
-- PROTECTED_DATA_KEY, and are decrypted only on an explicit reveal.

CREATE TABLE households (
  id         TEXT PRIMARY KEY,
  -- Bumped on every write; the app's quiet refresh asks "anything newer than rev?"
  rev        INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE records (
  household_id TEXT NOT NULL REFERENCES households(id),
  id           TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('profile','location','credential','home','contact','list','item','plan','task','pins')),
  -- The list an item belongs to, or the plan a task belongs to.
  parent_id    TEXT,
  data         TEXT NOT NULL CHECK (json_valid(data)),
  -- Optimistic concurrency: a write names the version it started from, or gets 409.
  version      INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by   TEXT NOT NULL CHECK (created_by IN ('jeffrey','zul')),
  created_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL CHECK (updated_by IN ('jeffrey','zul')),
  updated_at   TEXT NOT NULL,
  -- Random token of the last write, so a follow-up statement in the same batch can
  -- check that this exact write happened (task completion + its next occurrence).
  last_op      TEXT,
  -- Trash: soft-deleted rows are kept for 30 days, then purged.
  deleted_at   TEXT,
  deleted_by   TEXT CHECK (deleted_by IS NULL OR deleted_by IN ('jeffrey','zul')),
  -- Set on rows that went to the trash because their parent did (list → items, plan → tasks).
  deleted_with TEXT,
  PRIMARY KEY (household_id, id)
);

CREATE INDEX records_live    ON records (household_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX records_parent  ON records (household_id, parent_id);
CREATE INDEX records_trash   ON records (household_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX records_with    ON records (household_id, deleted_with) WHERE deleted_with IS NOT NULL;

-- A recurring series can have only one live task per due date, so completing twice
-- (two phones, a double tap, a retried request) can never create two next occurrences.
CREATE UNIQUE INDEX task_series_due ON records (household_id, json_extract(data, '$.seriesId'), json_extract(data, '$.due'))
  WHERE kind = 'task' AND deleted_at IS NULL AND json_extract(data, '$.due') IS NOT NULL;

CREATE TABLE protected_values (
  household_id TEXT NOT NULL,
  record_id    TEXT NOT NULL,
  -- "number" for a credential; the field id for a protected home field.
  slot         TEXT NOT NULL,
  -- Fingerprint of the key that encrypted it (not the key), to detect a wrong key.
  key_id       TEXT NOT NULL,
  iv           TEXT NOT NULL,  -- base64, 12 random bytes per value
  ciphertext   TEXT NOT NULL,  -- base64, AES-GCM output including its tag
  updated_by   TEXT NOT NULL CHECK (updated_by IN ('jeffrey','zul')),
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, record_id, slot),
  FOREIGN KEY (household_id, record_id) REFERENCES records (household_id, id) ON DELETE CASCADE
);

-- Who touched a protected value or exported, and when. Never the value itself.
CREATE TABLE audit_events (
  household_id TEXT NOT NULL,
  at           TEXT NOT NULL,
  member       TEXT NOT NULL CHECK (member IN ('jeffrey','zul')),
  action       TEXT NOT NULL CHECK (action IN ('protected.set','protected.clear','protected.reveal','export')),
  record_id    TEXT,
  slot         TEXT
);
CREATE INDEX audit_by_record ON audit_events (household_id, record_id, at);
