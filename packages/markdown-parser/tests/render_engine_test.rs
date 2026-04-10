use markdown_parser::{parse_content_native, ParseResult};

fn reference_document() -> &'static str {
    r#"
## 1. 基础排版与行内语法
**粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`、==高亮==、[^1]

- 链接: [OpenAI](https://openai.com) | <https://google.com>
- 内部链接: [[README]] | [[README|README别名]]
- 块链接: [[博客测试#^block-test-001]]
- 嵌入: ![[Pasted image 20260408214723.png]]

---

## 2. LaTeX 数学公式校验 (KaTeX)

### 行内公式
$f(x)=\left(1+\frac{1}{x}\right)^x$ 且 $\lim_{x\to0^+}x\ln x=0$。比较符测试：$x<y,\ y>0,\ x+y\ge x$。

### 块级公式 (多行对齐与矩阵)
$$
\begin{aligned}
f(x) &= \left(1+\frac{1}{x}\right)^x \\
f'(x) &= f(x)\left[\ln\left(1+\frac{1}{x}\right)-\frac{1}{x+1}\right]
\end{aligned}
$$

$$
\mathbf{J} = \begin{bmatrix}
-\sigma & \sigma & 0 \\
\rho - z & -1 & -x \\
y & x & -\beta
\end{bmatrix}
$$

---

## 3. 代码块与语法高亮 (Shiki)

```js
// line-highlight
function f(x) {
  return Math.pow(1 + 1 / x, x);
}
```

```html
<div class="note" data-msg="a < b && c > d">
  <span>HTML Entities: &lt;br&gt;</span>
</div>
```

---

## 4. Obsidian Callouts (Admonitions) - 嵌套与公式综合测试

> [!abstract] 理论模型汇总
> 这是一个包含复杂嵌套和数学公式的压力测试块。
> $$ \mathcal{L} = \bar{\psi}(i\gamma^\mu D_\mu - m)\psi - \frac{1}{4}F_{\mu\nu}F^{\mu\nu} $$
>
> > [!info] 符号定义与行内公式
> > - $\psi$: 费米子场 (Fermion Field)
> > - $D_\mu = \partial_\mu - ieA_\mu$: 协变导数，包含特殊字符测试 $\langle \phi | \hat{H} | \psi \rangle$
> >
> > > [!warning] 边界条件与多层嵌套
> > > 当 $x \to \infty$ 时，势能项 $V(x)$ 需满足收敛性：
> > > $$ \lim_{x \to \infty} V(x) = \begin{cases} 0 & \text{Vacuum} \\ \infty & \text{Confining Potential} \end{cases} $$
> > > 注意测试方括号在 Callout 内容首位的兼容性：
> > > `[Boundary Test]` $\text{Domain} \in [-\infty, +\infty]$

> [!danger] 混合块级元素测试
> > [!example] 列表、矩阵与对齐
> > 1. 旋转变换矩阵 $R(\theta)$:
> >    $$ R(\theta) = \begin{pmatrix} \cos\theta & -\sin\theta \\ \sin\theta & \cos\theta \end{pmatrix} $$
> > 2. 嵌套在列表项中的公式与样式：
> >    - 黎曼 Zeta 函数：$\zeta(s) = \sum_{n=1}^\infty \frac{1}{n^s}$
> >    - **粗体公式**: **$P(A|B) = \frac{P(B|A)P(A)}{P(B)}$**
> >    - *斜体公式*: *$\oint_{\partial \Sigma} \mathbf{E} \cdot d\mathbf{l} = -\frac{d}{dt} \iint_{\Sigma} \mathbf{B} \cdot d\mathbf{S}$*
>
> > [!tip] 代码与公式邻近测试
> > 在 `inline code` 之后紧跟 $x^2 + y^2 = z^2$。
> > 以及包含反斜杠的测试：`C:\Users\Admin` $\rightarrow$ $\lambda_{backtrack} = \sqrt{\gamma}$


---

> [!caution] 极限压力测试：超级嵌套、表格与任务列表
> > [!bug] 嵌套表格与公式
> > | 物理量 | 定义式 | 单位 |
> > | :--- | :--- | :--- |
> > | 动量 | $p = mv$ | $kg \cdot m/s$ |
> > | 薛定谔方程 | $i\hbar \frac{\partial}{\partial t} \Psi = \hat{H} \Psi$ | $J \cdot s$ |
> >
> > > [!todo] 嵌套任务列表中的公式
> > > - [ ] 验证非齐次方程：$\nabla^2 \phi - \frac{1}{c^2} \frac{\partial^2 \phi}{\partial t^2} = -4\pi\rho$
> > > - [x] 已完成对 $\alpha \approx 1/137$ 的精度校验
> > > - [ ] 待处理：$\text{Error} = |x_{true} - x_{est}| \pm \delta$
>
---

## 5. 更多边界测试

### 行内公式紧贴边界

### 极其复杂的数学环境 (KaTeX 负载)
$$
\begin{Bmatrix}
   a & b \\
   c & d
\end{Bmatrix}
\quad
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
\quad
\vec{\nabla} \times \vec{E} = -\frac{\partial \vec{B}}{\partial t}
$$

---

## 6. 列表与任务状态 (包含 Obsidian 扩展)


- [ ] 基础待办：计算 $\int \sin x \, dx$
- [x] 已完成：$2+2=4$
- [/] 正在进行：正在推导 $\zeta(2)$
- [!] 重要：检查 $G_{\mu\nu} = 8\pi G T_{\mu\nu}$
- [-] 已取消：关于 $1+1=3$ 的讨论
- [?] 疑问：此公式是否成立？ $P \stackrel{?}{=} NP$
- [*] 星标：重点关注 $\forall x \in \mathbb{R}$
- [>] 指向：见下文公式
- [l] 位置：$x=0, y=0$
- [b] 书签

1. 有序项嵌套测试
   - 第一层：基础文本
     - 第二层：含公式 $\frac{\partial \phi}{\partial x}$
     - [ ] 第三层：任务列表中的公式 $k_B T$

---

## 7. 块引用、标签与脚注

这里有一个可引用块。 ^block-test-001

#数学 #markdown/obsidian #latex/inline #html/test #嵌套测试

[^1]: 脚注内容测试，支持公式 $e^{i\pi}+1=0$ 与多行引用。
"#
}

fn parse_reference_document() -> ParseResult {
    parse_content_native(reference_document()).expect("reference render-engine document should parse")
}

fn count_occurrences(haystack: &str, needle: &str) -> usize {
    haystack.match_indices(needle).count()
}

#[test]
fn test_render_engine_reference_document_sets_all_feature_flags() {
    let res = parse_reference_document();

    assert!(res.has_math, "expected math extraction to be enabled");
    assert!(res.has_code, "expected fenced code detection to be enabled");
    assert!(res.has_table, "expected GFM table detection to be enabled");
    assert!(res.has_wiki_links, "expected wiki-link detection to be enabled");
    assert!(res.has_wiki_embeds, "expected wiki-embed detection to be enabled");
    assert!(res.has_hashtags, "expected hashtag extraction to be enabled");

    assert!(!res.hash.is_empty(), "expected a stable output hash");
    assert!(
        res.sections.len() >= 7,
        "expected extracted sections for the major document headings"
    );
    assert!(
        res.headings.iter().any(|heading| heading.text.contains("基础排版与行内语法"))
    );
    assert!(
        res.headings.iter().any(|heading| heading.text.contains("列表与任务状态"))
    );
}

#[test]
fn test_render_engine_reference_document_preserves_inline_syntax_and_links() {
    let res = parse_reference_document();

    assert!(res.html.contains("<strong>粗体</strong>"));
    assert!(res.html.contains("<em>斜体</em>"));
    assert!(
        res.html.contains("<strong><em>粗斜体</em></strong>")
            || res.html.contains("<em><strong>粗斜体</strong></em>")
    );
    assert!(res.html.contains("<del>删除线</del>"));
    assert!(res.html.contains("<code>行内代码</code>"));
    assert!(res.html.contains("<mark>高亮</mark>"));

    assert!(res.html.contains("href=\"https://openai.com\""));
    assert!(res.html.contains("href=\"https://google.com\""));
    assert!(res.html.contains("internal-link wiki-link"));
    assert!(res.html.contains("data-page=\"README\""));
    assert!(res.html.contains(">README<"));
    assert!(res.html.contains(">README别名<"));
    assert!(res.html.contains("data-target=\"博客测试#^block-test-001\""));
    assert!(res.html.contains("data-fragment=\"^block-test-001\""));
    assert!(res.html.contains("class=\"wiki-embed resolved-image\""));
    assert!(res.html.contains("data-src=\"Pasted image 20260408214723.png\""));

    assert!(
        res.links.iter().any(|link| {
            link.page == "README" && link.label == "README" && !link.is_embed
        }),
        "expected raw wiki-link metadata for [[README]]"
    );
    assert!(
        res.links.iter().any(|link| {
            link.page == "README" && link.label == "README别名" && !link.is_embed
        }),
        "expected aliased wiki-link metadata for [[README|README别名]]"
    );
    assert!(
        res.links.iter().any(|link| {
            link.page == "博客测试"
                && link.fragment == "^block-test-001"
                && !link.is_embed
        }),
        "expected block-link metadata for [[博客测试#^block-test-001]]"
    );
    assert!(
        res.links.iter().any(|link| {
            link.page == "Pasted image 20260408214723.png" && link.is_embed
        }),
        "expected attachment embed metadata"
    );
}

#[test]
fn test_render_engine_reference_document_renders_math_code_and_html_escaping() {
    let res = parse_reference_document();

    assert!(
        count_occurrences(&res.html, "math-inline") >= 12,
        "expected many inline formulas across paragraphs, callouts, tables, and tasks"
    );
    assert!(
        count_occurrences(&res.html, "math-block") >= 6,
        "expected multiple block formulas including nested callout formulas"
    );
    assert!(res.html.contains(r#"data-tex="f(x)=\left(1+\frac{1}{x}\right)^x""#));
    assert!(res.html.contains(r#"\begin{aligned}"#));
    assert!(res.html.contains(r#"\begin{bmatrix}"#));
    assert!(res.html.contains(r#"\begin{Bmatrix}"#));
    assert!(res.html.contains(r#"data-tex="x&lt;y,\ y&gt;0,\ x+y\ge x""#));

    assert!(res.html.contains("<pre"));
    assert!(res.html.contains("language-js"));
    assert!(res.html.contains("language-html"));
    assert!(res.html.contains("// line-highlight"));
    assert!(res.html.contains("function f(x)"));
    assert!(res.html.contains(r#"&lt;div class=&quot;note&quot; data-msg=&quot;a &lt; b &amp;&amp; c &gt; d&quot;&gt;"#));
    assert!(res.html.contains("&lt;br&gt;") || res.html.contains("&amp;lt;br&amp;gt;"));
}

#[test]
fn test_render_engine_reference_document_handles_nested_callouts_tables_and_tasks() {
    let res = parse_reference_document();

    assert!(
        count_occurrences(&res.html, "class=\"md-callout") >= 8,
        "expected nested callout chains to survive conversion"
    );
    for callout_type in [
        "abstract",
        "info",
        "warning",
        "danger",
        "example",
        "tip",
        "caution",
        "bug",
        "todo",
    ] {
        assert!(
            res.html.contains(&format!(r#"data-callout-type="{}""#, callout_type)),
            "missing callout type: {callout_type}"
        );
    }

    assert!(res.html.contains("理论模型汇总"));
    assert!(res.html.contains("边界条件与多层嵌套"));
    assert!(res.html.contains("嵌套表格与公式"));
    assert!(res.html.contains("嵌套任务列表中的公式"));

    assert!(res.html.contains("<table>"));
    assert!(res.html.contains("薛定谔方程"));
    assert!(res.html.contains("kg \\cdot m/s"));

    for task_type in [
        "todo",
        "done",
        "in-progress",
        "important",
        "cancelled",
        "question",
        "star",
        "forward",
        "location",
        "bookmark",
    ] {
        assert!(
            res.html.contains(&format!(r#"data-task="{}""#, task_type)),
            "missing task rendering for {task_type}"
        );
    }
    assert!(
        count_occurrences(&res.html, "obsidian-task task-list-item") >= 12,
        "expected top-level and nested task items to be preserved"
    );
}

#[test]
fn test_render_engine_reference_document_extracts_blocks_tags_and_footnotes() {
    let res = parse_reference_document();

    assert!(res.html.contains(r#"id="block-test-001""#));
    assert!(
        res.blocks
            .iter()
            .any(|block| block.block_id == "block-test-001" && block.text_content.contains("这里有一个可引用块")),
        "expected block extraction metadata for the named block reference"
    );

    assert_eq!(
        res.hashtags,
        vec![
            "html/test".to_string(),
            "latex/inline".to_string(),
            "markdown/obsidian".to_string(),
            "嵌套测试".to_string(),
            "数学".to_string(),
        ]
    );
    assert!(res.html.contains(r#"<span class="premium-tag md-hashtag">#数学</span>"#));
    assert!(
        res.html.contains(r#"<span class="premium-tag md-hashtag">#markdown/obsidian</span>"#)
    );

    assert!(
        res.html.contains("脚注内容测试，支持公式")
            && res.html.contains(r#"data-tex="e^{i\pi}+1=0""#),
        "expected footnote body and nested math to survive rendering"
    );
    assert!(
        res.html.contains("href=\"#fn-1\"") || res.html.contains("href=\"#user-content-fn-1\""),
        "expected a rendered footnote reference anchor"
    );
}
