import { createServer } from "node:http";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { attachRealtime } from "./realtime.js";
import { systemScheduler } from "./scheduler.js";
import { BunkerService } from "./service.js";

export const startServer = async () => {
  const config = loadConfig();
  const service = new BunkerService(config, systemScheduler);
  const server = createServer(createApp(service, config));
  const io = attachRealtime(server, service, config);
  await new Promise<void>((resolve) => server.listen(config.port, "0.0.0.0", resolve));
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    service.stopAccepting();
    io.emit("server:shutdown", { reconnectAfterMs: 5_000 });
    await new Promise<void>((resolve) => io.close(() => resolve()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.shutdown();
  };
  process.once("SIGTERM", () => void close());
  process.once("SIGINT", () => void close());
  return { server, io, service, close };
};

if (process.env.NODE_ENV !== "test") void startServer();
