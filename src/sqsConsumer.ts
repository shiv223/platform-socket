import {
  DeleteMessageBatchCommand,
  GetQueueUrlCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient
} from "@aws-sdk/client-sqs";
import { Server } from "socket.io";

import { config } from "./config";
import { CanonicalNotification, TargetType } from "./types";

type ParsedEnvelope = {
  targetType: TargetType;
  targetId: string;
  event: CanonicalNotification;
};

function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

function parseNotificationMessage(messageBody: string): ParsedEnvelope | null {
  const raw = parseJson(messageBody);
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Record<string, unknown>;
  const payloadRaw = source.payloadJson;

  let payload: unknown = payloadRaw;
  if (typeof payloadRaw === "string") {
    const parsedPayload = parseJson(payloadRaw);
    payload = parsedPayload ?? payloadRaw;
  }

  const targetType = typeof source.targetType === "string" ? source.targetType.trim().toUpperCase() : "";
  const targetId = typeof source.targetId === "string" ? source.targetId.trim() : "";
  const eventType = typeof source.eventType === "string" ? source.eventType.trim() : "UNKNOWN";

  if (!targetType || !targetId) {
    return null;
  }

  const event: CanonicalNotification = {
    id: typeof source.id === "number" ? source.id : undefined,
    eventType,
    targetType: targetType as TargetType,
    targetId,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : undefined,
    idempotencyKey: typeof source.idempotencyKey === "string" ? source.idempotencyKey : undefined,
    payload
  };

  return {
    targetType: event.targetType,
    targetId: event.targetId,
    event
  };
}

function roomName(targetType: string, targetId: string): string {
  return `${targetType}:${targetId}`;
}

export class SqsNotificationConsumer {
  private readonly sqsClient: SQSClient;
  private queueUrl = "";
  private isRunning = false;
  private readonly io: Server;

  constructor(io: Server) {
    this.io = io;
    this.sqsClient = new SQSClient({ region: config.awsRegion });
  }

  async start(): Promise<void> {
    this.queueUrl = await this.resolveQueueUrl();
    this.isRunning = true;
    console.info(`SQS consumer started for queue ${config.sqsQueueName} in region ${config.awsRegion}`);
    this.pollForever().catch((error) => {
      console.error("SQS consumer stopped unexpectedly", error);
      process.exitCode = 1;
    });
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  private async resolveQueueUrl(): Promise<string> {
    if (config.sqsQueueUrl && config.sqsQueueUrl.trim().length > 0) {
      return config.sqsQueueUrl.trim();
    }

    try {
      const response = await this.sqsClient.send(
        new GetQueueUrlCommand({ QueueName: config.sqsQueueName })
      );
      if (!response.QueueUrl) {
        throw new Error(`Unable to resolve queue url for ${config.sqsQueueName}`);
      }
      return response.QueueUrl;
    } catch (error) {
      const isQueueMissing = typeof error === "object"
        && error !== null
        && "name" in error
        && (error as { name: string }).name === "QueueDoesNotExist";

      if (isQueueMissing) {
        throw new Error(
          `Queue lookup failed for '${config.sqsQueueName}' in region '${config.awsRegion}'. ` +
          "Queue may be in a different region/account, or current AWS credentials lack sqs:GetQueueUrl access. " +
          "Set SQS_QUEUE_URL to bypass lookup."
        );
      }

      throw error;
    }
  }

  private async pollForever(): Promise<void> {
    while (this.isRunning) {
      const response = await this.sqsClient.send(
        new ReceiveMessageCommand({
          QueueUrl: this.queueUrl,
          MaxNumberOfMessages: config.sqsMaxMessages,
          WaitTimeSeconds: config.sqsWaitTimeSeconds,
          VisibilityTimeout: config.sqsVisibilityTimeoutSeconds
        })
      );

      const messages = response.Messages ?? [];
      if (messages.length === 0) {
        continue;
      }

      await this.handleMessages(messages);
    }
  }

  private async handleMessages(messages: Message[]): Promise<void> {
    const deleteEntries: { Id: string; ReceiptHandle: string }[] = [];

    for (const message of messages) {
      if (!message.Body || !message.MessageId || !message.ReceiptHandle) {
        continue;
      }

      const parsed = parseNotificationMessage(message.Body);
      if (!parsed) {
        console.warn("Discarding invalid notification message", { messageId: message.MessageId });
        deleteEntries.push({ Id: message.MessageId, ReceiptHandle: message.ReceiptHandle });
        continue;
      }

      const room = roomName(parsed.targetType, parsed.targetId);
      this.io.to(room).emit(config.socketEventName, parsed.event);
      deleteEntries.push({ Id: message.MessageId, ReceiptHandle: message.ReceiptHandle });
    }

    if (deleteEntries.length > 0) {
      await this.sqsClient.send(
        new DeleteMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: deleteEntries
        })
      );
    }
  }
}
