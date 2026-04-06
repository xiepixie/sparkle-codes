import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dialect: "postgresql",
	schema: "./schema/index.ts",
	dbCredentials: {
		url: process.env.DATABASE_URL as string,
	},
});
