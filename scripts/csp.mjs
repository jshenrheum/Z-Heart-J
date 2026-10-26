// Content-Security-Policy for the built app. Stage 1 injects it as a <meta> tag at
// build time; Stage 2's Worker also sends it as a real header (plus frame-ancestors,
// which a <meta> tag cannot express). Nothing here allows inline script or eval.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');
