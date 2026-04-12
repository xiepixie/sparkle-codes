use std::sync::Arc;
use notify::{RecursiveMode, EventKind};
use notify_debouncer_full::new_debouncer;
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
        move |result| {
            if let Ok(events) = result {
                for event in events {
                    let _ = tx.blocking_send(event);
                }
            }
        }
    ).unwrap();

    debouncer.watch(&vault_root, RecursiveMode::Recursive).unwrap();
    if attachment_root.exists() {
        debouncer.watch(&attachment_root, RecursiveMode::Recursive).unwrap();
        info!("Watching vault and attachments: {} | {}", vault_root.display(), attachment_root.display());
    } else {
        info!("Watching vault: {}", vault_root.display());
    }

    // 3. Event Loop
    while let Some(event) = rx.recv().await {
        // Collect additional events that arrived in the meantime to batch process
        let mut events = vec![event];
        while let Ok(next) = rx.try_recv() {
            events.push(next);
        }
        
        info!("🔔 Received {} file system events. Processing batch...", events.len());

        let mut set = tokio::task::JoinSet::new();
        let mut vault_paths_to_sync = std::collections::HashSet::new();
        let mut attachment_paths_to_sync = std::collections::HashSet::new();
        let mut paths_to_delete = std::collections::HashSet::new();

        for event in events {
            tracing::debug!("🔍 [Watcher] Raw event: {:?} (Paths: {:?})", event.event.kind, event.event.paths);
            let is_remove = matches!(event.event.kind, EventKind::Remove(_));
            for path in event.event.paths {
                if is_remove {
                    paths_to_delete.insert(path);
                } else if path.strip_prefix(&vault_root).is_ok() {
                    vault_paths_to_sync.insert(path);
                } else if path.strip_prefix(&attachment_root).is_ok() {
                    attachment_paths_to_sync.insert(path);
                }
            }
        }

        // Process deletions
        for path in paths_to_delete {
            if let Ok(rel) = path.strip_prefix(&vault_root) {
                let vault_path = rel.to_string_lossy().to_string();
                let engine = Arc::clone(&engine);
                let permit = engine.semaphore.clone().acquire_owned().await.unwrap();
                set.spawn(async move {
                    engine.delete_file(&vault_path).await;
                    drop(permit);
                });
            }
        }
 
        // Process vault syncs
        for path in vault_paths_to_sync {
            if path.extension().and_then(|s| s.to_str()) == Some("md") {
                if let Ok(rel) = path.strip_prefix(&vault_root) {
                    let vault_path = rel.to_string_lossy().to_string();
                    let engine = Arc::clone(&engine);
                    if path.exists() {
                        let permit = engine.semaphore.clone().acquire_owned().await.unwrap();
                        set.spawn(async move {
                            engine.sync_file(&vault_path, &path).await;
                            drop(permit);
                        });
                    }
                }
            }
        }
 
        // Process attachment syncs
        for path in attachment_paths_to_sync {
            if path.exists() && crate::sync::is_attachment_target(path.to_str().unwrap_or("")) {
                let engine = Arc::clone(&engine);
                let permit = engine.semaphore.clone().acquire_owned().await.unwrap();
                set.spawn(async move {
                    engine.sync_attachment(&path).await;
                    drop(permit);
                });
            }
        }

        // Wait for this batch to finish
        while let Some(res) = set.join_next().await {
            if let Err(e) = res {
                tracing::error!("Watcher task panicked: {}", e);
            }
        }

        // 🚀 Batch Revalidation: Trigger once after the entire event wave is processed
        engine.trigger_revalidation().await;
        info!("✅ Batch processing finished.");
    }
}
