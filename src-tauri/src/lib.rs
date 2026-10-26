mod commands;
mod db;
mod error;
mod models;
mod storage;
mod text;

use tauri::Manager;

use crate::storage::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let state = AppState::new(app.handle())?;
            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::create_note,
            commands::get_note,
            commands::save_note,
            commands::set_favorite,
            commands::trash_note,
            commands::restore_note,
            commands::purge_note,
            commands::empty_trash,
            commands::search_notes,
            commands::save_draft,
            commands::get_draft,
            commands::discard_draft,
            commands::list_drafts,
            commands::list_snapshots,
            commands::read_snapshot,
            commands::restore_snapshot,
            commands::check_external_changes,
            commands::refresh_notes,
            commands::update_settings,
            commands::import_paths,
            commands::export_note_to,
            commands::export_all_to,
            commands::open_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running InkNote");
}
