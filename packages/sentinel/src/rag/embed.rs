use serde::{Deserialize, Serialize};
use reqwest::Client;
use tokio::process::Command;
use tokio::io::AsyncWriteExt;

use std::process::Stdio;
use crate::config::SyncConfig;

#[derive(Serialize)]
struct EmbedRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Deserialize)]
struct EmbedResponse {
    embeddings: Vec<Vec<f32>>,
    #[serde(default)]
    error: Option<String>,
}

pub struct EmbedClient {
    client: Client,
    base_url: String,
    model: String,
    strategy: String,
    mlx_model_path: String,
}

impl EmbedClient {
    /// Create a new EmbedClient using the provided configuration.
    pub fn new(config: &SyncConfig) -> Self {
        Self {
            client: Client::new(),
            base_url: config.local_ai_base_url.clone(),
            model: config.embedding_model.clone(),
            strategy: config.embedding_strategy.clone(),
            mlx_model_path: config.mlx_model_path.clone(),
        }
    }

    /// Generate embeddings for a batch of strings.
    pub async fn embed_batch(&self, inputs: Vec<String>) -> anyhow::Result<Vec<Vec<f32>>> {
        if inputs.is_empty() {
            return Ok(vec![]);
        }

        if self.strategy == "local" {
            self.local_embed_batch(inputs).await
        } else {
            self.http_embed_batch(inputs).await
        }
    }

    /// Optimized Ollama/HTTP-style embedding.
    async fn http_embed_batch(&self, inputs: Vec<String>) -> anyhow::Result<Vec<Vec<f32>>> {
        let url = format!("{}/api/embed", self.base_url);
        let resp = self.client.post(url)
            .json(&EmbedRequest {
                model: self.model.clone(),
                input: inputs,
            })
            .send()
            .await?;
        
        if !resp.status().is_success() {
            let status = resp.status();
            let err_text = resp.text().await?;
            return Err(anyhow::anyhow!("Embedding API error: {} (Status: {})", err_text, status));
        }

        let body = resp.json::<EmbedResponse>().await?;
        Ok(body.embeddings)
    }

    /// Local MLX embedding using uv run.
    async fn local_embed_batch(&self, inputs: Vec<String>) -> anyhow::Result<Vec<Vec<f32>>> {
        let input_json = serde_json::to_string(&inputs)?;
        
        // Use full path to uv for reliability
        let uv_path = "/opt/homebrew/bin/uv";
        
        // Resolve script path relative to current working directory
        let current_dir = std::env::current_dir().unwrap_or_default();
        let script_path = if current_dir.ends_with("sentinel") {
            "scripts/mlx_embed.py"
        } else {
            "packages/sentinel/scripts/mlx_embed.py"
        };

        let mut child = Command::new(uv_path)
            .arg("-q")
            .arg("run")
            .arg(script_path)
            .arg(&self.mlx_model_path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?;

        let mut stdin = child.stdin.take().expect("Failed to open stdin");
        stdin.write_all(input_json.as_bytes()).await?;
        drop(stdin);

        let output = child.wait_with_output().await?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(anyhow::anyhow!("Local embedding failed: {}", stderr));
        }

        let body: EmbedResponse = serde_json::from_slice(&output.stdout)?;
        
        if let Some(err) = body.error {
            return Err(anyhow::anyhow!("MLX Script error: {}", err));
        }

        Ok(body.embeddings)
    }
}
