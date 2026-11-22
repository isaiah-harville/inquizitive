-- Desktop-to-server sync: device tokens and deletion tombstones.

CREATE TABLE api_tokens (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  token_hash    TEXT NOT NULL UNIQUE,
  created_at    BIGINT NOT NULL,
  last_used_at  BIGINT
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

CREATE TABLE sync_tombstones (
  entity      TEXT NOT NULL CHECK (entity IN ('folder', 'set', 'card')),
  id          TEXT NOT NULL,
  owner_id    TEXT,
  deleted_at  BIGINT NOT NULL,
  PRIMARY KEY (entity, id)
);
CREATE INDEX idx_tombstones_owner ON sync_tombstones(owner_id, deleted_at);

CREATE FUNCTION record_tombstone() RETURNS trigger AS $$
DECLARE
  owner TEXT;
BEGIN
  IF TG_ARGV[0] = 'card' THEN
    SELECT s.owner_id INTO owner FROM study_sets s WHERE s.id = OLD.set_id;
  ELSE
    owner := OLD.owner_id;
  END IF;
  INSERT INTO sync_tombstones (entity, id, owner_id, deleted_at)
  VALUES (TG_ARGV[0], OLD.id, owner, (extract(epoch FROM clock_timestamp()) * 1000)::bigint)
  ON CONFLICT (entity, id) DO UPDATE SET owner_id = excluded.owner_id, deleted_at = excluded.deleted_at;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER folders_tombstone AFTER DELETE ON folders
  FOR EACH ROW EXECUTE FUNCTION record_tombstone('folder');
CREATE TRIGGER study_sets_tombstone AFTER DELETE ON study_sets
  FOR EACH ROW EXECUTE FUNCTION record_tombstone('set');
CREATE TRIGGER flashcards_tombstone AFTER DELETE ON flashcards
  FOR EACH ROW EXECUTE FUNCTION record_tombstone('card');
