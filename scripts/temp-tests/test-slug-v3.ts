import { source } from "./lib/source";

const pages = source.getPages();
console.log(`Found ${pages.length} pages.`);

for (const page of pages) {
    if (page.slugs.some(s => s.includes("projects"))) {
      console.log(`- Slug: ${JSON.stringify(page.slugs)}`);
      // Print hex codes for the chinese part
      const chinesePart = page.slugs.find(s => s.includes("学习"));
      if (chinesePart) {
          const hex = Array.from(chinesePart).map(c => c.charCodeAt(0).toString(16)).join(" ");
          console.log(`  Hex: ${hex}`);
          console.log(`  Normalizations: NFC(${chinesePart.normalize('NFC').length}) vs NFD(${chinesePart.normalize('NFD').length}) vs RAW(${chinesePart.length})`);
      }
    }
}
