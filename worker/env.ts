/** Bindings and settings. Names match wrangler.jsonc and the README. */
export interface Env {
  /** The built app (dist/), served through this Worker so every response gets the security headers. */
  ASSETS: Fetcher;
  /** D1 database. */
  DB: D1Database;
  /** e.g. "yourteam.cloudflareaccess.com" (Zero Trust → Settings → Custom pages / team domain). */
  ACCESS_TEAM_DOMAIN?: string;
  /** The Access application's Audience (AUD) tag. */
  ACCESS_AUD?: string;
  /** Secret. "jeffrey:<email>,zul:<email>" — the two people who may use the app. */
  MEMBER_EMAILS?: string;
  /** Secret. Base64 of exactly 32 random bytes (AES-256-GCM) for protected fields. */
  PROTECTED_DATA_KEY?: string;
  /** Secret. Base64url of the 65-byte public key that signs notifications (VAPID). */
  VAPID_PUBLIC_KEY?: string;
  /** Secret. Base64url of the matching 32-byte private key. */
  VAPID_PRIVATE_KEY?: string;
  /** Local tests only: extra hosts allowed as notification services (a stand-in on this machine). */
  PUSH_EXTRA_HOSTS?: string;
  /** Row scope for this deployment. Defaults to "zj". */
  HOUSEHOLD_ID?: string;
}
