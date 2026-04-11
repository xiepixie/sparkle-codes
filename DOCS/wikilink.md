# Wiki-Link 架构与处理逻辑协议 (v2.0)

> [!IMPORTANT]
> 本文档定义了 Obsidian Wiki-Link `[[Link]]` 到 Web 端 HTML 渲染的完整链路协议。所有 Agent 在修改相关逻辑时必须严格遵守本协议，确保 Rust 后端与 TypeScript 前端的高度对称。

---

## 1. 核心模型定义

| 术语 | 定义 | 来源 | 用途 |
| :--- | :--- | :--- | :--- |
| **Raw Target** | 原始输入字符串 (如 `A/B#Heading`) | Obsidian `[[...]]` | 解析起点 |
| **Vault Path** | 相对库根目录的路径 (如 `Work/Project A.md`) | 文件系统 | 数据库主键，链接解析目标 |
| **Slug** | URL 友好的 kebab-case 路径 (如 `work-project-a`) | `slugifyPath(Vault Path)` | 路由、API 查询 |
| **Fragment** | 锚点信息 (如 `#h-标题` 或 `#^block-id`) | Rust Parser 生成 | DOM 定位、平滑滚动 |
| **Document ID** | 文档的 UUID | 数据库 `posts.id` | 高性能预览查询 (O(1)) |

---

## 2. 统一解析协议 (Two-Layer Protocol)

为确保跨平台一致性，所有路径到 Slug 的转换必须遵循以下双层处理模型：

### Layer 1: 结构化解析 (Structural Resolution)
由 Rust `markdown-parser` 或 TypeScript `@repo/utils/wikilink` 执行：
1.  **Unicode 归一化**：强制使用 `NFC` (Normalization Form C)，解决 Mac/Linux 文件名不一致问题。
2.  **组件拆分**：分离 `Path`、`Alias` (|) 和 `Fragment` (#)。
3.  **Fragment 预处理**：
    *   **Block ID** (以 `^` 开头)：去除 `^` 前缀，保留原始 ID。
    *   **Heading**：应用 `slugifyPath` 并添加 `h-` 前缀（例如：`#2. 标题` -> `#h-2-标题`）。

### Layer 2: 规范化解析 (Canonical Resolution)
由 Rust `Sentinel` 同步器执行：
1.  **路径决策**：根据文件系统索引或数据库记录，将文件名/别名映射到真实的 `Vault Path`。
2.  **Slug 生成**：调用与前端对称的 `slugifyPath` 算法生成最终 URL。
3.  **ID 注入**：从数据库获取目标文档的 `UUID` 并注入到 HTML 属性中。

---

## 3. HTML 产出规范 (Data Attributes)

同步后的 Wiki-Link 必须包含以下语义化属性：

```html
<a 
  class="internal-link" 
  href="/blog/target-slug#h-heading-id" 
  data-target="原始输入文本" 
  data-link-type="article | heading | block" 
  data-document-id="UUID-1234-5678"
>
  显示文字
</a>
```

*   **`href` (金标准)**：包含完全解析后的 URL。其中的 Fragment 必须直接对应目标 DOM 元素的 `id`。
*   **`data-link-type`**：指示链接的精确类型，用于前端 UI 分支决策。
*   **`data-document-id`**：可选但推荐。存在时，前端预览组件应优先基于 ID 进行 API 查询，而非字符串匹配。

---

## 4. 后端处理细节 (Rust)

### A. Parser 层 (`markdown-parser`)
*   **ID 注入**：`inject_heading_ids` 使用 `h-{slugify(text)}` 格式。
*   **Href 构建**：`build_wikilink_href` 必须使用完全相同的 slugify 算法处理 fragment，确保 `href` 中的锚点与生成的标题 ID 100% 匹配。

### B. Sentinel 层
*   **占位符替换**：在同步过程中，使用正则表达式识别所有带 `data-target` 的链接，并根据数据库解析结果注入 `data-document-id` 及完整的 `href`。
*   **去重保护**：在处理长文档时，需对 HTML 中的重复链接目标进行去重处理，避免正则表达式多次替换导致属性冗余。

---

## 5. 前端处理行为 (Next.js / Client)

### A. 精准滚动 (`scrollToFragment`)
由于 Rust 后端已经保证了 `href` 中的锚点就是真实的 DOM ID，前端不再需要任何 fallback 猜测逻辑：

```typescript
function scrollToFragment(fragment: string) {
  const decoded = decodeURIComponent(fragment.replace("#", ""));
  const targetElement = document.getElementById(decoded);
  if (targetElement) {
    targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}
```

### B. 高保真预览 (`WikiLinkPreviewManager`)
1.  **Cache Key**：优先使用 `data-document-id` 作为缓存键，实现精确匹配。
2.  **API 请求**：调用 `/api/preview?id=...`。后端应支持按 UUID 直接查询文档元数据和物理切片。
3.  **DOM 提取**：如果链接指向当前页面 (`isSamePage`)，直接在当前 DOM 容器内查找 `id` 匹配的元素，并截取相邻节点作为预览内容。

---

## 6. 协作模型总结

| 阶段 | 职责所在 | 关键产出 |
| :--- | :--- | :--- |
| **同步 (Sync)** | Sentinel (Rust) | 生成包含 UUID 和 Slugified Anchor 的持久化 HTML |
| **渲染 (Render)** | Next.js (Server) | 零计算量输出预处理好的 HTML 字符串 |
| **交互 (Interact)** | Interactivity (Client) | 通过 `getElementById` 实现 O(1) 定位；通过 UUID 实现 O(1) 预览 |

**结论**：这套“重后端、轻前端”的架构确保了非 ASCII 字符（如中文）和复杂锚点在所有场景下都能 100% 稳定运行，同时最大限度减少了客户端的计算开销。
