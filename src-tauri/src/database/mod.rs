//! SQLite storage: connection setup, migrations, and JSON <-> SQL value mapping.
//!
//! Migrations are plain `.sql` files in `migrations/sqlite/`, embedded at
//! compile time and tracked with `PRAGMA user_version`. The same files are used
//! by the TypeScript test-suite and the browser build, so there is exactly one
//! source of truth for the schema.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, types::Value as SqlValue};
use serde_json::{Map, Number, Value as JsonValue};

use crate::error::{AppError, AppResult};

/// Ordered list of `(version, sql)` migrations. Append only; never edit a
/// migration that has shipped.
pub const MIGRATIONS: &[(u32, &str)] = &[
    (1, include_str!("../../../migrations/sqlite/0001_init.sql")),
    (2, include_str!("../../../migrations/sqlite/0002_sync.sql")),
];

pub fn latest_version() -> u32 {
    MIGRATIONS.last().map(|(v, _)| *v).unwrap_or(0)
}

/// Apply connection-level pragmas. Foreign keys are off by default in SQLite.
pub fn configure(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(
        "PRAGMA foreign_keys = ON;
         PRAGMA busy_timeout = 5000;",
    )?;
    Ok(())
}

pub fn schema_version(conn: &Connection) -> AppResult<u32> {
    Ok(conn.query_row("PRAGMA user_version", [], |r| r.get::<_, u32>(0))?)
}

/// Run every pending migration, each in its own transaction.
pub fn migrate(conn: &mut Connection) -> AppResult<u32> {
    let current = schema_version(conn)?;
    if current > latest_version() {
        return Err(AppError::Message(format!(
            "database schema v{current} is newer than this app supports (v{}); update Inquizitive",
            latest_version()
        )));
    }
    for (version, sql) in MIGRATIONS.iter().filter(|(v, _)| *v > current) {
        let tx = conn.transaction()?;
        tx.execute_batch(sql)?;
        tx.pragma_update(None, "user_version", version)?;
        tx.commit()?;
        log::info!("applied migration v{version}");
    }
    schema_version(conn)
}

/// Open (or create) the database at `path`, backing up the existing file
/// before applying any migration so an interrupted upgrade cannot lose data.
pub fn open(path: &Path) -> AppResult<Connection> {
    let existed = path.exists();
    let mut conn = Connection::open(path)?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;")?;
    configure(&conn)?;

    let current = schema_version(&conn)?;
    if existed && current > 0 && current < latest_version() {
        let backup = backup_path(path, current);
        conn.execute("VACUUM INTO ?1", [backup.to_string_lossy().as_ref()])?;
        log::info!("pre-migration backup written to {}", backup.display());
    }
    migrate(&mut conn)?;
    Ok(conn)
}

fn backup_path(db: &Path, version: u32) -> PathBuf {
    let stem = db
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("inquizitive");
    let mut candidate = db.with_file_name(format!("{stem}.v{version}.bak.db"));
    let mut n = 1;
    while candidate.exists() {
        candidate = db.with_file_name(format!("{stem}.v{version}.bak.{n}.db"));
        n += 1;
    }
    candidate
}

/// Convert a JSON parameter into an SQLite value.
pub fn json_to_sql(value: &JsonValue) -> AppResult<SqlValue> {
    Ok(match value {
        JsonValue::Null => SqlValue::Null,
        JsonValue::Bool(b) => SqlValue::Integer(i64::from(*b)),
        JsonValue::Number(n) => {
            if let Some(i) = n.as_i64() {
                SqlValue::Integer(i)
            } else if let Some(f) = n.as_f64() {
                SqlValue::Real(f)
            } else {
                return Err(AppError::Message(format!("unsupported number {n}")));
            }
        }
        JsonValue::String(s) => SqlValue::Text(s.clone()),
        JsonValue::Array(_) | JsonValue::Object(_) => {
            return Err(AppError::Message(
                "SQL parameters must be scalars; serialize objects to JSON text first".into(),
            ));
        }
    })
}

fn sql_to_json(value: SqlValue) -> JsonValue {
    match value {
        SqlValue::Null => JsonValue::Null,
        SqlValue::Integer(i) => JsonValue::Number(i.into()),
        SqlValue::Real(f) => Number::from_f64(f)
            .map(JsonValue::Number)
            .unwrap_or(JsonValue::Null),
        SqlValue::Text(s) => JsonValue::String(s),
        SqlValue::Blob(b) => JsonValue::Array(b.into_iter().map(JsonValue::from).collect()),
    }
}

fn bind(params: &[JsonValue]) -> AppResult<Vec<SqlValue>> {
    params.iter().map(json_to_sql).collect()
}

/// Run a query and return rows as JSON objects keyed by column name.
pub fn select(
    conn: &Connection,
    sql: &str,
    params: &[JsonValue],
) -> AppResult<Vec<Map<String, JsonValue>>> {
    let mut stmt = conn.prepare_cached(sql)?;
    let names: Vec<String> = stmt.column_names().map(str::to_string).collect();
    let values = bind(params)?;
    let rows = stmt.query_map(rusqlite::params_from_iter(values.iter()), |row| {
        let mut obj = Map::with_capacity(names.len());
        for (i, name) in names.iter().enumerate() {
            obj.insert(name.clone(), sql_to_json(row.get::<_, SqlValue>(i)?));
        }
        Ok(obj)
    })?;
    Ok(rows.collect::<Result<_, _>>()?)
}

/// Execute a single write statement and return the number of changed rows.
pub fn execute(conn: &Connection, sql: &str, params: &[JsonValue]) -> AppResult<usize> {
    let values = bind(params)?;
    Ok(conn
        .prepare_cached(sql)?
        .execute(rusqlite::params_from_iter(values.iter()))?)
}

#[derive(Debug, serde::Deserialize)]
pub struct Statement {
    pub sql: String,
    #[serde(default)]
    pub params: Vec<JsonValue>,
}

/// Execute several statements atomically: either all apply or none do.
pub fn batch(conn: &mut Connection, statements: &[Statement]) -> AppResult<usize> {
    let tx = conn.transaction()?;
    let mut changes = 0;
    for s in statements {
        changes += execute(&tx, &s.sql, &s.params)?;
    }
    tx.commit()?;
    Ok(changes)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn mem() -> Connection {
        let mut conn = Connection::open_in_memory().unwrap();
        configure(&conn).unwrap();
        migrate(&mut conn).unwrap();
        conn
    }

    fn now() -> JsonValue {
        json!(1_700_000_000_000_i64)
    }

    fn insert_set(conn: &Connection, id: &str, title: &str) {
        execute(
            conn,
            "INSERT INTO study_sets (id, owner_id, title, description, created_at, updated_at) VALUES (?1, 'local', ?2, '', ?3, ?3)",
            &[json!(id), json!(title), now()],
        )
        .unwrap();
    }

    fn insert_card(conn: &Connection, id: &str, set: &str, front: &str, back: &str) {
        execute(
            conn,
            "INSERT INTO flashcards (id, set_id, front, back, position, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, 1, ?5, ?5)",
            &[json!(id), json!(set), json!(front), json!(back), now()],
        )
        .unwrap();
    }

    #[test]
    fn migrations_apply_and_are_idempotent() {
        let mut conn = mem();
        assert_eq!(schema_version(&conn).unwrap(), latest_version());
        assert_eq!(migrate(&mut conn).unwrap(), latest_version());
    }

    #[test]
    fn refuses_newer_schema() {
        let mut conn = Connection::open_in_memory().unwrap();
        conn.pragma_update(None, "user_version", latest_version() + 1)
            .unwrap();
        assert!(migrate(&mut conn).is_err());
    }

    #[test]
    fn foreign_keys_cascade_cards_with_set() {
        let conn = mem();
        insert_set(&conn, "s1", "Biology");
        insert_card(&conn, "c1", "s1", "cell", "unit of life");
        execute(
            &conn,
            "DELETE FROM study_sets WHERE id = ?1",
            &[json!("s1")],
        )
        .unwrap();
        let rows = select(&conn, "SELECT count(*) AS n FROM flashcards", &[]).unwrap();
        assert_eq!(rows[0]["n"], json!(0));
    }

    #[test]
    fn foreign_keys_reject_orphans() {
        let conn = mem();
        let res = execute(
            &conn,
            "INSERT INTO flashcards (id, set_id, front, back, position, created_at, updated_at) VALUES ('c', 'missing', '', '', 0, 0, 0)",
            &[],
        );
        assert!(res.is_err());
    }

    #[test]
    fn fts_tracks_inserts_updates_and_deletes() {
        let conn = mem();
        insert_set(&conn, "s1", "Chemistry");
        insert_card(&conn, "c1", "s1", "Avogadro", "6.022e23 per mole");
        let q = "SELECT f.id FROM cards_fts JOIN flashcards f ON f.seq = cards_fts.rowid WHERE cards_fts MATCH ?1";
        assert_eq!(select(&conn, q, &[json!("mole")]).unwrap().len(), 1);

        execute(
            &conn,
            "UPDATE flashcards SET back = 'a constant' WHERE id = 'c1'",
            &[],
        )
        .unwrap();
        assert_eq!(select(&conn, q, &[json!("mole")]).unwrap().len(), 0);
        assert_eq!(select(&conn, q, &[json!("constant")]).unwrap().len(), 1);

        execute(&conn, "DELETE FROM flashcards WHERE id = 'c1'", &[]).unwrap();
        assert_eq!(select(&conn, q, &[json!("constant")]).unwrap().len(), 0);

        let sq = "SELECT s.id FROM sets_fts JOIN study_sets s ON s.seq = sets_fts.rowid WHERE sets_fts MATCH ?1";
        assert_eq!(select(&conn, sq, &[json!("chem*")]).unwrap().len(), 1);
    }

    #[test]
    fn fts_survives_vacuum() {
        let conn = mem();
        insert_set(&conn, "s1", "A");
        insert_card(&conn, "c1", "s1", "first", "x");
        insert_card(&conn, "c2", "s1", "second", "y");
        execute(&conn, "DELETE FROM flashcards WHERE id = 'c1'", &[]).unwrap();
        conn.execute_batch("VACUUM").unwrap();
        let rows = select(
            &conn,
            "SELECT f.id FROM cards_fts JOIN flashcards f ON f.seq = cards_fts.rowid WHERE cards_fts MATCH 'second'",
            &[],
        )
        .unwrap();
        assert_eq!(rows[0]["id"], json!("c2"));
    }

    #[test]
    fn batch_is_atomic() {
        let mut conn = mem();
        let stmts = vec![
            Statement {
                sql: "INSERT INTO user_settings (user_id, key, value) VALUES ('local', 'a', '1')"
                    .into(),
                params: vec![],
            },
            Statement {
                sql: "INSERT INTO user_settings (user_id, key, value) VALUES ('local', 'a', '2')"
                    .into(), // PK violation
                params: vec![],
            },
        ];
        assert!(batch(&mut conn, &stmts).is_err());
        let rows = select(&conn, "SELECT count(*) AS n FROM user_settings", &[]).unwrap();
        assert_eq!(rows[0]["n"], json!(0));
    }

    #[test]
    fn json_values_round_trip() {
        let conn = mem();
        let row = &select(
            &conn,
            "SELECT ?1 AS a, ?2 AS b, ?3 AS c, ?4 AS d, ?5 AS e",
            &[
                json!(null),
                json!(true),
                json!(42),
                json!(1.5),
                json!("héllo"),
            ],
        )
        .unwrap()[0];
        assert_eq!(row["a"], json!(null));
        assert_eq!(row["b"], json!(1));
        assert_eq!(row["c"], json!(42));
        assert_eq!(row["d"], json!(1.5));
        assert_eq!(row["e"], json!("héllo"));
        assert!(json_to_sql(&json!({"x": 1})).is_err());
    }

    #[test]
    fn open_backs_up_before_upgrading() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("lib.db");
        {
            let conn = Connection::open(&path).unwrap();
            // Simulate an older schema version with some data in it.
            conn.execute_batch(MIGRATIONS[0].1).unwrap();
            conn.pragma_update(None, "user_version", 1).unwrap();
        }
        let conn = open(&path).unwrap();
        assert_eq!(schema_version(&conn).unwrap(), latest_version());
        if latest_version() > 1 {
            assert!(dir.path().join("lib.v1.bak.db").exists());
        }
    }
}
