## 🌌 核心设计思想：信息的“重力感”与“浮动力”
*   **正文 (Main)**：作为系统的“重力中心”，保持 `896px (max-w-4xl)` 的稳固阅读流。
*   **右翼 (Author)**：作为正文的“向心引力”，即脚注与批注。
*   **左翼 (Dialogue)**：作为正文的“离心力”，即读者的实时评论与思维碰撞。

---

### 第一阶段：布局重构与隔离 (Layout & Matrix)
**目标**：打破单列限制，建立全局对齐矩阵。

1.  **Grid 矩阵定义**：
    *   在 `blog/[slug]/page.tsx` 中引入一个 `GridLayout`：
        *   `Left (Comments)`: `minmax(300px, 1fr)`
        *   `Center (Article)`: `min(896px, 100%)`
        *   `Right (Sidenotes)`: `minmax(300px, 1fr)`
    *   **关键策略**：给容器设置 `relative`，确保所有侧边卡片能相对于正文的特定段落进行绝对定位。

2.  **打破容器壁垒**：
    *   移除 `MarkdownBody` 容器上的 `overflow-hidden`。
    *   **CSS 层级**：使用 `@layer components` 隔离侧边栏样式，防止 `typography.css` 的全局样式（如 `p` 标签的 margin）干扰评论卡片的布局。

---

### 第二阶段：内容对齐引擎 (The Alignment Engine)
**目标**：确保“批注”与“正文”永远在一水平线上。

1.  **Block-Level 坐标系**：
    *   **现状**：你的 Rust 解析器已经在生成 `data-block-id`。
    *   **实现**：在 `MarkdownInteractivity` 中引入一个 `ObserverHub`。它会利用 `ResizeObserver` 实时监听屏幕及正文高度变化。

2.  **垂直滑移布局 (Vertical Slotting)**：
    *   每一个侧边注释（Sidenote/Comment）卡片通过 `top: offsetTop` 挂载。
    *   **防撞预测算法**：如果注释 A 的 `bottom` 与注释 B 的 `top` 重叠，则 B 自动向下推移 `gap` 距离。这能解决在短段落内有大量引用时的堆叠问题。

---

### 第三阶段：作者端：右侧脚注自动化 (Right-side Sidenotes)
**目标**：将传统的底部脚注无缝转化为侧边注。

1.  **DOM 提取逻辑**：
    *   React 挂载后，寻找 `.markdown-body .footnotes` 区域。
    *   解析每一个 `li` 的 `id` (例如 `user-content-fn-1`)。
    *   找到正文中对应的 `[data-footnote-ref]` 位置。
2.  **视觉呈现**：
    *   不再使用传统的“返回本段”链接，而是将内容浮动到右侧。
    *   **样式细节**：采用 `shadow-glow` 暗金色光晕，标注这是“作者原注”。

---

### 第四阶段：读者端：左侧对话与登录 (Left-side Comments)
**目标**：接入 Neon Auth 与持久化存储。

1.  **数据 Schema 设计 (`packages/database`)**：
    *   `CommentTable`: `id`, `user_id`, `post_id`, `block_id` (关键锚点), `content`.
    *   **RLS 策略**：在 Neon 数据库层配置 `CREATE POLICY`，确保只有评论所有者能通过 `auth.uid()` 修改数据。

2.  **选区触发逻辑**：
    *   点击段落左侧的“星形图标”触发评论。
    *   **登录流**：点击评论时，由 `Neon Auth` 唤起 GitHub 登录，登录后直接在左侧弹出输入框。

3.  **引用渲染**：
    *   左侧评论如果引用了正文内容，自动在正文中产生一个高亮的投影效果。

---

### 第五阶段：性能与 SEO 优化
1.  **混合渲染策略**：
    *   **SEO 友好**：原始脚注依然由 Rust 渲染在 HTML 中，保证爬虫可见。
    *   **交互增强**：JavaScript 负责将这些可见内容“搬运”并隐藏原始底部区域。
2.  **动态加载**：
    *   评论内容作为 `Client Component` 延迟加载，不阻塞正文的首屏显示（LCP）。

---

### 🚀 开发者操作指令 (开发建议序列)
1.  **Step 1**: 在 `apps/web/app/(site)/blog/[slug]/page.tsx` 中将布局从 `flex` 或 `max-w-4xl mx-auto` 重构为基于 `grid-template-areas` 的三栏结构。
2.  **Step 2**: 更新 `packages/markdown-parser/src/styles/academic.css`，将 sidenote 的 `left: auto; right: -300px;` 逻辑改为响应式。
3.  **Step 3**: 在 `packages/ai` 中（如果需要）增加一个“评论摘要”逻辑，汇总左侧边栏的热点讨论。
4.  **Step 4**: 执行 `neon auth set-up` 并将 `Better Auth` 配置到 `api/auth/[...auth]` 路由下。

这份计划将你的系统从“个人站点”转型为“协同知识库”，它非常适合你目前这种“硬核技术 + 极简设计”的风格。**如果你确认这份调研指导可以，我们可以开始后续的准备步骤。**