//! Local card images. Files live in `<app data>/media/` and are addressed by a
//! generated file name only; any path separators or unknown extensions are
//! rejected so the frontend can never read or write outside that directory.

use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

pub const ALLOWED_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "webp", "avif"];
pub const MAX_MEDIA_BYTES: usize = 20 * 1024 * 1024;

/// Accepts `<uuid>.<ext>` (hex digits and dashes only) with an allowed image extension.
pub fn validate_name(name: &str) -> AppResult<()> {
    let (stem, ext) = name
        .rsplit_once('.')
        .ok_or_else(|| AppError::Message(format!("invalid media name: {name}")))?;
    let stem_ok = !stem.is_empty()
        && stem.len() <= 64
        && stem.chars().all(|c| c.is_ascii_hexdigit() || c == '-');
    let ext_ok = ALLOWED_EXTENSIONS.contains(&ext.to_ascii_lowercase().as_str());
    if stem_ok && ext_ok {
        Ok(())
    } else {
        Err(AppError::Message(format!("invalid media name: {name}")))
    }
}

pub fn resolve(dir: &Path, name: &str) -> AppResult<PathBuf> {
    validate_name(name)?;
    Ok(dir.join(name))
}

pub fn write(dir: &Path, name: &str, bytes: &[u8]) -> AppResult<()> {
    if bytes.len() > MAX_MEDIA_BYTES {
        return Err(AppError::Message("image is larger than 20 MB".into()));
    }
    let path = resolve(dir, name)?;
    std::fs::create_dir_all(dir)?;
    // Write to a temp file then rename, so a crash never leaves a half-written image.
    let tmp = path.with_extension("partial");
    std::fs::write(&tmp, bytes)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

pub fn read(dir: &Path, name: &str) -> AppResult<Vec<u8>> {
    Ok(std::fs::read(resolve(dir, name)?)?)
}

pub fn remove(dir: &Path, name: &str) -> AppResult<()> {
    let path = resolve(dir, name)?;
    if path.exists() {
        std::fs::remove_file(path)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_traversal_and_unknown_types() {
        assert!(validate_name("0f3a-11.png").is_ok());
        assert!(validate_name("ABCDEF.JPG").is_ok());
        assert!(validate_name("../etc/passwd").is_err());
        assert!(validate_name("a/b.png").is_err());
        assert!(validate_name("abc.svg").is_err());
        assert!(validate_name("abc.html").is_err());
        assert!(validate_name(".png").is_err());
        assert!(validate_name("abc").is_err());
    }

    #[test]
    fn write_read_remove_round_trip() {
        let dir = tempfile::tempdir().unwrap();
        write(dir.path(), "abc123.png", b"\x89PNG").unwrap();
        assert_eq!(read(dir.path(), "abc123.png").unwrap(), b"\x89PNG");
        remove(dir.path(), "abc123.png").unwrap();
        assert!(read(dir.path(), "abc123.png").is_err());
    }
}
