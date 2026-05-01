use axum::{
    extract::{Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use serde::Deserialize;

use crate::auth::AuthUser;
use crate::error::{err, internal_error, ApiError};
use crate::AppState;

/// GET /api/agent/version — Returns the latest agent version info.
/// Requires authentication.
pub async fn latest_version(
    State(state): State<AppState>,
    AuthUser(_claims): AuthUser,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Read version from settings, or return current agent version
    let version: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM settings WHERE key = 'agent_latest_version'",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| internal_error("latest version", e))?;

    let download_url: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM settings WHERE key = 'agent_download_url'",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| internal_error("latest version", e))?;

    let checksum: Option<(String,)> = sqlx::query_as(
        "SELECT value FROM settings WHERE key = 'agent_checksum'",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| internal_error("latest version", e))?;

    Ok(Json(serde_json::json!({
        "version": version.map(|v| v.0).unwrap_or_else(|| env!("CARGO_PKG_VERSION").to_string()),
        "download_url": download_url.map(|v| v.0),
        "checksum": checksum.map(|v| v.0),
    })))
}

#[derive(Deserialize)]
pub struct ArchQuery {
    arch: String,
}

/// GET /api/agent/binary?arch=amd64 — Streams the agent binary so a remote
/// server bootstrapping via SSH can fetch it from the panel itself, without
/// depending on a public GitHub release. Path resolution order:
///   1. AGENT_BINARY_PATH_<ARCH> env var (e.g. AGENT_BINARY_PATH_AMD64)
///   2. AGENT_BINARY_PATH env var (only when arch matches local)
///   3. /usr/local/bin/axiapanel-agent (only when arch matches local)
/// Public endpoint (no auth) because the bootstrap script runs as root on a
/// fresh server and has no credentials yet — the agent_token is provided
/// out-of-band via the SSH session.
pub async fn download_binary(
    Query(q): Query<ArchQuery>,
) -> Result<impl IntoResponse, ApiError> {
    let arch = q.arch.to_lowercase();
    if arch != "amd64" && arch != "arm64" {
        return Err(err(StatusCode::BAD_REQUEST, "arch deve ser amd64 ou arm64"));
    }

    let local_arch = if cfg!(target_arch = "x86_64") {
        "amd64"
    } else if cfg!(target_arch = "aarch64") {
        "arm64"
    } else {
        ""
    };

    let arch_specific = format!("AGENT_BINARY_PATH_{}", arch.to_uppercase());
    let path = std::env::var(&arch_specific)
        .ok()
        .or_else(|| {
            if arch == local_arch {
                std::env::var("AGENT_BINARY_PATH").ok()
            } else {
                None
            }
        })
        .unwrap_or_else(|| {
            if arch == local_arch {
                "/usr/local/bin/axiapanel-agent".to_string()
            } else {
                String::new()
            }
        });

    if path.is_empty() {
        return Err(err(
            StatusCode::NOT_FOUND,
            &format!(
                "Binário do agent {arch} não disponível. Defina {arch_specific}=/caminho/para/o/binário"
            ),
        ));
    }

    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| internal_error(&format!("read agent binary {path}"), e))?;

    Ok((
        StatusCode::OK,
        [
            (header::CONTENT_TYPE, "application/octet-stream"),
            (header::CONTENT_DISPOSITION, "attachment; filename=\"axiapanel-agent\""),
        ],
        bytes,
    ))
}
