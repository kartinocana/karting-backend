const express = require("express");
require("dotenv").config();
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const pool = require("../db");
const { runMaintenanceEngine } = require("./services/maintenanceEngine");

const app = express();

// =======================
// SOCKET.IO INSTANCE
// =======================
let ioInstance = null;

app.setSocketIO = (io) => {
  ioInstance = io;
};

// =======================
// LIVE STATE EN MEMORIA
// =======================
const liveState = {
  session: null,
  participants: [],
  byParticipantId: {},
  byTransponder: {},
  lastPassAtByPid: {},
  lastRawPassAtByTransponder: {},
  classification: [],
  bestLapTime: null,
  updatedAt: null,
};

const PASS_DEBOUNCE_MS = Number(process.env.PASS_DEBOUNCE_MS || 2000);
const MIN_LAP_MS = Number(process.env.MIN_LAP_MS || 0);

// =======================
// HELPERS LIVE
// =======================
function normalizeTransponder(value) {
  return String(value || "").trim();
}

function formatSafeNumber(n, fallback = null) {
  const x = Number(n);
  return Number.isFinite(x) ? x : fallback;
}

function cloneParticipantBase(p = {}) {
  return {
    id: p.id,
    driver_id: p.driver_id ?? null,
    kart_id: p.kart_id ?? null,
    driver_name: p.driver_name ?? p.name ?? "",
    kart_number: p.kart_number ?? null,
    kart_name: p.kart_name ?? "",
    racerNumber: p.racerNumber ?? p.kart_number ?? p.driver_number ?? null,
    transponder: normalizeTransponder(p.transponder),
    weight: p.weight ?? null,
    category: p.category ?? null,
    nickname: p.nickname ?? "-",

    lapTimes: [],
    laps: 0,
    lastLapMs: null,
    bestLapMs: null,
    totalMs: 0,
  };
}

function getLiveParticipants() {
  return Object.values(liveState.byParticipantId);
}

function getGlobalBestLap() {
  let best = null;
  for (const p of getLiveParticipants()) {
    const t = Number(p.bestLapMs);
    if (!Number.isFinite(t) || t <= 0) continue;
    if (best == null || t < best) best = t;
  }
  return best;
}

function buildClassification() {
  const sorted = [...getLiveParticipants()].sort((a, b) => {
    const lapsA = Number(a.laps || 0);
    const lapsB = Number(b.laps || 0);

    if (lapsB !== lapsA) return lapsB - lapsA;

    const totalA = Number.isFinite(a.totalMs) ? a.totalMs : Number.MAX_SAFE_INTEGER;
    const totalB = Number.isFinite(b.totalMs) ? b.totalMs : Number.MAX_SAFE_INTEGER;
    return totalA - totalB;
  });

  const leader = sorted[0] || null;
  const leaderLaps = leader?.laps || 0;
  const leaderTime = leader?.totalMs || 0;

  return sorted.map((p, i) => {
    let gap = "-";
    if (i > 0) {
      if ((p.laps || 0) === leaderLaps) {
        gap = (p.totalMs || 0) - leaderTime;
      } else {
        gap = `+${leaderLaps - (p.laps || 0)} LAP`;
      }
    }

    let diff = "-";
    if (i > 0) {
      const prev = sorted[i - 1];
      if ((p.laps || 0) === (prev.laps || 0)) {
        diff = (p.totalMs || 0) - (prev.totalMs || 0);
      } else {
        diff = `+${(prev.laps || 0) - (p.laps || 0)} LAP`;
      }
    }

    return {
      participant_id: p.id,
      pos: i + 1,
      racerName: p.driver_name || p.kart_name || "-",
      racerNumber: p.racerNumber ?? p.kart_number ?? "-",
      racerTransponder: p.transponder || "-",
      nickname: p.nickname ?? "-",
      category: p.category ?? "-",
      weight: p.weight ?? null,
      lapcount: p.laps || 0,
      lastTime: p.lastLapMs ?? null,
      best: p.bestLapMs ?? null,
      time: p.totalMs ?? null,
      gap,
      diff,
      laps_ms: p.lapTimes || [],
    };
  });
}

function refreshLiveStateDerived() {
  liveState.bestLapTime = getGlobalBestLap();
  liveState.classification = buildClassification();
  liveState.updatedAt = Date.now();
}

function emitLiveUpdate() {
  refreshLiveStateDerived();

  const payload = {
    session: liveState.session,
    updatedAt: liveState.updatedAt,
    bestLapTime: liveState.bestLapTime,
    classification: liveState.classification,
    participants: getLiveParticipants(),
  };

  if (ioInstance) {
    ioInstance.emit("live-update", payload);
  }
}

function resetLiveState() {
  liveState.session = null;
  liveState.participants = [];
  liveState.byParticipantId = {};
  liveState.byTransponder = {};
  liveState.lastPassAtByPid = {};
  liveState.lastRawPassAtByTransponder = {};
  liveState.classification = [];
  liveState.bestLapTime = null;
  liveState.updatedAt = Date.now();
}

function bootstrapLiveState({ session, participants }) {
  resetLiveState();

  liveState.session = session || null;
  liveState.participants = Array.isArray(participants) ? participants : [];

  for (const raw of liveState.participants) {
    const p = cloneParticipantBase(raw);
    if (p.id == null) continue;

    liveState.byParticipantId[p.id] = p;

    if (p.transponder) {
      liveState.byTransponder[p.transponder] = p.id;
    }
  }

  emitLiveUpdate();
}

function processRawPass({ transponder, timestamp }) {
  const trx = normalizeTransponder(transponder);
  const ts = formatSafeNumber(timestamp, Date.now());

  if (!trx) {
    return { ok: false, reason: "missing_transponder" };
  }

  // Anti-rebote por transponder
  const lastRaw = liveState.lastRawPassAtByTransponder[trx];
  if (Number.isFinite(lastRaw) && ts - lastRaw < PASS_DEBOUNCE_MS) {
    return {
      ok: false,
      reason: "duplicate_raw_pass",
      transponder: trx,
      timestamp: ts,
      deltaMs: ts - lastRaw,
    };
  }

  liveState.lastRawPassAtByTransponder[trx] = ts;

  const pid = liveState.byTransponder[trx];
  if (!pid) {
    return {
      ok: false,
      reason: "unknown_transponder",
      transponder: trx,
      timestamp: ts,
    };
  }

  const p = liveState.byParticipantId[pid];
  if (!p) {
    return {
      ok: false,
      reason: "participant_not_found",
      participant_id: pid,
      transponder: trx,
      timestamp: ts,
    };
  }

  const prev = liveState.lastPassAtByPid[pid];

  // Primer paso: solo referencia
  if (!Number.isFinite(prev)) {
    liveState.lastPassAtByPid[pid] = ts;

    p.lapTimes.push({ ms: 0, valid: false });

    emitLiveUpdate();

    return {
      ok: true,
      kind: "reference_pass",
      participant_id: pid,
      transponder: trx,
      timestamp: ts,
    };
  }

  const lapMs = ts - prev;
  liveState.lastPassAtByPid[pid] = ts;

  const isValid = !MIN_LAP_MS || lapMs >= MIN_LAP_MS;

  p.lapTimes.push({ ms: lapMs, valid: isValid });

  if (isValid) {
    p.laps = (p.laps || 0) + 1;
    p.lastLapMs = lapMs;
    p.bestLapMs = p.bestLapMs ? Math.min(p.bestLapMs, lapMs) : lapMs;
    p.totalMs = (p.totalMs || 0) + lapMs;
  }

  emitLiveUpdate();

  return {
    ok: true,
    kind: "lap",
    participant_id: pid,
    transponder: trx,
    timestamp: ts,
    lapMs,
    valid: isValid,
  };
}

// =======================
// LED STATE
// =======================
let lastLedPro = null;
let lastLedAt = null;

// =======================
// MIDDLEWARES
// =======================
app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

app.options("*", cors());
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
app.use("/api/laps", require("./routes/laps"));
app.use("/api/maintenance", require("./routes/maintenance"));
app.use("/api/maintenance/alerts", require("./routes/maintenanceAlerts"));
app.use("/api/timing-points", require("./routes/timingPoints"));
// app.use("/api/timing-input", require("./routes/timingInput"));
app.use("/api/maintenance/rules", require("./routes/maintenanceRules"));
app.use("/api/maintenance/jobs", require("./routes/maintenanceJobs"));
app.use("/api/forms", require("./routes/forms"));
app.use("/api/driver-levels", require("./routes/driver-levels"));
app.use("/api/email", require("./routes/sessionReport"));


// =======================
// CAMPEONATOS
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
// ☁️ INGEST OUTBOX (CronoNet -> Cloud) [PRO]
// =======================
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
// MAINTENANCE
// =======================
app.get("/api/maintenance/run-engine", async (req, res) => {
  try {
    await runMaintenanceEngine();
    res.json({ status: "engine_completed" });
  } catch (e) {
    console.error("❌ MaintenanceEngine manual run failed:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

setInterval(async () => {
  try {
    await runMaintenanceEngine();
  } catch (e) {
    console.error("❌ MaintenanceEngine failed:", e);
  }
}, 5 * 60 * 1000);

// =======================
// LED CONTROL API
// =======================
app.post("/api/led", (req, res) => {
  const { pro } = req.body || {};

  if (pro == null) {
    return res.status(400).json({ ok: false, error: "Missing pro" });
  }

  const proNum = Number(pro);

  if (!Number.isFinite(proNum)) {
    return res.status(400).json({ ok: false, error: "Invalid pro" });
  }

  lastLedPro = proNum;
  lastLedAt = Date.now();

  if (ioInstance) {
    ioInstance.emit("led-pro", { pro: lastLedPro, at: lastLedAt });
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
// HEALTH DB
// =======================
app.get("/api/health/db", async (req, res) => {
  try {
    const r = await pool.query("SELECT NOW() as now");
    return res.json({ ok: true, now: r.rows[0].now });
  } catch (e) {
    return res.status(500).json({
      ok: false,
      message: e.message,
      code: e.code,
    });
  }
});

// =======================
// LIVE BOOTSTRAP
// =======================
app.post("/api/live/bootstrap", (req, res) => {
  try {
    const session = req.body?.session || null;
    const participants = Array.isArray(req.body?.participants) ? req.body.participants : [];

    bootstrapLiveState({ session, participants });

    return res.json({
      ok: true,
      session: liveState.session,
      participants: getLiveParticipants().length,
      updatedAt: liveState.updatedAt,
    });
  } catch (e) {
    console.error("❌ Error en /api/live/bootstrap:", e);
    return res.status(500).json({ ok: false, error: "bootstrap_failed" });
  }
});

app.get("/api/live/state", (req, res) => {
  return res.json({
    ok: true,
    session: liveState.session,
    updatedAt: liveState.updatedAt,
    bestLapTime: liveState.bestLapTime,
    classification: liveState.classification,
    participants: getLiveParticipants(),
    meta: {
      transponders: Object.keys(liveState.byTransponder).length,
      debounceMs: PASS_DEBOUNCE_MS,
      minLapMs: MIN_LAP_MS,
    },
  });
});

// =======================
// CRONONET DIRECT PASS
// =======================
app.post("/api/crononet/pass", (req, res) => {
  try {
    const body = req.body || {};
    const transponder = normalizeTransponder(body.transponder);
    const timestamp = formatSafeNumber(body.timestamp, Date.now());

    if (!transponder) {
      return res.status(400).json({ ok: false, error: "missing_transponder" });
    }

    const rawPayload = { transponder, timestamp };

    if (ioInstance) {
      ioInstance.emit("raw-pass", rawPayload);
    }

    const result = processRawPass(rawPayload);

    return res.json({
      ok: true,
      raw: rawPayload,
      result,
      bestLapTime: liveState.bestLapTime,
      classificationSize: liveState.classification.length,
    });
  } catch (e) {
    console.error("❌ Error en /api/crononet/pass:", e);
    return res.status(500).json({ ok: false, error: "fail" });
  }
});

// =======================
// ESTÁTICOS
// =======================
app.use(express.static("public"));
app.use(express.static(path.join(__dirname, "../public")));

app.use(
  "/pits_admin_app",
  express.static(path.join(__dirname, "../public/pits_admin_app"))
);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/racecontrol.html"));
});

module.exports = app;
