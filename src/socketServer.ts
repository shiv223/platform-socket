import { createClient } from "redis";
import { createAdapter } from "@socket.io/redis-adapter";
import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";

import { config } from "./config";
import { SubscribePayload } from "./types";

function roomName(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`;
}

function isValidSubscribePayload(payload: unknown): payload is SubscribePayload {
  if (typeof payload !== "object" || payload === null) {
    return false;
  }
  const candidate = payload as Partial<SubscribePayload>;
  return (
    typeof candidate.targetType === "string" &&
    typeof candidate.targetId === "string" &&
    candidate.targetType.trim().length > 0 &&
    candidate.targetId.trim().length > 0
  );
}

async function configureRedisAdapter(io: Server): Promise<void> {
  if (!config.redisUrl) {
    return;
  }
  const pubClient = createClient({ url: config.redisUrl });
  const subClient = pubClient.duplicate();
  await Promise.all([pubClient.connect(), subClient.connect()]);
  io.adapter(createAdapter(pubClient, subClient));
  console.info("Socket.IO Redis adapter enabled");
}

function wireConnectionHandlers(io: Server): void {
  io.on("connection", (socket: Socket) => {
    socket.on(config.clientSubscribeEvent, (payload: unknown) => {
      if (!isValidSubscribePayload(payload)) {
        socket.emit("error", { message: "Invalid subscribe payload" });
        return;
      }

      const normalizedTargetType = payload.targetType.trim().toUpperCase();
      const normalizedTargetId = payload.targetId.trim();
      const room = roomName(normalizedTargetType, normalizedTargetId);
      socket.join(room);
      socket.emit("subscribed", { room, targetType: normalizedTargetType, targetId: normalizedTargetId });
    });

    socket.on(config.clientUnsubscribeEvent, (payload: unknown) => {
      if (!isValidSubscribePayload(payload)) {
        socket.emit("error", { message: "Invalid unsubscribe payload" });
        return;
      }

      const normalizedTargetType = payload.targetType.trim().toUpperCase();
      const normalizedTargetId = payload.targetId.trim();
      const room = roomName(normalizedTargetType, normalizedTargetId);
      socket.leave(room);
      socket.emit("unsubscribed", { room, targetType: normalizedTargetType, targetId: normalizedTargetId });
    });
  });
}

export async function createSocketServer(httpServer: HttpServer): Promise<Server> {
  const io = new Server(httpServer, {
    path: config.socketPath,
    cors: {
      origin: config.allowedOrigins,
      credentials: true
    }
  });

  await configureRedisAdapter(io);
  wireConnectionHandlers(io);

  return io;
}
