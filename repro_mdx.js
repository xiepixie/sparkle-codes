
const { compile } = require('@mdx-js/mdx');

const mdxContent = `
---
title: "Test"
---

<ul>
<li><strong>Label</strong>:
<ul>
<li>Subitem</li>
</ul>
</li>
</ul>
`;

async function test() {
  try {
    const _result = await compile(mdxContent);
    console.log("✅ Compiled successfully!");
  } catch (e) {
    console.error("❌ Compilation failed!");
    console.error(e.message);
  }
}

test();
