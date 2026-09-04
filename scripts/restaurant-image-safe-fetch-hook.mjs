import { createGuardedFetch } from "./lib/safe-public-fetch.mjs";

const nativeFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = createGuardedFetch({ fetchImpl: nativeFetch });
