use crate::indexer::LocalIndexer;
use crate::security::SecuritySandbox;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::fs;
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

#[derive(Debug, Serialize, Deserialize)]
pub struct BridgeConfig {
    pub cloud_url: String,
    pub device_id: String,
    pub device_token: String,
    pub device_name: String,
    pub authorized_directories: Vec<String>,
}

pub struct RelayClient {
    config: BridgeConfig,
    sandbox: Arc<Mutex<SecuritySandbox>>,
    indexer: Arc<Mutex<LocalIndexer>>,
}

impl RelayClient {
    pub fn new(
        config: BridgeConfig,
        sandbox: Arc<Mutex<SecuritySandbox>>,
        indexer: Arc<Mutex<LocalIndexer>>,
    ) -> Self {
        Self {
            config,
            sandbox,
            indexer,
        }
    }

    pub async fn run_loop(&self) {
        let ws_url = if self.config.cloud_url.starts_with("https://") {
            self.config.cloud_url.replace("https://", "wss://") + "/ws/bridge-hub"
        } else if self.config.cloud_url.starts_with("http://") {
            self.config.cloud_url.replace("http://", "ws://") + "/ws/bridge-hub"
        } else {
            format!("ws://{}/ws/bridge-hub", self.config.cloud_url)
        };

        println!("[RelayClient] Connecting to Cloud Relay: {}", ws_url);

        loop {
            match connect_async(&ws_url).await {
                Ok((mut ws_stream, _)) => {
                    println!("[RelayClient] WebSocket Connected! Sending auth handshake...");

                    // 1. Send auth packet
                    let auth_packet = serde_json::json!({
                        "type": "auth",
                        "deviceId": self.config.device_id,
                        "deviceToken": self.config.device_token,
                        "authorizedDirs": self.config.authorized_directories
                    });

                    if ws_stream.send(Message::Text(auth_packet.to_string())).await.is_err() {
                        tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                        continue;
                    }

                    // 2. Event loop
                    while let Some(msg) = ws_stream.next().await {
                        match msg {
                            Ok(Message::Text(text)) => {
                                if let Ok(val) = serde_json::from_str::<Value>(&text) {
                                    if val.get("type").and_then(|v| v.as_str()) == Some("rpc_request") {
                                        let req_id = val.get("requestId").and_then(|v| v.as_str()).unwrap_or("");
                                        let action = val.get("action").and_then(|v| v.as_str()).unwrap_or("");
                                        let payload = val.get("payload").cloned().unwrap_or(Value::Null);

                                        let res = self.handle_rpc(action, payload).await;
                                        let response_packet = serde_json::json!({
                                            "type": "rpc_response",
                                            "requestId": req_id,
                                            "success": res.is_ok(),
                                            "data": res.as_ref().ok(),
                                            "error": res.as_ref().err()
                                        });

                                        let _ = ws_stream.send(Message::Text(response_packet.to_string())).await;
                                    }
                                }
                            }
                            Ok(Message::Ping(payload)) => {
                                let _ = ws_stream.send(Message::Pong(payload)).await;
                            }
                            Ok(Message::Close(_)) | Err(_) => {
                                println!("[RelayClient] Connection lost, reconnecting...");
                                break;
                            }
                            _ => {}
                        }
                    }
                }
                Err(e) => {
                    eprintln!("[RelayClient] Connect error: {}, retrying in 4s...", e);
                }
            }

            tokio::time::sleep(tokio::time::Duration::from_secs(4)).await;
        }
    }

    async fn handle_rpc(&self, action: &str, payload: Value) -> Result<Value, String> {
        match action {
            "search_local_assets" => {
                let query = payload.get("query").and_then(|v| v.as_str()).unwrap_or("");
                let category = payload.get("category").and_then(|v| v.as_str()).unwrap_or("all");
                let limit = payload.get("limit").and_then(|v| v.as_u64()).unwrap_or(8) as usize;

                let indexer = self.indexer.lock().await;
                let records = indexer.search(query, category, limit);
                serde_json::to_value(records).map_err(|e| e.to_string())
            }

            "stage_file_upload" => {
                let file_path = payload.get("filePath").and_then(|v| v.as_str()).ok_or("Missing filePath")?;
                let sandbox = self.sandbox.lock().await;
                let verified_path = sandbox.verify_path(file_path)?;

                let bytes = fs::read(&verified_path).map_err(|e| format!("Failed to read file: {}", e))?;
                let b64 = format!("data:image/png;base64,{}", crate::indexer::base64_encode(&bytes));
                let file_name = verified_path.file_name().and_then(|s| s.to_str()).unwrap_or("file");

                Ok(serde_json::json!({
                    "fileName": file_name,
                    "fileSize": bytes.len(),
                    "base64": b64
                }))
            }

            "export_file_to_local" => {
                let deliverable_data = payload.get("deliverableData").and_then(|v| v.as_str()).ok_or("Missing deliverableData")?;
                let subfolder = payload.get("subfolder").and_then(|v| v.as_str()).unwrap_or("成品交付包");

                let sandbox = self.sandbox.lock().await;
                let dirs = sandbox.get_authorized_directories();
                let target_root = dirs.first().ok_or("No authorized directory available for export")?;

                let target_dir = std::path::Path::new(target_root).join(subfolder);
                let _ = fs::create_dir_all(&target_dir);

                let filename = format!("poster_{}.png", chrono::Local::now().format("%Y%m%d_%H%M%S"));
                let target_file = target_dir.join(&filename);

                // Decode base64 if needed
                let clean_b64 = deliverable_data.split(',').last().unwrap_or(deliverable_data);
                let bytes = match crate::indexer::base64_decode(clean_b64) {
                    Some(b) => b,
                    None => return Err("Invalid deliverable base64 data".to_string()),
                };

                fs::write(&target_file, bytes).map_err(|e| format!("Failed to write export file: {}", e))?;

                Ok(serde_json::json!({
                    "savedPath": target_file.to_string_lossy(),
                    "fileSize": fs::metadata(&target_file).map(|m| m.len()).unwrap_or(0)
                }))
            }

            _ => Err(format!("Unknown RPC action: {}", action)),
        }
    }
}
