import express from "express";
import cors from "cors";
import roomRoutes from "./routes/roomRoutes.js";

const app = express();

const clientUrl = "https://draw-ai-ankit.vercel.app/";
  // process.env.CLIENT_URL || "https://draw-ai-ankit.vercel.app/";

app.use(
  cors({
    origin: '*',
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
