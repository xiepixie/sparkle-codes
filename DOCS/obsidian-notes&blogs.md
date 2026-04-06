# [设计报告] Sparkle Codes: 全 Rust 核心内容引擎

## 1. 核心架构哲学 (Architectural Philosophy)

*   **解析权收归 Rust**: 唯一且绝对的解析逻辑位于 Rust 侧。Node.js 侧禁止引入任何依赖（如 `unified`, `remark`）执行解析。
*   **去 WASM 化微服务**: 弃用 `wasm-bindgen` 的内存拷贝开销，采用 **原生二进制 Daemon (Sentinel)** 和 **HTTP 微服务 (Parsing Facade)**。
*   **内容预渲染 (Pre-rendered Content)**: 在摄取阶段完成 Markdown -> HTML 转换，前端应用仅作为“成品 HTML”的容器。
*   **水合交互 (Client-side Hydration)**: React 组件通过 DOM 属性（`data-*`）定义的契约执行增强，不执行二次文本解析。

---

## 2. 组件详细设计与功能清单

### A. `packages/markdown-parser` (Rust 核心解析库)
**定位**: 解析引擎 (Parsing Engine)。一个纯粹的 Rust rlib，提供高保真语义转换。

*   **Embed 契约 (Embed Contract)**:
    *   弃用模糊的 `<span>` 占位，统一输出结构化属性：
        *   **图片嵌入**: `<span class="wiki-embed" data-embed-kind="image" data-src="Asset.png" data-alt="Description"></span>`
        *   **笔记嵌入**: `<span class="wiki-embed" data-embed-kind="note" data-target="Page#Fragment" data-target-doc-id="..."></span>` (ID 由后处理阶段填充)。
*   **HTML 安全与内容完整性 (Safety & Integrity)**:
    *   **B7: MDX 内容保真**: 解析器与 Sentinel 协作，确保 Markdown 中的 HTML 标签（如 `<details>`, `<img>`）在转换为 `.mdx` 时不被错误转义，完美适配 Fumadocs。
    *   **B14: Obsidian 增强语法支持**:
        *   **扩展任务标记 (Pass 2.6)**: 原生支持 `[>]` (进行中), `[!]` (重要), `[-]` (已取消), `[/]` (部分完成), `[?]` (疑问) 等状态。
        *   **Callout 语义转换 (Pass 2.7)**: 彻底弃用前端 DOM 重组。解析引擎直接将 `blockquote` 转换为结构化的 `<div class="md-callout">`，确保 SSR/CSR 结构绝对一致。
        *   **跳转导航锚点 (Pass 2.5)**: 自动为所有标题 (`h1-h6`) 生成基于内容的 Slug ID，并支持 `^id` 块引用锚点，确保 Obsidian 内部链接的高保真跳转。
    *   **B15: Math Re-injection Hardening**: 采用严苛的 HTML 属性转义（`escape_html_attr`）重新注入数学公式的 `data-tex` 属性，彻底根除包含 `'`, `<`, `>` 等特殊字符导致的 HTML 结构溃败或 XSS 风险。
    *   **作用域锁定**: 确保公式解析逻辑与代码块解析互斥。
    *   **协议限制**: 链接仅允许 `http`, `https`, `mailto` 协议。
    *   **高性能剥离**: 弃用解析器内部的 Frontmatter 解析，改由 Sentinel 在摄取阶段通过字符串切分完成，减少冗余内存拷贝。

### B. `packages/sentinel` (原生摄取编排器)
**定位**: 摄取编排器 (Ingestion Orchestrator)。负责物理世界到数字世界的同步。

*   **功能点与稳定性优化**:
    *   **B11: 非阻塞事件通道**: 采用 `tokio::mpsc` 加 `try_send` 机制处理文件变更事件，确保在大规模文件操作（如目录重命名）时不会阻塞 Notify 监听线程。
    *   **B8: 领域感知 Slug (Area-Aware Slug)**: 采用 `(slug, area)` 复合唯一索引，支持不同领域（Blog/Docs）存在同名笔记。内置 Robust Slugifier 自动处理非法字符。
    *   **B9: 事务安全 I/O (Commit-then-IO)**: 强制执行“先提交数据库事务，后执行物理文件写入”的原则，彻底解决因磁盘 I/O 阻塞导致的数据库连接池耗尽问题。
    *   **B12: 元数据标准化与物理注入 (Metadata Enrichment)**: 实现了全PARA领域的元数据 schema 统一：`(title, description, slug, area, date, updatedAt, tags, published)`。通过 `chrono` 实现高精度时间同步，并将所有元数据（含文件系统时间与 Obsidian Frontmatter）动态注入至生成的 `.mdx` 物理文件中。
    *   **B13: 内容清洗器 (Content Sanitizer)**: Sentinel 内置高性能 Regex 管道，自动转换以下 Obsidian 语法：
        *   `meta-bind-embed` -> `markdown` (标记为嵌入内容)。
        *   `ad-` callouts -> 标准 Markdown admonitions (`> [!INFO]`)。
        *   `[[WikiLinks]]` -> 标准 MD 链接 `[Title](Target)`。
        *   **MDX 兼容性转义**: 自动将正文中的 `{` 和 `}` 转义为 `\{` 和 `\}`，防止 Next.js 静态编译因误判为 JS 表达式而崩溃。
    *   **PARA 自动路由 & 草稿保护**: 逻辑识别 `工作领域` (WORK) 与 `学习领域` (LEARN)，并自动将 `0-收集箱` 或 `生活领域` 的内容标记为 `published: false`。
    *   **资源同步与 MDX 物理输出**: 负责资源迁移并重写 `data-src`。根据领域自动将内容导出至 `apps/web/content/blog` 或 `apps/docs/content/docs`。

### C. `packages/markdown-parser/src/MarkdownRenderer.tsx` (React 水合层)
**定位**: 交互增强器 (UI Hydrator)。

*   **功能点**:
    *   **契约驱动增强**: 基于 `data-embed-kind` 等属性，决定是渲染图片组件还是动态加载嵌入笔记内容。
    *   **零转换解析**: 该组件内部不包含任何正则表达式或解析逻辑，仅作为 DOM 事件监听与 Katex/Code highlight 的分发器。

---

## 3. 系统职责划分 (Separation of Concerns)

| 角色 | 组件 | 核心职责 |
| :--- | :--- | :--- |
| **Orchestrator** | `sentinel` | 监听变化、目录扫描、资源搬运、数据库状态维护、MDX 物理导出。 |
| **Engine** | `markdown-parser` | 解析逻辑、WikiLink 转换、HTML 安全清洗、元数据提取。 |
| **Facade** | **Parse API** | 暴露 HTTP 接口，处理实时预览、测试工具等非持久化解析请求。 |

---

## 4. 后期演进: Parsing Facade (微服务)

为了彻底移除 Node.js 对 Rust 逻辑的暗引用，我们将提供一个瘦微服务：
*   **职责收窄**: 仅处理 **临时/实时** 解析（如评论预览、后台编辑实时预览）。
*   **禁止范围**: 不处理文件扫描、不处理数据库写入、不处理大规模依赖图构建（这些由 `sentinel` 处理）。
*   **技术选型**: 使用 `axum` 调用 `markdown-parser` 引擎。

---
