mod app;
mod config;
mod db;
mod sync;
mod types;
mod utils;
mod watcher;

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    app::run().await
}
