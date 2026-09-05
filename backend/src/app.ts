import { randomUUID } from "node:crypto";
import cors from "cors";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import {
  PROTOCOL_VERSION,
  closeRoomRequestSchema,
  createRoomInputSchema,
  createSessionRequestSchema,
  joinRoomInputSchema,
  profilePatchSchema,
  restoreSessionRequestSchema,
  roomListQuerySchema
} from "../../packages/contracts/src/index.js";
import { BunkerError, BunkerService } from "./service.js";
import type { ServerConfig } from "./config.js";

type AuthedRequest = Request & { sessionId?: string };
const success = (data: unknown) => ({ ok: true as const, protocolVersion: PROTOCOL_VERSION, data });

export const createApp = (service: BunkerService, config: ServerConfig): Express => {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", config.trustProxy);
  app.use(cors({
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.corsOrigins.has(origin)) callback(null, true);
      else callback(new BunkerError("FORBIDDEN", "Origin is not allowed"));
    }
  }));
  app.use(express.json({ limit: config.maxPayloadBytes, strict: true }));

  const auth = (request: AuthedRequest, _response: Response, next: NextFunction) => {
    try {
      const header = request.header("authorization");
      if (!header?.startsWith("Bearer ")) throw new BunkerError("AUTH_REQUIRED");
      request.sessionId = service.sessionIdForToken(header.slice(7));
      next();
    } catch (error) { next(error); }
  };

  app.get("/health/live", (_request, response) => response.json({ status: "ok", protocolVersion: PROTOCOL_VERSION }));
  app.get("/health/ready", (_request, response) => response.json({ status: "ok", protocolVersion: PROTOCOL_VERSION }));
  app.post("/api/v1/sessions", (request, response, next) => {
    try { response.status(201).json(success(service.createSession(createSessionRequestSchema.parse(request.body).profile))); } catch (error) { next(error); }
  });
  app.post("/api/v1/sessions/restore", (request, response, next) => {
    try { response.json(success(service.restoreSession(restoreSessionRequestSchema.parse(request.body).reconnectToken))); } catch (error) { next(error); }
  });
  app.patch("/api/v1/profile", auth, (request: AuthedRequest, response, next) => {
    try { response.json(success(service.updateProfile(request.sessionId as string, profilePatchSchema.parse(request.body)))); } catch (error) { next(error); }
  });
  app.get("/api/v1/rooms", auth, (request: AuthedRequest, response, next) => {
    try { const query = roomListQuerySchema.parse(request.query); response.json(success({ rooms: service.listRooms(query.status), nextCursor: null })); } catch (error) { next(error); }
  });
  app.post("/api/v1/rooms", auth, (request: AuthedRequest, response, next) => {
    try { response.status(201).json(success(service.createRoom(request.sessionId as string, createRoomInputSchema.parse(request.body)))); } catch (error) { next(error); }
  });
  app.post("/api/v1/rooms/join", auth, (request: AuthedRequest, response, next) => {
    try { const body = joinRoomInputSchema.parse(request.body); response.json(success(service.joinRoom(request.sessionId as string, body.roomId))); } catch (error) { next(error); }
  });
  app.post("/api/v1/rooms/leave", auth, (request: AuthedRequest, response, next) => {
    try { service.leaveRoom(request.sessionId as string); response.json(success({})); } catch (error) { next(error); }
  });
  app.post("/api/v1/rooms/close", auth, (request: AuthedRequest, response, next) => {
    try { const body = closeRoomRequestSchema.parse(request.body); service.closeRoom(request.sessionId as string, body.roomId); response.json(success({})); } catch (error) { next(error); }
  });
  app.get("/api/v1/rooms/current", auth, (request: AuthedRequest, response, next) => {
    try { response.json(success(service.currentRoom(request.sessionId as string))); } catch (error) { next(error); }
  });
  app.post("/api/v1/packs/validate", auth, (request: AuthedRequest, response, next) => {
    try { response.json(success(service.validatePack(request.body))); } catch (error) { next(error); }
  });

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    const requestId = randomUUID();
    const bunker = error instanceof BunkerError ? error : new BunkerError(
      error instanceof SyntaxError && "type" in error && error.type === "entity.too.large" ? "PAYLOAD_TOO_LARGE" : "INVALID_PAYLOAD"
    );
    const status = bunker.code === "AUTH_REQUIRED" || bunker.code === "RECONNECT_TOKEN_INVALID" || bunker.code === "SESSION_EXPIRED" ? 401 : bunker.code === "NOT_FOUND" ? 404 : bunker.code === "RATE_LIMITED" ? 429 : bunker.code === "INTERNAL_ERROR" ? 500 : 400;
    response.status(status).json({ ok: false, protocolVersion: PROTOCOL_VERSION, error: { code: bunker.code, message: bunker.message, requestId } });
  });
  return app;
};
