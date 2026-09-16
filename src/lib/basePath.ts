/**
 * Public-asset URL helper. Next prefixes routes, scripts and next/font files with
 * `basePath` on its own, but NOT `next/image` src or metadata icon URLs — use this
 * for anything under /public that you reference by absolute path.
 */
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");

export function withBasePath(path: string): string {
  return `${BASE_PATH}${path.startsWith("/") ? path : `/${path}`}`;
}
