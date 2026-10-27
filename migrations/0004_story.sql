-- Z ♥ J — 0004: Our story (kind 'moment') and its photos.
--
-- As in 0002 and 0003: SQLite can't change a CHECK constraint in place, so `records` is
-- rebuilt with the new kinds allowed and every row copied across unchanged. The
-- encrypted values are copied aside first (dropping the old table cascades to
-- `protected_values`) and put back exactly as they were.

PRAGMA defer_foreign_keys = true;

CREATE TABLE protected_values_keep AS SELECT * FROM protected_values;

CREATE TABLE records_v4 (
  household_id TEXT NOT NULL REFERENCES households(id),
  id           TEXT NOT NULL,
  kind         TEXT NOT NULL CHECK (kind IN ('profile','location','credential','home','contact','list','item','plan','task','event','wedding','vendor','guest','budget','moment','pins')),
  parent_id    TEXT,
  data         TEXT NOT NULL CHECK (json_valid(data)),
  version      INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by   TEXT NOT NULL CHECK (created_by IN ('jeffrey','zul')),
  created_at   TEXT NOT NULL,
  updated_by   TEXT NOT NULL CHECK (updated_by IN ('jeffrey','zul')),
  updated_at   TEXT NOT NULL,
  last_op      TEXT,
  deleted_at   TEXT,
  deleted_by   TEXT CHECK (deleted_by IS NULL OR deleted_by IN ('jeffrey','zul')),
  deleted_with TEXT,
  PRIMARY KEY (household_id, id)
);

INSERT INTO records_v4 (household_id, id, kind, parent_id, data, version, created_by, created_at, updated_by, updated_at, last_op, deleted_at, deleted_by, deleted_with)
  SELECT household_id, id, kind, parent_id, data, version, created_by, created_at, updated_by, updated_at, last_op, deleted_at, deleted_by, deleted_with FROM records;

DROP TABLE records;

ALTER TABLE records_v4 RENAME TO records;

CREATE INDEX records_live    ON records (household_id, kind) WHERE deleted_at IS NULL;
CREATE INDEX records_parent  ON records (household_id, parent_id);
CREATE INDEX records_trash   ON records (household_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX records_with    ON records (household_id, deleted_with) WHERE deleted_with IS NOT NULL;
CREATE UNIQUE INDEX task_series_due ON records (household_id, json_extract(data, '$.seriesId'), json_extract(data, '$.due'))
  WHERE kind = 'task' AND deleted_at IS NULL AND json_extract(data, '$.due') IS NOT NULL;

INSERT OR IGNORE INTO protected_values (household_id, record_id, slot, key_id, iv, ciphertext, updated_by, updated_at)
  SELECT household_id, record_id, slot, key_id, iv, ciphertext, updated_by, updated_at FROM protected_values_keep;

DROP TABLE protected_values_keep;

-- Photos for Our story, kept private in the database and served only through the
-- signed-in Worker. A photo belongs to whichever moments list it; one that no
-- moment (live or in the trash) lists is removed by the daily clean-up.
CREATE TABLE photos (
  household_id TEXT NOT NULL REFERENCES households(id),
  id           TEXT NOT NULL,
  mime         TEXT NOT NULL CHECK (mime IN ('image/jpeg','image/webp','image/png')),
  width        INTEGER NOT NULL CHECK (width BETWEEN 1 AND 20000),
  height       INTEGER NOT NULL CHECK (height BETWEEN 1 AND 20000),
  size         INTEGER NOT NULL CHECK (size BETWEEN 1 AND 1500000),
  bytes        BLOB NOT NULL,
  created_by   TEXT NOT NULL CHECK (created_by IN ('jeffrey','zul')),
  created_at   TEXT NOT NULL,
  PRIMARY KEY (household_id, id)
);
