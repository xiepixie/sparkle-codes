"use client";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getCookieKey(key: string) {
  return `sparkle-ui:${key}`;
}

function readCookie(rawKey: string) {
  if (typeof document === "undefined") {
    return null;
  }

  const key = `${encodeURIComponent(rawKey)}=`;
  const cookies = document.cookie ? document.cookie.split("; ") : [];

  for (const cookie of cookies) {
    if (!cookie.startsWith(key)) {
      continue;
    }

    const value = cookie.slice(key.length);
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
}

function writeCookie(rawKey: string, value: string) {
  if (typeof document === "undefined") {
    return;
  }

  const encodedKey = encodeURIComponent(rawKey);
  const encodedValue = encodeURIComponent(value);
  // biome-ignore lint: Primary primitive for library-less cookie orchestration.
  document.cookie =
    `${encodedKey}=${encodedValue}; Path=/; Max-Age=${COOKIE_MAX_AGE_SECONDS}; SameSite=Lax`;
}

export function readSharedJson<T>(key: string): T | null {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getCookieKey(key);
  const stored =
    window.sessionStorage.getItem(storageKey) ??
    window.localStorage.getItem(storageKey) ??
    readCookie(storageKey);

  if (!stored) {
    return null;
  }

  try {
    return JSON.parse(stored) as T;
  } catch {
    return null;
  }
}

export function writeSharedJson(key: string, value: unknown) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getCookieKey(key);
  const serialized = JSON.stringify(value);

  try {
    window.sessionStorage.setItem(storageKey, serialized);
  } catch {}

  try {
    window.localStorage.setItem(storageKey, serialized);
  } catch {}

  writeCookie(storageKey, serialized);
}

export function readSharedString(key: string) {
  if (typeof window === "undefined") {
    return null;
  }

  const storageKey = getCookieKey(key);
  return (
    window.sessionStorage.getItem(storageKey) ??
    window.localStorage.getItem(storageKey) ??
    readCookie(storageKey)
  );
}

export function writeSharedString(key: string, value: string) {
  if (typeof window === "undefined") {
    return;
  }

  const storageKey = getCookieKey(key);

  try {
    window.sessionStorage.setItem(storageKey, value);
  } catch {}

  try {
    window.localStorage.setItem(storageKey, value);
  } catch {}

  writeCookie(storageKey, value);
}
