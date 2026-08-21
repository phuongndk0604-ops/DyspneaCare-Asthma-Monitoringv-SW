const express = require("express");
const path = require("path");
const session = require("express-session");
const helmet = require("helmet");
const cors = require("cors");
const morgan = require("morgan");
require("dotenv").config();

const { ready, gracefulShutdown } = require("./db");

const app = express();
const PORT = process.env.PORT || 3000;
const isProd = process.env.NODE_ENV === "production";

app.use(helmet({
  contentSecurityPolicy: false,
}));
app.use(cors());
app.use(morgan(isProd ? "combined" : "dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || "change-this-secret",
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false },
}));

app.use(express.static(path.join(__dirname, "public"), {
  maxAge: isProd ? "1d" : 0,
}));

const loginRoutes = require("./routes/login");
const registerRoutes = require("./routes/register");
const userRoutes = require("./routes/user");
const dataRoutes = require("./routes/data");
const mailRoutes = require("./routes/mail");
const analysisRoutes = require("./routes/analysis");

app.use("/api/login", loginRoutes);
app.use("/api/register", registerRoutes);
app.use("/api/users", userRoutes);
app.use("/api", dataRoutes);
app.use("/api/mail", mailRoutes);
app.use("/api/analysis", analysisRoutes);

app.post("/api/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ error: "Logout failed" });
    res.sendStatus(200);
  });
});

app.get("/:page", (req, res) => {
  const page = req.params.page;

  if (page === "home") {
    if (!req.session.user) return res.redirect("/login");
  }

  const filePath = path.join(__dirname, "public", `${page}.html`);
  res.sendFile(filePath, (err) => {
    if (err) res.status(404).send("Page not found!");
  });
});

app.get("/", (req, res) => {
  res.redirect("/login");
});

app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Endpoint not found" });
  }
  next();
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: isProd ? "Internal server error" : err.message,
  });
});

ready.then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });

  process.on("SIGINT", () => {
    console.log("Received SIGINT, shutting down...");
    gracefulShutdown();
    server.close(() => process.exit(0));
  });

  process.on("SIGTERM", () => {
    console.log("Received SIGTERM, shutting down...");
    gracefulShutdown();
    server.close(() => process.exit(0));
  });
}).catch((err) => {
  console.error("Failed to initialize database:", err);
  process.exit(1);
});
