/** True only in production builds (the service worker is registered only then). */
declare const __PROD__: boolean;
/** True only in the demo build (`--mode demo`): placeholder data in memory, no server. */
declare const __DEMO__: boolean;
