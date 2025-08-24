import express from "express";
import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.route";
import fileRoutes from "./routes/file.routes";
import { connectRedis } from "./repos/redis.repo";

(async () => {
  console.log("Bootstrapping application...");

  await connectRedis();

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use("/health", healthRoutes);
  app.use("/auth", authRoutes);
  app.use("/file", fileRoutes);

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
  });
})();
