import { codeToHtml } from 'shiki';

async function test() {
  const code = 'const hello = "world";\nconsole.log(hello);';
  const html = await codeToHtml(code, {
    lang: 'js',
    themes: {
      light: 'github-light',
      dark: 'nord',
    },
    defaultColor: 'light',
    cssVariablePrefix: '--shiki-',
    transformers: [
      {
        pre(node) {
          node.tagName = 'div';
          node.properties.class = 'code-fence mockup-code !bg-background/20 !border-0';
          node.properties.style = ''; // Remove inline styles from Shiki
        },
        code(node) {
          node.tagName = 'div';
        },
        line(node, line) {
          node.tagName = 'pre';
          node.properties = { 'data-prefix': line };
        }
      }
    ]
  });
  console.log(html);
}
test();
