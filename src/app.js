import express from "express";
import cors from "cors";
import roomRoutes from "./routes/roomRoutes.js";

const app = express();

const clientUrl =
  process.env.CLIENT_URL || "http://localhost:5173";

app.use(
  cors({
    origin: clientUrl,
    methods: ["GET", "POST"],
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "DrawAI server is running",
  });
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "DrawAI API is healthy",
  });
});

app.use("/api/rooms", roomRoutes);

export { app };
