# splyt-webhook-test

Quickstart to run the service.

## Prerequisites
- Node.js
- npm or yarn

## Install
```bash
npm install
# or
yarn install
```

## Run locally
```bash
npm run start
# or
yarn start
```
Server defaults to `http://localhost:3000`.

## HTTP endpoints (helpers)
- `POST /event` — ingest a driver event
- `GET /subscribers` — current connected websocket count.

## WebSocket endpoint
- same as host `http://localhost:3000`

## Env vars
- `PORT` (default `3000`)
- `PUBLIC_URL` — public tunnel URL
- `WEBHOOK_URL`  webhook to notify on start