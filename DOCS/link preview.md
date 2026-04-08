明白了，你的意思是：**当前文档的预览不应该再去查一次数据库，因为数据已经在页面上了**。这完全正确。让我重新全面审阅后输出完整计划。

Viewed markdown-interactivity.tsx:820-870
Searched for "MarkdownInteractivity"
Viewed markdown-interactivity.tsx:520-545
Searched for "MarkdownInteractivity"
Viewed page.tsx:120-160
Viewed page.tsx:1-80
Searched for "getPostBySlug"
Viewed blog.ts:1-678

现在我对整个数据链路完全清楚了。以下是修正后的完整优化计划：

---

## WikiLink 双向链接预览系统 — 完整优化计划

### 数据链路现状分析

```
页面加载时:
  page.tsx → getPostBySlug(slug) → getPostBySlugQuery() → DB
  → mapDocumentToPost() (Shiki + KaTeX heavy rendering)
  → 传递 html 给 <MarkdownInteractivity html={...} currentSlug={slug}/>

当用户 hover wiki-link 时（包括当前文档自身的链接）:
  WikiLinkPreviewManager → getPostPreview() [Server Action]
    → getCachedPreviewPost(slug) → getPostBySlugQuery() → DB  ← 又来一次！
    → 返回 { title, description, area, status, tags, htmlContent? }
```

**核心浪费**：当前文档 `[[#Header]]` 或 `[[自己文档名]]` 的预览，再次调用 `getPostBySlugQuery` 去查数据库拿自己的数据——而这些数据页面加载时**已经**在 Server Component 里取过了。

---

### Phase 1：消除当前文档的重复查询 (P0)

#### 1.1 传递当前文档元数据到 WikiLinkPreviewManager

**思路**：页面 RSC（`page.tsx`）已经持有 `post` 完整数据。把预览所需的轻量字段透传下去，让 WikiLinkPreviewManager 对当前文档不发请求。

**改动链路**：

| 文件 | 改动 |
|------|------|
| `MarkdownInteractivityProps` | 新增可选 `currentPostMeta?: { title, description, area, status, tags }` |
| `page.tsx` L145 | 传入 `currentPostMeta` prop |
| `WikiLinkPreviewManager` props | 新增 `currentPostMeta` |
| `WikiLinkPreviewManager` hover 逻辑 | 命中 `currentSlug` 时直接用 props 数据，跳过 Server Action |

**对 fragment 预览的处理**：
- `[[#Header]]` 的 fragment 内容实际上已经在 DOM 中了
- 方案：当 `targetSlug === currentSlug` 且有 fragment 时，直接从 DOM 提取对应 heading/block 的 `innerHTML`，零网络请求
- 具体做法：`containerRef.current.querySelector(`[id="${fragment}"]`)` → 取其 parent section 的 HTML 切片

---

### Phase 2：客户端内存缓存去重 (P0)

#### 2.1 WikiLinkPreviewManager 内维护 Map 缓存

**现状问题**：同一页面内相同的 wiki-link 出现多次（如 `[[React]]` 在文章中被引用 5 次），每次 hover 都触发 Server Action。

**改动**：

```ts
// 在组件内部维护 LRU 式缓存
const cacheRef = useRef<Map<string, { data: any; timestamp: number }>>(new Map());
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// hover 时先查缓存
const cached = cacheRef.current.get(targetSlug);
if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
  setPreviewData(cached.data); // 命中 → 不发请求
  return;
}
// 未命中 → 发请求 → 写缓存
```

---

### Phase 3：useEffect 依赖修复 (P0 — 性能 Bug)

#### 3.1 消除频繁 re-bindinglistener

**现状** (wiki-link-preview.tsx L116)：
```ts
}, [containerRef, hoveredLink, isHoveringCard]);
```

`hoveredLink` 和 `isHoveringCard` 每次 hover 都变化 → effect 被反复销毁重建 → `addEventListener` / `removeEventListener` 频繁执行。

**修复**：用 `useRef` 保持对最新状态的引用，effect 依赖只保留 `containerRef`：

```ts
const hoveredLinkRef = useRef(hoveredLink);
hoveredLinkRef.current = hoveredLink;

const isHoveringCardRef = useRef(isHoveringCard);
isHoveringCardRef.current = isHoveringCard;

useEffect(() => {
  // 闭包中读 .current 而非直接读 state
  // ...
}, [containerRef]); // ← 只在容器变化时重新绑定
```

---

### Phase 4：响应式卡片定位系统 (P1)

#### 4.1 卡片尺寸优化

| 属性 | 当前值 | 优化值 | 原因 |
|------|--------|--------|------|
| 宽度 | `w-[350px]` | `w-[min(480px,90vw)]` | 代码块和公式需要更多水平空间 |
| 内容高度 | `max-h-[150px]` + `overflow-hidden` | `max-h-[33vh]` + `overflow-y-auto` | 1/3 屏幕高度，可滚动 |
| 渐变遮罩 | 固定 `before:h-12 bg-gradient-to-t` | 仅在 `overflow` 触发时显示 | 短内容不需要遮罩 |

#### 4.2 四向边界碰撞检测与翻转

**现状**：只处理了右边界（L140 `Math.min`），底部、左侧、顶部均未处理。

**完整定位算法**：

```
计算流程:
1. 获取 link 的 getBoundingClientRect()
2. 默认方向: 卡片在 link 正下方偏右展开

3. 右边界检测:
   if (linkRect.left + cardWidth > viewportWidth - MARGIN)
     → 左对齐 (cardLeft = linkRect.right - cardWidth)

4. 左边界检测:
   if (adjustedLeft < MARGIN)
     → 强制最小 left = MARGIN

5. 底部溢出检测 (关键):
   if (linkRect.bottom + GAP + cardHeight > viewportHeight)
     → 翻转到 link 上方 (cardTop = linkRect.top - GAP - cardHeight + scrollY)
   else
     → 保持下方 (cardTop = linkRect.bottom + GAP + scrollY)

6. 顶部溢出检测 (翻转后):
   if (cardTop - scrollY < MARGIN)
     → 强制居中 (vertically center in viewport)
```

**实现方式**：
- 使用 `useLayoutEffect` + `ResizeObserver` 在卡片渲染后测量实际高度
- 卡片初始渲染为 `opacity-0`，计算位置后 `opacity-1` + 动画入场
- 动画方向根据是否翻转调整（上方入场 vs 下方入场）

---

### Phase 5：轻量级预览专用查询 (P1)

#### 5.1 新建 `getPostPreviewBySlugQuery`

**现状**：`getCachedPreviewPost` 调用 `getPostBySlugQuery`，后者 SELECT 了 `content`、`html` 等大字段（整篇文章内容），但预览只用了 `title`、`description`、`area`、`isPublished`、`metadata`。

**改动**：

| 文件 | 改动 |
|------|------|
| `packages/database/queries/posts.ts` | 新增 `getPostPreviewBySlugQuery(slug)` — 只 SELECT `id, slug, title, description, area, isPublished, metadata`，不拉 `content`/`html` |
| `apps/web/lib/preview-cache.ts` | `getCachedPreviewPost` 改调新的轻量查询 |

**SQL 层面优势**：
- 当前查询返回 `content`（可能 50KB+）和 `html`（可能 100KB+）
- 新查询只返回约 ~1KB 的元数据
- 数据库不需要扫描大字段 → 更快的 I/O

#### 5.2 Fragment 预览保留现有查询

`getCachedFragmentPreview` 依然需要查 `documentSections` / `documentBlocks`，这个不变，因为 fragment HTML 不在预览元数据中。但当 target 是当前文档时（Phase 1 的优化），这个调用也被绕过了。

---

### Phase 6：跳转体验优化 (P2)

#### 6.1 CardTitle 点击跳转改用 `next/navigation`

**现状**：L191 `window.location.href = ...` → 硬刷新整个页面。

**改动**：
- 引入 `useRouter` from `next/navigation`
- 点击时 `router.push(targetPath)` → SPA 级页面跳转
- 支持 `router.back()` 回退，不丢失阅读进度

#### 6.2 `markdown-interactivity.tsx` 跨页跳转

**现状**：L1090/1095 `window.location.assign(...)` → 硬刷新。

**同理改动**：但此处在 useEffect 闭包内，需要把 `router` 通过 ref 传入或改用 `window.history.pushState` + `router.push`。

---

### Phase 7：安全与类型修复 (P2)

#### 7.1 htmlContent 过 DOMPurify

**现状**：L202 `dangerouslySetInnerHTML={{ __html: previewData.htmlContent }}`，没有经过 sanitize。

**改动**：
```ts
const safeHtml = DOMPurify.sanitize(previewData.htmlContent);
```

#### 7.2 类型安全

**现状**：L17 `previewData` 类型为 `any`。

**改动**：定义明确的 `PreviewData` interface 并从 Server Action 返回类型推断。

---

### Phase 8：移动端 Touch 适配 (P3)

#### 8.1 Long-press 触发预览

- 移动端没有 hover，需要用 `touchstart` + 300ms 计时触发
- 点击（非长按）保持正常跳转行为
- 预览卡片出现后，点击其他区域关闭

---

### 实施顺序与文件清单

```
Phase 1 + 2 + 3 (P0 — 性能根基):
  ├── apps/web/components/wiki-link-preview.tsx     ← 主改动：缓存、ref、当前文档短路
  ├── apps/web/components/markdown-interactivity.tsx ← 透传 currentPostMeta
  └── apps/web/app/(site)/blog/[slug]/page.tsx      ← 注入 currentPostMeta prop

Phase 4 (P1 — 响应式定位):
  └── apps/web/components/wiki-link-preview.tsx      ← 定位算法重写

Phase 5 (P1 — 轻量查询):
  ├── packages/database/queries/posts.ts             ← 新增 getPostPreviewBySlugQuery
  ├── apps/web/lib/preview-cache.ts                  ← 切换到轻量查询
  └── apps/web/app/actions/preview.ts                ← 适配新数据结构

Phase 6 (P2 — 跳转优化):
  ├── apps/web/components/wiki-link-preview.tsx      ← router.push
  └── apps/web/components/markdown-interactivity.tsx  ← router.push

Phase 7 (P2 — 安全/类型):
  └── apps/web/components/wiki-link-preview.tsx       ← DOMPurify + interface

Phase 8 (P3 — 移动端):
  └── apps/web/components/wiki-link-preview.tsx       ← touch 事件
```

---

确认这个计划没问题就告诉我，我按 Phase 顺序开始改代码。