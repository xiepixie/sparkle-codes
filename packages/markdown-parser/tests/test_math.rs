use markdown_parser::parse_content_native;

#[test]
fn test_math_bug() {
    let input = r#"
| 性质 | 结论 |
|------|------|
| **定义域** | $(-\infty,-1)\cup(0,+\infty)$（要求基座 $1+\frac{1}{x}>0$）|
| **水平渐近线** | $y=e$（双侧：$x\to\pm\infty$）|
| **垂直渐近线** | $x=-1$（右侧趋于 $+\infty$）|
| **单调性** | 两个区间内均**严格递增** |
| **值域** | $(1,e)\cup(e,+\infty)$，**函数值永不等于 $e$** |

**关键导数分析**：
$$f'(x) = f(x)\left[\ln\left(1+\frac{1}{x}\right) - \frac{1}{x+1}\right]$$
"#;

    let res = parse_content_native(input).unwrap();
    println!("{}", res.html);
}
