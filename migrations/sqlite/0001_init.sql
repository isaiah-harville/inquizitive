-- Inquizitive schema v1 (SQLite). Keep in step with migrations/postgres/0001_init.sql.
-- Ids are UUID strings; timestamps are Unix epoch milliseconds.
-- Content (sets/cards), per-user learning history and session state are kept
-- in separate tables so one set can be studied by many users.

CREATE TABLE users (
  id             TEXT PRIMARY KEY NOT NULL,
  username       TEXT NOT NULL,
  display_name   TEXT NOT NULL DEFAULT '',
  email          TEXT,
  role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  password_hash  TEXT,
  auth_provider  TEXT NOT NULL DEFAULT 'local',
  external_id    TEXT,
  created_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  last_login_at  INTEGER,
  disabled_at    INTEGER
);
CREATE UNIQUE INDEX ux_users_username ON users(lower(username));
CREATE UNIQUE INDEX ux_users_external ON users(auth_provider, external_id);

-- The single owner of all data in desktop / no-auth mode.
INSERT INTO users (id, username, display_name, role, auth_provider, created_at, updated_at)
VALUES ('local', 'local', 'Me', 'admin', 'none', 0, 0);

CREATE TABLE auth_sessions (
  id            TEXT PRIMARY KEY NOT NULL,   -- SHA-256 of the session token
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    INTEGER NOT NULL,
  expires_at    INTEGER NOT NULL,
  last_seen_at  INTEGER NOT NULL
);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE folders (
  id          TEXT PRIMARY KEY NOT NULL,
  owner_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);
CREATE INDEX idx_folders_owner ON folders(owner_id);
CREATE INDEX idx_folders_parent ON folders(parent_id);

CREATE TABLE study_sets (
  seq          INTEGER PRIMARY KEY,                 -- stable rowid for FTS
  id           TEXT NOT NULL UNIQUE,
  owner_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id    TEXT REFERENCES folders(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  description  TEXT NOT NULL DEFAULT '',
  visibility   TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private', 'shared')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  archived_at  INTEGER,
  deleted_at   INTEGER
);
CREATE INDEX idx_sets_owner ON study_sets(owner_id, deleted_at);
CREATE INDEX idx_sets_folder ON study_sets(folder_id);
CREATE INDEX idx_sets_visibility ON study_sets(visibility, deleted_at);
CREATE INDEX idx_sets_updated ON study_sets(updated_at);

-- Per-user "recent" information for any set the user has opened or studied.
CREATE TABLE set_activity (
  user_id          TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id           TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  last_opened_at   INTEGER,
  last_studied_at  INTEGER,
  PRIMARY KEY (user_id, set_id)
);
CREATE INDEX idx_activity_studied ON set_activity(user_id, last_studied_at);

CREATE TABLE flashcards (
  seq          INTEGER PRIMARY KEY,                 -- stable rowid for FTS
  id           TEXT NOT NULL UNIQUE,
  set_id       TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  front        TEXT NOT NULL DEFAULT '',
  back         TEXT NOT NULL DEFAULT '',
  explanation  TEXT NOT NULL DEFAULT '',
  position     REAL NOT NULL,
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL
);
CREATE INDEX idx_cards_set_position ON flashcards(set_id, position);

CREATE TABLE accepted_answers (
  id            TEXT PRIMARY KEY NOT NULL,
  flashcard_id  TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  answer        TEXT NOT NULL,
  position      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_answers_card ON accepted_answers(flashcard_id, position);

CREATE TABLE tags (
  id    TEXT PRIMARY KEY NOT NULL,
  name  TEXT NOT NULL
);
CREATE UNIQUE INDEX ux_tags_name ON tags(lower(name));

CREATE TABLE study_set_tags (
  set_id  TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  tag_id  TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (set_id, tag_id)
);
CREATE INDEX idx_set_tags_tag ON study_set_tags(tag_id);

CREATE TABLE card_media (
  id             TEXT PRIMARY KEY NOT NULL,
  flashcard_id   TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  side           TEXT NOT NULL CHECK (side IN ('front', 'back')),
  relative_path  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  created_at     INTEGER NOT NULL
);
CREATE INDEX idx_media_card ON card_media(flashcard_id);
CREATE INDEX idx_media_path ON card_media(relative_path);

-- Per-user learning state. `known`/`starred` are the simple flashcard-mode
-- markers; the FSRS columns are long-term scheduling and independent of them.
CREATE TABLE card_progress (
  user_id           TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flashcard_id      TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  starred           INTEGER NOT NULL DEFAULT 0,
  known             INTEGER,
  review_count      INTEGER NOT NULL DEFAULT 0,
  lapses            INTEGER NOT NULL DEFAULT 0,
  fsrs_state        INTEGER NOT NULL DEFAULT 0,
  stability         REAL NOT NULL DEFAULT 0,
  difficulty        REAL NOT NULL DEFAULT 0,
  last_reviewed_at  INTEGER,
  next_review_at    INTEGER,
  scheduling_state  TEXT,
  updated_at        INTEGER NOT NULL,
  PRIMARY KEY (user_id, flashcard_id)
);
CREATE INDEX idx_progress_card ON card_progress(flashcard_id);
CREATE INDEX idx_progress_due ON card_progress(user_id, next_review_at);

CREATE TABLE review_events (
  id                 TEXT PRIMARY KEY NOT NULL,
  user_id            TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flashcard_id       TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  reviewed_at        INTEGER NOT NULL,
  rating             INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 4),
  response_time_ms   INTEGER,
  scheduled_days     REAL,
  fsrs_state_before  INTEGER
);
CREATE INDEX idx_reviews_user_time ON review_events(user_id, reviewed_at);
CREATE INDEX idx_reviews_card ON review_events(flashcard_id);

CREATE TABLE study_sessions (
  id             TEXT PRIMARY KEY NOT NULL,
  user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id         TEXT REFERENCES study_sets(id) ON DELETE CASCADE,
  mode           TEXT NOT NULL,
  started_at     INTEGER NOT NULL,
  updated_at     INTEGER NOT NULL,
  completed_at   INTEGER,
  session_state  TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_sessions_user_set_mode ON study_sessions(user_id, set_id, mode, completed_at);
CREATE INDEX idx_sessions_user_updated ON study_sessions(user_id, updated_at);

CREATE TABLE study_attempts (
  id             TEXT PRIMARY KEY NOT NULL,
  session_id     TEXT NOT NULL REFERENCES study_sessions(id) ON DELETE CASCADE,
  flashcard_id   TEXT NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  question_type  TEXT NOT NULL,
  response       TEXT,
  correct        INTEGER NOT NULL,
  answered_at    INTEGER NOT NULL
);
CREATE INDEX idx_attempts_session ON study_attempts(session_id);
CREATE INDEX idx_attempts_card ON study_attempts(flashcard_id);
CREATE INDEX idx_attempts_time ON study_attempts(answered_at);

CREATE TABLE match_records (
  id           TEXT PRIMARY KEY NOT NULL,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  set_id       TEXT NOT NULL REFERENCES study_sets(id) ON DELETE CASCADE,
  pair_count   INTEGER NOT NULL,
  time_ms      INTEGER NOT NULL,
  achieved_at  INTEGER NOT NULL
);
CREATE INDEX idx_match_user_set ON match_records(user_id, set_id, pair_count, time_ms);

CREATE TABLE user_settings (
  user_id  TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key      TEXT NOT NULL,
  value    TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Full-text search (external-content FTS5 kept in sync by triggers).
CREATE VIRTUAL TABLE cards_fts USING fts5(
  front, back, explanation,
  content='flashcards', content_rowid='seq',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER flashcards_ai AFTER INSERT ON flashcards BEGIN
  INSERT INTO cards_fts(rowid, front, back, explanation)
  VALUES (new.seq, new.front, new.back, new.explanation);
END;
CREATE TRIGGER flashcards_ad AFTER DELETE ON flashcards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, front, back, explanation)
  VALUES ('delete', old.seq, old.front, old.back, old.explanation);
END;
CREATE TRIGGER flashcards_au AFTER UPDATE OF front, back, explanation ON flashcards BEGIN
  INSERT INTO cards_fts(cards_fts, rowid, front, back, explanation)
  VALUES ('delete', old.seq, old.front, old.back, old.explanation);
  INSERT INTO cards_fts(rowid, front, back, explanation)
  VALUES (new.seq, new.front, new.back, new.explanation);
END;

CREATE VIRTUAL TABLE sets_fts USING fts5(
  title, description,
  content='study_sets', content_rowid='seq',
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER study_sets_ai AFTER INSERT ON study_sets BEGIN
  INSERT INTO sets_fts(rowid, title, description) VALUES (new.seq, new.title, new.description);
END;
CREATE TRIGGER study_sets_ad AFTER DELETE ON study_sets BEGIN
  INSERT INTO sets_fts(sets_fts, rowid, title, description)
  VALUES ('delete', old.seq, old.title, old.description);
END;
CREATE TRIGGER study_sets_au AFTER UPDATE OF title, description ON study_sets BEGIN
  INSERT INTO sets_fts(sets_fts, rowid, title, description)
  VALUES ('delete', old.seq, old.title, old.description);
  INSERT INTO sets_fts(rowid, title, description) VALUES (new.seq, new.title, new.description);
END;
