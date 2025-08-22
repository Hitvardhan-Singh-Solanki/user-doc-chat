import express from "express";
import authRoutes from "./routes/auth.routes";
import healthRoutes from "./routes/health.route";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/health", healthRoutes);
app.use("/auth", authRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
