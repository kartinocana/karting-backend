const express = require("express");
require("dotenv").config();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const { runMaintenanceEngine } = require("./services/maintenanceEngine");

const app = express();

const PORT = process.env.PORT || 3000;


// =======================
// SOCKET.IO INSTANCE (INYECTADA DESDE server.js)
// =======================
let ioInstance = null;

// Permite que server.js inyecte el io aquí
app.setSocketIO = (io) => {
  ioInstance = io;
};

// ====== LED STATE (para CronoLed UI) ======
let lastLedPro = null;
let lastLedAt = null;

// =======================
// MIDDLEWARES GLOBALES
// =======================
app.use(cors());
app.use(express.json());

// =======================
// RUTAS API GENERALES
// =======================
app.use("/api/drivers", require("./routes/drivers"));
app.use("/api/karts", require("./routes/karts"));
app.use("/api/teams", require("./routes/teams"));
app.use("/api/sessions", require("./routes/sessions"));
app.use("/api/penalties", require("./routes/penalties"));
app.use("/api/rankings", require("./routes/rankings"));
app.use("/api/transponders", require("./routes/transponders"));
app.use("/api/race-control", require("./routes/raceControl"));
app.use("/api/maintenance", require("./routes/maintenance"));
app.use("/api/maintenance/alerts", require("./routes/maintenanceAlerts"));
app.use("/api/timing-points", require("./routes/timingPoints"));
app.use("/api/timing-input", require("./routes/timingInput"));
app.use("/api/maintenance/rules", require("./routes/maintenanceRules"));
app.use("/api/maintenance/jobs", require("./routes/maintenanceJobs"));
app.use("/api/forms", require("./routes/forms"));
app.use("/api/driver-levels", require("./routes/driver-levels"));
app.use("/api/email", require("./routes/sessionReport"));
// =======================
// 🏆 CAMPEONATOS
// =======================
app.use("/api/championships", require("./routes/championships"));
app.use("/api", require("./routes/championshipImport"));
app.use("/api", require("./routes/championshipRecalc"));
app.use("/api", require("./routes/championshipPenalties"));
app.use("/api", require("./routes/championshipClaims"));
app.use("/api", require("./routes/championshipStatus"));
app.use("/api", require("./routes/championshipPdf"));
app.use("/api", require("./routes/championshipStandings"));
app.use("/api", require("./routes/championshipRaces"));
app.use("/api", require("./routes/championshipBridge"));

const championshipRounds = require("./routes/championshipRounds");
app.use("/api/championships", championshipRounds);

// =======================
// LIVE TIMING JSON
// =======================
app.post("/api/tiempos", (req, res) => {
  try {
    const filePath = path.join(__dirname, "../public/tiempos.json");
    fs.writeFileSync(filePath, JSON.stringify(req.body, null, 2), "utf8");
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error escribiendo tiempos.json", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// =======================
// MANTENIMIENTO AUTOMÁTICO
// =======================
app.get("/api/maintenance/run-engine", async (req, res) => {
  await runMaintenanceEngine();
  res.json({ status: "engine_completed" });
});

setInterval(runMaintenanceEngine, 5 * 60 * 1000);

// =======================
// ✅ LED CONTROL API (GUARDA ESTADO + EMITE SOCKET)
// =======================
app.post("/api/led", (req, res) => {
  const { pro } = req.body || {};
  if (pro == null) return res.status(400).json({ ok: false, error: "Missing pro" });

  const proNum = Number(pro);
  if (!Number.isFinite(proNum)) {
    return res.status(400).json({ ok: false, error: "Invalid pro" });
  }

  lastLedPro = proNum;
  lastLedAt = Date.now();

  // ✅ Emite a TODAS las pantallas conectadas (aunque estén en segundo plano)
  if (ioInstance) {
    ioInstance.emit("led-pro", { pro: lastLedPro, at: lastLedAt });
  } else {
    console.warn("⚠️ ioInstance no está seteado (server.js no llamó app.setSocketIO)");
  }

  return res.json({ ok: true, pro: lastLedPro, at: lastLedAt });
});

app.get("/api/led-state", (req, res) => {
  res.json({
    pro: lastLedPro,
    at: lastLedAt,
  });
});

// =======================
// ESTÁTICOS (AL FINAL — IMPORTANTE)
// =======================
app.use(express.static(path.join(__dirname, "../public")));

app.use(
  "/pits_admin_app",
  express.static(path.join(__dirname, "../public/pits_admin_app"))
);

module.exports = app;
