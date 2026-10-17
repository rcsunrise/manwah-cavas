// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod indexer;
mod relay_client;
mod security;

use indexer::LocalIndexer;
use relay_client::{BridgeConfig, RelayClient};
use security::SecuritySandbox;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

fn get_app_dir() -> PathBuf {
    let mut dir = dirs_next().unwrap_or_else(|| PathBuf::from("."));
    dir.push(".manwah_bridge");
    let _ = fs::create_dir_all(&dir);
    dir
}

fn dirs_next() -> Option<PathBuf> {
    std::env::var_os("USERPROFILE")
        .or_else(|| std::env::var_os("HOME"))
        .map(PathBuf::from)
}

fn load_config() -> Option<BridgeConfig> {
    let config_file = get_app_dir().join("config.json");
    if let Ok(content) = fs::read_to_string(config_file) {
        serde_json::from_str(&content).ok()
    } else {
        None
    }
}

fn save_config(config: &BridgeConfig) -> Result<(), String> {
    let config_file = get_app_dir().join("config.json");
    let serialized = serde_json::to_string_pretty(config).map_err(|e| e.to_string())?;
    fs::write(config_file, serialized).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_bridge_status() -> Result<serde_json::Value, String> {
    let config = load_config();
    Ok(serde_json::json!({
        "configured": config.is_some(),
        "deviceName": config.as_ref().map(|c| c.device_name.clone()),
        "authorizedDirs": config.as_ref().map(|c| c.authorized_directories.clone()).unwrap_or_default()
    }))
}

#[tauri::command]
async fn pair_device(cloud_url: String, pair_code: String, device_name: String) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::new();
    let api_url = format!("{}/api/bridge/pair", cloud_url.trim_end_matches('/'));

    let res = client
        .post(&api_url)
        .json(&serde_json::json!({
            "pairCode": pair_code,
            "deviceName": device_name,
            "deviceFingerprint": format!("{:x}", sha2::Sha256::digest(device_name.as_bytes()))
        }))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to cloud: {}", e))?;

    let json: serde_json::Value = res.json().await.map_err(|e| format!("Invalid server response: {}", e))?;

    if json.get("success").and_then(|v| v.as_bool()) == Some(true) {
        let device_id = json["deviceId"].as_str().unwrap_or("").to_string();
        let device_token = json["deviceToken"].as_str().unwrap_or("").to_string();

        let new_config = BridgeConfig {
            cloud_url,
            device_id,
            device_token,
            device_name,
            authorized_directories: Vec::new(),
        };

        save_config(&new_config)?;
        Ok(json)
    } else {
        Err(json.get("error").and_then(|v| v.as_str()).unwrap_or("Pairing failed").to_string())
    }
}

use sha2::Digest;

#[tokio::main]
async fn main() {
    let app_dir = get_app_dir();
    let db_path = app_dir.join("index.db");

    let indexer = match LocalIndexer::init_db(&db_path) {
        Ok(idx) => Arc::new(Mutex::new(idx)),
        Err(e) => {
            eprintln!("Failed to init sqlite database: {}", e);
            return;
        }
    };

    let config = load_config().unwrap_or(BridgeConfig {
        cloud_url: "http://localhost:3000".to_string(),
        device_id: "".to_string(),
        device_token: "".to_string(),
        device_name: "Local Workstation".to_string(),
        authorized_directories: vec![],
    });

    let sandbox = Arc::new(Mutex::new(SecuritySandbox::new(config.authorized_directories.clone())));

    // If paired, start background relay loop
    if !config.device_token.is_empty() {
        let relay = RelayClient::new(config, Arc::clone(&sandbox), Arc::clone(&indexer));
        tokio::spawn(async move {
            relay.run_loop().await;
        });
    }

    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_bridge_status, pair_device])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
