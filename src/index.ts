import cors from "cors";
import express from "express";
import http from "http";

import { config } from "./config";
import { createSocketServer } from "./socketServer";
import { SqsNotificationConsumer } from "./sqsConsumer";

async function bootstrap(): Promise<void> {
  const app = express();

  app.use(cors({ origin: config.allowedOrigins, credentials: true }));

  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "ok", service: "socket-gateway" });
  });

  app.get("/readyz", (_req, res) => {
    res.status(200).json({ status: "ready", queue: config.sqsQueueName });
  });

  const server = http.createServer(app);
  const io = await createSocketServer(server);
  const consumer = new SqsNotificationConsumer(io);
  await consumer.start();

  server.listen(config.port, () => {
    console.info(`socket-gateway listening on :${config.port}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    console.info(`Received ${signal}, shutting down`);
    await consumer.stop();
    io.removeAllListeners();
    io.close();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start socket-gateway", error);
  process.exit(1);
});
