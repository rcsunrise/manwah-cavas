use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use walkdir::WalkDir;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LocalAssetRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub extension: String,
    pub size: u64,
    pub category: String,
    pub last_modified: i64,
    pub preview_base64: Option<String>,
}

pub struct LocalIndexer {
    conn: Connection,
}

impl LocalIndexer {
    pub fn init_db(db_path: &Path) -> Result<Self, rusqlite::Error> {
        if let Some(parent) = db_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let conn = Connection::open(db_path)?;

        // Initialize schema
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS local_assets (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                extension TEXT NOT NULL,
                size INTEGER NOT NULL,
                category TEXT NOT NULL,
                last_modified INTEGER NOT NULL,
                preview_base64 TEXT
            );

            CREATE VIRTUAL TABLE IF NOT EXISTS local_assets_fts USING fts5(
                name,
                path,
                extension,
                content='local_assets',
                content_rowid='rowid'
            );
            ",
        )?;

        Ok(Self { conn })
    }

    /// Scan directory and perform incremental indexing
    pub fn scan_and_index_directory(&self, dir_path: &str) -> Result<usize, String> {
        let mut count = 0;
        let supported_exts = ["png", "jpg", "jpeg", "webp", "pdf", "psd", "ai", "mp4"];

        for entry in WalkDir::new(dir_path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.file_type().is_file())
        {
            let p = entry.path();
            if let Some(ext) = p.extension().and_then(|s| s.to_str()) {
                let lower_ext = ext.to_lowercase();
                if supported_exts.contains(&lower_ext.as_str()) {
                    let file_name = p.file_name().and_then(|s| s.to_str()).unwrap_or("").to_string();
                    let metadata = entry.metadata().map_err(|e| e.to_string())?;
                    let file_size = metadata.len();
                    let mod_time = metadata
                        .modified()
                        .ok()
                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|d| d.as_secs() as i64)
                        .unwrap_or(0);

                    let category = match lower_ext.as_str() {
                        "png" | "jpg" | "jpeg" | "webp" => "product_photo",
                        "pdf" | "doc" | "docx" => "document",
                        "psd" | "ai" => "design",
                        "mp4" | "mov" => "video",
                        _ => "other",
                    };

                    let path_str = p.to_string_lossy().to_string();
                    let record_id = format!("{:x}", sha2::Sha256::digest(path_str.as_bytes()));

                    // Generate fast thumbnail for images
                    let preview_b64 = if category == "product_photo" && file_size < 30 * 1024 * 1024 {
                        Self::generate_webp_thumbnail(p)
                    } else {
                        None
                    };

                    let _ = self.conn.execute(
                        "INSERT OR REPLACE INTO local_assets (id, name, path, extension, size, category, last_modified, preview_base64)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                        params![record_id, file_name, path_str, lower_ext, file_size, category, mod_time, preview_b64],
                    );

                    count += 1;
                }
            }
        }

        Ok(count)
    }

    /// Search assets using FTS and fuzzy matching
    pub fn search(&self, query: &str, category: &str, limit: usize) -> Vec<LocalAssetRecord> {
        let mut results = Vec::new();
        let pattern = format!("%{}%", query.trim());

        let sql = if category == "all" || category.is_empty() {
            "SELECT id, name, path, extension, size, category, last_modified, preview_base64
             FROM local_assets
             WHERE name LIKE ?1 OR path LIKE ?1
             ORDER BY last_modified DESC
             LIMIT ?2"
        } else {
            "SELECT id, name, path, extension, size, category, last_modified, preview_base64
             FROM local_assets
             WHERE (name LIKE ?1 OR path LIKE ?1) AND category = ?3
             ORDER BY last_modified DESC
             LIMIT ?2"
        };

        if let Ok(mut stmt) = self.conn.prepare(sql) {
            let rows = if category == "all" || category.is_empty() {
                stmt.query_map(params![pattern, limit as i64], |row| {
                    Ok(LocalAssetRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        path: row.get(2)?,
                        extension: row.get(3)?,
                        size: row.get(4)?,
                        category: row.get(5)?,
                        last_modified: row.get(6)?,
                        preview_base64: row.get(7)?,
                    })
                })
            } else {
                stmt.query_map(params![pattern, limit as i64, category], |row| {
                    Ok(LocalAssetRecord {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        path: row.get(2)?,
                        extension: row.get(3)?,
                        size: row.get(4)?,
                        category: row.get(5)?,
                        last_modified: row.get(6)?,
                        preview_base64: row.get(7)?,
                    })
                })
            };

            if let Ok(mapped) = rows {
                for r in mapped.flatten() {
                    results.push(r);
                }
            }
        }

        results
    }

    fn generate_webp_thumbnail(img_path: &Path) -> Option<String> {
        if let Ok(img) = image::open(img_path) {
            let thumb = img.thumbnail(256, 256);
            let mut buf = std::io::Cursor::new(Vec::new());
            if thumb.write_to(&mut buf, image::ImageFormat::WebP).is_ok() {
                use sha2::Digest;
                return Some(format!("data:image/webp;base64,{}", base64_encode(&buf.into_inner())));
            }
        }
        None
    }
}

use sha2::Digest;

fn base64_encode(data: &[u8]) -> String {
    const CHARSET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0];
        let b1 = if chunk.len() > 1 { chunk[1] } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] } else { 0 };

        out.push(CHARSET[(b0 >> 2) as usize] as char);
        out.push(CHARSET[(((b0 & 0x03) << 4) | (b1 >> 4)) as usize] as char);
        if chunk.len() > 1 {
            out.push(CHARSET[(((b1 & 0x0F) << 2) | (b2 >> 6)) as usize] as char);
        } else {
            out.push('=');
        }
        if chunk.len() > 2 {
            out.push(CHARSET[(b2 & 0x3F) as usize] as char);
        } else {
            out.push('=');
        }
    }
    out
}

pub fn base64_decode(input: &str) -> Option<Vec<u8>> {
    let mut clean = input.trim().replace("\r", "").replace("\n", "");
    while clean.len() % 4 != 0 {
        clean.push('=');
    }

    const DECODE_TABLE: [i8; 256] = {
        let mut table = [-1i8; 256];
        let charset = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut i = 0;
        while i < charset.len() {
            table[charset[i] as usize] = i as i8;
            i += 1;
        }
        table
    };

    let bytes = clean.as_bytes();
    let mut out = Vec::with_capacity(bytes.len() * 3 / 4);

    for chunk in bytes.chunks(4) {
        if chunk.len() < 4 {
            break;
        }
        let c0 = DECODE_TABLE[chunk[0] as usize];
        let c1 = DECODE_TABLE[chunk[1] as usize];
        let c2 = if chunk[2] == b'=' { 0 } else { DECODE_TABLE[chunk[2] as usize] };
        let c3 = if chunk[3] == b'=' { 0 } else { DECODE_TABLE[chunk[3] as usize] };

        if c0 < 0 || c1 < 0 || c2 < 0 || c3 < 0 {
            return None;
        }

        out.push(((c0 as u8) << 2) | ((c1 as u8) >> 4));
        if chunk[2] != b'=' {
            out.push(((c1 as u8) << 4) | ((c2 as u8) >> 2));
        }
        if chunk[3] != b'=' {
            out.push(((c2 as u8) << 6) | (c3 as u8));
        }
    }

    Some(out)
}
