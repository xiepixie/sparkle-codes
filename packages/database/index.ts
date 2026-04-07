import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export * from "drizzle-orm";
export * from "./queries/posts";
export * from "./schema";

function normalizeDatabaseUrl(url: string) {
	if (url.startsWith("postgres://")) {
		return `postgresql://${url.slice("postgres://".length)}`;
	}

	return url;
}

export function getDatabaseUrl() {
	const rawUrl = process.env.DATABASE_URL;
	if (!rawUrl) {
		return null;
	}

	return normalizeDatabaseUrl(rawUrl);
}

export function isBuildTimeDatabaseStub(url = getDatabaseUrl()) {
	return url?.includes("build-time-dummy") ?? false;
}

export const hasUsableDatabaseUrl = (url = getDatabaseUrl()) => {
	const isDummy = isBuildTimeDatabaseStub(url);

	if (!url || isDummy) {
		return false;
	}

	try {
		const urlObj = new URL(url);
		return (
			(urlObj.protocol === "postgresql:" || urlObj.protocol === "postgres:") &&
			Boolean(urlObj.hostname) &&
			urlObj.pathname.length > 1
		);
	} catch {
		return false;
	}
};



function createDb() {
	const url = getDatabaseUrl();
	if (!url) {
		throw new Error("DATABASE_URL is not set");
	}

	const sql = neon(url);
	return drizzle(sql, { schema });
}

type Database = ReturnType<typeof createDb>;

let _db: Database | undefined;

function getDb(): Database {
	if (!_db) {
		_db = createDb();
	}
	return _db;
}

/**
 * Lazy database instance for Next.js build-time safety.
 * Wrapped in a Proxy to delay initialization until the first access.
 */
export const db: Database = new Proxy({} as Database, {
	get(_target, prop, receiver) {
		return Reflect.get(getDb(), prop, receiver);
	},
});
