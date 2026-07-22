const isHttpPage = window.location.protocol === 'http:' || window.location.protocol === 'https:';
const DEFAULT_API_ORIGIN = isHttpPage ? window.location.origin : 'http://127.0.0.1:5001';
const storedApiOrigin = window.localStorage.getItem('inventory_api_origin');
const isLoopbackStoredOrigin = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(storedApiOrigin || '');
const isLanPage = isHttpPage && !/^(127\.0\.0\.1|localhost)$/i.test(window.location.hostname);

const normalizedApiOrigin = (!storedApiOrigin || storedApiOrigin === 'http://127.0.0.1:5000' || (isLanPage && isLoopbackStoredOrigin))
  ? DEFAULT_API_ORIGIN
  : storedApiOrigin;

if (normalizedApiOrigin !== storedApiOrigin) {
  window.localStorage.setItem('inventory_api_origin', normalizedApiOrigin);
}

export const API_ORIGIN = normalizedApiOrigin;
export const API_BASE = `${API_ORIGIN}/api`;

export function saveApiOrigin(origin) {
  window.localStorage.setItem('inventory_api_origin', origin || DEFAULT_API_ORIGIN);
}

export function getDefaultApiOrigin() {
  return DEFAULT_API_ORIGIN;
}
