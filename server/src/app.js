import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bodyParser from "body-parser";
import conf from "./conf/conf.js";
import { ensureUploadsSubdirs, getUploadsDir } from "./utils/uploadsDir.js";

const app = express();
const BODY_LIMIT = "150mb";

app.use(bodyParser.json({ limit: BODY_LIMIT }));
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

// app.use(
//   cors({
//     origin: conf.CORS_ORIGIN.replace(/\/$/, ""),
//     credentials: true,
//     methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
//   })
// );

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "http://localhost:8080",
      "https://admin.samitcoop.com",
      "https://student.samit.co.id",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
    ],
    optionsSuccessStatus: 204,
  })
);

app.use(express.static("public"));
app.use(cookieParser());

// Ensure uploads directories exist (important for fresh containers)
ensureUploadsSubdirs();

// Serve static files from uploads directory (persisted via volume mount)
app.use("/uploads", express.static(getUploadsDir(), {
  fallthrough: true,
  // small perf; keep defaults otherwise
  etag: true,
  maxAge: "1h",
}));

// Legacy compatibility with samitbank-style receipt URLs
app.use("/upload", express.static(getUploadsDir(), {
  fallthrough: true,
  etag: true,
  maxAge: "1h",
}));

import Routes from "./routes/index.js";
import adminRoutes from "./routes/admin.routes.js";
import webhookRoutes from "./routes/webhook.routes.js";

app.use("/api", Routes);
app.use("/api", adminRoutes);
app.use("/api/webhook", webhookRoutes);

app.post("/testing", (req, res) => {
  console.log("Testing");
  res.send("Hello testing completed");
});

app.get("/", (req, res) => {
  res.send("Welcome to the Express Server!");
});

app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  const message =
    err.message || (statusCode >= 500 ? "Internal Server Error" : "Bad Request");

  if (statusCode >= 500) {
    console.error("Unhandled server error:", err);
  }

  res.status(statusCode).json({
    success: false,
    message,
    errors: err.errors || [],
  });
});

export { app };
