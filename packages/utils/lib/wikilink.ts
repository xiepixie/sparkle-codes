/**
 * 🔗 Sparkle Wiki-Link Standard Protocol (Layered Architecture)
 *
 * 本模块定义了从 Obsidian 原始引用到 Web 路由的完整转换链路。
 *
 * 职责分层：
 *   Layer 1 - parseWikiLink:  结构化拆分（路径 / 片段 / 块引用），不涉及路由。
 *   Layer 2 - slugifyPath:    确定性 Slug 生成，必须与 Rust 端完全对称。
 *   Utility - normalizeSlug:  URL → 纯 Slug 的归一化（用于比较 / 去重）。
 *   Utility - isSameWikiPage:  页面身份判等（用于导航 / 高亮）。
 *
 * 对称性约束 (Symmetry Rule):
 *   TypeScript slugifyPath  ⟷  Rust slugify_publish_path  (packages/sentinel/src/utils/path.rs)
 *   TypeScript slugifyPath  ⟷  Rust slugify_publish_path  (packages/markdown-parser/src/protocol/links.rs)
 *   Heading ID = `h-${slugifyPath(headingText)}`，两端均使用同一函数，禁止引入独立的 heading slug 函数。
 */

export interface WikiLinkInfo {
  /** 原始输入 (e.g. "Work/Project A#Section") */
  raw: string;
  /** 
   * 规范化的 Vault 路径 (Normalize Unicode + Clear Extension) 
   * 用于作为 Resolution 的锚点。
   */
  path: string;
  /** 文件名部分 (不含路径和扩展名) */
  basename: string;
  /** 锚点片段 (Heading 或 Block ID) */
  fragment: string | null;
  /** 是否为 Obsidian Block Reference (^block-id) */
  isBlock: boolean;
}

/**
 * Layer 1: 解析层 (Resolve/Normalize)
 *
 * 职责：严格按照 Obsidian Wiki-Link 语义拆分字符串，产出结构化的 WikiLinkInfo。
 * 不涉及任何 Web 路由逻辑（路由由 slugifyPath 负责）。
 *
 * 处理步骤：NFC 归一化 → 锚点剥离(# / ^) → URI 解码 → 路径清洗 → 文件名提取
 *
 * 为什么用 indexOf 而非 split：
 *   链接中可能存在多个 '#'（如 URI 编码的中文标题），split 会截断后续内容。
 */
export function parseWikiLink(raw: string): WikiLinkInfo {
  // 1. Unicode 归一化 (NFC)
  // 必须首选 NFC，因为 Mac 生成的文件名通常是 NFD，会导致字符串比对失败。
  const normalizedRaw = (raw || "").normalize("NFC").trim();

  let linkPath = normalizedRaw;
  let fragment: string | null = null;
  let isBlock = false;

  // 2. 剥离锚点 (# 或 ^)
  const hashIdx = normalizedRaw.indexOf("#");
  const caretIdx = normalizedRaw.indexOf("^");

  if (hashIdx !== -1) {
    linkPath = normalizedRaw.substring(0, hashIdx);
    const rawFrag = normalizedRaw.substring(hashIdx + 1);
    try {
      fragment = decodeURIComponent(rawFrag);
    } catch {
      fragment = rawFrag;
    }
  } else if (caretIdx !== -1) {
    linkPath = normalizedRaw.substring(0, caretIdx);
    fragment = normalizedRaw.substring(caretIdx);
  }

  // 3. 路径 URI 解码
  try {
    linkPath = decodeURIComponent(linkPath);
  } catch {
    // 容错：linkPath 可能包含无效的 percent-encoding，保留原始值
  }

  // 4. 识别 Block Reference 类型
  if (fragment?.startsWith("^")) {
    isBlock = true;
  }

  // 5. 规范化路径分隔符
  const path = linkPath
    .replace(/\\/g, "/")                // 统一斜杠
    .replace(/\/+/g, "/")               // 去重
    .replace(/\.mdx?$/, "")             // 移除扩展名
    .replace(/^\/|\/$/g, "");           // 移除首尾斜杠

  // 4. 提取基准文件名
  const basename = path.split("/").pop() || "";

  return {
    raw,
    path,
    basename,
    fragment,
    isBlock,
  };
}

/**
 * Layer 2: 归一化层 (Slugify)
 *
 * 核心路由算法。同时用于：
 *   1. 路径 → URL Slug 转换（路由生成）
 *   2. Heading 文本 → Heading ID 生成（`h-${slugifyPath(text)}`）
 *
 * 对称源码 (Symmetry Sources):
 *   - packages/sentinel/src/utils/path.rs          :: slugify_publish_path
 *   - packages/markdown-parser/src/protocol/links.rs :: slugify_publish_path
 *   - packages/markdown-parser/src/protocol/anchors.rs :: inject_heading_ids (line 23)
 *
 * 字符映射规则：
 *   '/' | '\\' | ' ' | '_'  →  '-'  (分隔符)
 *   c.is_alphanumeric()     →  c.toLowerCase()  (保留)
 *   '-'                     →  '-'  (保留，去重)
 *   其他字符                →  丢弃（不产生分隔符）
 *
 * 惩罚性约束：若与 Rust 端逻辑不一致，会导致前端链接 404 或双向链接预览失效。
 */
export function slugifyPath(input: string): string {
  if (!input) {
    return "";
  }

  // 1. 拆分路径并归一化 (镜像 Rust 的 normalize_vault_path)
  const normalized = input
    .normalize("NFC")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\/|\/$/g, "")
    .replace(/\.mdx?$/, "");

  let out = "";
  let lastWasDash = false;

  // 2. 字符遍历模拟 Rust 的 behavior
  for (const ch of normalized) {
    // 镜像 Rust: '/' | '\\' | ' ' | '_' => '-'
    if (ch === "/" || ch === "\\" || ch === " " || ch === "_") {
      if (out.length > 0 && !lastWasDash) {
        out += "-";
        lastWasDash = true;
      }
      continue;
    }

    // 镜像 Rust: c.is_alphanumeric()
    // 💡 [Symmetry Rule] Using Unicode property escapes (\p{L}, \p{N}) to match Rust's is_alphanumeric()
    if (/[\p{L}\p{N}]/u.test(ch)) {
      out += ch.toLowerCase();
      lastWasDash = false;
    } else if (ch === "-") {
      if (out.length > 0 && !lastWasDash) {
        out += "-";
        lastWasDash = true;
      }
    }
  }

  // 移除首尾的连字符 (镜像 Rust: out.trim_matches('-'))
  return out.replace(/^-+|-+$/g, "");
}

/**
 * Canonical Slug 归一化 — 阅读历史子系统中所有 slug 比较 / 去重 / 存储的唯一真相源。
 *
 * 用途：将 URL 路径（可能包含 /blog/ 前缀、fragment、query string）
 *       清洗为纯粹的小写 slug，用于相等性判断。
 *
 * 为什么双重 decodeURIComponent：
 *   Obsidian → Sentinel → Next.js 管线中经常出现双重编码（如中文路径），
 *   单次解码不足以还原原始字符串。
 */
export function normalizeSlug(raw?: string): string {
  if (!raw) {
    return "";
  }
  let slug = raw;
  try {
    // Handle URL decoding. We decode multiple times to handle double-encoded slugs 
    // common in Obsidian-to-Next.js pipelines.
    slug = decodeURIComponent(decodeURIComponent(slug));
  } catch {
    try {
      slug = decodeURIComponent(slug);
    } catch {
      // malformed URI or raw bytes — just continue
    }
  }

  return slug
    .trim()
    .normalize("NFC")               // Enforce NFC for Mac/Obsidian parity
    .replace(/^\/+/, "")            // strip leading slashes
    .replace(/^blog\//i, "")        // strip /blog prefix
    .replace(/^docs\//i, "")        // strip /docs prefix
    .replace(/^notes\//i, "")       // strip /notes prefix
    .split("#")[0]                  // strip hash fragment
    .split("?")[0]                  // strip query string
    .replace(/\/+$/, "")            // strip trailing slashes
    .toLowerCase();                 // canonical lowercase
}

/**
 * 页面身份判等 — 用于 Wiki 导航中的「当前页面」检测。
 *
 * 为什么需要 endsWith 兜底：
 *   Obsidian 的短链接（仅文件名）经过 slugifyPath 后可能只是完整 slug 的后缀，
 *   例如 target="Guide" → "guide"，current="local-retrieval-model-selection-guide"。
 *   endsWith 允许这种模糊匹配，避免同页链接被误判为跨页。
 */
export function isSameWikiPage(target: string, currentSlug: string): boolean {
  if (!target) {
    return true;
  }
  
  const linkInfo = parseWikiLink(target);
  if (!linkInfo.path) {
    return true;
  }
  
  const targetSlug = slugifyPath(linkInfo.path);
  const currentNormalized = normalizeSlug(currentSlug);
  
  return targetSlug === currentNormalized || 
         currentNormalized.endsWith(`-${targetSlug}`);
}
