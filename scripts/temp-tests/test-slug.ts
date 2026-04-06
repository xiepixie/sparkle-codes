import { source } from "./lib/source";

const slug = ["projects", "学习领域-项目-多agents"];
const page = source.getPage(slug);

if (page) {
    console.log("Success: Found page", page.data.title);
} else {
    console.log("Failure: Page not found for slug", slug);
    console.log("Available slugs in projects:");
    source.getPages().filter(p => p.slugs[0] === "projects").forEach(p => {
        console.log(" - ", p.slugs);
    });
}
