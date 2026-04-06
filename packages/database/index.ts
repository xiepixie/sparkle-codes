import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export * from "drizzle-orm";
export * from "./queries/posts";
export * from "./schema";

let _db: any;

function getDb() {
	if (!_db) {
		const url = process.env.DATABASE_URL;
		if (!url) {
			throw new Error("DATABASE_URL is not set");
		}
		const sql = neon(url);
		_db = drizzle(sql, { schema });
	}
	return _db;
}

/**
 * Lazy database instance for Next.js build-time safety.
 * Wrapped in a Proxy to delay initialization until the first access.
 */
export const db = new Proxy({} as any, {
	get(_target, prop, receiver) {
		return Reflect.get(getDb(), prop, receiver);
	},
	apply(_target, thisArg, argArray) {
		return Reflect.apply(getDb(), thisArg, argArray);
	},
});