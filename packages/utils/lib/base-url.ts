export type AppName = 'web' | 'docs';

const PORT_MAP: Record<AppName, number> = {
  web: 3000,
  docs: 3001,
};

/**
 * Resolves the absolute URL for a specific monorepo application.
 */
export function getAppUrl(app: AppName = 'web') {
  // 1. Build-time / Runtime Explicit override
  const envKey = `NEXT_PUBLIC_${app.toUpperCase()}_URL` as any;
  if (process.env[envKey]) {
    return process.env[envKey] as string;
  }

  // 2. Production Fallbacks
  if (process.env.NODE_ENV === 'production') {
    if (app === 'docs') {
      return 'https://docs.sparkle.codes';
    }
    return 'https://sparkle.codes';
  }

  // 3. Vercel Preview (Legacy)
  if (process.env.NEXT_PUBLIC_VERCEL_URL) {
    return `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`;
  }

  // 4. Local Development
  return `http://localhost:${PORT_MAP[app]}`;
}

/**
 * Legacy wrapper: Defaults to the main web site URL.
 */
export function getBaseUrl() {
  return getAppUrl('web');
}
