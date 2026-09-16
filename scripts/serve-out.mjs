#!/usr/bin/env node
/**
 * Serve the static export the way GitHub Pages will: `out/` mounted under the basePath.
 *   npm run build:pages && npm run preview:pages   → http://localhost:3101/medaker/
 * PORT and NEXT_PUBLIC_BASE_PATH override the defaults (3101, /medaker).
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const base = (process.env.NEXT_PUBLIC_BASE_PATH ?? "/medaker").replace(/\/$/, "");
const port = Number(process.env.PORT ?? 3101);
const root = join(process.cwd(), "out");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (base && !url.startsWith(base + "/") && url !== base) {
    res.writeHead(404).end(`not under ${base}/ (GitHub Pages would 404 here too)`);
    return;
  }
  let rel = normalize(url.slice(base.length) || "/");
  if (rel.endsWith("/")) rel += "index.html";
  const file = join(root, rel);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end("404");
    return;
  }
  res.writeHead(200, { "content-type": types[extname(file)] ?? "application/octet-stream" });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`serving out/ at http://localhost:${port}${base}/`));
