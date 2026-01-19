import express, { Request, Response, NextFunction } from "express";
import { Server as SocketIOServer, Socket } from "socket.io";
import cors from "cors";
import morgan from "morgan";
import helmet from "helmet";
import http from "http";

const app = express();
const PORT: number = Number(process.env.PORT) || 3000;
const server = http.createServer(app);
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

let receivedData: EventRequestBody[] = [];
let requestCount = 0;
let connectedClients: Set<string> = new Set<string>();

//*** Socket **/
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

  socket.on("subscribe", (data: any): void => {
    console.log(`Subscription request from ${socket.id}:`, data);
    socket.join("subscribers");
  });
});

app.use(helmet());
app.use(cors());
app.use(morgan("combined"));
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (req: Request, res: Response): void => {
  res.json({
    message: "Data Ingestion Service with Real-time Updates!",
    timestamp: new Date().toISOString(),
    requestCount: requestCount,
    receivedData: receivedData.length,
    connectedSubscribers: connectedClients.size,
  });
});

//*** API Endpoint **/
app.post("/event", (req: Request, res: Response): void => {
  const data = req.body as EventRequestBody;

  receivedData.push(data);
  console.log(`Received data #${data}:`, data);

  const broadcastData = {
    type: "data_update",
    ...data,
  };

  io.emit("data_received", broadcastData);
  io.to("subscribers").emit("data_update", broadcastData);

  res.status(201).json({
    success: true,
    message: "Data received and broadcasted successfully",
    payload: data,
    subscribersNotified: connectedClients.size,
  });
});

app.get("/event", (req: Request, res: Response): void => {
  const limitParam =
    typeof req.query.limit === "string" ? req.query.limit : undefined;
  const limit = limitParam ? parseInt(limitParam, 10) : 10;
  const recentData = receivedData.slice(-limit);

  res.json({
    success: true,
    count: recentData.length,
    total: receivedData.length,
    subscribersConnected: connectedClients.size,
    data: recentData,
  });
});

app.get("/subscribers", (req: Request, res: Response): void => {
  res.json({
    success: true,
    count: connectedClients.size,
    message: `${connectedClients.size} subscribers currently connected`,
  });
});

app.get("/subscribe", (req: Request, res: Response): void => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "Access-Control-Allow-Origin": "*",
  });

  res.write(
    `data: ${JSON.stringify({
      type: "connected",
      message: "SSE connection established",
      timestamp: new Date().toISOString(),
    })}\n\n`,
  );

  const sendUpdate = (data: any): void => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  const clientId = `sse-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 11)}`;
  console.log(`SSE client connected: ${clientId}`);

  const heartbeat = setInterval(() => {
    res.write(
      `data: ${JSON.stringify({
        type: "heartbeat",
        timestamp: new Date().toISOString(),
      })}\n\n`,
    );
  }, 30000); // TODO: config interval with env

  req.on("close", (): void => {
    clearInterval(heartbeat);
    console.log(`SSE client disconnected: ${clientId}`);
  });

  void sendUpdate;
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
});

(module as any).exports = { app, server, io };
