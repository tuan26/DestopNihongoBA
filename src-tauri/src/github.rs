//! Download the user's own N1 data file from THEIR private GitHub repository, using THEIR token.
//! The token lives in `n1-github.json` in the per-user app config dir (never in the DB or the WebView).
//! The file is saved to `<app data>/n1/n1_data.json`; an ETag is kept so unchanged files are not re-downloaded.

use serde::Deserialize;
use serde_json::{json, Value};
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

#[derive(serde::Serialize, Deserialize, Default)]
struct Store {
    token: Option<String>,
    etag: Option<String>,
    source: Option<String>,
}

fn store_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("n1-github.json"))
}

fn load(app: &tauri::AppHandle) -> Store {
    store_path(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app: &tauri::AppHandle, s: &Store) -> Result<(), String> {
    std::fs::write(store_path(app)?, serde_json::to_string_pretty(s).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

fn local_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("n1");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("n1_data.json"))
}

fn valid_part(s: &str) -> bool {
    !s.is_empty() && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_./".contains(c)) && !s.contains("..")
}

#[tauri::command]
pub fn n1_github_status(app: tauri::AppHandle) -> Value {
    let s = load(&app);
    json!({ "hasToken": s.token.as_deref().map(|t| !t.is_empty()).unwrap_or(false), "source": s.source })
}

#[tauri::command]
pub fn set_n1_github_token(app: tauri::AppHandle, token: Option<String>) -> Result<(), String> {
    let mut s = load(&app);
    s.token = token.map(|t| t.trim().to_string()).filter(|t| !t.is_empty());
    s.etag = None;
    save(&app, &s)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadReq {
    repo: String,
    path: String,
    branch: Option<String>,
    force: Option<bool>,
}

/// Returns `{ path, changed, size }`. `changed: false` when GitHub answered 304 (same ETag) and the local copy exists.
#[tauri::command]
pub async fn download_n1_from_github(app: tauri::AppHandle, req: DownloadReq) -> Result<Value, String> {
    let repo = req.repo.trim().trim_matches('/').to_string();
    let path = req.path.trim().trim_matches('/').to_string();
    if repo.split('/').count() != 2 || !valid_part(&repo) || !valid_part(&path) {
        return Err("Repo phải có dạng owner/tên-repo và đường dẫn file hợp lệ".into());
    }
    let mut store = load(&app);
    let token = store.token.clone().ok_or_else(|| "Chưa nhập GitHub token".to_string())?;
    let dest = local_file(&app)?;
    let source = format!("{repo}/{path}@{}", req.branch.clone().unwrap_or_default());
    if store.source.as_deref() != Some(&source) {
        store.etag = None;
    }
    let mut url = format!("https://api.github.com/repos/{repo}/contents/{path}");
    if let Some(b) = req.branch.as_ref().filter(|b| !b.trim().is_empty()) {
        if !valid_part(b) {
            return Err("Tên branch không hợp lệ".into());
        }
        url.push_str(&format!("?ref={}", b.trim()));
    }
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .user_agent("japanese-ba-vocab")
        .build()
        .map_err(|e| e.to_string())?;
    let mut rb = client
        .get(&url)
        .header("Accept", "application/vnd.github.raw+json")
        .header("Authorization", format!("Bearer {token}"))
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let (Some(etag), false, true) = (store.etag.as_ref(), req.force.unwrap_or(false), dest.is_file()) {
        rb = rb.header("If-None-Match", etag);
    }
    let resp = rb.send().await.map_err(|e| format!("Không kết nối được GitHub: {e}"))?;
    let status = resp.status();
    if status.as_u16() == 304 {
        return Ok(json!({ "path": dest.to_string_lossy(), "changed": false, "size": std::fs::metadata(&dest).map(|m| m.len()).unwrap_or(0) }));
    }
    if !status.is_success() {
        let hint = match status.as_u16() {
            401 => "Token sai hoặc đã hết hạn",
            403 => "Token không có quyền đọc repo này (cần quyền Contents: Read-only) hoặc bị giới hạn tốc độ",
            404 => "Không thấy repo hoặc file (kiểm tra tên repo, đường dẫn, branch và quyền của token)",
            _ => "Lỗi từ GitHub",
        };
        return Err(format!("GitHub {}: {hint}", status.as_u16()));
    }
    let etag = resp.headers().get("etag").and_then(|v| v.to_str().ok()).map(|s| s.to_string());
    let bytes = resp.bytes().await.map_err(|e| format!("Tải file thất bại: {e}"))?;
    if bytes.len() > 150 * 1024 * 1024 {
        return Err("File quá lớn (tối đa 150 MB)".into());
    }
    // write atomically so an interrupted download never leaves a half file behind
    let tmp = dest.with_extension("json.part");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())?;
    store.etag = etag;
    store.source = Some(source);
    save(&app, &store)?;
    Ok(json!({ "path": dest.to_string_lossy(), "changed": true, "size": bytes.len() }))
}
