// Content-Security-Policy. The Worker sends it as a response header on every
// response, with frame-ancestors (which a <meta> tag can't carry); the build also
// writes it into index.html as a <meta> tag so the static demo preview has it too.
// Nothing here allows inline script, inline style, or eval.
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

export const CSP_HEADER = `${CSP}; frame-ancestors 'none'`;
