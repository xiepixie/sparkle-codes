import { createId as cuid } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import {
	pgTable,
	text,
	timestamp,
	boolean,
	jsonb,
	index,
	pgEnum,
	integer,
	uniqueIndex,
	customType,
} from "drizzle-orm/pg-core";

// --- CUSTOM TYPES (PGVECTOR) ---

/** 
 * Standard Float Vector (Max 2000 dimensions)
 */
const vector = customType<{ data: number[]; config: { dimensions: number } }>({
	dataType(config) {
		return `vector(${config?.dimensions ?? 768})`;
	},
	fromDriver(value: unknown) {
		if (typeof value !== "string") return [];
		return value
			.slice(1, -1)
			.split(",")
			.map((v) => parseFloat(v));
	},
	toDriver(value: number[]) {
		return `[${value.join(",")}]`;
	},
});

/** 
 * Half-precision Vector (float16)
 * Supports up to 4000 dimensions - Best for Qwen3-Embedding-4B (2560 dims)
 */
const halfvec = customType<{ data: number[]; config: { dimensions: number } }>({
	dataType(config) {
		return `halfvec(${config?.dimensions ?? 2560})`;
	},
	fromDriver(value: unknown) {
		if (typeof value !== "string") return [];
		return value
			.slice(1, -1)
			.split(",")
			.map((v) => parseFloat(v));
	},
	toDriver(value: number[]) {
		return `[${value.join(",")}]`;
	},
});

// PARA Areas
export const areaEnum = pgEnum("Area", ["WORK", "LEARN", "OTHER"]);
export const sourceTypeEnum = pgEnum("SourceType", ["OBSIDIAN", "MDX", "IMPORTED"]);

// ✅ P0: Documents - High-Fidelity Knowledge Node
export const documents = pgTable(
	"documents",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),

		// --- IDENTITY ---
		vaultPath: text("vaultPath").notNull().unique(),
		slug: text("slug").notNull(),
		title: text("title").notNull(),
		aliases: jsonb("aliases").$type<string[]>().default([]),

		// --- CONTENT & ARTIFACTS ---
		content: text("content").notNull(),
		html: text("html"),

		// --- COMPILER TRACKING ---
		contentHash: text("contentHash").notNull(),
		parserVersion: text("parserVersion").notNull(),

		// --- STRUCTURED METADATA (High-frequency query fields) ---
		description: text("description"),
		banner: text("banner"),
		area: areaEnum("area").default("OTHER").notNull(),
		sourceType: sourceTypeEnum("sourceType").default("OBSIDIAN").notNull(),
		isPublished: boolean("isPublished").default(false).notNull(),

		// --- EXTENSIBLE METADATA (Low-frequency fields) ---
		metadata: jsonb("metadata").$type<Record<string, any>>().default({}),

		createdAt: timestamp("createdAt").defaultNow().notNull(),
		updatedAt: timestamp("updatedAt")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),
		publishedAt: timestamp("publishedAt"),
		
		// --- SYNC STATUS ---
		lastSyncedAt: timestamp("lastSyncedAt"),
	},
	(table) => [
		uniqueIndex("document_slug_area_uidx").on(table.slug, table.area),
		index("document_vault_path_idx").on(table.vaultPath),
		index("document_area_idx").on(table.area),
	],
);

// ✅ P1: Synaptic Links (3-Layer Resolution Model)
export const documentLinks = pgTable(
	"document_links",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),

		fromId: text("fromId")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),

		// --- LINK RESOLUTION LAYERS ---
		rawTarget: text("rawTarget").notNull(),
		normalizedTarget: text("normalizedTarget"),

		resolvedDocumentId: text("resolvedDocumentId").references(() => documents.id, {
			onDelete: "set null",
		}),

		anchor: text("anchor"),
		displayText: text("displayText"),

		isResolved: boolean("isResolved").default(false).notNull(),
		type: text("type")
			.$type<"wiki" | "embed">()
			.default("wiki")
			.notNull(),
	},
	(table) => [
		index("link_from_idx").on(table.fromId),
		index("link_target_idx").on(table.normalizedTarget),
		index("link_resolved_idx").on(table.resolvedDocumentId),
	],
);

// ✅ P2: Semantic Fragments (Chunking Logic)
export const documentChunks = pgTable(
	"document_chunks",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),

		documentId: text("documentId")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),

		// --- CHUNK LOCATION & CONTEXT ---
		chunkIndex: integer("chunkIndex").notNull(),
		startOffset: integer("startOffset"),
		endOffset: integer("endOffset"),
		headingPath: text("headingPath"),

		chunkText: text("chunkText").notNull(),

		// --- EMBEDDING DATA ---
		embeddingModel: text("embeddingModel"),
		embeddingVersion: text("embeddingVersion"),
		
		// ⚠️ HIGH-FIDELITY VECTOR DATA
		// Supporting Qwen3-Embedding-4B (Option B: 2560 dimensions with half-precision)
		embedding: halfvec("embedding", { dimensions: 2560 }),
	},
	(table) => [
		index("chunk_doc_idx").on(table.documentId),
		index("chunk_lookup_idx").on(table.documentId, table.chunkIndex),
		// HNSW Index for cosine distance - Optimal for large scale RAG
		index("chunk_embedding_hnsw_idx").using(
			"hnsw",
			sql`${table.embedding} halfvec_cosine_ops`,
		),
	],
);

// --- RELATIONS ---

export const documentRelations = relations(documents, ({ many }) => ({
	links: many(documentLinks, { relationName: "outgoingLinks" }),
	incomingLinks: many(documentLinks, { relationName: "incomingLinks" }),
	chunks: many(documentChunks),
}));

export const documentLinksRelations = relations(documentLinks, ({ one }) => ({
	from: one(documents, {
		fields: [documentLinks.fromId],
		references: [documents.id],
		relationName: "outgoingLinks",
	}),
	to: one(documents, {
		fields: [documentLinks.resolvedDocumentId],
		references: [documents.id],
		relationName: "incomingLinks",
	}),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
	document: one(documents, {
		fields: [documentChunks.documentId],
		references: [documents.id],
	}),
}));
