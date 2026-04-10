/**
 * 🔗 Sparkle Wiki-Link Standard Protocol (Layered Architecture)
 *
 * 这套协议定义了项目如何处理从 Obsidian 原始引用到 Web 路由的转换。
 * 包含两层职责：
 * 1. Resolution (解析层): 将原始字符串拆解为结构化路径和片段。
 * 2. Slugify (归一化层): 将规范路径转换为确定性的 Web Slug。
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
 * 职责：严格按照 Obsidian 语义拆分字符串，不涉及 Web 路由逻辑。
 * 
 * 为什么这样做：
 * 保证无论输入是什么样（含空格、反斜杠、Unicode NFD），都能产出一致的内部表示。
 */
export function parseWikiLink(raw: string): WikiLinkInfo {
  // 1. Unicode 归一化 (NFC)
  // 必须首选 NFC，因为 Mac 生成的文件名通常是 NFD，会导致字符串比对失败。
  const normalizedRaw = (raw || "").normalize("NFC").trim();

  let linkPath = normalizedRaw;
  let fragment: string | null = null;
  let isBlock = false;

  // 2. 剥离锚点 (# 或 ^)
  if (normalizedRaw.includes("#")) {
    const parts = normalizedRaw.split("#");
    linkPath = parts[0];
    try {
      fragment = parts[1] ? decodeURIComponent(parts[1]) : null;
    } catch {
      fragment = parts[1] || null;
    }
  } else if (normalizedRaw.includes("^")) {
    const idx = normalizedRaw.indexOf("^");
    linkPath = normalizedRaw.substring(0, idx);
    fragment = normalizedRaw.substring(idx);
  }

  // 3. 路径归一化
  try {
    linkPath = decodeURIComponent(linkPath);
  } catch {
    // ignore
  }

  // 识别 Block 类型
  if (fragment?.startsWith("^")) {
    isBlock = true;
  }

  // 3. 规范化路径分隔符
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
 * 职责：核心路由算法。必须与 Rust 端的 `slugify_publish_path` 完全对称。
 * 
 * 逻辑参照：packages/sentinel/src/utils/path.rs
 * 惩罚性原则：若逻辑不一致，会导致前端链接 404 或双向链接预览失效。
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
    // 注意：JS 的正则 [\w] 不包含中文字符，我们需要包含中文字符。
    if (/[a-zA-Z0-9\u4e00-\u9fa5]/.test(ch)) {
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
 * Canonical slug normalization — the SINGLE SOURCE OF TRUTH for all slug
 * comparison / dedup / storage in the reading-history subsystem.
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
 * isSameWikiPage - Standard identity check for Wiki navigation.
 */
export function isSameWikiPage(target: string, currentSlug: string): boolean {
  if (!target) return true;
  
  const linkInfo = parseWikiLink(target);
  if (!linkInfo.path) return true;
  
  const targetSlug = slugifyPath(linkInfo.path);
  const currentNormalized = normalizeSlug(currentSlug);
  
  return targetSlug === currentNormalized || 
         currentNormalized.endsWith("-" + targetSlug);
}

/**
 * Heading ID logic — mirrors the Markdown parser's heading slugification.
 * 为什么这样做：
 * 为了在预览 (WikiLinkPreview) 中能够正确提取非 ASCII 标题 (如中文) 的片段。
 * 该逻辑必须与 Rust 端 `h-{slug}` 的生成规则一致。
 */
export function slugifyHeader(text: string): string {
  if (!text) {
    return "";
  }
  
  // 镜像 Rust: 仅将空格、特殊符号转换为连字符，保留字母、数字和中文字符
  return text
    .normalize("NFC")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");        // 移除首尾连字符
}