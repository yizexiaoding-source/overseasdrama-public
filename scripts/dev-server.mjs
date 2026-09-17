import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";

const workspace = process.cwd();
const environment = { ...process.env };

function readEnvValue(source, wantedKey) {
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1 || line.slice(0, separator).trim() !== wantedKey) continue;
    return line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
  }
  return "";
}

try {
  const source = readFileSync(path.join(workspace, ".env.analysis.local"), "utf8");
  const localPath = path.join(workspace, ".env.local");
  let localSource = "";
  try { localSource = readFileSync(localPath, "utf8"); } catch { /* created below when needed */ }
  const localProxy = environment.LUMINA_HTTP_PROXY || readEnvValue(localSource, "LUMINA_HTTP_PROXY");
  if (localProxy) {
    environment.LUMINA_HTTP_PROXY ||= localProxy;
    environment.HTTP_PROXY ||= localProxy;
    environment.HTTPS_PROXY ||= localProxy;
    environment.NODE_USE_ENV_PROXY ||= "1";
  }
  const localKeys = new Set(
    localSource.split(/\r?\n/).map((line) => line.trim().split("=", 1)[0]).filter(Boolean),
  );
  const additions = [];
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && value && !environment[key]) environment[key] = value;
    if (key && value && !localKeys.has(key)) additions.push(`${key}=${value}`);
  }
  // vinext/workerd reads server secrets from .env.local rather than inherited
  // process variables. Mirror missing local-only semantic settings at startup.
  if (additions.length) writeFileSync(localPath, `${localSource.replace(/\s*$/, "")}\n${additions.join("\n")}\n`, "utf8");
} catch {
  // The app can still run without semantic generation; its API reports the
  // missing configuration only when a generation feature is requested.
}

const modelProxy = environment.LUMINA_HTTP_PROXY
  ? spawn(process.execPath, [path.join(workspace, "scripts", "model-proxy.mjs")], { cwd: workspace, env: environment, stdio: "inherit" })
  : null;

const child = spawn(process.execPath, [path.join(workspace, "node_modules", "vinext", "dist", "cli.js"), "dev"], {
  cwd: workspace,
  env: environment,
  stdio: "inherit",
});
child.on("exit", (code) => {
  modelProxy?.kill();
  process.exit(code ?? 1);
});
