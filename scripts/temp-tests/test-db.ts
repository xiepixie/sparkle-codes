import { config } from "dotenv";
config({ path: "./.env.local" });

async function main() {
  const { db } = await import("./packages/database/index.ts");
  const posts = await db.query.documents.findMany({
    limit: 10
  });
  
  if (posts.length > 0) {
    for (const post of posts) {
      console.log(`Checking post: ${post.slug}`);
      const html = post.html || "";
      const codeBlocks = html.match(/<pre[^>]*>[\s\S]*?<\/pre>/g);
      console.log("Found code blocks:", codeBlocks ? codeBlocks.length : 0);
      if (codeBlocks && codeBlocks.length > 0) {
          console.log("First code block:", codeBlocks[0].substring(0, 500));
      }

      const mathBlocks = html.match(/\$\$[\s\S]*?\$\$/g);
      const mathSpan = html.match(/<span[^>]*math[^>]*>[\s\S]*?<\/span>/g);
      const mathDiv = html.match(/<div[^>]*math[^>]*>[\s\S]*?<\/div>/g);

      console.log("Math blocks ($$):", mathBlocks?.length || 0);
      console.log("Math blocks (span):", mathSpan?.length || 0);
      console.log("Math blocks (div):", mathDiv?.length || 0);
      
      const tables = html.match(/<table[^>]*>[\s\S]*?<\/table>/g);
      console.log("Found tables:", tables ? tables.length : 0);
      
      console.log("---");
    }
  }
}
main().catch(console.error);
