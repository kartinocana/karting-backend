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
// ☁️ INGEST OUTBOX (CronoNet -> Cloud)  [PRO]
// =======================
const pool = require("../db"); // ajusta si tu db.js está en otra ruta

app.post("/api/ingest/outbox", async (req, res) => {
  try {
    // Auth simple por clave compartida
    const key = req.headers["x-crononet-key"];
    if (!process.env.CLOUD_INGEST_KEY || key !== process.env.CLOUD_INGEST_KEY) {
      return res.status(401).json({ ok: false, error: "unauthorized" });
    }

    const { stream_id, batch_id, events } = req.body || {};
    if (!stream_id || !Array.isArray(events) || events.length === 0) {
      return res.status(400).json({ ok: false, error: "bad_request" });
    }

    // Insert idempotente + emitir live
    let maxSeq = 0;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      for (const e of events) {
        const event_id = e?.event_id;
        const seq = Number(e?.seq);
        const payload = e?.payload;

        if (!event_id || !Number.isFinite(seq) || !payload) continue;

        // Guardar idempotente
        await client.query(
          `
          INSERT INTO crononet_inbox(event_id, stream_id, seq, payload_json)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (event_id) DO NOTHING
          `,
          [String(event_id), String(stream_id), seq, payload]
        );

        if (seq > maxSeq) maxSeq = seq;

        // Emitir a webs (RaceControl/TV/etc.)
        if (ioInstance) {
          ioInstance.emit("raw-pass", payload);
        }
      }

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    return res.json({
      ok: true,
      batch_id: batch_id || null,
      acks: [{ stream_id, seq_upto: maxSeq }],
    });
  } catch (e) {
    console.error("❌ ingest/outbox error:", e);
    return res.status(500).json({ ok: false, error: e.message });
  }
});
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
