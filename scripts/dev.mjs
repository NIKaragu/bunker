import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const backendRoot = resolve(root, "backend");
const frontendRoot = resolve(root, "frontend");
const backendRequire = createRequire(resolve(backendRoot, "package.json"));
const frontendRequire = createRequire(resolve(frontendRoot, "package.json"));

const readPort = (name, fallback) => {
  const raw = process.env[name] ?? String(fallback);
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(
      `${name} must be an integer from 1 through 65535; received ${raw}`,
    );
  }
  return port;
};

const backendPort = readPort("BUNKER_BACKEND_PORT", 4000);
const frontendPort = readPort("BUNKER_FRONTEND_PORT", 3000);
if (backendPort === frontendPort) {
  throw new Error(
    "BUNKER_BACKEND_PORT and BUNKER_FRONTEND_PORT must be different",
  );
}

const children = new Map();
let shuttingDown = false;

const start = (name, entrypoint, args, cwd, env) => {
  const child = spawn(process.execPath, [entrypoint, ...args], {
    cwd,
    env: { ...process.env, ...env },
    stdio: "inherit",
    detached: process.platform !== "win32",
    windowsHide: true,
  });
  children.set(name, child);
  return child;
};

const isRunning = (child) =>
  child.exitCode === null && child.signalCode === null;

const waitForExit = (child, timeoutMs) => {
  if (!isRunning(child)) return Promise.resolve(true);
  return new Promise((resolveWait) => {
    const onExit = () => {
      clearTimeout(timer);
      resolveWait(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolveWait(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
};

const terminate = (child, signal, force = false) => {
  if (!child.pid || !isRunning(child)) return;
  if (process.platform === "win32") {
    const args = ["/pid", String(child.pid), "/t"];
    if (force) args.push("/f");
    spawnSync("taskkill.exe", args, { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(-child.pid, force ? "SIGKILL" : signal);
  } catch (error) {
    if (error?.code !== "ESRCH") throw error;
  }
};

const stopAll = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  const active = [...children.values()].filter(isRunning);
  for (const child of active) terminate(child, signal);
  const stopped = await Promise.all(
    active.map((child) => waitForExit(child, 5_000)),
  );
  for (const [index, child] of active.entries()) {
    if (!stopped[index] && isRunning(child)) terminate(child, signal, true);
  }
  await Promise.all(active.map((child) => waitForExit(child, 2_000)));
};

const failFromChild = async (name, code, signal) => {
  if (shuttingDown) return;
  process.exitCode = typeof code === "number" && code !== 0 ? code : 1;
  console.error(
    `${name} exited unexpectedly (code=${code ?? "none"}, signal=${signal ?? "none"})`,
  );
  await stopAll("SIGTERM");
};

const backend = start(
  "backend",
  backendRequire.resolve("tsx/cli"),
  ["watch", "src/server.ts"],
  backendRoot,
  {
    PORT: String(backendPort),
    CORS_ORIGINS: `http://localhost:${frontendPort}`,
  },
);
const frontend = start(
  "frontend",
  frontendRequire.resolve("next/dist/bin/next"),
  ["dev", "-p", String(frontendPort)],
  frontendRoot,
  {
    PORT: String(frontendPort),
    NEXT_PUBLIC_BACKEND_URL: `http://localhost:${backendPort}`,
  },
);

for (const [name, child] of children) {
  child.once("error", (error) => {
    console.error(`${name} failed to start: ${error.message}`);
    void failFromChild(name, 1, null);
  });
  child.once("exit", (code, signal) => void failFromChild(name, code, signal));
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    void stopAll(signal).then(() => {
      process.exitCode = signal === "SIGINT" ? 130 : 143;
    });
  });
}

console.log(`Bunker dev: frontend http://localhost:${frontendPort}`);
console.log(`Bunker dev: backend  http://localhost:${backendPort}`);
