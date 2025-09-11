import { Request, Response, NextFunction } from "express";
import { logger, metrics, requestLogger } from "../config/logging";
import { register } from "prom-client";

export const monitoringMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();

  // Capture response metrics
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    requestLogger(req, res.statusCode, duration);
  });

  next();
};

// Metrics endpoint for Prometheus
export const metricsEndpoint = async (req: Request, res: Response) => {
  try {
    res.set("Content-Type", register.contentType);
    res.send(await register.metrics());
  } catch (error) {
    logger.error("Failed to generate metrics", { error });
    res.status(500).send("Failed to generate metrics");
  }
};

// Health check endpoint
export const healthCheck = async (req: Request, res: Response) => {
  const health = {
    uptime: process.uptime(),
    timestamp: Date.now(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
  };

  try {
    // Add additional health checks here (Redis, PostgreSQL, etc.)
    res.send(health);
  } catch (error) {
    logger.error("Health check failed", { error });
    res.status(503).send(health);
  }
};
