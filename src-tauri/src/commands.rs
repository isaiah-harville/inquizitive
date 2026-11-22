//! Tauri commands exposed to the webview. Kept deliberately small: a generic
//! parameterized SQL bridge (the webview only ever runs bundled, local code
//! under a strict CSP) plus sandboxed media file access.

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use serde_json::{Map, Value as JsonValue};
use tauri::State;

use crate::database::{self, Statement};
use crate::error::{AppError, AppResult};
use crate::media;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub db_path: PathBuf,
    pub media_dir: PathBuf,
}

impl AppState {
    fn conn(&self) -> AppResult<std::sync::MutexGuard<'_, Connection>> {
        self.db
            .lock()
            .map_err(|_| AppError::Message("database lock poisoned".into()))
    }
}

#[tauri::command]
pub fn db_select(
    state: State<'_, AppState>,
    sql: String,
    params: Vec<JsonValue>,
) -> AppResult<Vec<Map<String, JsonValue>>> {
    database::select(&*state.conn()?, &sql, &params)
}

#[tauri::command]
pub fn db_execute(
    state: State<'_, AppState>,
    sql: String,
    params: Vec<JsonValue>,
) -> AppResult<usize> {
    database::execute(&*state.conn()?, &sql, &params)
}

#[tauri::command]
pub fn db_batch(state: State<'_, AppState>, statements: Vec<Statement>) -> AppResult<usize> {
    database::batch(&mut *state.conn()?, &statements)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppInfo {
    db_path: String,
    media_dir: String,
    schema_version: u32,
    version: String,
}

#[tauri::command]
pub fn app_info(state: State<'_, AppState>, app: tauri::AppHandle) -> AppResult<AppInfo> {
    Ok(AppInfo {
        db_path: state.db_path.display().to_string(),
        media_dir: state.media_dir.display().to_string(),
        schema_version: database::schema_version(&*state.conn()?)?,
        version: app.package_info().version.to_string(),
    })
}

#[tauri::command]
pub fn media_write(state: State<'_, AppState>, name: String, bytes: Vec<u8>) -> AppResult<()> {
    media::write(&state.media_dir, &name, &bytes)
}

#[tauri::command]
pub fn media_read(state: State<'_, AppState>, name: String) -> AppResult<tauri::ipc::Response> {
    Ok(tauri::ipc::Response::new(media::read(
        &state.media_dir,
        &name,
    )?))
}

#[tauri::command]
pub fn media_remove(state: State<'_, AppState>, name: String) -> AppResult<()> {
    media::remove(&state.media_dir, &name)
}
