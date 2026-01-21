import express, { Request, Response, NextFunction } from "express";
import { Server as SocketIOServer, Socket } from "socket.io";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import http from "http";
import https from "https";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

const webhook_url = process.env.WEBHOOK_URL || "https://tech-task.splytech.dev/api/eng/tunnel";
const publicUrl = process.env.PUBLIC_URL || ``;

let receivedData: EventRequestBody[] = [];
let requestCount = 0;
let connectedClients: Set<string> = new Set<string>();
const socketDriverSubscriptions: Map<string, string> = new Map<
  string,
  string
>();

//** Functions *//
// get unique room name for driver 
const getDriverRoom = (driverId: string): string => `driver:${driverId}`;

// parse datetime string to Date object
const parsedatetime = (value?: string): Date | null => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

// to directly call Splyt webhook on start
const notifyWebhook = (publicUrl: string): void => {
  try {
    const payload = JSON.stringify({ public_url: publicUrl });
    const url = new URL(webhook_url);
    const options: https.RequestOptions = {
      method: "POST",
      hostname: url.hostname,
      path: url.pathname + url.search,
      port: url.port || 443,
      rejectUnauthorized: false,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(payload),
      },
    };
    const req = https.request(options, (res) => {
      console.log(`Webhook status: ${res.statusCode}`);
      console.log(`Webhook res: ${res}`);
      res.on("data", () => { });
    });
    req.on("error", (err) => {
      console.error("Failed to notify webhook", err);
    });
    req.write(payload);
    req.end();
  } catch (err) {
    console.error("Failed to construct webhook request", err);
  }
};

//*** Socket **//
io.on("connection", (socket: Socket): void => {
  console.log(`Client connected: ${socket.id}`);
  connectedClients.add(socket.id);

  socket.emit("connected", {
    message: "Successfully connected to websocket",
    clientId: socket.id,
    timestamp: new Date().toISOString(),
  });

  socket.broadcast.emit("subscriber_joined", {
    message: "New subscriber joined",
    subscriberCount: connectedClients.size,
  });

  socket.on("disconnect", (): void => {
    connectedClients.delete(socket.id);
    console.log(`Client disconnected: ${socket.id}`);
    socket.broadcast.emit("subscriber_left", {
      message: "Subscriber left",
      subscriberCount: connectedClients.size,
    });
  });

  socket.on("subscribe", (payload: DriverSubscriptionRequest): void => {
    console.log(`Subscription request from ${socket.id}:`, payload);
    const driverId = typeof payload?.driver_id === "string" ? payload.driver_id.trim() : "";
    if (!driverId) {
      socket.emit("driver_subscription_error", {
        error: "driver_id is required",
        timestamp: new Date().toISOString(),
      });
      return;
    }
    const since = payload.since;
    const datetimeDate = parsedatetime(since);

    const currentDriverId = socketDriverSubscriptions.get(socket.id);
    if (currentDriverId && currentDriverId !== driverId) {
      socket.leave(getDriverRoom(currentDriverId));
    }
    socketDriverSubscriptions.set(socket.id, driverId);
    socket.join(getDriverRoom(driverId));
    const history = receivedData.filter((entry) => {
      if (entry.data.driver !== driverId) return false;
      if (!datetimeDate) return true;

      const eventTime = new Date(entry.data.timestamp);
      if (Number.isNaN(eventTime.getTime())) return false;
      return eventTime >= datetimeDate;
    });
    history.forEach((entry) => {
      socket.emit("driver_location_update", {
        type: "driver_location",
        driverId: entry.data.driver,
        event: entry.event,
        data: entry.data,
        // replay: true,
      });
    });
    socket.emit("driver_subscription_success", {
      driverId,
      since: since ?? null,
      subscriptionId: socket.id,
      timestamp: new Date().toISOString(),
    });
  });
});

app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response): void => {
  res.json({
    message: "Server is running",
    timestamp: new Date().toISOString(),
    requestCount: requestCount,
    receivedData: receivedData.length,
    connectedSubscribers: connectedClients.size,
  });
});

//*** API Endpoint **//
app.post("/event", (req: Request, res: Response) => {
  const data = req.body as EventRequestBody;
  const driverId = data.data?.driver;
  console.log("line 168; req:", data)

  // Need to send response immediately else server will timeout
  res.status(200).json({ success: true });

  // emit location update
  setImmediate(() => {
    receivedData.push(data);
    requestCount++;

    const driverRoom = getDriverRoom(driverId);
    io.to(driverRoom).emit("driver_location_update", {
      type: "driver_location",
      driverId,
      event: data.event,
      data: data.data,
    });
  });
});

app.get("/event", (req: Request, res: Response) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 10;
  const recentData = receivedData.slice(-limit);

  res.json({
    success: true,
    count: recentData.length,
    total: receivedData.length,
    subscribersConnected: connectedClients.size,
    data: recentData,
  });
});

// to check how many webscokects are connected
app.get("/subscribers", (req: Request, res: Response): void => {
  res.json({
    success: true,
    count: connectedClients.size,
    message: `${connectedClients.size} subscribers currently connected`,
  });
});

app.delete("/event", (req: Request, res: Response): void => {
  receivedData = [];
  requestCount = 0;

  io.emit("reset", {
    type: "reset",
    timestamp: new Date().toISOString(),
    message: "Reset data",
  });

  res.json({
    success: true,
    message: "Data reseted successfully",
  });
});

app.use((err: Error, req: Request, res: Response, next: NextFunction): void => {
  console.error(err.stack);

  io.emit("server_error", {
    type: "server_error",
    message: "server error",
    timestamp: new Date().toISOString(),
  });

  res.status(500).json({
    success: false,
    error: "Error",
    message: err.message,
  });
});

app.use((req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: "Endpoint not found",
  });
});

server.listen(PORT, (): void => {
  console.log(`Server running on port ${PORT}`);
  console.log("WebSocket running on same host");

  notifyWebhook(publicUrl); // call webhook directly 
});

(module as any).exports = { app, server, io };
