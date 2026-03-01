import dotenv from "dotenv";

dotenv.config();

function toInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function parseOrigins(value: string | undefined): string[] {
  if (!value || value.trim().length === 0) {
    return ["*"];
  }
  return value
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export const config = {
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: toInt(process.env.PORT, 8090),
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS),
  awsRegion: process.env.AWS_REGION ?? "us-west-2",
  sqsQueueName: process.env.SQS_QUEUE_NAME ?? "platform-notifications-queue",
  sqsQueueUrl: process.env.SQS_QUEUE_URL,
  sqsWaitTimeSeconds: toInt(process.env.SQS_WAIT_TIME_SECONDS, 20),
  sqsMaxMessages: toInt(process.env.SQS_MAX_MESSAGES, 10),
  sqsVisibilityTimeoutSeconds: toInt(process.env.SQS_VISIBILITY_TIMEOUT_SECONDS, 30),
  socketPath: process.env.SOCKET_PATH ?? "/socket.io",
  socketEventName: process.env.SOCKET_EVENT_NAME ?? "notification",
  clientSubscribeEvent: process.env.CLIENT_SUBSCRIBE_EVENT ?? "subscribe",
  clientUnsubscribeEvent: process.env.CLIENT_UNSUBSCRIBE_EVENT ?? "unsubscribe",
  redisUrl: process.env.REDIS_URL
};
