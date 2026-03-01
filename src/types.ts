export type TargetType = "SHOP" | "USER" | "DEVICE" | "TOPIC";

export type SubscribePayload = {
  targetType: TargetType;
  targetId: string;
};

export type CanonicalNotification = {
  id?: number;
  eventType: string;
  targetType: TargetType;
  targetId: string;
  createdAt?: string;
  idempotencyKey?: string;
  payload: unknown;
};
