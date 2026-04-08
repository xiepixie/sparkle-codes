CREATE TYPE "public"."TargetType" AS ENUM('ARTICLE', 'HEADING', 'BLOCK');--> statement-breakpoint
CREATE TABLE "document_blocks" (
	"id" text PRIMARY KEY NOT NULL,
	"documentId" text NOT NULL,
	"blockId" text NOT NULL,
	"sectionId" text NOT NULL,
	"html" text NOT NULL,
	"textContent" text NOT NULL,
	"blockIndex" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"documentId" text NOT NULL,
	"headingId" text,
	"headingText" text NOT NULL,
	"headingLevel" integer NOT NULL,
	"sectionIndex" integer NOT NULL,
	"html" text NOT NULL,
	"textContent" text NOT NULL,
	"startOffset" integer,
	"endOffset" integer,
	"isFirstSection" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
DROP INDEX "document_slug_uidx";--> statement-breakpoint
ALTER TABLE "document_chunks" ALTER COLUMN "embedding" SET DATA TYPE halfvec(2560);--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "targetType" "TargetType";--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "sourceHeadingId" text;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "sourceBlockId" text;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "sourceTextSnippet" text;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "sourceOrder" integer;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "targetFragmentRaw" text;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "targetHeadingId" text;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "targetBlockId" text;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "isFragmentResolved" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "document_links" ADD COLUMN "resolutionError" text;--> statement-breakpoint
ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_blocks" ADD CONSTRAINT "document_blocks_sectionId_document_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."document_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_sections" ADD CONSTRAINT "document_sections_documentId_documents_id_fk" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "block_doc_idx" ON "document_blocks" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX "block_idx" ON "document_blocks" USING btree ("blockId");--> statement-breakpoint
CREATE INDEX "section_doc_idx" ON "document_sections" USING btree ("documentId");--> statement-breakpoint
CREATE INDEX "section_heading_idx" ON "document_sections" USING btree ("headingId");--> statement-breakpoint
CREATE INDEX "chunk_embedding_hnsw_idx" ON "document_chunks" USING hnsw ("embedding" halfvec_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "document_slug_area_uidx" ON "documents" USING btree ("slug","area");