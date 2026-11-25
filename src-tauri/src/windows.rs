//! Main window / floating card management and the system tray.

use serde::Deserialize;
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, PhysicalPosition, PhysicalSize, WebviewWindow,
};

pub const MAIN: &str = "main";
pub const CARD: &str = "card";

fn card(app: &AppHandle) -> Result<WebviewWindow, String> {
    app.get_webview_window(CARD).ok_or_else(|| "card window not found".to_string())
}

/// Show a window WITHOUT activating it, so the application the user is typing in keeps keyboard focus.
#[cfg(windows)]
fn show_no_activate(w: &WebviewWindow) -> Result<(), String> {
    use raw_window_handle::{HasWindowHandle, RawWindowHandle};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, ShowWindow, HWND_TOPMOST, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SW_SHOWNOACTIVATE,
    };
    let handle = w.window_handle().map_err(|e| e.to_string())?;
    if let RawWindowHandle::Win32(h) = handle.as_raw() {
        let hwnd = h.hwnd.get() as windows_sys::Win32::Foundation::HWND;
        unsafe {
            ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0, SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
        }
        Ok(())
    } else {
        w.show().map_err(|e| e.to_string())
    }
}

#[cfg(not(windows))]
fn show_no_activate(w: &WebviewWindow) -> Result<(), String> {
    w.show().map_err(|e| e.to_string())?;
    w.set_always_on_top(true).map_err(|e| e.to_string())
}

pub fn set_card_visible(app: &AppHandle, visible: bool) -> Result<bool, String> {
    let w = card(app)?;
    if visible {
        show_no_activate(&w)?;
    } else {
        w.hide().map_err(|e| e.to_string())?;
    }
    let _ = app.emit("card://visibility", serde_json::json!({ "visible": visible }));
    Ok(visible)
}

#[tauri::command]
pub fn show_card(app: AppHandle) -> Result<bool, String> {
    set_card_visible(&app, true)
}

#[tauri::command]
pub fn hide_card(app: AppHandle) -> Result<bool, String> {
    set_card_visible(&app, false)
}

#[tauri::command]
pub fn toggle_card(app: AppHandle) -> Result<bool, String> {
    let visible = card(&app)?.is_visible().unwrap_or(false);
    set_card_visible(&app, !visible)
}

#[tauri::command]
pub fn card_visible(app: AppHandle) -> bool {
    card(&app).and_then(|w| w.is_visible().map_err(|e| e.to_string())).unwrap_or(false)
}

pub fn show_main_window(app: &AppHandle) {
    if let Some(w) = app.get_webview_window(MAIN) {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

#[tauri::command]
pub fn show_main(app: AppHandle, route: Option<String>) {
    show_main_window(&app);
    if let Some(r) = route {
        let _ = app.emit_to(MAIN, "main://navigate", serde_json::json!({ "route": r }));
    }
}

#[derive(Deserialize)]
pub struct Bounds {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

fn corner_position(w: &WebviewWindow, corner: &str) -> Result<PhysicalPosition<i32>, String> {
    let monitor = w
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or(w.primary_monitor().map_err(|e| e.to_string())?)
        .ok_or_else(|| "no monitor".to_string())?;
    let area = monitor.work_area();
    // A window that has not been mapped yet can report 0×0; fall back to inner size, then to the configured default.
    let mut size = w.outer_size().map_err(|e| e.to_string())?;
    if size.width == 0 || size.height == 0 {
        size = w.inner_size().map_err(|e| e.to_string())?;
    }
    if size.width == 0 || size.height == 0 {
        let s = monitor.scale_factor();
        size = PhysicalSize::new((360.0 * s) as u32, (210.0 * s) as u32);
    }
    let margin = (16.0 * monitor.scale_factor()) as i32;
    let left = area.position.x + margin;
    let top = area.position.y + margin;
    let right = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let bottom = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    Ok(match corner {
        "top-left" => PhysicalPosition::new(left, top),
        "top-right" => PhysicalPosition::new(right, top),
        "bottom-left" => PhysicalPosition::new(left, bottom),
        _ => PhysicalPosition::new(right, bottom),
    })
}

#[tauri::command]
pub fn reset_card_position(app: AppHandle, corner: String) -> Result<(), String> {
    let w = card(&app)?;
    let pos = corner_position(&w, &corner)?;
    w.set_position(pos).map_err(|e| e.to_string())
}

/// Restore saved bounds; if they are no longer on any monitor (display unplugged), fall back to a corner.
#[tauri::command]
pub fn apply_card_bounds(app: AppHandle, bounds: Option<Bounds>, corner: String) -> Result<(), String> {
    let w = card(&app)?;
    if let Some(b) = bounds {
        let width = b.width.clamp(150, 1600);
        let height = b.height.clamp(56, 1200);
        let monitors = w.available_monitors().map_err(|e| e.to_string())?;
        let visible = monitors.iter().any(|m| {
            let p = m.position();
            let s = m.size();
            let cx = b.x + (width as i32) / 2;
            let cy = b.y + 20;
            cx >= p.x && cx < p.x + s.width as i32 && cy >= p.y && cy < p.y + s.height as i32
        });
        w.set_size(PhysicalSize::new(width, height)).map_err(|e| e.to_string())?;
        if visible {
            return w.set_position(PhysicalPosition::new(b.x, b.y)).map_err(|e| e.to_string());
        }
    }
    reset_card_position(app, corner)
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Mở ứng dụng", true, None::<&str>)?;
    let toggle = MenuItem::with_id(app, "toggle_card", "Ẩn / Hiện card", true, None::<&str>)?;
    let study = MenuItem::with_id(app, "study", "Quick 5", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Thoát", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &toggle, &study, &sep, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main-tray")
        .tooltip("Japanese BA Vocabulary")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main_window(app),
            "toggle_card" => {
                let _ = toggle_card(app.clone());
            }
            "study" => show_main(app.clone(), Some("/study/quick5".into())),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main_window(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}
