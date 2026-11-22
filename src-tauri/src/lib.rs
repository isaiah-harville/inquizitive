mod commands;
pub mod database;
pub mod error;
pub mod media;

use std::sync::Mutex;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            let data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_dir)?;
            let db_path = data_dir.join("inquizitive.db");
            let conn = database::open(&db_path)?;
            app.manage(commands::AppState {
                db: Mutex::new(conn),
                db_path,
                media_dir: data_dir.join("media"),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::db_select,
            commands::db_execute,
            commands::db_batch,
            commands::app_info,
            commands::media_write,
            commands::media_read,
            commands::media_remove,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Inquizitive");
}
