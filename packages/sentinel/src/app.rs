use crate::config::SyncConfig;
use crate::watcher;
use sqlx::postgres::PgPoolOptions;
use std::sync::Arc;
use sysinfo::{Pid, System};
use clap::{Parser, Subcommand};
use tracing::{info, warn};


#[derive(Parser)]
#[command(name = "sentinel")]
#[command(about = "Native Rust daemon: watches Obsidian vault, parses Markdown, syncs to Neon.", long_about = None)]
struct Cli {
    #[command(subcommand)]
    command: Option<Commands>,
}

#[derive(Subcommand)]
enum Commands {
    /// Perform a synchronization of the vault.
    Sync {
        /// Perform a full scan and synchronization of the entire vault.
        #[arg(short, long)]
        full: bool,
    },
}

pub async fn run() -> Result<(), Box<dyn std::error::Error>> {
    // 1. Tracing Setup (Two-tier)
    // Console: WARN/ERROR only (to prevent batch output spam)
    // File: DEBUG (saved in logs/sentinel.log.YYYY-MM-DD)
    let file_appender = tracing_appender::rolling::daily("logs", "sentinel.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(file_appender);

    use tracing_subscriber::prelude::*;
    use tracing_subscriber::filter::LevelFilter;

    // The file receives warnings/errors from the system, and detailed debug info from sentinel
    let file_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("warn,sentinel=info"));

    let file_layer = tracing_subscriber::fmt::layer()
        .with_writer(non_blocking)
        .with_ansi(false)
        .with_filter(file_filter);

    // The terminal receives INFO, WARN and ERROR
    let terminal_layer = tracing_subscriber::fmt::layer()
        .with_writer(std::io::stdout)
        .with_target(false)
        .with_filter(LevelFilter::INFO);

    tracing_subscriber::registry()
        .with(terminal_layer)
        .with(file_layer)
        .init();

    // Store the guard to ensure background writing works
    Box::leak(Box::new(_guard));


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

    // 4.5 Handle CLI Commands
    let cli = Cli::parse();
    match cli.command {
        Some(Commands::Sync { full }) => {
            if full {
                info!("🚀 [CLI] Starting requested full synchronization...");
                engine.initial_sync().await;
                info!("✨ [CLI] Full synchronization finished. Exiting.");
                return Ok(());
            }
        }
        None => {
            info!("Sentinel started. Watcher mode enabled. Vault root: {:?}", config.vault_root);
            // 5. Run Watcher (initial sync is called within watcher::run)
            watcher::run(engine).await;
        }
    }

    Ok(())
}

/// 检查并清理旧的 Sentinel 进程，确保单实例运行
fn ensure_single_instance() {
    let mut system = System::new_all();
    system.refresh_all();

    let current_pid = Pid::from(std::process::id() as usize);
    let my_name = "sentinel";

    for (pid, process) in system.processes() {
        if *pid != current_pid && process.name().to_string_lossy().to_lowercase().contains(my_name) {
            warn!("Found existing sentinel process (PID: {}). Killing it...", pid);
            process.kill();
        }
    }
}
