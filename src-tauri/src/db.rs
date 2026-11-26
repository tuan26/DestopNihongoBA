//! SQLite access for the frontend (single connection, serialized across windows).
//!
//! A transaction started by one window (BEGIN) gives that window exclusive use of the connection
//! until COMMIT/ROLLBACK, so statements from the other window never interleave inside it.

use rusqlite::{types::ValueRef, Connection, ToSql};
use serde::Deserialize;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use std::sync::{Condvar, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{Manager, State, WebviewWindow};

pub struct DbInner {
    pub conn: Option<Connection>,
    pub tx_owner: Option<String>,
}

pub struct Db {
    pub inner: Mutex<DbInner>,
    pub cv: Condvar,
    pub path: PathBuf,
    pub backup_dir: PathBuf,
}

const MAX_BACKUPS: usize = 10;
const TX_WAIT: Duration = Duration::from_secs(15);

pub fn open_connection(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.busy_timeout(Duration::from_secs(5))?;
    conn.execute_batch("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;")?;
    Ok(conn)
}

impl Db {
    pub fn open(app: &tauri::AppHandle) -> Result<Self, String> {
        let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let path = dir.join("vocab.db");
        let backup_dir = dir.join("backups");
        let conn = open_connection(&path).map_err(|e| e.to_string())?;
        Ok(Db {
            inner: Mutex::new(DbInner { conn: Some(conn), tx_owner: None }),
            cv: Condvar::new(),
            path,
            backup_dir,
        })
    }

    /// Run `f` with the connection, waiting while another window owns an open transaction.
    fn with_conn<T>(
        &self,
        caller: &str,
        f: impl FnOnce(&Connection, &mut Option<String>) -> Result<T, String>,
    ) -> Result<T, String> {
        let mut guard = self.inner.lock().map_err(|_| "DB lock poisoned".to_string())?;
        loop {
            match &guard.tx_owner {
                Some(owner) if owner != caller => {
                    let (g, timeout) = self.cv.wait_timeout(guard, TX_WAIT).map_err(|_| "DB lock poisoned".to_string())?;
                    guard = g;
                    if timeout.timed_out() {
                        // The owner vanished mid-transaction (e.g. window closed): roll it back.
                        if let Some(c) = guard.conn.as_ref() {
                            let _ = c.execute_batch("ROLLBACK");
                        }
                        guard.tx_owner = None;
                    }
                }
                _ => break,
            }
        }
        let inner = &mut *guard;
        let conn = inner.conn.as_ref().ok_or_else(|| "Database is closed".to_string())?;
        let r = f(conn, &mut inner.tx_owner);
        self.cv.notify_all();
        r
    }
}

fn to_sql_values(params: &[Value]) -> Vec<Box<dyn ToSql>> {
    params
        .iter()
        .map(|v| -> Box<dyn ToSql> {
            match v {
                Value::Null => Box::new(rusqlite::types::Null),
                Value::Bool(b) => Box::new(if *b { 1i64 } else { 0i64 }),
                Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        Box::new(i)
                    } else {
                        Box::new(n.as_f64().unwrap_or(0.0))
                    }
                }
                Value::String(s) => Box::new(s.clone()),
                other => Box::new(other.to_string()),
            }
        })
        .collect()
}

fn exec_one(conn: &Connection, sql: &str, params: &[Value], tx_owner: &mut Option<String>, caller: &str) -> Result<Value, String> {
    let head = sql.trim_start().to_ascii_uppercase();
    let p = to_sql_values(params);
    let refs: Vec<&dyn ToSql> = p.iter().map(|b| b.as_ref()).collect();
    let n = conn.execute(sql, refs.as_slice()).map_err(|e| e.to_string())?;
    if head.starts_with("BEGIN") {
        *tx_owner = Some(caller.to_string());
    } else if head.starts_with("COMMIT") || head.starts_with("ROLLBACK") || head.starts_with("END") {
        *tx_owner = None;
    }
    Ok(serde_json::json!({ "rowsAffected": n, "lastInsertId": conn.last_insert_rowid() }))
}

#[tauri::command]
pub async fn db_execute(window: WebviewWindow, db: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<Value, String> {
    let caller = window.label().to_string();
    db.with_conn(&caller, |conn, owner| exec_one(conn, &sql, &params, owner, &caller))
}

#[tauri::command]
pub async fn db_select(window: WebviewWindow, db: State<'_, Db>, sql: String, params: Vec<Value>) -> Result<Vec<Map<String, Value>>, String> {
    let caller = window.label().to_string();
    db.with_conn(&caller, |conn, _| {
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
        let p = to_sql_values(&params);
        let refs: Vec<&dyn ToSql> = p.iter().map(|b| b.as_ref()).collect();
        let mut rows = stmt.query(refs.as_slice()).map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        while let Some(row) = rows.next().map_err(|e| e.to_string())? {
            let mut m = Map::new();
            for (i, name) in names.iter().enumerate() {
                let v = match row.get_ref(i).map_err(|e| e.to_string())? {
                    ValueRef::Null => Value::Null,
                    ValueRef::Integer(n) => Value::from(n),
                    ValueRef::Real(f) => Value::from(f),
                    ValueRef::Text(t) => Value::from(String::from_utf8_lossy(t).to_string()),
                    ValueRef::Blob(_) => Value::Null,
                };
                m.insert(name.clone(), v);
            }
            out.push(m);
        }
        Ok(out)
    })
}

#[derive(Deserialize)]
pub struct Stmt {
    sql: String,
    #[serde(default)]
    params: Vec<Value>,
}

/// Execute many statements atomically in one IPC round-trip.
#[tauri::command]
pub async fn db_batch(window: WebviewWindow, db: State<'_, Db>, statements: Vec<Stmt>) -> Result<(), String> {
    let caller = window.label().to_string();
    db.with_conn(&caller, |conn, owner| {
        let nested = owner.is_some();
        if !nested {
            conn.execute_batch("BEGIN IMMEDIATE").map_err(|e| e.to_string())?;
        }
        for s in &statements {
            let p = to_sql_values(&s.params);
            let refs: Vec<&dyn ToSql> = p.iter().map(|b| b.as_ref()).collect();
            if let Err(e) = conn.execute(&s.sql, refs.as_slice()) {
                if !nested {
                    let _ = conn.execute_batch("ROLLBACK");
                }
                return Err(format!("{e} — SQL: {}", s.sql.chars().take(120).collect::<String>()));
            }
        }
        if !nested {
            conn.execute_batch("COMMIT").map_err(|e| e.to_string())?;
        }
        Ok(())
    })
}

fn timestamp() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn sanitize(reason: &str) -> String {
    reason.chars().filter(|c| c.is_ascii_alphanumeric() || *c == '-').take(32).collect()
}

/// Snapshot the live DB with `VACUUM INTO` (consistent even while open). Keeps the newest MAX_BACKUPS files.
pub fn backup_now(db: &Db, reason: &str) -> Result<Option<String>, String> {
    std::fs::create_dir_all(&db.backup_dir).map_err(|e| e.to_string())?;
    let target = db.backup_dir.join(format!("vocab-{}-{}.db", timestamp(), sanitize(reason)));
    let guard = db.inner.lock().map_err(|_| "DB lock poisoned".to_string())?;
    let conn = match guard.conn.as_ref() {
        Some(c) => c,
        None => return Ok(None),
    };
    let tables: i64 = conn
        .query_row("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    if tables == 0 {
        return Ok(None);
    }
    conn.execute("VACUUM INTO ?1", [target.to_string_lossy().to_string()]).map_err(|e| e.to_string())?;
    drop(guard);
    prune_backups(&db.backup_dir);
    Ok(Some(target.to_string_lossy().to_string()))
}

fn prune_backups(dir: &Path) {
    if let Ok(entries) = std::fs::read_dir(dir) {
        let mut files: Vec<_> = entries
            .filter_map(|e| e.ok())
            .filter(|e| e.file_name().to_string_lossy().ends_with(".db"))
            .collect();
        files.sort_by_key(|e| e.metadata().and_then(|m| m.modified()).ok());
        while files.len() > MAX_BACKUPS {
            let f = files.remove(0);
            let _ = std::fs::remove_file(f.path());
        }
    }
}

#[tauri::command]
pub async fn backup_database(db: State<'_, Db>, reason: String) -> Result<Option<String>, String> {
    backup_now(&db, &reason)
}

#[tauri::command]
pub async fn list_backups(db: State<'_, Db>) -> Result<Vec<Value>, String> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&db.backup_dir) {
        for e in entries.filter_map(|e| e.ok()) {
            let name = e.file_name().to_string_lossy().to_string();
            if !name.ends_with(".db") {
                continue;
            }
            let meta = e.metadata().map_err(|e| e.to_string())?;
            let modified = meta
                .modified()
                .ok()
                .and_then(|m| m.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_secs())
                .unwrap_or(0);
            out.push(serde_json::json!({ "path": e.path().to_string_lossy(), "name": name, "size": meta.len(), "modified": modified }));
        }
    }
    out.sort_by(|a, b| b["modified"].as_u64().cmp(&a["modified"].as_u64()));
    Ok(out)
}

/// Replace the live DB with a backup file (only files inside the backups directory are accepted).
#[tauri::command]
pub async fn restore_backup(app: tauri::AppHandle, db: State<'_, Db>, path: String) -> Result<(), String> {
    let src = PathBuf::from(&path);
    let canon_dir = std::fs::canonicalize(&db.backup_dir).map_err(|e| e.to_string())?;
    let canon_src = std::fs::canonicalize(&src).map_err(|e| e.to_string())?;
    if !canon_src.starts_with(&canon_dir) {
        return Err("Chỉ được khôi phục từ thư mục backups của ứng dụng".into());
    }
    backup_now(&db, "before-restore")?;
    {
        let mut guard = db.inner.lock().map_err(|_| "DB lock poisoned".to_string())?;
        guard.conn = None; // close
        for ext in ["-wal", "-shm"] {
            let _ = std::fs::remove_file(PathBuf::from(format!("{}{}", db.path.to_string_lossy(), ext)));
        }
        std::fs::copy(&canon_src, &db.path).map_err(|e| e.to_string())?;
        guard.conn = Some(open_connection(&db.path).map_err(|e| e.to_string())?);
        guard.tx_owner = None;
    }
    app.restart();
}

#[tauri::command]
pub fn db_path(db: State<'_, Db>) -> String {
    db.path.to_string_lossy().to_string()
}

fn check_ext(path: &str, exts: &[&str]) -> Result<(), String> {
    let lower = path.to_lowercase();
    if exts.iter().any(|e| lower.ends_with(e)) {
        Ok(())
    } else {
        Err(format!("Chỉ hỗ trợ file {}", exts.join(", ")))
    }
}

/// Write a user-chosen export file (path comes from the native save dialog).
#[tauri::command]
pub async fn save_file(path: String, bytes: Vec<u8>) -> Result<(), String> {
    check_ext(&path, &[".xlsx", ".csv", ".json"])?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())
}

/// Read a user-chosen import file (path comes from the native open dialog).
#[tauri::command]
pub async fn read_file(path: String) -> Result<Vec<u8>, String> {
    check_ext(&path, &[".xlsx"])?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 30 * 1024 * 1024 {
        return Err("File quá lớn (tối đa 30 MB)".into());
    }
    std::fs::read(&path).map_err(|e| e.to_string())
}

/// Read a user-chosen JSON file (N1 deck import). Returned as a string to avoid huge byte arrays over IPC.
#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    check_ext(&path, &[".json"])?;
    let meta = std::fs::metadata(&path).map_err(|e| e.to_string())?;
    if meta.len() > 150 * 1024 * 1024 {
        return Err("File quá lớn (tối đa 150 MB)".into());
    }
    std::fs::read_to_string(&path).map_err(|e| e.to_string())
}
