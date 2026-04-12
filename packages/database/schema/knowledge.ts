import { createId as cuid } from "@paralleldrive/cuid2";
import { relations, sql } from "drizzle-orm";
import {
	boolean,
	customType,
	index,
	integer,
	jsonb,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
} from "drizzle-orm/pg-core";

// --- CUSTOM TYPES (PGVECTOR) ---

/** 
 * Half-precision Vector (float16)
 * Supports up to 4000 dimensions - Best for Qwen3-Embedding-4B (2560 dims)
 */
const halfvec = customType<{ data: number[]; config: { dimensions: number } }>({
	dataType(config) {
		return `halfvec(${config?.dimensions ?? 2560})`;
	},
	fromDriver(value: unknown) {
		if (typeof value !== "string") {
			return [];
		}
		return value
			.slice(1, -1)
			.split(",")
			.map((v) => Number.parseFloat(v));
	},
	toDriver(value: number[]) {
		return `[${value.join(",")}]`;
	},
});

/**
 * Postgres TSVECTOR Type
 */
const tsvector = customType<{ data: string }>({
	dataType() {
		return "tsvector";
	},
});

// PARA Areas
export const areaEnum = pgEnum("Area", ["WORK", "LEARN", "OTHER"]);
export const sourceTypeEnum = pgEnum("SourceType", ["OBSIDIAN", "MDX", "IMPORTED"]);
export const targetTypeEnum = pgEnum("TargetType", ["ARTICLE", "HEADING", "BLOCK"]);

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

		/** 
		 * 🆔 系统入库时间 (System Creation)
		 * 该记录首次被写入数据库的时间。主要用于系统审计，不建议作为文章展示日期。
		 */
		createdAt: timestamp("createdAt").defaultNow().notNull(),

		/** 
		 * 🔄 记录物理更新时间 (Record Modification)
		 * 数据库层记录发生任何变更的时间（由 Drizzle $onUpdate 自动维护）。
		 * 当内容、标题或元数据改变时，该值会自动刷新。
		 */
		updatedAt: timestamp("updatedAt")
			.defaultNow()
			.$onUpdate(() => new Date())
			.notNull(),

		/** 
		 * 📝 内容发布/创作日期 (Content Authoring Date)
		 * 映射自 Obsidian Frontmatter 中的 `date` 字段。
		 * 【重要】：这是博客前端展示日期、文章列表排序的核心依据（第一优先级）。
		 */
		publishedAt: timestamp("publishedAt"),
		
		// --- SYNC STATUS ---
		/** 
		 * 🚀 Sentinel 最后同步时间 (Last Sync Success)
		 * Sentinel 同步任务成功处理并完成该文件解析的时间戳。
		 */
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
			
		// --- EXTENDED TRACKING (WikiLink Opt) ---
		targetType: targetTypeEnum("targetType"),
		sourceHeadingId: text("sourceHeadingId"),
		sourceBlockId: text("sourceBlockId"),
		sourceTextSnippet: text("sourceTextSnippet"),
		sourceOrder: integer("sourceOrder"),
		targetFragmentRaw: text("targetFragmentRaw"),
		targetHeadingId: text("targetHeadingId"),
		targetBlockId: text("targetBlockId"),
		isFragmentResolved: boolean("isFragmentResolved").default(false).notNull(),
		attachmentUrl: text("attachmentUrl"),
		resolutionError: text("resolutionError"),
	},
	(table) => [
		index("link_from_idx").on(table.fromId),
		index("link_target_idx").on(table.normalizedTarget),
		index("link_resolved_idx").on(table.resolvedDocumentId),
	],
);

// ✅ P1.5: Document Sections (Heading-based chunks for preview)
export const documentSections = pgTable(
	"document_sections",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		documentId: text("documentId")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		headingId: text("headingId"),
		headingText: text("headingText").notNull(),
		headingLevel: integer("headingLevel").notNull(),
		sectionIndex: integer("sectionIndex").notNull(),
		html: text("html").notNull(),
		textContent: text("textContent").notNull(),
		startOffset: integer("startOffset"),
		endOffset: integer("endOffset"),
		isFirstSection: boolean("isFirstSection").default(false).notNull(),
	},
	(table) => [
		index("section_doc_idx").on(table.documentId),
		index("section_heading_idx").on(table.headingId),
	],
);

// ✅ P1.6: Document Blocks (Block anchor lookup)
export const documentBlocks = pgTable(
	"document_blocks",
	{
		id: text("id")
			.$defaultFn(() => cuid())
			.primaryKey(),
		documentId: text("documentId")
			.notNull()
			.references(() => documents.id, { onDelete: "cascade" }),
		blockId: text("blockId").notNull(),
		sectionId: text("sectionId")
			.notNull()
			.references(() => documentSections.id, { onDelete: "cascade" }),
		html: text("html").notNull(),
		textContent: text("textContent").notNull(),
		blockIndex: integer("blockIndex").notNull(),
	},
	(table) => [
		index("block_doc_idx").on(table.documentId),
		index("block_idx").on(table.blockId),
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
		headingId: text("headingId"),

		chunkText: text("chunkText").notNull(),

		// --- EMBEDDING DATA ---
		embeddingModel: text("embeddingModel"),
		embeddingVersion: text("embeddingVersion"),
		
		// ⚠️ HIGH-FIDELITY VECTOR DATA
		// Supporting Qwen3-Embedding-4B (Option B: 2560 dimensions with half-precision)
		embedding: halfvec("embedding", { dimensions: 2560 }),

		// --- SEARCH OPTIMIZATION (FTS) ---
		searchVector: tsvector("searchVector"),
		tokenCount: integer("tokenCount"),
		hasCode: boolean("hasCode").default(false).notNull(),
	},
	(table) => [
		index("chunk_doc_idx").on(table.documentId),
		index("chunk_lookup_idx").on(table.documentId, table.chunkIndex),
		// HNSW Index for cosine distance - Optimal for large scale RAG
		index("chunk_embedding_hnsw_idx").using(
			"hnsw",
			sql`${table.embedding} halfvec_cosine_ops`,
		),
		// GIN Index for Full-Text Search
		index("chunk_search_vector_idx").using("gin", table.searchVector),
	],
);

// --- RELATIONS ---

export const documentRelations = relations(documents, ({ many }) => ({
	links: many(documentLinks, { relationName: "outgoingLinks" }),
	incomingLinks: many(documentLinks, { relationName: "incomingLinks" }),
	chunks: many(documentChunks),
	sections: many(documentSections),
	blocks: many(documentBlocks),
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

export const documentSectionsRelations = relations(documentSections, ({ one }) => ({
	document: one(documents, {
		fields: [documentSections.documentId],
		references: [documents.id],
	}),
}));

export const documentBlocksRelations = relations(documentBlocks, ({ one }) => ({
	document: one(documents, {
		fields: [documentBlocks.documentId],
		references: [documents.id],
	}),
	section: one(documentSections, {
		fields: [documentBlocks.sectionId],
		references: [documentSections.id],
	}),
}));

export const documentChunksRelations = relations(documentChunks, ({ one }) => ({
	document: one(documents, {
		fields: [documentChunks.documentId],
		references: [documents.id],
	}),
}));
