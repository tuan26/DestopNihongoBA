//! AI provider calls. API keys never reach the WebView: they come from environment variables
//! (ANTHROPIC_API_KEY / OPENAI_API_KEY) or from `ai-keys.json` in the per-user app config dir.

use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

fn keys_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("ai-keys.json"))
}

fn read_keys(app: &tauri::AppHandle) -> HashMap<String, String> {
    keys_file(app)
        .ok()
        .and_then(|p| std::fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn env_name(provider: &str) -> Option<&'static str> {
    match provider {
        "anthropic" => Some("ANTHROPIC_API_KEY"),
        "openai" => Some("OPENAI_API_KEY"),
        _ => None,
    }
}

fn get_key(app: &tauri::AppHandle, provider: &str) -> Option<String> {
    if let Some(var) = env_name(provider) {
        if let Ok(v) = std::env::var(var) {
            if !v.trim().is_empty() {
                return Some(v.trim().to_string());
            }
        }
    }
    read_keys(app).get(provider).cloned().filter(|k| !k.is_empty())
}

#[tauri::command]
pub fn ai_status(app: tauri::AppHandle) -> Value {
    let env = |p: &str| env_name(p).map(|v| std::env::var(v).map(|s| !s.is_empty()).unwrap_or(false)).unwrap_or(false);
    json!({
        "anthropic": get_key(&app, "anthropic").is_some(),
        "openai": get_key(&app, "openai").is_some(),
        "anthropicFromEnv": env("anthropic"),
        "openaiFromEnv": env("openai"),
    })
}

#[tauri::command]
pub fn set_ai_key(app: tauri::AppHandle, provider: String, key: Option<String>) -> Result<(), String> {
    if env_name(&provider).is_none() {
        return Err("Provider không hợp lệ".into());
    }
    let mut keys = read_keys(&app);
    match key.map(|k| k.trim().to_string()).filter(|k| !k.is_empty()) {
        Some(k) => {
            keys.insert(provider, k);
        }
        None => {
            keys.remove(&provider);
        }
    }
    let path = keys_file(&app)?;
    std::fs::write(&path, serde_json::to_string_pretty(&keys).map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    provider: String,
    model: String,
    system: String,
    prompt: String,
    max_tokens: Option<u32>,
}

#[tauri::command]
pub async fn ai_generate(app: tauri::AppHandle, req: GenerateRequest) -> Result<String, String> {
    let key = get_key(&app, &req.provider).ok_or_else(|| "Chưa cấu hình API key cho provider này".to_string())?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|e| e.to_string())?;
    let max_tokens = req.max_tokens.unwrap_or(8000).min(32000);
    let (url, body, headers): (&str, Value, Vec<(&str, String)>) = match req.provider.as_str() {
        "anthropic" => (
            "https://api.anthropic.com/v1/messages",
            json!({
                "model": req.model,
                "max_tokens": max_tokens,
                "system": req.system,
                "messages": [{ "role": "user", "content": req.prompt }]
            }),
            vec![("x-api-key", key), ("anthropic-version", "2023-06-01".to_string())],
        ),
        "openai" => (
            "https://api.openai.com/v1/chat/completions",
            json!({
                "model": req.model,
                "max_tokens": max_tokens,
                "messages": [
                    { "role": "system", "content": req.system },
                    { "role": "user", "content": req.prompt }
                ]
            }),
            vec![("authorization", format!("Bearer {key}"))],
        ),
        _ => return Err("Provider không hợp lệ".into()),
    };
    let mut rb = client.post(url).json(&body);
    for (k, v) in headers {
        rb = rb.header(k, v);
    }
    let resp = rb.send().await.map_err(|e| format!("Lỗi kết nối: {e}"))?;
    let status = resp.status();
    let v: Value = resp.json().await.map_err(|e| format!("Phản hồi không hợp lệ: {e}"))?;
    if !status.is_success() {
        let msg = v["error"]["message"].as_str().unwrap_or("unknown error");
        return Err(format!("API lỗi {}: {}", status.as_u16(), msg));
    }
    let text = match req.provider.as_str() {
        "anthropic" => v["content"]
            .as_array()
            .map(|blocks| {
                blocks
                    .iter()
                    .filter_map(|b| b["text"].as_str())
                    .collect::<Vec<_>>()
                    .join("")
            })
            .unwrap_or_default(),
        _ => v["choices"][0]["message"]["content"].as_str().unwrap_or_default().to_string(),
    };
    if text.is_empty() {
        return Err("AI không trả về nội dung".into());
    }
    Ok(text)
}
