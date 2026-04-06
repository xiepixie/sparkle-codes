const { config } = require("dotenv");
config({ path: "./.env.local" });
const { neon } = require("@neondatabase/serverless");

async function main() {
  const sql = neon(process.env.DATABASE_URL);
  const result = await sql("SELECT html FROM documents WHERE html LIKE '%$$%' LIMIT 2");
  console.log("Math Found:", result.length);
  if (result.length > 0) {
    console.log("HTML Sample:", result[0].html.substring(result[0].html.indexOf("$$") - 100, result[0].html.indexOf("$$") + 500));
  }
}
main().catch(console.error);
