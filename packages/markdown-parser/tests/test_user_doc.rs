use markdown_parser::parse_content_native;

#[test]
fn test_user_doc_comprehensive() {
    let input = r#"
# 一级标题 H1

## 二级标题 H2

### 三级标题 H3

这是一个普通段落，包含 **粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`、==高亮==，以及一个脚注引用[^1]。

这里测试行内链接：[OpenAI](https://openai.com)  
这里测试自动链接：<https://example.com>  
这里测试 Obsidian 内链：[[数学分析]]  
这里测试别名内链：[[函数单调性|单调性分析]]  
这里测试标题链接：[[微积分#导数定义]]  
这里测试块链接：[[测试#^block-test-001]]  
这里测试嵌入：![[Pasted image 20260405121838.png]]  

---

> 这是一个引用块。
>
> 可以包含 **强调**、[[内部链接]]、以及行内公式 $e^{x\ln(1+1/x)}$。
>
> > 这是嵌套引用，其中有比较符号：$a<b,\ c>d,\ x\le y,\ y\ge z$。

---

- 无序列表项 1
  - 子列表项 1.1
  - 子列表项 1.2，含行内公式 $\frac{1}{x+1}$
- 无序列表项 2

1. 有序列表项 1
2. 有序列表项 2
   3. 子项 2.1
   4. 子项 2.2，含集合表示 $\{x\in\mathbb{R}\mid x>0\}$

- [ ] 未完成任务
- [x] 已完成任务
- [>] 进行中任务
- [!] 重要任务
- [-] 已取消任务

---

下面是水平线：

---

这是一个行内公式测试：函数 $f(x)=\left(1+\frac{1}{x}\right)^x$ 在其定义域内有特定的单调性。

这是另一个行内公式测试：$\lim_{x\to0^+}x\ln x=0$，它应该和普通文字在**同一行**显示。

这是一个比较符测试：当 $x<y$ 且 $y>0$ 时，$x+y> x$。

这是一个花括号测试：集合 $A=\{x\mid x\in\mathbb{R},\ x\neq0\}$ 不应因 `{}` 干扰 HTML 或模板。

下面是行间公式测试，应当**单独占一行**：

$$
f(x)=\left(1+\frac{1}{x}\right)^x
$$

$$
f'(x)=f(x)\left[\ln\left(1+\frac{1}{x}\right)-\frac{1}{x+1}\right]
$$

$$
\lim_{x\to\pm\infty}\left(1+\frac{1}{x}\right)^x=e
$$

$$
\left\{
\begin{aligned}
x+y&=1\\
x-y&=3
\end{aligned}
\right.
$$

还可以测试多行对齐公式：

$$
\begin{aligned}
f(x) &= \left(1+\frac{1}{x}\right)^x \\
\ln f(x) &= x\ln\left(1+\frac{1}{x}\right) \\
f'(x) &= f(x)\left[\ln\left(1+\frac{1}{x}\right)-\frac{1}{x+1}\right]
\end{aligned}
$$

---

## 表格测试

| 性质 | 结论 |
|------|------|
| **定义域** | $(-\infty,-1)\cup(0,+\infty)$（要求基座 $1+\frac{1}{x}>0$） |
| **水平渐近线** | $y=e$（双侧：$x\to\pm\infty$） |
| **垂直渐近线** | $x=-1$（右侧趋于 $+\infty$） |
| **单调性** | 两个区间内均 **严格递增** |
| **值域** | $(1,e)\cup(e,+\infty)$，**函数值永不等于 $e$** |
| **集合表达** | $\{x\in\mathbb{R}\mid x<-1 \text{ or } x>0\}$ |
| **比较测试** | 若 $a<b$ 且 $b<c$，则 $a<c$ |

---

## 代码测试

行内代码：`const y = Math.exp(1);`

```js
function f(x) {
  return Math.pow(1 + 1 / x, x);
}
console.log(f(10));
```

```html
<div class="note" data-msg="a < b && c > d">
  <span>HTML 代码块中的 < 和 > 不应被二次解析</span>
</div>
```

---

## Callout 测试

> [!note]
> 这是一个 note callout。

> [!tip]
> 这是一个 tip callout，包含行内公式 $\sqrt{x^2+1}$。

> [!warning]
> 这是一个 warning callout，其中有不等式 $0<x<1$。

---

## 标签测试

#数学 #markdown/obsidian #latex/inline #latex/block #html/test

---

这里有一个可引用块。 ^block-test-001

---

[^1]: 这是一个脚注内容，包含行内公式 $e^{i\pi}+1=0$。
"#;

    let res = parse_content_native(input).unwrap();
    
    // Validate Math preservation (Note: attributes are HTML escaped)
    assert!(res.has_math);
    assert!(res.html.contains("data-tex=\"f(x)=\\left(1+\\frac{1}{x}\\right)^x\""));
    assert!(res.html.contains("data-tex=\"a&lt;b,\\ c&gt;d,\\ x\\le y,\\ y\\ge z\""));
    
    // Validate Hashtags
    assert!(res.has_hashtags);
    assert!(res.html.contains("#数学"));
    assert!(res.html.contains("#markdown/obsidian"));
    
    // Validate WikiLinks
    assert!(res.has_wiki_links);
    assert!(res.html.contains("data-page=\"数学分析\""));
    assert!(res.html.contains("data-page=\"测试\" data-fragment=\"^block-test-001\""));
    
    // Validate Block Anchors (Obsidian block IDs prefix with ^ in the DOM)
    assert!(res.html.contains("id=\"^block-test-001\""));
    
    // Validate HTML protection
    assert!(res.html.contains("&lt;span&gt;HTML 代码块中的 &lt; 和 &gt; 不应被二次解析&lt;/span&gt;"));
    
    println!("SUCCESS: Comprehensive document parsed correctly.");
}
