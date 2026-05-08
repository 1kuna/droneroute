use std::{
    fs,
    net::TcpListener,
    path::{Path, PathBuf},
    sync::Mutex,
};

use tauri::{Manager, State};
use tauri_plugin_shell::{process::CommandChild, process::CommandEvent, ShellExt};

struct DesktopState {
    api_base: Mutex<Option<String>>,
    backend: Mutex<Option<CommandChild>>,
}

impl Default for DesktopState {
    fn default() -> Self {
        Self {
            api_base: Mutex::new(None),
            backend: Mutex::new(None),
        }
    }
}

#[tauri::command]
fn desktop_api_base(state: State<'_, DesktopState>) -> Result<String, String> {
    state
        .api_base
        .lock()
        .map_err(|_| "Could not read desktop backend state".to_string())?
        .clone()
        .ok_or_else(|| "Desktop backend is not ready".to_string())
}

fn reserve_port() -> Result<u16, String> {
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|err| format!("Could not reserve local backend port: {err}"))?;
    let port = listener
        .local_addr()
        .map_err(|err| format!("Could not read local backend port: {err}"))?
        .port();
    drop(listener);
    Ok(port)
}

fn backend_entry(app: &tauri::App) -> Result<PathBuf, String> {
    if cfg!(debug_assertions) {
        if let Ok(path) = std::env::var("DRONEROUTE_DESKTOP_BACKEND_ENTRY") {
            return Ok(PathBuf::from(path));
        }

        return Ok(Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("resources")
            .join("backend")
            .join("dist")
            .join("index.js"));
    }

    Ok(app
        .path()
        .resource_dir()
        .map_err(|err| format!("Could not locate desktop resources: {err}"))?
        .join("resources")
        .join("backend")
        .join("dist")
        .join("index.js"))
}

fn backend_root(entry: &Path) -> Result<PathBuf, String> {
    entry
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or_else(|| "Could not determine backend runtime directory".to_string())
}

fn start_backend(app: &mut tauri::App) -> Result<(), String> {
    let port = reserve_port()?;
    let api_base = format!("http://127.0.0.1:{port}/api");
    let entry = backend_entry(app)?;
    let runtime_root = backend_root(&entry)?;

    if !entry.exists() {
        return Err(format!(
            "Backend entrypoint is missing at {}. Run `npm run prepare:backend -w packages/desktop`.",
            entry.display()
        ));
    }

    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| format!("Could not locate app data directory: {err}"))?;
    fs::create_dir_all(&app_data_dir)
        .map_err(|err| format!("Could not create app data directory: {err}"))?;
    let db_path = app_data_dir.join("genmap.db");

    let command = app
        .shell()
        .sidecar("node")
        .map_err(|err| format!("Could not prepare Node sidecar: {err}"))?
        .arg(entry.to_string_lossy().to_string())
        .env("PORT", port.to_string())
        .env("DB_PATH", db_path.to_string_lossy().to_string())
        .env("JWT_SECRET", "droneroute-desktop-local-jwt-secret")
        .env("SELF_HOSTED", "true")
        .env("DRONEROUTE_DESKTOP", "true")
        .env("NODE_ENV", "production")
        .env("PWD", runtime_root.to_string_lossy().to_string());

    let (mut rx, child) = command
        .spawn()
        .map_err(|err| format!("Could not start local DroneRoute backend: {err}"))?;

    let state = app.state::<DesktopState>();
    *state
        .api_base
        .lock()
        .map_err(|_| "Could not store desktop API URL".to_string())? = Some(api_base);
    *state
        .backend
        .lock()
        .map_err(|_| "Could not store desktop backend process".to_string())? = Some(child);

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    println!("[backend] {}", String::from_utf8_lossy(&bytes).trim());
                }
                CommandEvent::Stderr(bytes) => {
                    eprintln!("[backend] {}", String::from_utf8_lossy(&bytes).trim());
                }
                CommandEvent::Error(error) => {
                    eprintln!("[backend] {error}");
                }
                CommandEvent::Terminated(status) => {
                    println!("[backend] terminated: {status:?}");
                    break;
                }
                _ => {}
            }
        }
    });

    Ok(())
}

fn stop_backend(app: &tauri::AppHandle) {
    let state = app.state::<DesktopState>();
    if let Ok(mut backend) = state.backend.lock() {
        if let Some(child) = backend.take() {
            let _ = child.kill();
        }
    };
}

fn main() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![desktop_api_base])
        .setup(|app| {
            start_backend(app)?;
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("failed to build DroneRoute desktop app");

    let app_handle = app.handle().clone();
    app.run(move |_handle, event| {
        if let tauri::RunEvent::Exit { .. } = event {
            stop_backend(&app_handle);
        }
    });
}
