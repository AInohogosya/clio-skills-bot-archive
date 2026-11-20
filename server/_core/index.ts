import "dotenv/config";
import express from "express";
import { createServer, type Server } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { publicApiRateLimit } from "./rateLimit";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { scheduledCatalogSyncHandler } from "../unaiCatalog";
import { serveStatic, setupVite } from "./vite";

const MAX_PORT_ATTEMPTS = 20;

function listenOnAvailablePort(
  server: Server,
  startPort: number,
  host: string,
): Promise<number> {
  return new Promise((resolve, reject) => {
    let currentPort = startPort;
    let remainingAttempts = MAX_PORT_ATTEMPTS;

    const onListening = () => {
      server.removeListener("error", onError);
      resolve(currentPort);
    };

    const onError = (error: NodeJS.ErrnoException) => {
      server.removeListener("listening", onListening);
      if (error.code === "EADDRINUSE" && remainingAttempts > 1) {
        remainingAttempts -= 1;
        currentPort += 1;
        server.once("listening", onListening);
        server.listen(currentPort, host);
        return;
      }
      reject(error);
    };

    server.once("listening", onListening);
    server.on("error", onError);
    server.listen(currentPort, host);
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const isDevelopment = process.env.NODE_ENV === "development";
  const host =
    process.env.HOST?.trim() || (isDevelopment ? "127.0.0.1" : "0.0.0.0");

  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), geolocation=(), microphone=()",
    );
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));
  registerOAuthRoutes(app);
  app.post("/api/scheduled/unai-catalog-sync", scheduledCatalogSyncHandler);
  app.use(
    "/api/trpc",
    publicApiRateLimit,
    createExpressMiddleware({
      router: appRouter,
      createContext,
    }),
  );
  if (isDevelopment) {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await listenOnAvailablePort(server, preferredPort, host);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  console.log(`Server running on http://${host}:${port}/`);
}

startServer().catch(console.error);
