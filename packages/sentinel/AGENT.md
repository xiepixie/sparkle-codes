# Sentinel 同步引擎 — 分层架构说明

## 1. 定位

`sentinel` 是一个原生 Rust 守护进程，负责：

*   监听 Obsidian Vault 和 附件目录 文件变化（创建 / 修改 / 删除）
*   读取并解析 Markdown 文档（调用 `@v2/markdown-parser` WASM 引擎）
*   提取 frontmatter、路径语义、文档分段和链接关系
*   将结构化结果写入 Neon Postgres（documents / links / sections / blocks）
*   将图片、视频等附件同步至 Cloudflare R2（原生 `aws-sdk-s3` 客户端）
*   生成发布产物（MDX 文件输出至 Fumadocs 内容目录）

设计哲学不是"尽量抽象"，而是：

* **主流程清晰** — 六阶段流水线一目了然
* **纯逻辑与副作用隔离** — `utils/*` 保持纯函数化
* **数据库访问集中** — 所有 SQL 仅出现在 `db/*`
* **监听层不污染业务层** — `watcher.rs` 只做调度

---

## 2. 目录结构

```text
src/
├── main.rs                  # 入口层：极薄壳
├── app.rs                   # 应用装配层：env / tracing / pool / engine / watcher
├── watcher.rs               # 事件驱动层：文件系统事件 → 同步 / 删除调度
├── sync.rs                  # 同步核心层：SyncEngine 结构体 + 六阶段流水线
├── config.rs                # 环境配置：SyncConfig
├── types.rs                 # 数据契约层：共享 struct / enum
├── db/
│   ├── mod.rs               # 统一 re-export
│   ├── documents.rs         # 文档主记录 CRUD
│   ├── links.rs             # 链接批量解析 + 持久化
│   └── sections.rs          # 文档分段 + Block 锚点持久化
└── utils/
    ├── mod.rs               # 统一 re-export
    ├── frontmatter.rs       # Frontmatter 切分 + YAML 解析
    ├── path.rs              # 路径推导 / Area 检测 / Slug 生成
    ├── html.rs              # HTML 剥离 / 正则模式（Heading / Block）
    ├── transform.rs         # Obsidian 预处理 + 链接占位符解析
    ├── mdx.rs               # MDX 安全转义 + MDX 文件输出
    └── r2.rs                # R2/S3 客户端：附件哈希校验与云端同步
```

依赖方向保持单向：

```text
main → app → watcher → sync (SyncEngine) → db/* / utils/* / types / config
```

* `utils/*` 和 `types.rs` **不反向依赖** `watcher`、`app`。
* `db/*` **不依赖** `watcher`。
* `watcher.rs` **不写** 业务逻辑。

---

## 3. 技术栈

| 类别 | 依赖 | 用途 |
|------|------|------|
| 异步运行时 | `tokio` (full) | 全局异步调度 |
| 文件监听 | `notify` + `notify-debouncer-full` | FS 事件 + 500ms 去抖 |
| 目录遍历 | `walkdir` | initial_sync 全量扫描 |
| 数据库 | `sqlx` (Postgres, tokio-rustls, chrono) | 异步 SQL 执行 |
| 文本解析 | `yaml-rust2` | Frontmatter YAML 解析 |
| Markdown 引擎 | `markdown-parser` (本地路径依赖) | `parse_content_native()` |
| 正则 | `regex` + `once_cell::Lazy` | HTML 解析 / 转换模式 |
| 哈希 | `sha2` + `hex` | 内容变更检测 |
| ID 生成 | `cuid2` | 文档 / 分段 / 链接 ID |
| 序列化 | `serde` + `serde_json` | frontmatter→JSON / metadata |
| 时间 | `chrono` (serde) | 时间戳处理 |
| URL 编码 | `urlencoding` | slug / 路径安全 |
| 日志 | `tracing` + `tracing-subscriber` | 日志收集 |
| 环境变量 | `dotenvy` | .env / .env.local 加载 |
| R2 存储 | `aws-sdk-s3` + `aws-config` | 原生云存储同步 |
| 错误处理 | `anyhow` | `Result<T, anyhow::Error>` |

---

## 4. 各层职责定义

### 4.1 `main.rs` — 入口层

**当前状态**：5 行。仅声明模块并调用 `app::run().await`。

**硬约束**：不包含任何业务判断、初始化细节或条件逻辑。

---

### 4.2 `app.rs` — 应用装配层

**职责**：组装运行时环境。

**当前实现**：
1. `tracing_subscriber::fmt::init()` — 日志初始化
2. `dotenvy::dotenv()` — 加载环境变量
3. `SyncConfig::from_env()` → `Arc<SyncConfig>` — 构建配置
4. `PgPoolOptions` → `Pool<Postgres>` — 数据库连接池
5. `SyncEngine::new(pool, config)` → `Arc<SyncEngine>` — 构建引擎
6. `OBSIDIAN_SOURCE_PATHS` → `Vec<String>` — 解析监听路径
7. `watcher::run(engine, watch_paths).await` — 启动监听

**不应该做的事**：不处理单文件同步、不写 SQL、不做 frontmatter 解析。

---

### 4.3 `watcher.rs` — 事件驱动层

**职责**：将"文件系统事件"转化为"同步/删除任务"。

**当前实现**：
* 调用 `engine.initial_sync()` 进行全量扫描
* 使用 `notify-debouncer-full` 创建 500ms 去抖监听器
* 通过 `tokio::sync::mpsc` 异步接收事件
*   逐事件分派：
  *   `.md` 文件删除 → `engine.delete_file(vault_path)`
  *   `.md` 文件创建/修改 → `engine.sync_file(vault_path, abs_path)`
  *   附件（图片/视频等）变化 → `engine.sync_attachment(abs_path)`
* 每个同步任务通过 `tokio::spawn` 异步执行

**不应该做的事**：不决定 slug 规则、不做 SQL 查询、不做内容转换。

---

### 4.4 `sync.rs` — 同步核心层（`SyncEngine`）

**职责**：`SyncEngine` 结构体是整个同步流水线的核心。它**同时**承担了编排与执行的职责（当前代码没有独立的 `sync_engine.rs`）。

**结构体定义**：

```rust
pub struct SyncEngine {
    pub pool: Pool<Postgres>,
    pub config: Arc<SyncConfig>,
    pub semaphore: Arc<Semaphore>,  // 并发控制（= pool_size）
}
```

**公开入口**：

| 方法 | 职责 |
|------|------|
| `initial_sync(&self, watch_paths)` | 全量扫描：WalkDir → 遍历 Vault 与 Attachment 目录 |
| `sync_file(&self, vault_path, abs_path)` | 单文件同步入口（获取信号量 → execute_pipeline） |
| `sync_attachment(&self, abs_path)` | 附件同步入口（哈希对比 → R2 上传） |
| `delete_file(&self, vault_path)` | 删除：DB 删除 + MDX 清理 |

**六阶段流水线** (`execute_pipeline`)：

```text
Stage 1: read_context        → 读取文件、计算 SHA256 哈希、提取 mtime
Stage 2: extract_metadata    → split_frontmatter + parse YAML + 构建 DocumentMetadata
Stage 3: compute_sync_plan   → 查 DB 比对 hash/parserVersion → Skip / Create / Update
Stage 4: parse_and_resolve   → transform_obsidian_to_mdx → parse_content_native
                                → resolve_targets_batch → 分段/Block解析 → resolve_placeholders_in_html
Stage 5: persist_sync        → upsert_document + persist_links + upsert_sections + upsert_blocks
Stage 6: publish_outputs     → (Dual-Gated) publish_mdx 仅在 Area 允许且 is_published=true 时输出
```

**不应该做的事**：不管理 watcher 的 channel 逻辑、不直接构造 SQL 字符串（委托给 `db/*`）。

---

### 4.5 `config.rs` — 环境配置

**当前字段**：

| 字段 | 环境变量 | 默认值 |
|------|----------|--------|
| `blog_dest` | `SYNC_BLOG_DEST` | `apps/web/content/blog` |
| `docs_dest` | `SYNC_DOCS_DEST` | `apps/docs/content/docs` |
| `notes_dest` | `SYNC_NOTES_DEST` | `apps/web/content/notes` |
| `pool_size` | `SENTINEL_POOL_SIZE` | `10` |
| `parser_version` | (硬编码) | `v1.3.6` |
| `r2_bucket` | `R2_BUCKET_NAME` | `sparkle-assets` |
| `r2_public_domain` | `R2_PUBLIC_DOMAIN` | `cdn.sparkle.codes` |

**边界**：
* "根据配置返回目录基路径" → `config.rs`
* "根据 vault path 推导 area / subfolder / slug" → `utils/path.rs`

---

### 4.6 `types.rs` — 数据契约层

**当前类型清单**：

| 类型 | 用途 |
|------|------|
| `FileContext` | 文件运行时上下文（vault_path / full_path / content_hash / last_modified） |
| `DocumentMetadata` | 同步元数据（title / slug / area / sub_folder / expected_mdx_path / aliases / tags 等） |
| `ResolvedLink` | 链接解析结果（target_id / target_slug / target_area） |
| `LinkInstance` | 单条链接实例（kind / target / anchor / alias / resolved / source_order） |
| `SectionMetadata` | 文档分段（heading_id / heading_text / heading_level / html / text_content / index / is_first） |
| `BlockMetadata` | Block 锚点（block_id / section_id / html / text_content / index） |
| `SyncAction` | 同步决策枚举：`Skip` / `Create` / `Update` / `Delete` |

**硬约束**：不包含业务逻辑、不写 SQL、不做 I/O。

---

### 4.7 `db/mod.rs` — 数据库模块出口

统一 re-export 三个子模块：`documents`、`links`、`sections`。

---

### 4.8 `db/documents.rs` — 文档主记录

**当前函数**：

| 函数 | 职责 |
|------|------|
| `get_document_sync_info(pool, vault_path)` | 查询现有 hash / parserVersion / slug（用于 sync_plan） |
| `upsert_document(pool, ctx, meta, body, html)` | INSERT ... ON CONFLICT (vaultPath) DO UPDATE → 返回 doc_id |
| `delete_document(pool, vault_path)` | DELETE ... RETURNING slug, area |

**写入字段**：title / slug / vaultPath / area (CAST → Area enum) / content / html / contentHash / parserVersion / aliases (jsonb) / metadata (jsonb with tags) / updatedAt / lastSyncedAt / isPublished。

---

### 4.9 `db/links.rs` — 链接解析与持久化

**当前函数**：

| 函数 | 职责 |
|------|------|
| `resolve_target(pool, target_name)` | 单目标解析（内部复用 batch） |
| `resolve_targets_batch(pool, targets)` | 批量查询：slug / title / alias 三级匹配优先级 |
| `persist_links(pool, doc_id, links)` | DELETE 旧链接 → 批量 INSERT（QueryBuilder） |

**解析优先级**：
1. Slug 精确匹配（highest）
2. Title 匹配
3. Alias 匹配（lowest）

**写入字段**：id / fromId / rawTarget / normalizedTarget / resolvedDocumentId / anchor / displayText / isResolved / type / targetType (CAST → TargetType enum) / sourceOrder / targetFragmentRaw。

**关键边界**：此层负责"链接在数据库里怎么表示"。文本层面的 `[[Page]]` → `<a>` 替换属于 `utils/transform.rs`。

---

### 4.10 `db/sections.rs` — 分段与 Block 持久化

**当前函数**：

| 函数 | 职责 |
|------|------|
| `upsert_sections(pool, doc_id, sections)` | DELETE 旧分段（FK CASCADE 到 blocks） → 批量 INSERT |
| `upsert_blocks(pool, doc_id, blocks)` | 批量 INSERT blocks |

---

### 4.11 `utils/frontmatter.rs` — Frontmatter 处理

**两步设计**（已实现）：

1. `split_frontmatter(content) → FrontMatterResult { raw_yaml, body }` — 纯文本切分，行扫描逻辑，处理 CRLF / 未闭合 / 正文中 `---` 等边界情况
2. `parse_frontmatter(content) → ParsedFM { clean_body, fields: HashMap<String, Value> }` — 调用 split → yaml-rust2 解析 → yaml_to_json 转换

**核心类型**：
* `FrontMatterResult<'a>` — 零拷贝文本切分结果
* `ParsedFM` — 拥有所有权的解析结果

**硬约束**：不做数据库逻辑、不做 I/O。

---

### 4.12 `utils/path.rs` — 路径推导

**当前函数**：

| 函数 | 职责 |
|------|------|
| `detect_area(vault_path)` | 中文目录名匹配 → `"WORK"` / `"LEARN"` / `"OTHER"` |
| `get_sub_folder(vault_path, area)` | LEARN 区域的 PARA 子分类 → projects / resources / archives / misc |
| `get_dest_path_for_vault(config, vault_path, slug)` | 拼接目标 MDX 路径 |
| `slugify(vault_path)` | 路径 → 小写 kebab-case slug |

**PARA 路由规则**（LEARN 区域）：

| 中文目录关键词 | 映射 | 默认发布状态 | 说明 |
|----------------|------|--------------|------|
| `项目` | `projects` | ✅ Yes | 高质量、完整性的产出 |
| `资源` | `resources` | ❌ No | 外部参考、深度研究，需手动开启 |
| `收集` | `collect` | ❌ No | 碎片化灵感、原始摘录，需手动开启 |
| `存档` / `Archives` | `archives` | ✅ Yes | 已完成的历史项目 |
| (其他) | `misc` | ❌ No | 无法分类的杂项 |

**Area → 输出目录映射**：

| Area | dest_base 配置键 | 默认值 |
|------|-------------------|--------|
| WORK | `blog_dest` | apps/web/content/blog |
| LEARN | `docs_dest` | apps/docs/content/docs |
| OTHER | `notes_dest` | apps/web/content/notes |

**硬约束**：纯函数，不读环境变量（通过 `SyncConfig` 参数传入），不写文件，不查数据库。

**注意**：`path.rs` 依赖 `config.rs`（`get_dest_path_for_vault` 接受 `&SyncConfig`），但不依赖其他任何模块。

---

### 4.13 `utils/html.rs` — HTML 工具

**当前内容**：

| 导出 | 职责 |
|------|------|
| `RE_HEADING_PARSE` (Lazy Regex) | 匹配 `<h1-6 id="...">...</h1-6>` 用于分段切割 |
| `RE_BLOCK_PARSE` (Lazy Regex) | 匹配带 `^block-*` 锚点的 `<p>`/`<li>`/`<blockquote>`/`<div>` |
| `strip_html(html) → String` | 剥离标签 + 解码实体 + 规范化空白 → 纯文本 |

**硬约束**：纯函数，无 I/O，无数据库依赖。

---

### 4.14 `utils/transform.rs` — Obsidian 预处理与链接解析

**当前函数**：

| 函数 | 职责 |
|------|------|
| `transform_obsidian_to_mdx(content)` | 解析前预处理：剥离 Meta Bind 语法（INPUT[...] / VIEW[...] / BUTTON[...]），替换为 placeholder span |
| `resolve_placeholders_in_html(html, links)` | 解析后处理：将 parser 输出的 `data-target` + `href="#"` wiki-link 占位符替换为真实路由路径 |

**路由映射**（`resolve_placeholders_in_html`）：

| Area | 路由前缀 |
|------|----------|
| WORK | `/blog` |
| LEARN | `/docs` |
| OTHER | `/notes` |

**依赖**：`types::LinkInstance`（仅读取 resolved 结果），`regex`，`once_cell::Lazy`。

---

### 4.15 `utils/mdx.rs` — MDX 安全与发布

**当前函数**：

| 函数 | 职责 |
|------|------|
| `apply_mdx_safety(content)` | `{` → `&#123;`，`}` → `&#125;`（防止 MDX/JSX 表达式注入） |
| `publish_mdx(dest, html_content)` | 创建目录 + 写入 MDX 文件（async I/O） |

**注意**：`publish_mdx` 包含异步文件 I/O，这是 `utils/*` 里唯一的副作用函数。此函数语义上更接近"发布动作"，但当前归入 `utils/mdx.rs` 是为了将 MDX 相关逻辑（安全处理 + 输出）集中在一处。

### 4.15 `utils/r2.rs` — 云存储客户端

**职责**：封装 R2/S3 云存储交互逻辑。

**关键逻辑**：
1.  **哈希检测**：上传前计算文件 SHA256，利用 `head_object` 检查 R2 中是否已存在相同哈希的文件，实现极致秒传。
2.  **路径规则**：所有附件存储在 `attachments/{hash}.{ext}`。
3.  **Content-Type 自动推导**：根据后缀名（png/jpg/mp4/pdf 等）自动设置正确的 MIME 类型。

---

## 5. 数据流（实际实现）

### 5.1 单文件同步

```text
watcher event (.md file create/modify)
  → sync::SyncEngine::sync_file(vault_path, abs_path)
    → semaphore.acquire()
    → execute_pipeline:
        [Stage 1] read_context
            → tokio::fs::read_to_string
            → sha2::Sha256 content hash
            → FileContext { vault_path, full_path, content_hash, last_modified }

        [Stage 2] extract_metadata
            → frontmatter::parse_frontmatter(content)
            → path::slugify / path::detect_area / path::get_sub_folder / path::get_dest_path_for_vault
            → DocumentMetadata { title, slug, area, aliases, tags, ... }

        [Stage 3] compute_sync_plan
            → db::documents::get_document_sync_info(pool, vault_path)
            → compare hash + parserVersion + MDX existence
            → SyncAction::Skip | Create | Update

        [Stage 4] parse_and_resolve_document
            → transform::transform_obsidian_to_mdx(body)      # Pre-processing
            → markdown_parser::parse_content_native(body)       # WASM 引擎
            → merge hashtags into meta.tags
            → db::links::resolve_targets_batch(pool, targets)   # 批量链接解析
            → html::RE_HEADING_PARSE → SectionMetadata[]        # 分段
            → html::RE_BLOCK_PARSE → BlockMetadata[]            # Block 锚点
            → transform::resolve_placeholders_in_html(html)     # 链接路由替换

        [Stage 5] persist_sync
            → db::documents::upsert_document(pool, ctx, meta, body, html) → doc_id
            → db::links::persist_links(pool, doc_id, links)
            → db::sections::upsert_sections(pool, doc_id, sections)
            → db::sections::upsert_blocks(pool, doc_id, blocks)

        [Stage 6] publish_outputs
            → (area ≠ "WORK") mdx::publish_mdx(dest, html)
```

### 5.2 文件删除

```text
watcher event (.md file remove)
  → sync::SyncEngine::delete_file(vault_path)
    → semaphore.acquire()
    → db::documents::delete_document(pool, vault_path) → Option<(slug, area)>
    → (area ≠ "WORK") tokio::fs::remove_file(dest_mdx_path)
```

### 5.3 全量同步

```text
watcher::run 启动时
  → engine.initial_sync(watch_paths)
    → WalkDir 递归扫描每个 watch_path
    → 对每个 .md 文件 spawn → sync_file(vault_path, abs_path)
    → JoinSet 等待所有任务完成
```

### 5.4 附件同步流 (Asset Sync)

```text
watcher event (attachment directory change)
  → sync::SyncEngine::sync_attachment(abs_path)
    → semaphore.acquire()
    → r2::R2Client::upload_attachment(abs_path)
        → 计算本哈希 (SHA256)
        → S3 HEAD 检查文件是否已存在
        → (不存在时) S3 PUT 上传
        → 返回公网引用地址 (cdn.sparkle.codes/attachments/...)
```

---

## 6. 数据库 Schema 对照

Sentinel 写入 Neon Postgres 的以下表（定义在 `packages/database/schema/knowledge.ts`）：

| 表 | 用途 | Sentinel 写入模块 |
|----|------|-------------------|
| `documents` | 文档主记录 | `db/documents.rs` |
| `document_links` | 文档间链接关系 | `db/links.rs` |
| `document_sections` | 标题级分段 | `db/sections.rs` |
| `document_blocks` | Block 锚点 | `db/sections.rs` |
| `document_chunks` | 向量化语义分片 | ❌ 未实现（由 `packages/ai` 负责） |

**Enum 类型**：
* `Area` — `WORK` / `LEARN` / `OTHER`
* `SourceType` — `OBSIDIAN` / `MDX` / `IMPORTED`（Sentinel 默认写入 `OBSIDIAN`，但当前 upsert 未显式设置 sourceType）
* `TargetType` — `ARTICLE` / `HEADING` / `BLOCK`

---

## 7. 模块边界硬约束

### 规则 1 — SQL 隔离
`watcher.rs` 和 `utils/*` 中**不允许**出现 SQL 字符串。所有 SQL 仅存在于 `db/*`。

### 规则 2 — 连接池隔离
`utils/*` **不允许**依赖 `sqlx::PgPool`。纯文本处理不持有数据库连接。

### 规则 3 — 关注点分离
`db/*` **不允许**写 Markdown / MDX / HTML 文本转换逻辑。

### 规则 4 — 装配层纯净
`app.rs` **不允许**包含单文件同步细节。

### 规则 5 — 类型层无副作用
`types.rs` **不允许**放复杂副作用逻辑（I/O、DB、channel 等）。

### 规则 6 — Frontmatter 两步法
Frontmatter 必须先 `split`（文本切分）再 `parse`（YAML 解析），不允许合并为一步。

### 规则 7 — PARA 路由单点定义
Area 检测（`工作领域` / `学习领域`）和 PARA 子分类（`项目` / `资源` / `存档`）的映射规则**只在 `utils/path.rs` 中定义一次**，不允许多处手写分支。

### 规则 8 — 链接一致性
链接的"数据库解析状态"（`db/links.rs`）和"HTML 占位符替换"（`utils/transform.rs`）必须基于同一份 `LinkInstance` 数据，不允许状态不一致。

---

## 8. 测试优先级

### 8.1 `utils/path.rs` — **必须单测**

* Area 检测（中文目录名边界）
* PARA 子分类映射
* 目标 MDX 路径生成
* Slug 稳定性（特殊字符、中文、多级路径）

### 8.2 `utils/frontmatter.rs` — **必须单测**

* LF / CRLF 兼容
* 无 frontmatter
* 未闭合 frontmatter
* 正文中出现 `---`（不应误切）
* 空 frontmatter（`---\n---`）
* 含特殊 YAML 值（数组、嵌套对象、布尔、整数）

### 8.3 `utils/html.rs` — **必须单测**

* `strip_html` 标签剥离
* HTML 实体解码（`&nbsp;`、`&#123;`、`&#125;` 等）
* `RE_HEADING_PARSE` 匹配有/无 id 的标题
* `RE_BLOCK_PARSE` 匹配各种 block 锚点格式

### 8.4 `utils/transform.rs` — **必须单测**

* Meta Bind 语法剥离（INPUT[...] / VIEW[...] / BUTTON[...]）
* Wiki-link 占位符替换（resolved / unresolved / 含 anchor）
* 各 Area 对应的路由前缀正确性

### 8.5 `utils/mdx.rs` — **建议单测**

* `{}` 花括号转义完整性

### 8.6 `db/links.rs` — **建议集成测试**

* 批量 resolve 正确性
* 三级匹配优先级（slug > title > alias）
* 未命中 target 返回 None
* `persist_links` 的 QueryBuilder 正确性

### 8.7 `sync.rs` SyncEngine — **建议端到端测试**

* `compute_sync_plan` 的 Skip / Create / Update 决策
* `delete_file` 流程（DB 删除 + MDX 清理）
### 8.8 [新增] 发布一致性测试
*   **双重门禁校验**：验证 `Area::Learn` + `is_published: false` 时，MDX 是否既不被生成也不被计划标记为“缺失”。

---

## 9. 核心业务逻辑备注

### 9.1 双重门禁发布机制 (Dual-Gated Publication)
为了防止同步引擎陷入“计划要补齐文件 vs 执行阶段拒绝写入”的死循环，MDX 生成遵循以下逻辑：
1. **Emit 检查**：只有 `LEARN` 等配置了 MDX 输出的领域才会进入检查流。
2. **Publish 检查**：只有 `meta.is_published` 为 `true` 的文档才会被写入磁盘并要求磁盘存在。
3. **默认状态**：`项目` 和 `存档` 默认 `published: true`；**`资源`** 和 **`收集`** 默认 `published: false`。

---

## 10. 已知技术债务与改进方向

| 编号 | 问题 | 影响 | 建议 |
|------|------|------|------|
| D1 | `sync.rs` 同时承担编排与执行，366 行 | 可维护性 | 考虑拆分 `sync_engine.rs` 承接 Stage 4 的分段/Block解析逻辑 |
| D2 | `mdx.rs` 的 `publish_mdx` 包含异步 I/O，违反 `utils/*` 纯函数原则 | 架构一致性 | 将 `publish_mdx` 上移至 `sync.rs` 或新建 `publish.rs` |
| D3 | 链接占位符替换在 `transform.rs` 中逐条构造 Regex | 性能 | 改为单次全量替换或使用 HashMap 查表 |
| D4 | `upsert_document` 未显式写入 `sourceType` 字段 | 数据完整性 | 添加 `sourceType: "OBSIDIAN"` 参数 |
| D5 | `parser_version` 硬编码在 `config.rs` 中 | 维护性 | 考虑从 `markdown-parser` crate 元数据自动读取 |
| D6 | `upsert_sections` 使用 DELETE + INSERT 而非 upsert | 性能/事务安全 | 当前可接受（FK CASCADE），未来考虑 batch upsert |
| D7 | `RE_HEADING_PARSE` 的 `[^\>]*` 贪婪匹配可能在嵌套标签场景失效 | 正确性 | 引入 `html5ever` 或约束解析器输出格式 |
| D8 | 无 graceful shutdown 机制 | 可靠性 | `watcher.rs` 添加 `tokio::signal::ctrl_c()` → 取消 JoinSet |
| D9 | `document_chunks` 向量化分片未实现 | 功能缺失 | 待 `packages/ai` RAG 管线就绪后集成 |

---

## 10. 环境变量清单

| 变量 | 必需 | 说明 |
|------|------|------|
| `DATABASE_URL` | ✅ | Neon Postgres 连接字符串 |
| `OBSIDIAN_SOURCE_PATHS` | ✅ | 逗号分隔的监听目录列表 |
| `SENTINEL_POOL_SIZE` | ❌ | 数据库连接池大小（默认 10） |
| `SYNC_BLOG_DEST` | ❌ | WORK 区域 MDX 输出目录 |
| `SYNC_DOCS_DEST` | ❌ | LEARN 区域 MDX 输出目录 |
| `SYNC_NOTES_DEST` | ❌ | OTHER 区域 MDX 输出目录 |
| `OBSIDIAN_ATTACHMENT_PATH` | ✅ | 附件原始存放路径 |
| `R2_BUCKET_NAME` | ✅ | R2 存储桶名称 |
| `R2_ACCOUNT_ID` | ✅ | Cloudflare Account ID |
| `R2_ACCESS_KEY_ID` | ✅ | R2 Access Key |
| `R2_SECRET_ACCESS_KEY` | ✅ | R2 Secret Key |
| `R2_PUBLIC_DOMAIN` | ❌ | CDN 域名（默认 cdn.sparkle.codes） |