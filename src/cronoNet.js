"use strict";
console.log("🚀 CronoNet PASARELA cargado DESDE:", __filename);

const net = require("net");
const tls = require("tls");
const fs = require("fs");
const path = require("path");
const pool = require("../db");

// Socket.IO (inyectado desde server.js)
let io = null;

// ==========================
// CONFIG
// ==========================
const TP_REFRESH_MS = 10_000;
const SOCKET_IDLE_TIMEOUT_MS = 60_000;
const ENABLE_TCP_KEEPALIVE = true;

// Buffer RAW (auditoría)
const MAX_BUFFER_ITEMS = 50_000;
const FLUSH_EVERY_MS = 1_000;
const FLUSH_BATCH_SIZE = 300;

// Estado servidores activos
const activeServers = new Map(); // tpId -> { server, port, protocol, decoder_ip }

// Cola RAW
const rawQueue = [];
let flushing = false;

// ==========================
// HELPERS
// ==========================
function log(msg) {
  console.log(`[CronoNet ${new Date().toISOString()}] ${msg}`);
}

function loadTlsOptionsOrNull() {
  const keyPath = process.env.TLS_KEY_PATH;
  const certPath = process.env.TLS_CERT_PATH;
  if (!keyPath || !certPath) return null;

  try {
    return {
      key: fs.readFileSync(path.resolve(keyPath)),
      cert: fs.readFileSync(path.resolve(certPath)),
    };
  } catch (e) {
    console.error("❌ TLS error:", e.message);
    return null;
  }
}

// Normaliza IP (Node puede dar ::ffff:x.x.x.x)
function normalizeRemoteIp(ip) {
  if (!ip) return "";
  const s = String(ip);
  return s.startsWith("::ffff:") ? s.slice(7) : s;
}

// Normaliza transponder
function normalizeTransponder(raw) {
  return String(raw || "").replace(/\D/g, "").slice(-5);
}

// Parser RAW típico: decoder,transponder,timestamp
function parseRawLine(line) {
  const parts = String(line).trim().split(",");
  if (parts.length < 3) return null;

  const decoder = parts[0] || null;
  const transponder = normalizeTransponder(parts[1]);
  const ts = new Date(parts[2]);

  if (!transponder || isNaN(ts.getTime())) return null;

  return {
    decoder,
    transponder,
    tsMs: ts.getTime(),
    rawLine: String(line).trim(),
  };
}

// ==========================
// RAW BUFFER / DB (AUDITORÍA)
// ==========================
function enqueueRaw({ transponder, decoder, tsMs, timingPointId, rawLine, remote }) {
  const item = {
    transponder,
    decoder,
    ts: new Date(tsMs),
    raw_json: {
      timing_point_id: timingPointId,
      remote,
      rawLine,
      decoder,
    },
  };

  if (rawQueue.length >= MAX_BUFFER_ITEMS) rawQueue.shift();
  rawQueue.push(item);
}

async function flushRawQueue() {
  if (flushing || rawQueue.length === 0) return;
  flushing = true;

  try {
    while (rawQueue.length > 0) {
      const batch = rawQueue.splice(0, FLUSH_BATCH_SIZE);
      const values = [];
      const params = [];
      let p = 1;

      for (const it of batch) {
        values.push(`($${p++}, $${p++}, $${p++}, $${p++})`);
        params.push(it.transponder, it.decoder, it.ts, it.raw_json);
      }

      await pool.query(
        `INSERT INTO timing_log_raw (transponder, decoder, ts, raw_json)
         VALUES ${values.join(",")}`,
        params
      );
    }
  } catch (e) {
    console.error("❌ flushRawQueue error:", e.message);
  } finally {
    flushing = false;
  }
}

// ==========================
// CORE: PASARELA PURA
// ==========================
async function handlePass({
  timingPointId,
  transponder,
  tsMs,
  decoder,
  rawLine,
  remote,
  expectedDecoderIp,
}) {
  // Guardar RAW (auditoría)
  enqueueRaw({ transponder, decoder, tsMs, timingPointId, rawLine, remote });

  // Filtro por IP del decoder configurado
  if (expectedDecoderIp) {
    const remoteIp = normalizeRemoteIp(remote.split(":")[0]);
    const expected = normalizeRemoteIp(expectedDecoderIp);
    if (remoteIp !== expected && remoteIp !== "127.0.0.1") {
      log(`⛔ BLOQUEADO TP${timingPointId} remote=${remoteIp} expected=${expected}`);
      return;
    }
  }

  // 🔁 REENVÍO PURO (SIN LÓGICA DE CARRERA)
  if (io) {
    io.emit("raw-pass", {
      timing_point_id: timingPointId,
      transponder,
      timestamp: tsMs,
      decoder,
      raw: rawLine,
      remote,
    });
  }
}

// ==========================
// TCP / TLS SERVER
// ==========================
function createLineReader(onLine) {
  let buffer = "";
  return async (chunk) => {
    buffer += chunk.toString("utf8");
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      await onLine(s);
    }
  };
}

function startServerForTimingPoint(tp, tlsOptionsOrNull) {
  const tpId = Number(tp.id);
  const port = Number(tp.decoder_port);
  const protocol = String(tp.protocol || "").toUpperCase();
  const expectedDecoderIp = tp.decoder_ip ? String(tp.decoder_ip).trim() : null;
  if (!tpId || !port) return;

  const wantsTLS = protocol.includes("SSL");

  const handler = (socket) => {
    const remote = `${socket.remoteAddress}:${socket.remotePort}`;
    log(`🔌 CONNECT TP${tpId} ${wantsTLS ? "TLS" : "TCP"} from ${remote}`);

    socket.setTimeout(SOCKET_IDLE_TIMEOUT_MS);
    if (ENABLE_TCP_KEEPALIVE && socket.setKeepAlive)
      socket.setKeepAlive(true, 15_000);

    const onData = createLineReader(async (line) => {
      const parsed = parseRawLine(line);
      if (!parsed) return;

      await handlePass({
        timingPointId: tpId,
        transponder: parsed.transponder,
        tsMs: parsed.tsMs,
        decoder: parsed.decoder,
        rawLine: parsed.rawLine,
        remote,
        expectedDecoderIp,
      });
    });

    socket.on("data", (chunk) => {
      onData(chunk).catch((e) => console.error("❌ onData:", e.message));
    });
  };

  const server = wantsTLS
    ? tls.createServer(tlsOptionsOrNull, handler)
    : net.createServer(handler);

  server.listen(port, "0.0.0.0", () => {
    log(`🚀 LISTEN TP${tpId} ${wantsTLS ? "TLS" : "TCP"} port=${port}`);
  });

  activeServers.set(tpId, {
    server,
    port,
    protocol,
    decoder_ip: expectedDecoderIp,
  });
}

async function stopServer(tpId) {
  const rec = activeServers.get(tpId);
  if (!rec) return;
  await new Promise((r) => rec.server.close(r));
  activeServers.delete(tpId);
  log(`🧹 STOP TP${tpId}`);
}

// ==========================
// TIMING POINTS
// ==========================
async function loadTimingPoints() {
  const { rows } = await pool.query(`
    SELECT id, protocol, decoder_ip, decoder_port
    FROM timing_points
    WHERE decoder_port IS NOT NULL
    ORDER BY id
  `);
  return rows;
}

async function reconcileServers(tlsOptionsOrNull) {
  const tps = await loadTimingPoints();
  const desired = new Map();

  for (const tp of tps) {
    desired.set(tp.id, tp);
  }

  for (const [tpId] of activeServers.entries()) {
    if (!desired.has(tpId)) await stopServer(tpId);
  }

  for (const tp of tps) {
    if (!activeServers.has(tp.id)) {
      startServerForTimingPoint(tp, tlsOptionsOrNull);
    }
  }
}

// ==========================
// PUBLIC API
// ==========================
function startCronoNetServer(socketIO) {
  io = socketIO || null;
  const tlsOptionsOrNull = loadTlsOptionsOrNull();

  setInterval(() => flushRawQueue().catch(() => {}), FLUSH_EVERY_MS);

  reconcileServers(tlsOptionsOrNull)
    .then(() => log("✅ CronoNet PASARELA listo"))
    .catch(console.error);

  setInterval(
    () => reconcileServers(tlsOptionsOrNull).catch(console.error),
    TP_REFRESH_MS
  );
}

module.exports = {
  startCronoNetServer,
};





