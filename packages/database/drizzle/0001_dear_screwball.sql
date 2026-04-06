ALTER TABLE "document_chunks" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "lastSyncedAt" timestamp;