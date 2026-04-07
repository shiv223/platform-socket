# Platform Socket Gateway

Stateless Socket.IO gateway that consumes notification events from AWS SQS and pushes realtime updates to connected clients.

## Purpose

This service is the realtime delivery layer between your backend notification pipeline and UI clients.

- Backend writes canonical notifications to `notifications` table and enqueues to SQS.
- This gateway consumes SQS messages and emits to Socket.IO rooms.
- UI pages subscribe to rooms (for example `SHOP:12`) and refresh data in background when events arrive.

The gateway remains stateless:

- No local event storage.
- Horizontal scaling ready.
- Optional Redis adapter for cross-instance room fanout.

## Expected message shape from SQS

The consumer expects a JSON body that contains at least:

```json
{
  "targetType": "SHOP",
  "targetId": "12",
  "eventType": "NEW_BOOKING",
  "payloadJson": "{\"bookingId\":101,\"shopId\":12,\"queueNumber\":9}"
}
```

## Client contract

### Subscribe

Client emits `subscribe`:

```json
{
  "targetType": "SHOP",
  "targetId": "12"
}
```

Server joins room `SHOP:12`.

### Unsubscribe

Client emits `unsubscribe` with same payload.

### Receive events

Server emits `notification` (default name):

```json
{
  "id": 88,
  "eventType": "NEW_BOOKING",
  "targetType": "SHOP",
  "targetId": "12",
  "idempotencyKey": "...",
  "createdAt": "2026-02-28T20:31:12",
  "payload": {
    "bookingId": 101,
    "shopId": 12,
    "queueNumber": 9
  }
}
```

Recommended UI behavior: treat event as invalidation signal and refetch authoritative data via API.

## Environment variables

Copy `.env.example` to `.env` and update values.

Required:

- `AWS_REGION`
- `SQS_QUEUE_NAME`

Optional (recommended when queue is in another account/profile context):

- `SQS_QUEUE_URL` (full queue URL; bypasses `GetQueueUrl` lookup by name)

Common:

- `PORT` (default `8090`)
- `ALLOWED_ORIGINS` (comma-separated)
- `SOCKET_PATH` (default `/socket.io`)
- `SOCKET_EVENT_NAME` (default `notification`)

Optional for multi-instance fanout:

- `REDIS_URL`

## Run locally

```bash
cd socket-gateway
npm install
cp .env.example .env
npm run dev
```

Health checks:

- `GET /healthz`
- `GET /readyz`

## Build

```bash
cd socket-gateway
npm install
npm run build
npm start
```

## Docker build and run

```bash
cd socket-gateway
docker build -t platform-socket-gateway:latest .
docker run --rm -p 8090:8090 --env-file .env platform-socket-gateway:latest
```

## Deploy

You can deploy this container to any platform that supports long-running HTTP + WebSocket services.

### Azure Container Apps (example)

1. Build and push image to Azure Container Registry.
2. Create Container App with external ingress enabled.
3. Set env vars (`AWS_REGION`, `SQS_QUEUE_NAME`, `ALLOWED_ORIGINS`, `REDIS_URL` if used).
4. Configure health probes:
   - Liveness: `/healthz`
   - Readiness: `/readyz`
5. Scale out as needed.

### AWS ECS/Fargate (example)

1. Push image to ECR.
2. Create task/service with port `8090`.
3. Add IAM permissions for SQS receive/delete/getQueueUrl.
4. Configure environment variables.
5. Put behind ALB with WebSocket support.

## IAM permissions required

The runtime identity needs:

- `sqs:GetQueueUrl`
- `sqs:ReceiveMessage`
- `sqs:DeleteMessage`
- `sqs:DeleteMessageBatch`

## Troubleshooting: QueueDoesNotExist

If startup fails with `QueueDoesNotExist`, usually one of these is wrong:

- `AWS_REGION` does not match the queue region.
- Runtime credentials point to a different AWS account than the queue owner.
- Missing permission for `sqs:GetQueueUrl` on that queue.

Fastest fix: set `SQS_QUEUE_URL` explicitly.

## Scaling notes

- Without Redis adapter, each instance manages local rooms only.
- With `REDIS_URL`, Socket.IO adapter synchronizes rooms/events across instances.
- Keep this service stateless and rely on backend DB/API for source of truth.


## Manual deployment
  - docker build -t socket-app:latest .
  - docker save -o socket-app.tar socket-app:latest
  - scp -i demoplatform.pem ./platform-socket/socket-app.tar ec2-user@35.90.119.174:/home/ec2-user/
  - scp -i demoplatform.pem .env ec2-user@35.90.119.174:/home/ec2-user/.env
  - ssh -i demoplatform.pem ec2-user@35.90.119.174
  - docker load -i /home/ec2-user/socket-app.tar
  -   docker stop socket-app || true
      docker rm socket-app || true
      docker run -d \
        --name socket-app \
        -p 8090:8090 \
        --env-file .env \
        socket-app
  -  docker ps
  -  docker logs -f --tail 200 socket-app      