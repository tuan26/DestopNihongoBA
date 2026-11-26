//! Locate the user's own N1 data file (`n1_data.json`) on this computer so it can be imported automatically.
//! Read-only: only the file name/size/mtime is inspected here; content is read later via `read_text_file`.

use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant, UNIX_EPOCH};
use tauri::Manager;

const TARGET: &str = "n1_data.json";
const MAX_DEPTH: usize = 7;
const MAX_ENTRIES: usize = 200_000;
const TIME_BUDGET: Duration = Duration::from_secs(4);
const SKIP: &[&str] = &[
    "node_modules", ".git", "AppData", "Library", "$Recycle.Bin", "Windows", "Program Files", "Program Files (x86)",
    ".cache", ".npm", ".cargo", ".rustup", "target", "venv", ".venv", "__pycache__", "OneDrive - Personal",
];

fn mtime(p: &Path) -> u64 {
    std::fs::metadata(p)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn walk(dir: &Path, depth: usize, found: &mut Vec<PathBuf>, seen: &mut usize, start: Instant) {
    if depth > MAX_DEPTH || *seen > MAX_ENTRIES || start.elapsed() > TIME_BUDGET {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        *seen += 1;
        let name = e.file_name().to_string_lossy().to_string();
        let Ok(ft) = e.file_type() else { continue };
        if ft.is_symlink() {
            continue;
        }
        if ft.is_dir() {
            if !SKIP.iter().any(|s| s.eq_ignore_ascii_case(&name)) && !name.starts_with('.') {
                walk(&e.path(), depth + 1, found, seen, start);
            }
        } else if name.eq_ignore_ascii_case(TARGET) {
            found.push(e.path());
        }
    }
}

/// Search the user's home folder (Desktop, Documents, Downloads, projects…) for `n1_data.json`.
/// Largest file first (the crawler's enriched copy), then newest.
#[tauri::command]
pub async fn find_n1_data(app: tauri::AppHandle) -> Result<Vec<Value>, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let start = Instant::now();
    let mut found = Vec::new();
    let mut seen = 0usize;
    walk(&home, 0, &mut found, &mut seen, start);
    let mut out: Vec<(u64, u64, String)> = found
        .iter()
        .filter_map(|p| std::fs::metadata(p).ok().map(|m| (m.len(), mtime(p), p.to_string_lossy().to_string())))
        .filter(|(size, _, _)| *size > 1024)
        .collect();
    out.sort_by(|a, b| b.0.cmp(&a.0).then(b.1.cmp(&a.1)));
    Ok(out.into_iter().map(|(size, modified, path)| json!({ "path": path, "size": size, "modified": modified })).collect())
}

/// Modification time (unix seconds) of a previously imported file, or null if it no longer exists.
#[tauri::command]
pub fn file_modified(path: String) -> Option<u64> {
    let p = PathBuf::from(path);
    p.is_file().then(|| mtime(&p))
}

/// Read a previously chosen/located N1 JSON file.
#[tauri::command]
pub async fn read_n1_file(path: String) -> Result<String, String> {
    let lower = path.to_lowercase();
    if !lower.ends_with(".json") {
        return Err("Chỉ hỗ trợ file .json".into());
    }
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 150 * 1024 * 1024 {
        return Err("File quá lớn (tối đa 150 MB)".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
