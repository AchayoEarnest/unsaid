const csp = ["default-src 'self'", "script-src 'self' 'unsafe-inline'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src https://fonts.gstatic.com", "img-src 'self' data: blob:", `connect-src 'self' ${process.env.WS_URL ?? ""}`, "frame-ancestors 'none'", "base-uri 'self'", "form-action 'self'"].join("; ");
export default { async headers() { return [{ source: "/(.*)", headers: [
  { key: "Content-Security-Policy", value: csp }, { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" }, { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" }] }]; } };
