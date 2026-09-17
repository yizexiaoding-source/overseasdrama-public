export function modelFetch(input: string | URL, init: RequestInit) {
  // Route runtimes execute inside workerd, where Node's HTTPS_PROXY handling
  // and custom Undici dispatchers are unavailable. The local Node sidecar owns
  // proxy transport; the route itself can keep using standards-based fetch.
  if (!process.env.LUMINA_HTTP_PROXY) return fetch(input, init);

  const headers = new Headers(init.headers);
  headers.set("X-Lumina-Upstream", String(input));
  const gateway = process.env.LUMINA_MODEL_PROXY_URL || "http://127.0.0.1:21082/request";
  return fetch(gateway, { ...init, headers });
}
