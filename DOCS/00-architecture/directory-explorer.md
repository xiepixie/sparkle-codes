# Sparkle Codes: “浏览目录” (Directory Explorer) 模式详细设计方案

> 本文档规范了全局 CommandMenu (Cmd+K) 中“目录浏览”模式的架构设计。结合 Neon Postgres 数据库特性与客户端极限性能追求，打造出无缝、油画级丝滑的沉浸式层级导航体验。

## 1. 核心业务价值与模式入口

### 1.1 业务场景
解决“按图索骥”的知识探索需求。当用户不明确具体的关键字，但知道内容大体归属于“项目/RAG”时，将基于单行信息流的博客升级为结构化的工作站知识库。

### 1.2 唤醒机制与入口
*   **循环切换**：在 `CommandMenu` 的输入框中，通过 `Tab` 键在 `全站搜索` -> `目录浏览` -> `页内跳转` 模式间循环。
*   **指令进入**：遵循主流命令终端习惯，直接输入 `>` 符号自动切换并聚焦至目录浏览模式。

## 2. 交互设计：级联面板 (Cascading Panels) 协议

不采用空间受限的静态树形缩进，而是采用更接近 macOS Finder 的“列级联”视界。

### 2.1 视觉结构 (The UX Layout)
*   **面包屑顶栏**：在 `Header` 提供清晰的当前层级链路，如 `项目 / RAG`。
*   **单列专注视图**：每次仅展示当前结构深度的节点（文件夹或文件）。点击文件夹时面板左滑，点击返回时面板右滑。

### 2.2 键盘控制规范 (Keyboard Protocol)
*   `↑ / ↓`：垂直移动选择高亮节点。
*   `→` / `Enter` (在夹子焦点)：向下一层深入，拉起平滑左滑动画。
*   `←` / `Backspace`：返回父一层。若已在顶级（如项目），则清空当前模式。
*   `Enter` (在文件焦点)：实际打开该 Markdown 渲染页。

## 3. 数据层：计算前置与路径重塑

数据库原始存储的是全绝对路径 `vaultPath` (例如：`工作领域/项目/RAG/post.md`)。为了让前端保持轻量并支持无限层深的目录树钻取，采用数据库原生字符串切分能力。

### 3.1 SQL 层处理（Drizzle 原生）
构建专用的目录解析查询引擎。不将几万条记录发送到前端让 JS 计算，而是在后端基于动态深度进行部分匹配汇总：

```sql
-- 示例：查询特定深度 (:depth) 与特定前缀 (:prefix) 下的子分支
SELECT DISTINCT 
  split_part(replace("vaultPath", '工作领域/', ''), '/', :depth) as node_name,
  (CASE WHEN "vaultPath" LIKE '%/%' THEN 'folder' ELSE 'file' END) as type
FROM documents 
WHERE "vaultPath" LIKE :prefix_wildcard
  AND area = 'WORK' 
  AND "isPublished" = true;
```

### 3.2 领域抽象对象 (Domain Types)
前后端传输对象统一由转换器 (`PathTransform` Service) 封装：
```typescript
interface ExplorerNode {
  id: string;          // 动态生成的层级ID，或为文件CUID
  name: string;        // 用于显示的友好名 (无 .md)
  type: 'folder' | 'file';
  displayPath: string; // 业务侧精简路径，如：项目/RAG
  vaultPath: string;   // 用于溯源的物理路径
  hasChildren: boolean;
  metadata?: {
    count?: number;    // 子内容数量(用于Folder)
  };
}
```

## 4. 传输优化：分层懒加载与意图预取

结合重前端缓存体验，确立不妥协的预取原则：

### 4.1 骨架静默缓存 (Skeleton Caching)
*   首层（`项目`、`资源`、`收集`、`归档` 4个根模块）在全局 `layout.tsx` 构建时或呼出指令时静默获取。确保该模式唤醒率为 **0ms 延迟**。
*   下坠目录基于 `SWR` 或客户端 `Map` 按需拉取并缓存，做到了返回无阻尼。

### 4.2 基于意图的文件预取 (Intent-based Focused Prefetch)
为了达到按下 Enter 后瞬间出现的“油画感”，针对树状节点做出精细排期：
*   **Hover/Focus 触发**：监听 `CommandMenu` 中对文件的方向键选择转移。
*   **防抖延时 (120ms)**：只有停留超过 `120ms` 才触发下层渲染预热，防止上下快速扫视过程中的请求轰炸网络连接。
*   **请求中止 (AbortController)**：极其重要的一点。同一时间全局仅维护一个预读任务通道，光标一旦发生位移立即 `abort()` 废弃上一条无用预取通道，彻底消灭资源竞争浪费。
*   **按需轻读**：仅拉取文件的结构与摘要缓存，不主动将内容正文全量存入缓存，保持主内存高度纯洁。

## 5. 风险控制与兜底策略

*   **过深层级干预**：当 Obsidian 文档层级结构 `depth > 5` 时，级联翻页的易用性将指数下降。需强制中断层级，在其之下转换为扁平瀑布流或子级混合搜索。
*   **异常名称重载**：针对存在同名文件或极端命名（特殊符号导致 URL 打散）的情况，在 `displayPath` 末尾或内部属性中提供 hash 以完成唯一性溯源保障。