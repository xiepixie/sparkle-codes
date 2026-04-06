import { source } from "./lib/source";

function test(slug: string[]) {
  console.log(`Testing slug: [${slug.join(",")}]`);
  const page = source.getPage(slug);
  if (page) {
    console.log("SUCCESS: Found page!");
  } else {
    console.log("FAILED: Page not found.");
  }
}

// Test common Chinese characters
const chineseSlug = ["projects", "学习领域-项目-多agents"];
console.log("\n--- NFC ---");
test(chineseSlug.map(s => s.normalize("NFC")));

console.log("\n--- NFD ---");
test(chineseSlug.map(s => s.normalize("NFD")));

const available = source.getPages().map(p => p.slugs.join("/"));
console.log("\n--- Available Slugs ---");
console.log(available.filter(s => s.includes("projects")));
