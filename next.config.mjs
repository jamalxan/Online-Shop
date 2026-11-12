import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.dirname(fileURLToPath(import.meta.url))
const isProd = process.env.NODE_ENV === "production"

// ─── Image hosts ──────────────────────────────────────────
// Product/category media is served by the Django API (NEXT_PUBLIC_API_URL) under /media/.
const apiUrl = new URL(process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000")
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"]
const apiIsLocal = LOCAL_HOSTS.includes(apiUrl.hostname)

/** @type {import('next').NextConfig['images']['remotePatterns']} */
const remotePatterns = [
  { protocol: "https", hostname: "images.unsplash.com", pathname: "/**" },
  {
    protocol: apiUrl.protocol === "https:" ? "https" : "http",
    hostname: apiUrl.hostname,
    port: apiUrl.port,
    pathname: "/media/**",
  },
]
if (!isProd || apiIsLocal) {
  // local Django dev server
  for (const hostname of ["localhost", "127.0.0.1"]) {
    if (hostname === apiUrl.hostname && apiUrl.port === "8000") continue
    remotePatterns.push({ protocol: "http", hostname, port: "8000", pathname: "/media/**" })
  }
}

// ─── Security headers ─────────────────────────────────────
// Content-Security-Policy: the last line of defence if an XSS ever slips through. Sessions live in
// localStorage, so the policy limits where injected script could be loaded FROM and where data could
// be sent TO: only this site and the API. Next.js needs inline scripts/styles ('unsafe-inline');
// 'unsafe-eval' and the websocket are added in development only (React Fast Refresh).
// Phone login through Firebase is not wired into the UI. If it is ever enabled, add
// https://www.google.com https://www.gstatic.com https://apis.google.com to script-src/frame-src and
// https://identitytoolkit.googleapis.com https://securetoken.googleapis.com to connect-src.
const apiOrigin = apiUrl.origin
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${apiOrigin} https://images.unsplash.com`,
  "font-src 'self' data:",
  `connect-src 'self' ${apiOrigin}${isProd ? "" : " ws: wss:"}`,
  "media-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ")

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy", value: csp },
  ...(isProd
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
]

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: false,
  },
  // Pin the workspace root to this folder. Without it Next picks the outermost lockfile
  // (e.g. a stray package-lock.json in the user's home directory) and Turbopack then
  // treats the whole home directory as the project.
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  images: {
    remotePatterns,
    formats: ["image/avif", "image/webp"],
    // The optimizer refuses private/loopback hosts by default; needed only while the API runs locally.
    dangerouslyAllowLocalIP: apiIsLocal,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }]
  },
}

export default nextConfig
