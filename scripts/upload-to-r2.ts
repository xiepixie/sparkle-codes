// scripts/upload-to-r2.ts
import crypto from "crypto";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// Load environment variables from .env.local
dotenv.config({ path: ".env.local" });

const { 
    R2_ACCESS_KEY_ID, 
    R2_SECRET_ACCESS_KEY, 
    R2_ENDPOINT, 
    R2_BUCKET_NAME
} = process.env;

if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_ENDPOINT || !R2_BUCKET_NAME) {
    console.error("❌ Missing R2 environment variables in .env.local");
    process.exit(1);
}

const s3 = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

async function uploadFile(fileFullPath: string) {
    if (!fs.existsSync(fileFullPath)) {
        console.error(`❌ File not found: ${fileFullPath}`);
        process.exit(1);
    }

    const fileName = path.basename(fileFullPath);
    const fileContent = fs.readFileSync(fileFullPath);
    
    // Calculate local MD5 for deduplication (AWS ETag format)
    const localMd5 = crypto.createHash('md5').update(fileContent).digest('hex');

    // 1. Try to check if it already exists and is identical
    try {
        const head = await s3.send(new HeadObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: fileName,
        }));

        // AWS ETag is often just the MD5 in quotes
        if (head.ETag === `"${localMd5}"`) {
            console.log(`✅ Skip: ${fileName} already exists in R2 with same hash. (ETag match)`);
            return;
        }
        console.log(`🔄 ${fileName} exists but hash differs (Local: ${localMd5}, Remote: ${head.ETag}). Re-uploading...`);
    } catch (err: any) {
        // If 404, we continue to upload. Otherwise log warning.
        if (err.name !== 'NotFound' && err.$metadata?.httpStatusCode !== 404) {
            console.warn(`⚠️  Dedupe check ignored for ${fileName} due to error:`, err.message);
        }
    }

    // 2. Perform the upload if not skipped
    const ext = path.extname(fileName).toLowerCase().slice(1);
    const mimeType = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 
                     ext === 'png' ? 'image/png' :
                     ext === 'webp' ? 'image/webp' :
                     ext === 'svg' ? 'image/svg+xml' :
                     ext === 'gif' ? 'image/gif' : 'application/octet-stream';

    try {
        const command = new PutObjectCommand({
            Bucket: R2_BUCKET_NAME,
            Key: fileName,
            Body: fileContent,
            ContentType: mimeType,
            CacheControl: "public, max-age=31536000, immutable",
        });

        await s3.send(command);
        console.log(`🚀 Successfully uploaded ${fileName} to R2 bucket: ${R2_BUCKET_NAME}`);
    } catch (err) {
        console.error(`❌ Error uploading ${fileName} to R2:`, err);
        process.exit(1);
    }
}

// Get the file path from command line arguments
const targetFilePath = process.argv[2];
if (targetFilePath) {
    uploadFile(targetFilePath).catch(err => {
        console.error(err);
        process.exit(1);
    });
} else {
    console.error("❌ No file path provided");
    process.exit(1);
}
