use markdown_parser::parse_content_native;

#[test]
fn test_integration_comprehensive_document() {
    let input = r#"# 一级标题 H1

## 二级标题 H2

### 三级标题 H3

这是一个普通段落，包含 **粗体**、*斜体*、***粗斜体***、~~删除线~~、`行内代码`、==高亮==，以及一个脚注引用[^1]。

这里测试行内链接：[OpenAI](https://openai.com)  
这里测试自动链接：<https://example.com>  
这里测试 Obsidian 内链：[[数学分析]]  
这里测试别名内链：[[函数单调性|单调性分析]]  
这里测试标题链接：[[微积分#导数定义]]  
这里测试块链接：[[测试#^paragraph-id]]  
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
   4. 子项 2.2

---

### 表格测试

| 特征 | 描述 | 示例 |
| :--- | :--- | :--- |
| 渲染引擎 | 文档与博客统一 | Content Collections |
| 组件系统 | React & Tailwind | `components.tsx` |
| 交互体验 | Framer Motion | 微交互、弹性动画 |

---

### 代码块测试

```json
{
  "project": "Sentinel",
  "status": "watching",
  "config": {
    "pool": 10,
    "r2": true
  }
}
```

---

### 数学公式测试 (Katex)

行内公式测试：$E = mc^2$

行间公式测试：
$$
\int_{-\infty}^{\infty} e^{-x^2} dx = \sqrt{\pi}
$$

这里测试含比较符号的公式：$a < b$ 和 $c > d$。

---

### Obsidian Callout 与 Task 测试

> [!info] 提示标题
> 这是一个 info 类型的 callout，用来显示提示信息。
> 它支持 **Markdown**、[[内部链接]]。
> 而且能嵌套代码和公式：
> ```rust
> println!("Hello Callout");
> ```
> $$\sum_{i=1}^n i = \frac{n(n+1)}{2}$$

- [ ] 未完成任务
- [x] 已完成任务
- [/] 进行中任务
- [-] 已取消任务
- [>] 正在处理任务
- [!] 重要且紧急
- [?] 疑问项

---

### 块引用 ID 与块链接测试

这是带有块 ID 的段落。 ^paragraph-id

这里测试引用这个块 ID：[[测试#^paragraph-id]]

---

### 脚注内容
[^1]: 这是一个脚注的内容，用于解释某些术语。
"#;

    let res = parse_content_native(input).expect("Failed to parse integrated input");
    
    // Core structure
    assert!(res.html.contains("一级标题 H1"));
    assert!(res.html.contains("id=\"h-二级标题-h2\"") || res.html.contains("id=\"h-h2\""));
    
    // Math
    assert!(res.has_math);
    assert!(res.html.contains("mc^2"));
    assert!(res.html.contains("math-block"));
    
    // Obsidian
    assert!(res.has_wiki_links);
    assert!(res.html.contains("wiki-link"));
    assert!(res.html.contains("md-callout"));
    assert!(res.html.contains("obsidian-task"));
    assert!(res.html.contains("id=\"paragraph-id\""));
    
    // Table & Code
    assert!(res.has_table);
    assert!(res.has_code);
    assert!(res.html.contains("<pre"));
    assert!(res.html.contains("<table>"));
}
