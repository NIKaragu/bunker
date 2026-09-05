import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const timeoutMs = Number(process.env.SMOKE_TIMEOUT_MS ?? 30_000);
const externalUrl = process.env.SMOKE_BASE_URL?.replace(/\/$/u, "");
const backendArtifact = resolve(root, "backend/dist/backend/src/server.js");
let child;
let output = "";

const freePort = async () => {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!port) throw new Error("Could not allocate a smoke-test port");
  return port;
};

const waitForExit = async (processToWait, milliseconds) => {
  if (processToWait.exitCode !== null || processToWait.signalCode !== null)
    return true;
  return Promise.race([
    new Promise((resolveExit) =>
      processToWait.once("exit", () => resolveExit(true)),
    ),
    new Promise((resolveTimeout) =>
      setTimeout(() => resolveTimeout(false), milliseconds),
    ),
  ]);
};

const probe = async (baseUrl, pathname) => {
  const response = await fetch(`${baseUrl}${pathname}`, {
    signal: AbortSignal.timeout(2_000),
  });
  const body = await response.json();
  if (
    !response.ok ||
    body.status !== "ok" ||
    body.protocolVersion !== "bunker-party-v1"
  ) {
    throw new Error(
      `${pathname} returned ${response.status}: ${JSON.stringify(body)}`,
    );
  }
};

const waitUntilReady = async (baseUrl) => {
  const deadline = Date.now() + timeoutMs;
  let lastError = new Error("backend did not answer");
  while (Date.now() < deadline) {
    if (child && child.exitCode !== null)
      throw new Error(`backend exited early (${child.exitCode})\n${output}`);
    try {
      await probe(baseUrl, "/health/live");
      await probe(baseUrl, "/health/ready");
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await new Promise((resolveWait) => setTimeout(resolveWait, 150));
    }
  }
  throw lastError;
};

const buildBackend = () => {
  const args = ["--filter", "@bunker/backend", "build"];
  if (process.env.npm_execpath && existsSync(process.env.npm_execpath)) {
    return spawnSync(process.execPath, [process.env.npm_execpath, ...args], {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    });
  }
  if (process.platform === "win32") {
    return spawnSync(
      process.env.ComSpec ?? "cmd.exe",
      ["/d", "/s", "/c", "pnpm.cmd --filter @bunker/backend build"],
      { cwd: root, encoding: "utf8", stdio: "pipe" },
    );
  }
  return spawnSync("pnpm", args, {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe",
  });
};

try {
  let baseUrl = externalUrl;
  if (!baseUrl) {
    const build = buildBackend();
    if (build.error || build.status !== 0) {
      const details = `${build.stdout ?? ""}\n${build.stderr ?? build.error?.message ?? ""}`;
      if (
        details.includes("ERR_PNPM_UNSUPPORTED_ENGINE") &&
        existsSync(backendArtifact)
      ) {
        console.warn(
          "Smoke build skipped: local Node/pnpm do not match the exact workspace engines; probing the existing production artifact.",
        );
      } else {
        throw new Error(`backend build failed\n${details}`);
      }
    }
    const port = await freePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, [backendArtifact], {
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        PORT: String(port),
        CORS_ORIGINS: "http://127.0.0.1:3000",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const capture = (chunk) => {
      output = `${output}${chunk.toString()}`.slice(-8_000);
    };
    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
  }
  await waitUntilReady(baseUrl);
  console.log(`Smoke passed: ${baseUrl}/health/live and /health/ready`);
} finally {
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    if (!(await waitForExit(child, 5_000))) {
      child.kill("SIGKILL");
      await waitForExit(child, 2_000);
    }
    if (child.exitCode === null && child.signalCode === null)
      throw new Error("smoke backend process did not stop");
  }
}
