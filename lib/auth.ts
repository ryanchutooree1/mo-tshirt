import type { ReadonlyRequestCookies } from 'next/dist/server/web/spec-extension/adapters/request-cookies';
export function isAuthed(cookies: ReadonlyRequestCookies) {
  return cookies.get('mo_auth')?.value === '1';
}