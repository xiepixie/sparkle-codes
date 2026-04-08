use std::sync::Arc;
use notify::{Watcher, RecursiveMode};
use notify_debouncer_full::{new_debouncer, DebouncedEvent};
use tracing::info;
use crate::sync::SyncEngine;

pub async fn run(engine: Arc<SyncEngine>) {
    let (tx, mut rx) = tokio::sync::mpsc::channel(100);
    let vault_root = engine.config.vault_root.clone();
    let attachment_root = engine.config.attachment_root.clone();

    // 1. Initial Sync
    Arc::clone(&engine).initial_sync().await;

    // 2. Watcher Setup
    let mut debouncer = new_debouncer(
        std::time::Duration::from_millis(500),
        None,
        move |result: Result<Vec<DebouncedEvent>, _>| {
            if let Ok(events) = result {
                for event in events {
                    let _ = tx.blocking_send(event);
                }
            }
        }
    ).unwrap();

    debouncer.watcher().watch(&vault_root, RecursiveMode::Recursive).unwrap();
    if attachment_root.exists() {
        debouncer.watcher().watch(&attachment_root, RecursiveMode::Recursive).unwrap();
        info!("Watching vault and attachments: {} | {}", vault_root.display(), attachment_root.display());
    } else {
        info!("Watching vault: {}", vault_root.display());
    }

    // 3. Event Loop
    while let Some(event) = rx.recv().await {
        let is_remove = event.event.kind.is_remove();

        for path in event.event.paths {
            let engine = Arc::clone(&engine);
            let vault_root = vault_root.clone();
            let attachment_root = attachment_root.clone();

            tokio::spawn(async move {
                // 1. Vault synchronization (MD files)
                if let Ok(rel) = path.strip_prefix(&vault_root) {
                    if path.extension().and_then(|s| s.to_str()) == Some("md") {
                        let vault_path = rel.to_string_lossy().to_string();
                        if is_remove {
                            engine.delete_file(&vault_path).await;
                        } else if path.exists() {
                            engine.sync_file(&vault_path, &path).await;
                        }
                    }
                } 
                // 2. Attachment synchronization (Assets)
                else if let Ok(_rel) = path.strip_prefix(&attachment_root) {
                    if !is_remove && path.exists() && crate::sync::is_attachment_target(path.to_str().unwrap_or("")) {
                        engine.sync_attachment(&path).await;
                    }
                }
            });
        }
    }
}
