# Wiki-Link 深度技术规范与实现指南 (v2.0)

> [!NOTE]
> 本文档旨在提供 Wiki-Link 处理链路的完整技术视图，涵盖从 Obsidian 源文件扫描到 Web 端高保真预览的所有细节。开发者应能通过本文档完整复现整个渲染逻辑。

---

## 1. 处理链路全景图 (Data Flow)

整个处理流程分为三个核心阶段，旨在将 Obsidian 的非确定性链接转化为 Web 端的确定性资产。

```mermaid
graph TD
    A[Obsidian Source: [[Target#Fragment|Alias]]] --> B[Pass 1: Sentinel Crawl]
    B --> C[Pass 2: Metadata Pre-scan & ID Allocation]
    C --> D[Pass 3: Parallel Parsing & Resolution]
    D --> E[HTML Transformation & Injection]
    E --> F[Next.js Server: Pre-rendering]
    F --> G[Client: O(1) Interactivity & Preview]
```

---

## 2. 阶段一：身份预分配 (Identity Pre-allocation)

为了在单次同步中生成包含 UUID 的 HTML，Sentinel 在扫描阶段执行以下逻辑：

### 2.1 内存索引构建 (`pre_scan_metadata`)
1.  **文件爬取**：线性遍历仓库中所有 `.md` 文件。
2.  **身份锚定**：
    *   执行批量 SQL：`SELECT id, "vaultPath" FROM documents WHERE "vaultPath" = ANY(paths)`。
    *   **老文档**：从数据库获取并保留其原始 UUID。
    *   **新文档**：在内存中立即生成 `cuid2` 作为预分配 ID。
3.  **多键合并方案**：
    为了支持 Wiki-Link 的模糊匹配，内存索引 (`metadata_index`) 必须存储同一文档的多个 Key 映射到同一个 `MetadataExcerpt`：
    *   `vaultPath` (全路径，NFC 归一化)
    *   `basename` (文件名)
    *   `slug` (来自 Frontmatter 或路径计算)
    *   `title` (展示标题)
    *   `aliases` (别名数组)

---

## 3. 阶段二：解析与转换逻辑 (Resolution & Transformation)

在 `execute_pipeline` 阶段，Sentinel 将原始 Markdown 转换为高度语义化的 HTML。

### 3.1 锚点生成算法 (Anchor Standard)
为了确保 href 链接与目标 DOM ID 的绝对对称，遵循以下规则：

| 类型 | 处理前 (Obsidian) | 处理后 (HTML ID & Href) | 逻辑说明 |
| :--- | :--- | :--- | :--- |
| **Heading** | `## 1. 参考 资料` | `id="h-1-参考-资料"` | 强制 `h-` 前缀 + Kebab-case slugify。 |
| **Block** | `^block-id` | `id="block-id"` | 剥离 `^` 符号，作为标准 DOM ID。 |

### 3.2 HTML 属性注入规范
解析器 (`markdown-parser`) 产出的 `<a>` 标签必须在转换后包含以下属性：

```html
<a 
  class="internal-link wiki-link" 
  href="/blog/target-slug#h-anchor" 
  data-target="原始输入文本" 
  data-link-type="article | heading | block" 
  data-document-id="预分配的-UUID"
>
  显示文本
</a>
```

**关键注入逻辑 (`resolve_placeholders_in_html`)：**
*   使用正则表达式识别带 `data-target` 的特定 `<a>` 占位符。
*   **命中优先级**：内存索引 (Memory Index) > 数据库记录 (DB Backup)。
*   **href 修正**：如果解析到目标 Slug 为 `target-slug`，则根据链接类型（heading/block）重构 `href`，确保其包含正确的 `h-` 前缀。

---

## 4. 阶段三：前端交互协议 (Frontend Interactivity)

前端不再承担复杂的路径猜测逻辑，而是基于后端提供的确定性属性进行操作。

### 4.1 精准定位逻辑 (`scrollToFragment`)
1.  从 URL 获取 `hash`。
2.  **不执行** Slugify 变换（因为后端已经做好了）。
3.  直接调用 `document.getElementById(decodeURIComponent(hash))`。

### 4.2 高保真预览策略 (`WikiLinkPreviewManager`)
1.  **基于 ID 的快速预检**：
    *   由于 HTML 中包含 `data-document-id`，前端预览首选通过该 ID 向服务器请求元数据。
2.  **同页片段截取 (DOM Scraping)**：
    *   如果链接指向当前 Slug，直接在当前 `article` 容器内通过 ID 定位元素。
    *   **块引用预览**：截取 `id` 对应元素的父节点 (`parentElement`)。如果是 `<li>`，则包裹在 `<ul>` 中以维持列表样式。
    *   **标题预览**：从目标标题开始，向下扫描直到遇到同级或更高级别的标题为止，截取中间的所有 DOM 节点。

---

## 5. 数据库查询优化 (SQL Optimization)

### 5.1 鲁棒的片段查询 (`getPostFragmentPreviewQuery`)
在服务器端处理预览请求时，SQL 必须兼容带/不带前缀的 ID 形式：

```typescript
// 伪代码：兼容块引用和标题的鲁棒查询
const isBlock = fragment.startsWith('^') || (!fragment.startsWith('h-') && fragment.length === 8);
if (isBlock) {
  const queryId = fragment.startsWith('^') ? fragment : `^${fragment}`;
  // 查询 document_blocks 表
} else {
  // 查询 document_sections 表，匹配 headingId = fragment OR headingId = fragment.replace('h-', '')
}
```

---

## 6. 复现检查表 (Implementation Checklist)

- [ ] **Unicode**：全链路强制使用 `NFC` 归一化。
- [ ] **IDs**：Heading ID 必须带有 `h-` 前缀。
- [ ] **Paths**：所有路径处理禁止使用 `.split('/').pop()`，必须使用 `WikiLink` 工具库。
- [ ] **UUIDs**：`MetadataExcerpt` 必须承载预分配 ID，`upsert_document` 必须接受该 ID 写入。
- [ ] **Security**：`DOMPurify` 必须白名单放行 `data-link-type` 和 `data-document-id`。

---