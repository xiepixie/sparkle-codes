# 双向链接渲染工程说明书

## 1. 项目目标

在现有 Obsidian -> Rust -> Neon -> Next.js 博客流水线上，完整实现符合 Obsidian 合法语义的双向链接阅读体验，包括：

### 正向链接

支持以下三类 wiki-link：

* `[[文章标题]]`
* `[[文章标题#某个小节]]`
* `[[文章标题^block-id]]`

并实现：

* 当前页跳转
* 精准滚动到标题 / block
* 目标高亮 1 秒
* hover 预览

### hover 预览

规则固定为：

* 文章级：显示 `description + 第一个标题下完整内容`
* 标题级：显示 `该标题直到下一个同级标题`
* 块级：显示 `该 block 所在最近标题下完整内容`

### 反向链接

在文章页底部展示：

* “提及本文的文章”列表
* 每个来源可点击跳转到来源文章对应位置
* 第二阶段支持显示引用上下文片段

---

# 2. 现状判断

## 2.1 已经具备的基础

从你提供的信息看，现有系统已经有非常强的基础能力：

### 解析层

`markdown-parser` 已经输出了对我们很有用的 HTML 结构：

* heading id：例如
  `<h2 id="h-块引用-id-与块链接测试">`
* block anchor：例如
  `<span id="^block-test-001" class="block-anchor"></span>`
* wiki-link 结构：例如
  `<a class="wiki-link" data-target="微积分#导数定义" data-page="微积分" data-fragment="导数定义" ...>`
* block link 结构：例如
  `<a class="wiki-link" data-target="测试#^block-test-001" data-page="测试" data-fragment="^block-test-001" ...>`

这说明前端不需要重新解析原始 markdown 语法，已经可以基于渲染结果中的 `data-page` / `data-fragment` / `data-target` 工作。

### 数据层

数据库已有：

* `documents`
* `document_links`
* `document_chunks`

其中最关键的是：

* `documents`：文章主体
* `document_links`：出边链接图

这说明 backlinks 的基本图结构也已经在了。

---

## 2.2 当前缺口

虽然基础很好，但要达到你要的行为，还缺下面这些关键能力：

### 缺口 1：`document_links` 目前偏“文档级”

现在的表能表示：

* fromId
* rawTarget
* normalizedTarget
* resolvedDocumentId
* isResolved

但还不够表达：

* 这是 article / heading / block 哪一种链接
* 来源文章的哪个 section / block 发出的链接
* 目标 fragment 是 heading 还是 block
* backlinks 要跳到来源哪里

### 缺口 2：预览内容缺少 section 级索引

你现在的规则不是“摘要截断”，而是“结构切片”。
因此只靠 `documents.content` 这一整坨 HTML，不足以高质量完成预览。

### 缺口 3：前端点击行为还没有统一 target resolver

虽然 HTML 中已有 `data-page` / `data-fragment`，但还缺：

* page -> document slug 的稳定解析
* fragment -> heading/block 的区分
* 页面内滚动定位与高亮

### 缺口 4：backlinks 只能做“提到某文档”，还不能做“从哪里提到”

这会影响可用性。

---

# 3. 设计原则

## 3.1 不重做解析器

现有 `markdown-parser` 已经足够强。
这次工程不重写 markdown 解析，而是在现有解析结果上补充结构索引。

## 3.2 数据为主，前端为辅

预览、精准跳转、backlinks 不应依赖前端去拆 HTML。
前端只负责：

* 链接组件
* hover 浮层
* 路由跳转
* DOM 定位高亮

### 不让前端负责

* 从全文里判断 section 范围
* 猜 block 属于哪个 heading
* 现算预览内容

## 3.3 与 Obsidian 合法语义兼容

博客不是链接语法定义者，只是 Obsidian 合法语法的阅读端消费方。
所以：

* page 名称匹配要兼容 Obsidian 页面写法
* block-id 语义按 Obsidian 走
* fragment 不能乱设计新格式

---

# 4. 工程范围

---

## 4.1 本次要实现的功能

### A. wiki-link 点击跳转

支持：

* `[[文章标题]]`
* `[[文章标题#标题]]`
* `[[文章标题^block-id]]`

### B. hover 预览

支持三类目标的不同切片规则

### C. backlinks 展示

支持文章页底部显示来源文章列表，并跳到来源位置

### D. 数据结构增强

补齐 section / fragment / source-position 相关索引

---

## 4.2 本次不做的功能

### 暂不做

* Obsidian graph view
* 编辑器侧实时补全
* 多层 block 嵌套引用渲染
* 非法链接自动修复 UI
* alias pipe 语法增强展示（如果以后有）

---

# 5. 数据模型改造方案

这是本次最重要的一部分。

---

## 5.1 现有表保持不动的部分

### `documents`

继续作为文章主表，不拆。

### `document_chunks`

与向量检索无关，本次不动。

---

## 5.2 `document_links` 扩展字段

建议在现有 `document_links` 基础上扩展，而不是重建。

### 现有字段

* `id`
* `rawTarget`
* `normalizedTarget`
* `isResolved`
* `fromId`
* `resolvedDocumentId`

### 新增字段建议

#### 目标类型

* `targetType`
  枚举：

  * `ARTICLE`
  * `HEADING`
  * `BLOCK`

#### 来源定位

* `sourceHeadingId` nullable
  表示链接出现在哪个 heading section 中
* `sourceBlockId` nullable
  表示链接是否位于某个 block 中
* `sourceTextSnippet` nullable
  用于 backlinks 上下文展示
* `sourceOrder` nullable integer
  表示链接在文章中的出现顺序，便于稳定排序

#### 目标 fragment

* `targetFragmentRaw` nullable
  原始 fragment，如 `导数定义` 或 `^block-test-001`
* `targetHeadingId` nullable
  解析后的目标 heading anchor
* `targetBlockId` nullable
  解析后的 block id

#### 目标状态

* `isFragmentResolved` boolean default false
  文档找到了不代表 heading / block 一定找到
* `resolutionError` nullable
  用于记录 fragment 解析失败原因

---

## 5.3 新增 `document_sections` 表

这张表是本次预览与精准定位的核心。

### 用途

存储一篇文章按 heading 切分后的 section 结构。

### 建议字段

* `id`
* `documentId`
* `headingId` nullable
  若文档开头有 intro 段落，可允许 null 或 special root
* `headingText`
* `headingLevel`
* `sectionIndex`
* `html`
* `text`
* `startOffset` nullable
* `endOffset` nullable
* `isFirstSection` boolean

### 作用

用于：

* 标题级预览
* 文章级“第一个标题下完整内容”
* block 找到所属最近标题后回查 section

---

## 5.4 新增 `document_blocks` 表

### 用途

存储 block-id 与 section 的关系。

### 建议字段

* `id`
* `documentId`
* `blockId`
* `sectionId`
* `html`
* `text`
* `blockIndex`

### 作用

用于：

* `[[文章^block-id]]` 精准匹配
* block 跳转
* block 预览时找到所属 section

---

## 5.5 为什么要新增这两张表

因为你现在的预览规则都是 section 语义，而不是纯文档语义。
如果只靠 `documents.content`，每次 hover 都得拆 HTML，既慢又不稳。

---

# 6. 解析与同步层改造说明（Rust / sentinel）

这部分是落实现有系统最关键的地方。

---

## 6.1 输入基础

你们的 `markdown-parser` 已经能生成：

* heading HTML 与 id
* block anchor
* wiki-link data-page / data-fragment / data-target

所以 `sentinel` 在入库阶段应新增两个动作：

1. **从最终 HTML 中建立 section 索引**
2. **解析每条 wiki-link 的目标类型与来源位置**

---

## 6.2 section 构建逻辑

### 目标

把整篇 HTML 按 heading 切成 section。

### 规则

* 遇到 heading 开始一个 section
* section 结束于下一个“同级或更高语义边界”？
  这里分两类：

#### 用于“标题级预览”的 section

你要求的是：

> 显示该标题直到下一个同级标题

所以这里不是简单“直到下一个任意标题”，而是：

* 一个标题 section 的预览边界是：直到下一个同级标题
* 更低级标题内容属于该 section

例如：

* `## A`
* `### A.1`
* `### A.2`
* `## B`

那么 `[[文章#A]]` 预览应包含 `A + A.1 + A.2`，直到 `## B`

### 实现建议

在 section 表中存：

* 原始 heading level
* section html
* 下一同级边界后的 end index

---

## 6.3 block 构建逻辑

### 规则

对每个 `<span id="^block-xxx" class="block-anchor">`：

* 提取 `blockId`
* 找到其所属最近 heading section
* 写入 `document_blocks`

### 注意

你们当前 HTML 里 block 是 `<span id="^block-test-001" class="block-anchor"></span>`
这个格式前端可以直接定位，不需要再发明别的 DOM 结构。

---

## 6.4 wiki-link 目标类型解析

从现有 HTML：

```html
<a class="wiki-link" data-target="微积分#导数定义" data-page="微积分" data-fragment="导数定义" ...>
```

我们已经知道：

* `data-page`
* `data-fragment`
* `data-target`

### 判断逻辑

#### article

* `data-fragment === ""`

#### heading

* `data-fragment !== ""` 且不以 `^` 开头

#### block

* `data-fragment.startsWith("^")`

### 注意

你提供的 block link 示例里，最终输出可能是：

* `data-target="测试#^block-test-001"`
* `data-fragment="^block-test-001"`

这很好，直接可用。

---

## 6.5 来源位置解析

为了支持 backlinks 精准跳回来源，需要在同步时记录来源位置。

### 最低要求

记录：

* 该 link 出现在哪个 section 中
* section heading id 是什么

### 更好版本

记录：

* source text snippet（链接周围一小段纯文本）
* source block（如果能识别到）

### 推荐做法

在解析 HTML 时：

* 遍历 section
* 在 section 内扫描 wiki-link
* 赋予每个 link `sourceHeadingId`

---

## 6.6 文档目标解析

`document_links` 目前只做到了文档级 `resolvedDocumentId`。
要补 fragment 解析：

### 第一步

先按 `data-page` / `normalizedTarget` 找到目标 `document`

### 第二步

若有 fragment：

* 如果是 heading，去目标文档的 `document_sections` 找对应 heading
* 如果是 block，去目标文档的 `document_blocks` 找对应 block

### 结果

写回：

* `targetType`
* `targetHeadingId` / `targetBlockId`
* `isFragmentResolved`

---

# 7. 前端渲染层说明（Next.js / React）

---

## 7.1 WikiLink 组件职责

前端不要再把 wiki-link 当普通 `<a>`。
应该统一走一个 `WikiLink` 组件。

### 输入

从 HTML 渲染层或 AST 映射到：

* `data-page`
* `data-fragment`
* `data-target`
* label

### 输出行为

* 生成真实 href
* 绑定 hover 预览
* 绑定点击逻辑

---

## 7.2 href 生成规则

### article

`[[文章标题]]`
-> `/posts/:slug`

### heading

`[[文章标题#标题]]`
-> `/posts/:slug#heading-id`

### block

`[[文章标题^block-id]]`
-> `/posts/:slug#^block-id`

### 说明

前端不自己猜 slug，应该使用服务端 / 数据层已解析后的 canonical target。
最稳的方式是渲染页面时就把 resolved href 注入组件。

---

## 7.3 点击跳转行为

### 流程

1. 当前页路由跳转
2. 页面渲染完成后读取 hash
3. 定位目标 DOM
4. 平滑滚动
5. 高亮 1 秒

### 定位顺序

* 优先找精确 id
* 找不到则回退到文档顶部

### 高亮建议

给目标元素加一个 `data-link-target-highlighted` class，1 秒后移除。

---

## 7.4 Sticky header 偏移

如果博客页面有 fixed header，滚动必须做 offset。
否则会出现“跳到了但标题被导航遮住”。

---

# 8. Hover 预览系统说明

---

## 8.1 预览数据来源

不从页面 DOM 现抓，不从原始 `documents.content` 字符串临时切。
统一通过服务端查询结构索引拿：

* article preview
* section preview
* block preview

---

## 8.2 预览规则落地

### article

显示：

* 文章标题
* description
* `document_sections` 中 `isFirstSection = true` 的 html

### heading

显示：

* 文章标题
* 目标 heading text
* 对应 `document_sections.html`

### block

显示：

* 文章标题
* 所属 heading text
* 该 block 对应的 `section.html`
* 并把目标 block 在预览中高亮

---

## 8.3 为什么 block 预览不是只显示 block 本身

因为你已经明确要求：

> 如果链接是 文章^block，则只预览该 block 所在最近标题下完整内容

所以 block 预览核心是“section 级预览 + block 内高亮”。

---

## 8.4 交互规则

### 打开

* hover 200ms 打开
* 同一时间仅一个浮层

### 位置

* 默认右侧
* 空间不足翻左
* 浮层最大高度受视口限制，内部滚动

### 关闭

* 鼠标移出链接和浮层后关闭
* 给 80-120ms 缓冲，减少闪烁

---

## 8.5 性能建议

* 预览 payload 缓存到客户端查询层
* 相同 target key 复用
* 若页面 SSR 已知当前页内所有目标，可局部预取热门 target

---

# 9. Backlinks 系统说明

---

## 9.1 最小上线版

在文章页底部展示：

* 提及本文的文章标题列表
* 点击跳到来源文章对应 section

### 数据来源

反查：

* `document_links.resolvedDocumentId = 当前文档id`

---

## 9.2 更优版本

每条 backlinks 展示：

* 来源文章标题
* 来源 section 标题
* 可选上下文片段（`sourceTextSnippet`）

### 点击行为

跳到：

* 来源文章 slug
* 若有 `sourceHeadingId`，加 hash 跳到对应 heading

---

## 9.3 上下文片段建议作为第二阶段

因为它依赖 `sourceTextSnippet` 或更精细 source block 抽取。
但非常值得做，体验会显著提升。

---

# 10. API / 查询层说明

---

## 10.1 建议新增的查询能力

### 获取 wiki-link target 的 resolved preview

输入：

* article page
* fragment

输出：

* targetType
* slug
* title
* description
* previewHtml
* targetHeadingId
* targetBlockId

### 获取当前文章 backlinks

输入：

* current document id / slug

输出：

* source document title
* source slug
* source heading id
* sourceTextSnippet

---

## 10.2 服务端查询优先

预览最好由服务端统一解析查询，而不是客户端直接拼 SQL 或多次猜测。
这样更稳定，也利于后续缓存。

---

# 11. 页面渲染规范

---

## 11.1 heading DOM 规范

现有 heading 有 id，例如：

```html
<h2 id="h-块引用-id-与块链接测试">
```

继续保留，作为 heading 定位主锚点。

---

## 11.2 block DOM 规范

现有 block anchor 形式：

```html
<span id="^block-test-001" class="block-anchor"></span>
```

建议继续保留，不要改格式。
前端定位 block 时直接 `document.getElementById("^block-test-001")`

### 可选增强

为 block anchor 的最近可视容器加一个包装标记，便于高亮更自然。
但不是必须。

---

## 11.3 wiki-link DOM 规范

现有：

```html
<a class="wiki-link" data-target="测试#^block-test-001" data-page="测试" data-fragment="^block-test-001" ...>
```

这已经很适合前端 hydration。
只需要在 React 渲染层把这类 `<a.wiki-link>` 替换成统一交互组件。

---

# 12. 实施步骤

---

## Phase 1：数据模型增强

### 任务

1. 扩展 `document_links`
2. 新增 `document_sections`
3. 新增 `document_blocks`

### 验收

* 一篇文章的 sections 与 blocks 可独立查询
* links 可区分 ARTICLE / HEADING / BLOCK

---

## Phase 2：Rust 同步增强

### 任务

1. 从 HTML 构建 `document_sections`
2. 提取 `document_blocks`
3. 给每条 link 记录 `sourceHeadingId`
4. 解析目标 fragment，填充 `targetHeadingId` / `targetBlockId`

### 验收

* 任意一个 wiki link 入库后可知道其目标类型和目标定位
* fragment 解析失败有日志可查

---

## Phase 3：前端点击跳转

### 任务

1. 实现 `WikiLink` 组件
2. 生成 canonical href
3. 页面加载后 hash 定位
4. 实现高亮 1 秒

### 验收

* article / heading / block 三类跳转正确

---

## Phase 4：hover 预览

### 任务

1. 实现 preview query
2. 实现 hover card
3. 实现 article / heading / block 三类预览规则
4. block 所属 section 预览中高亮 block

### 验收

* 预览内容完全符合你定义的三条规则

---

## Phase 5：backlinks

### 任务

1. 查询所有指向当前文档的 links
2. 展示来源文章标题列表
3. 支持跳转到来源位置
4. 第二阶段再加 source snippet

### 验收

* 当前文章底部能看到所有提及它的文章
* 点击能跳回来源 section

---

# 13. 测试说明

---

## 13.1 解析层测试

必须覆盖：

### article

* `[[数学分析]]`

### heading

* `[[微积分#导数定义]]`

### block

* `[[测试^block-test-001]]`
* 以及你当前 HTML 产物里等价表现的 `测试#^block-test-001`

### 验证点

* `targetType`
* `resolvedDocumentId`
* `targetHeadingId`
* `targetBlockId`

---

## 13.2 section 切片测试

对标题级：

* `## A`
* `### A.1`
* `### A.2`
* `## B`

应保证：

* `A` 的 section 预览包含 `A.1` 和 `A.2`
* 不包含 `B`

---

## 13.3 点击跳转测试

验证：

* hash 定位
* sticky header offset
* 高亮 1 秒
* 找不到目标时回退顶部

---

## 13.4 hover 预览测试

验证：

* 200ms 延迟
* 浮层右侧优先 / 自动翻转
* 文章级 / 标题级 / 块级内容正确
* 移入浮层不闪退

---

## 13.5 backlinks 测试

验证：

* 指向当前文档的 links 都可被列出
* 来源 section 定位正确

---

# 14. 风险与约束

---

## 14.1 风险：标题匹配规则不统一

如果 Rust 生成的 heading id 和前端定位规则不一致，点击会跳错。
解决方式：

> heading id 以解析产物为唯一标准，前端不重复 slugify。

---

## 14.2 风险：block 高亮容器不自然

因为当前 block anchor 是空 span。
解决方式：

* 最简单先高亮 anchor 邻近容器
* 后续可在解析层给 block 包一层稳定容器

---

## 14.3 风险：旧 links 只有文档级信息

需要一次补索引或重新同步。
建议：

> 在本次上线前，对已发布文档全量重跑一次 sentinel sync。

---

## 14.4 风险：preview payload 过大

标题级或 block 所属 section 如果很长，hover 卡片可能过重。
解决方式：

* 先完整按规则显示，但可设置卡片最大高度内部滚动
* 不截断语义，只限制可视区域

---

# 15. 最终落地结论

基于你们现有系统，最正确的实现路径不是重做解析，而是：

1. **扩展 `document_links` 的 fragment 语义**
2. **新增 `document_sections` 与 `document_blocks` 结构索引**
3. **让 sentinel 在同步阶段完成 section / block / target 解析**
4. **让前端只消费结构化结果，负责点击、hover、定位与高亮**
5. **利用 `document_links` 反查生成 backlinks**

这样做的好处是：

* 完全兼容你们现有 Obsidian 合法链接
* 不需要推翻 Rust pipeline
* 预览和跳转会真正对齐
* backlinks 能自然落地
* 后续还能进一步做引用上下文、图谱、推荐

---