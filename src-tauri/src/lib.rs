mod ai;
mod db;
mod windows;

use tauri::{Manager, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            windows::show_main_window(app);
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let database = db::Db::open(&handle).map_err(Box::<dyn std::error::Error>::from)?;
            app.manage(database);
            windows::setup_tray(&handle)?;
            let minimized = std::env::args().any(|a| a == "--minimized");
            if !minimized {
                windows::show_main_window(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing either window only hides it: the app keeps running in the tray.
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
                if window.label() == windows::CARD {
                    let _ = tauri::Emitter::emit(window.app_handle(), "card://visibility", serde_json::json!({ "visible": false }));
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            db::db_execute,
            db::db_select,
            db::db_batch,
            db::backup_database,
            db::list_backups,
            db::restore_backup,
            db::db_path,
            db::save_file,
            db::read_file,
            windows::show_card,
            windows::hide_card,
            windows::toggle_card,
            windows::card_visible,
            windows::show_main,
            windows::reset_card_position,
            windows::apply_card_bounds,
            ai::ai_status,
            ai::set_ai_key,
            ai::ai_generate,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
