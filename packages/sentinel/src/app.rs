use crate::config::SyncConfig;
use crate::watcher;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use sysinfo::{Pid, System};
use tracing::{info, warn};

pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Tracing
    let filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .init();


    // 2. Env & Config: Try loading .env first, then fallback/supplement with .env.local
    dotenvy::dotenv().ok();
    dotenvy::from_filename(".env.local").ok();

    // 2.5. Ensure Single Instance
    ensure_single_instance();
    let config = Arc::new(SyncConfig::from_env());

    // 3. Database
    let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL must be set");
    let pool = PgPoolOptions::new()
        .max_connections(config.pool_size)
        .min_connections(0)
        .idle_timeout(std::time::Duration::from_secs(15))
        .max_lifetime(std::time::Duration::from_secs(30 * 60))
        .connect(&database_url)
        .await?;

    // 4. Engine
    let engine = Arc::new(crate::sync::SyncEngine::new(pool, (*config).clone()));

    info!("Sentinel started. Vault root: {:?}", config.vault_root);

    // 5. Run Watcher (initial sync is called within watcher::run)
    watcher::run(engine).await;

    Ok(())
}

/// 检查并清理旧的 Sentinel 进程，确保单实例运行
fn ensure_single_instance() {
    let mut system = System::new_all();
    system.refresh_all();

    let current_pid = Pid::from(std::process::id() as usize);
    let my_name = "sentinel";

    for (pid, process) in system.processes() {
        if *pid != current_pid && process.name().to_lowercase().contains(my_name) {
            warn!("Found existing sentinel process (PID: {}). Killing it...", pid);
            process.kill();
        }
    }
}
