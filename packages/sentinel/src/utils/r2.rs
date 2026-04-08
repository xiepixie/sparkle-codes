use aws_sdk_s3::config::{Credentials, Region};
use aws_sdk_s3::Client;
use std::path::Path;
use anyhow::Result;
use tokio::fs;
use sha2::{Sha256, Digest};

pub struct R2Client {
    client: Client,
    bucket: String,
    public_domain: String,
}

impl R2Client {
    pub fn new(account_id: &str, access_key: &str, secret_key: &str, bucket: &str, public_domain: &str) -> Self {
        let endpoint = format!("https://{}.r2.cloudflarestorage.com", account_id);
        let credentials = Credentials::new(access_key, secret_key, None, None, "r2");
        let region = Region::new("auto");

        let config = aws_sdk_s3::Config::builder()
            .credentials_provider(credentials)
            .endpoint_url(endpoint)
            .region(region)
            .behavior_version(aws_sdk_s3::config::BehaviorVersion::latest())
            .build();

        let client = Client::from_conf(config);

        Self {
            client,
            bucket: bucket.to_string(),
            public_domain: public_domain.to_string(),
        }
    }

    pub async fn upload_attachment(&self, file_path: &Path) -> Result<String> {
        if !file_path.exists() {
            return Err(anyhow::anyhow!("File does not exist: {}", file_path.display()));
        }

        let content = fs::read(file_path).await?;
        let hash = hex::encode(Sha256::digest(&content));
        let ext = file_path.extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        
        let key = format!("attachments/{}.{}", hash, ext);

        // Check if object already exists to avoid redundant uploads
        let exists = self.client.head_object()
            .bucket(&self.bucket)
            .key(&key)
            .send()
            .await
            .is_ok();

        if !exists {
            let mut request = self.client.put_object()
                .bucket(&self.bucket)
                .key(&key)
                .body(content.into());

            // Set content type based on extension
            if let Some(ct) = get_content_type(ext) {
                request = request.content_type(ct);
            }

            request.send().await?;
        }

        Ok(format!("https://{}/{}", self.public_domain, key))
    }
}

fn get_content_type(ext: &str) -> Option<&'static str> {
    match ext.to_lowercase().as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "mp4" => Some("video/mp4"),
        "webm" => Some("video/webm"),
        "pdf" => Some("application/pdf"),
        "mp3" => Some("audio/mpeg"),
        "wav" => Some("audio/wav"),
        "mov" => Some("video/quicktime"),
        _ => None,
    }
}
