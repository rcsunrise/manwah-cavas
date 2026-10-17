use std::path::{Path, PathBuf};

/// Security Sandbox for Local Asset Bridge
/// Enforces strict path whitelist boundary to prevent directory traversal attacks (e.g. ../../)
pub struct SecuritySandbox {
    authorized_directories: Vec<PathBuf>,
}

impl SecuritySandbox {
    pub fn new(authorized_paths: Vec<String>) -> Self {
        let mut canonical_dirs = Vec::new();
        for p in authorized_paths {
            if let Ok(canon) = Path::new(&p).canonicalize() {
                canonical_dirs.push(canon);
            }
        }
        Self {
            authorized_directories: canonical_dirs,
        }
    }

    /// Add a new authorized root directory
    pub fn add_directory(&mut self, dir_path: &str) -> Result<(), String> {
        let p = Path::new(dir_path);
        if !p.is_dir() {
            return Err("Target path is not a valid directory".to_string());
        }
        let canon = p.canonicalize().map_err(|e| e.to_string())?;
        if !self.authorized_directories.contains(&canon) {
            self.authorized_directories.push(canon);
        }
        Ok(())
    }

    /// Verify whether a target file path resides within authorized boundaries
    pub fn verify_path(&self, target_path: &str) -> Result<PathBuf, String> {
        let path = Path::new(target_path);
        
        // Canonicalize path to resolve symlinks and relative tokens
        let canonical_target = if path.exists() {
            path.canonicalize().map_err(|e| format!("Failed to canonicalize path: {}", e))?
        } else {
            // If creating a new export file, verify parent directory
            let parent = path.parent().ok_or_else(|| "Invalid target path".to_string())?;
            let canonical_parent = parent.canonicalize().map_err(|e| format!("Parent directory does not exist: {}", e))?;
            canonical_parent.join(path.file_name().ok_or_else(|| "Missing file name".to_string())?)
        };

        for auth_dir in &self.authorized_directories {
            if canonical_target.starts_with(auth_dir) {
                return Ok(canonical_target);
            }
        }

        Err(format!(
            "Security Violation: Path '{}' is outside of authorized directories!",
            target_path
        ))
    }

    pub fn get_authorized_directories(&self) -> Vec<String> {
        self.authorized_directories
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect()
    }
}
