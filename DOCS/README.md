# DOCS

技术文档知识库，按功能模块分类组织。

## 目录结构

```
DOCS/
├── 00-architecture/          # 架构设计
├── 01-content-pipeline/      # 内容同步流程
├── 02-tech-specs/            # 技术规范
├── 03-features/              # 功能设计
└── 04-system/                # 系统机制
```

## 分类说明

### 00-architecture (架构设计)

| 文件 | 说明 |
|------|------|
| `architecture-plan.md` | 整体架构规划 (I.P.A.R.A. 模型) |
| `directory-explorer.md` | CommandMenu 目录浏览模式设计 |
| `caching-mechanism.md` | 缓存策略与机制 |
| `astro-migration.md` | Astro 迁移方案 |

### 01-content-pipeline (内容同步)

| 文件 | 说明 |
|------|------|
| `obsidian-sync.md` | Sentinel 同步引擎操作手册 |
| `content-pipeline-status.md` | 内容管道状态报告 |
| `obsidian-notes-and-blogs.md` | Obsidian 笔记与博客系统 |

### 02-tech-specs (技术规范)

| 文件 | 说明 |
|------|------|
| `wikilink-spec.md` | Wiki-Link 处理技术规范 |
| `rag-implementation-plan.md` | RAG 实现计划 |
| `rust-layer-technical-review.md` | Rust 层技术评审 |

### 03-features (功能设计)

| 文件 | 说明 |
|------|------|
| `link-preview.md` | 链接预览功能设计 |
| `mermaid-styling.md` | Mermaid 图表样式规范 |

### 04-system (系统机制)

| 文件 | 说明 |
|------|------|
| `auth.md` | 认证系统设计 |

## 命名规范

- 所有文件名使用 **kebab-case** (短横线连接的小写字母)
- 数字前缀 `00-` 用于排序文件夹，确保展示顺序
- 避免使用空格和特殊字符 (&, # 等)
