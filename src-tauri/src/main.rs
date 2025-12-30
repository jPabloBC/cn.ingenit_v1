// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Child, Command, Stdio};
use std::io::Write;
use std::sync::Mutex;
use std::env;
use std::path::PathBuf;
use std::io::{BufRead, BufReader};
use std::thread;
use tauri::State;
use tauri::Manager;
// use chrono for timestamped temp files
use chrono::Utc;
#[cfg(unix)]
use std::os::unix::process::CommandExt;

struct AutomationProcess(Mutex<Option<Child>>);

#[tauri::command]
fn start_automation(
    app: tauri::AppHandle,
    csv_arg: String,
    process_state: State<AutomationProcess>,
) -> Result<String, String> {
    let mut process = process_state.0.lock().unwrap();

    // Stop any existing process
    if let Some(ref mut child) = *process {
        let _ = child.kill();
    }

    // Build absolute path to automation/index.js (project root is parent of src-tauri)
    let cwd = env::current_dir().map_err(|e| format!("cwd error: {}", e))?;
    let project_root = cwd.parent().map(|p| p.to_path_buf()).unwrap_or(cwd.clone());
    let script_path: PathBuf = project_root.join("automation").join("index.js");
    let script_str = script_path.to_string_lossy().to_string();

    // Determine if `csv_arg` is empty, a path to existing file, or raw CSV content.
    let csv_path_to_use: String = if csv_arg.trim().is_empty() {
        // Empty -> indicate manual mode by passing empty string
        "".to_string()
    } else if PathBuf::from(&csv_arg).exists() {
        csv_arg.clone()
    } else {
        // Treat as content: write to a temp file
        let mut tmp = env::temp_dir();
        let fname = format!("form-automation-{}.csv", chrono::Utc::now().timestamp_millis());
        tmp.push(&fname);
        let tmp_path_str = tmp.to_string_lossy().to_string();
        match std::fs::write(&tmp, csv_arg.as_bytes()) {
            Ok(_) => tmp_path_str,
            Err(e) => return Err(format!("Failed to write temp CSV: {}", e)),
        }
    };

    // Prepare command: prefer bundled node on Windows if present, otherwise use system `node`
    let mut cmd = if cfg!(target_family = "windows") {
        // Look for automation/node-windows/node.exe next to project root
        let bundled = project_root.join("automation").join("node-windows").join("node.exe");
        if bundled.exists() {
            Command::new(bundled)
        } else {
            Command::new("node")
        }
    } else {
        Command::new("node")
    };

    cmd.arg(script_str).arg(&csv_path_to_use)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());

    // On Unix, create new process group so we can kill the whole group later
    #[cfg(unix)]
    {
        cmd.before_exec(|| {
            // setpgid(0,0) -> put child in new process group
            unsafe { libc::setpgid(0, 0); }
            Ok(())
        });
    }

    // Ensure Playwright looks for browsers in the bundled location when available
    let bundled_playwright = project_root.join("automation").join(".playwright");
    if bundled_playwright.exists() {
        cmd.env("PLAYWRIGHT_BROWSERS_PATH", bundled_playwright.clone());
    }

    match cmd.spawn() {
        Ok(mut child) => {
            // If stdout is available, spawn a thread to stream logs to the frontend
            if let Some(stdout) = child.stdout.take() {
                let reader = BufReader::new(stdout);
                let app_handle = app.clone();
                thread::spawn(move || {
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            // Try to parse as JSON, otherwise send raw string
                            let payload = match serde_json::from_str::<serde_json::Value>(&l) {
                                Ok(v) => v,
                                Err(_) => serde_json::json!({ "level": "info", "type": "log", "message": l }),
                            };
                            let _ = app_handle.emit_all("automation-log", payload);
                        }
                    }
                });
            }

            // Also stream stderr
            if let Some(stderr) = child.stderr.take() {
                let reader = BufReader::new(stderr);
                let app_handle = app.clone();
                thread::spawn(move || {
                    for line in reader.lines() {
                        if let Ok(l) = line {
                            let payload = serde_json::json!({ "level": "error", "type": "stderr", "message": l });
                            let _ = app_handle.emit_all("automation-log", payload);
                        }
                    }
                });
            }

            *process = Some(child);
            Ok(format!("Automation started with CSV: {}", csv_path_to_use))
        }
        Err(e) => Err(format!("Failed to start automation: {}", e)),
    }
}

    fn send_command_to_child(process_state: State<AutomationProcess>, cmd_json: &serde_json::Value) -> Result<String, String> {
        let mut process = process_state.0.lock().unwrap();
        if let Some(ref mut child) = *process {
            if let Some(stdin) = child.stdin.as_mut() {
                let s = format!("{}\n", cmd_json.to_string());
                match stdin.write_all(s.as_bytes()) {
                    Ok(_) => Ok("command-sent".to_string()),
                    Err(e) => Err(format!("Failed to write to child stdin: {}", e)),
                }
            } else {
                Err("Child stdin not available".to_string())
            }
        } else {
            Err("No automation process running".to_string())
        }
    }

    #[tauri::command]
    fn insert_start(process_state: State<AutomationProcess>) -> Result<String, String> {
        let cmd = serde_json::json!({ "cmd": "start_insertion" });
        send_command_to_child(process_state, &cmd)
    }

    #[tauri::command]
    fn insert_start_with_form(process_state: State<AutomationProcess>, form: String) -> Result<String, String> {
        let cmd = serde_json::json!({ "cmd": "start_insertion", "form": form });
        send_command_to_child(process_state, &cmd)
    }

    #[tauri::command]
    fn insert_pause(process_state: State<AutomationProcess>) -> Result<String, String> {
        let cmd = serde_json::json!({ "cmd": "pause_insertion" });
        send_command_to_child(process_state, &cmd)
    }

    #[tauri::command]
    fn insert_stop(process_state: State<AutomationProcess>) -> Result<String, String> {
        let cmd = serde_json::json!({ "cmd": "stop_insertion" });
        send_command_to_child(process_state, &cmd)
    }

    // `insert_807` removed: insertion should be handled by start/insert flow only.

    #[tauri::command]
    fn load_csv_content(process_state: State<AutomationProcess>, csv: String) -> Result<String, String> {
        let cmd = serde_json::json!({ "cmd": "load_csv_content", "csv": csv });
        send_command_to_child(process_state, &cmd)
    }

    #[tauri::command]
    fn load_csv_path(process_state: State<AutomationProcess>, path: String) -> Result<String, String> {
        let cmd = serde_json::json!({ "cmd": "load_csv_path", "path": path });
        send_command_to_child(process_state, &cmd)
    }

#[tauri::command]
fn stop_automation(process_state: State<AutomationProcess>) -> Result<String, String> {
    let mut process = process_state.0.lock().unwrap();

    if let Some(mut child) = process.take() {
        let pid = child.id();
        #[cfg(target_family = "windows")]
        {
            // Use taskkill to kill the process tree on Windows
            let _ = Command::new("taskkill")
                .args(&["/PID", &pid.to_string(), "/T", "/F"])
                .spawn();
        }
        #[cfg(unix)]
        {
            // Kill whole process group via negative PID
            let pgid = format!("-{}", pid);
            let _ = Command::new("kill").args(&["-TERM", &pgid]).spawn();
            // Fallback to SIGKILL
            let _ = Command::new("kill").args(&["-KILL", &pgid]).spawn();
        }

        // Try to wait for child to exit
        let _ = child.kill();
        let _ = child.wait();
        *process = None;
        Ok("Automation stopped".to_string())
    } else {
        Err("No automation process running".to_string())
    }
}

#[tauri::command]
fn get_automation_status(process_state: State<AutomationProcess>) -> Result<String, String> {
    let process = process_state.0.lock().unwrap();
    
    match *process {
        Some(_) => Ok("running".to_string()),
        None => Ok("stopped".to_string()),
    }
}

fn main() {
    tauri::Builder::default()
        .manage(AutomationProcess(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            start_automation,
            stop_automation,
            get_automation_status,
            insert_start,
            insert_start_with_form,
            insert_pause,
            insert_stop,
            load_csv_content,
            load_csv_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
