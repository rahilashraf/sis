import type { CookieOptions, Request } from 'express';

const DEFAULT_AUTH_COOKIE_NAME = 'sis_access_token';
const DEFAULT_AUTH_COOKIE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type SameSitePolicy = 'lax' | 'strict' | 'none';

function normalizeSameSite(value?: string): SameSitePolicy {
  const normalized = value?.trim().toLowerCase();
  if (
    normalized === 'none' ||
    normalized === 'strict' ||
    normalized === 'lax'
  ) {
    return normalized;
  }

  return 'lax';
}

function parseBooleanEnv(value: string | undefined) {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true;
  }

  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false;
  }

  return null;
}

function parseCookieHeader(rawCookieHeader?: string) {
  if (!rawCookieHeader) {
    return {};
  }

  return rawCookieHeader
    .split(';')
    .map((segment) => segment.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, segment) => {
      const separatorIndex = segment.indexOf('=');
      if (separatorIndex < 1) {
        return cookies;
      }

      const key = segment.slice(0, separatorIndex).trim();
      const value = segment.slice(separatorIndex + 1).trim();

      if (!key) {
        return cookies;
      }

      cookies[key] = decodeURIComponent(value);
      return cookies;
    }, {});
}

export function resolveAuthCookieName() {
  const configured = process.env.AUTH_COOKIE_NAME?.trim();
  return configured?.length ? configured : DEFAULT_AUTH_COOKIE_NAME;
}

export function resolveAuthCookieOptions(): CookieOptions {
  const sameSite = normalizeSameSite(process.env.AUTH_COOKIE_SAME_SITE);
  const envSecure = parseBooleanEnv(process.env.AUTH_COOKIE_SECURE);
  const secure = sameSite === 'none' ? true : envSecure ?? process.env.NODE_ENV === 'production';
  const configuredMaxAge = Number.parseInt(
    process.env.AUTH_COOKIE_MAX_AGE_MS ?? `${DEFAULT_AUTH_COOKIE_MAX_AGE_MS}`,
    10,
  );
  const maxAge =
    Number.isFinite(configuredMaxAge) && configuredMaxAge > 0
      ? configuredMaxAge
      : DEFAULT_AUTH_COOKIE_MAX_AGE_MS;
  const cookieDomain = process.env.AUTH_COOKIE_DOMAIN?.trim();

  return {
    httpOnly: true,
    secure,
    sameSite,
    maxAge,
    path: '/',
    ...(cookieDomain ? { domain: cookieDomain } : {}),
  };
}

export function resolveAuthCookieClearOptions(): CookieOptions {
  const options = resolveAuthCookieOptions();
  return {
    httpOnly: options.httpOnly,
    secure: options.secure,
    sameSite: options.sameSite,
    path: options.path,
    ...(options.domain ? { domain: options.domain } : {}),
  };
}

export function getAuthTokenFromCookie(request: Request) {
  const cookieName = resolveAuthCookieName();
  const cookies = parseCookieHeader(request.headers.cookie);
  return cookies[cookieName] ?? null;
}
