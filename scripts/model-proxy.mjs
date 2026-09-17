import { createServer } from "node:http";
import { fetch as upstreamFetch, ProxyAgent } from "undici";

const port = Number(process.env.LUMINA_MODEL_PROXY_PORT || 21082);
const proxyUrl = process.env.LUMINA_HTTP_PROXY || process.env.HTTPS_PROXY || process.env.HTTP_PROXY;

if (!proxyUrl) throw new Error("LUMINA_HTTP_PROXY is required to start the local model proxy");

const dispatcher = new ProxyAgent(proxyUrl);
const blockedHeaders = new Set(["connection", "content-length", "host", "x-lumina-upstream"]);

function requestHeaders(headers) {
  const output = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string" && !blockedHeaders.has(key.toLowerCase())) output[key] = value;
  }
  return output;
}

const server = createServer(async (request, response) => {
  const upstream = String(request.headers["x-lumina-upstream"] || "");
  if (request.method !== "POST" || !upstream.startsWith("https://")) {
    response.writeHead(400, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: "Invalid model proxy request" }));
    return;
  }

  try {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const result = await upstreamFetch(upstream, {
      method: "POST",
      headers: requestHeaders(request.headers),
      body: Buffer.concat(chunks),
      dispatcher,
    });
    const payload = Buffer.from(await result.arrayBuffer());
    const headers = {};
    for (const [key, value] of result.headers) {
      if (key !== "transfer-encoding" && key !== "content-encoding") headers[key] = value;
    }
    response.writeHead(result.status, headers);
    response.end(payload);
  } catch (error) {
    response.writeHead(502, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ message: error instanceof Error ? error.message : "Model proxy request failed" }));
  }
});

server.on("error", (error) => {
  if (error && error.code === "EADDRINUSE") {
    console.log(`Local model proxy already running on 127.0.0.1:${port}; reusing it.`);
    process.exit(0);
  }
  console.error(error);
  process.exit(1);
});
server.listen(port, "127.0.0.1", () => console.log(`Local model proxy listening on 127.0.0.1:${port}`));
