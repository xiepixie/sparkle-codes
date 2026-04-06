export type AppName = 'web' | 'docs';

const PORT_MAP: Record<AppName, number> = {
  web: 3000,
  docs: 3001,
};

/**
 * Resolves the absolute URL for a specific monorepo application.
 */
export function getAppUrl(app: AppName = 'web') {
  // 1. Production/Explicit override
  const envKey = `NEXT_PUBLIC_${app.toUpperCase()}_URL` as any;
  if (process.env[envKey]) return process.env[envKey] as string;

  // 2. Vercel Preview/Production
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    const baseUrl = `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
    // If we are on the web app, return the base. If on docs, we might need a subdomain or suffix.
    // Assuming for now simple relative prod mapping or explicit vars handle it.
    return baseUrl; 
  }

  // 3. Local Development
  return `http://localhost:${PORT_MAP[app]}`;
}

/**
 * Legacy wrapper: Defaults to the main web site URL.
 */
export function getBaseUrl() {
  return getAppUrl('web');
}
