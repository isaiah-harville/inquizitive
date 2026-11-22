-- Desktop-to-server sync: device tokens and deletion tombstones.

CREATE TABLE api_tokens (
  id            TEXT PRIMARY KEY NOT NULL,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    INTEGER NOT NULL,
  last_used_at  INTEGER
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

CREATE TABLE sync_tombstones (
  entity      TEXT NOT NULL CHECK (entity IN ('folder', 'set', 'card')),
  id          TEXT NOT NULL,
  owner_id    TEXT,
  deleted_at  INTEGER NOT NULL,
  PRIMARY KEY (entity, id)
);
CREATE INDEX idx_tombstones_owner ON sync_tombstones(owner_id, deleted_at);

CREATE TRIGGER folders_tombstone AFTER DELETE ON folders BEGIN
  INSERT OR REPLACE INTO sync_tombstones (entity, id, owner_id, deleted_at)
  VALUES ('folder', old.id, old.owner_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;

CREATE TRIGGER study_sets_tombstone AFTER DELETE ON study_sets BEGIN
  INSERT OR REPLACE INTO sync_tombstones (entity, id, owner_id, deleted_at)
  VALUES ('set', old.id, old.owner_id, CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;

CREATE TRIGGER flashcards_tombstone AFTER DELETE ON flashcards BEGIN
  INSERT OR REPLACE INTO sync_tombstones (entity, id, owner_id, deleted_at)
  VALUES ('card', old.id, (SELECT owner_id FROM study_sets WHERE id = old.set_id),
          CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER));
END;
