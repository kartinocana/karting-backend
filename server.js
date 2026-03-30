require("dotenv").config();

// -------------------------------------------
// LOGGING
// -------------------------------------------
const fs = require("fs");
const logFile = fs.createWriteStream("backend.log", { flags: "a" });

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  console.log(line);
  logFile.write(line);
}

// -------------------------------------------
// EXPRESS APP
// -------------------------------------------
const app = require("./src/index");

// -------------------------------------------
// HTTP + SOCKET.IO
// -------------------------------------------
const http = require("http");
const { Server } = require("socket.io");

const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" },
});

// Permitir a Express emitir eventos
if (typeof app.setSocketIO === "function") {
  app.setSocketIO(io);
}

// -------------------------------------------
// SOCKET.IO
// -------------------------------------------
io.on("connection", (socket) => {
  const authKey = socket.handshake?.auth?.key;
  const authRole = socket.handshake?.auth?.role;

  const isUplink =
    authRole === "crononet" &&
    authKey &&
    process.env.CLOUD_INGEST_KEY &&
    authKey === process.env.CLOUD_INGEST_KEY;

  if (isUplink) {
    log(`☁️ UPLINK autorizado ${socket.id}`);

    socket.on("raw-pass", (data) => {
      io.emit("raw-pass", data);
    });
  } else {
    log(`🟢 Cliente conectado ${socket.id}`);
  }

  socket.on("disconnect", () => {
    log(`🔴 Socket desconectado ${socket.id}`);
  });
});

// -------------------------------------------
// INICIAR CRONONET TCP
// -------------------------------------------
const RUN_MODE = (process.env.RUN_MODE || "local").toLowerCase();

if (RUN_MODE === "local") {
  const { startCronoNetServer } = require("./src/cronoNet");
  startCronoNetServer(io);
  log("RUN_MODE=local -> CronoNet ACTIVADO");
} else {
  log("RUN_MODE=cloud -> CronoNet DESACTIVADO");
}

// -------------------------------------------
// SYNC WEB -> LOCAL
// Solo tiene sentido en el nodo local/seguidor
// -------------------------------------------
if (
  RUN_MODE === "local" &&
  (process.env.SYNC_FROM_WEB || "false").toLowerCase() === "true"
) {
  const { syncSessionsAndLaps } = require("./src/services/webMirrorSync");

  // Primera sync poco después del arranque
  setTimeout(async () => {
    try {
      await syncSessionsAndLaps();
    } catch (e) {
      log(`❌ Initial WEB -> LOCAL sync error: ${e.message}`);
    }
  }, 3000);

  // Sync periódica
  setInterval(async () => {
    try {
      await syncSessionsAndLaps();
    } catch (e) {
      log(`❌ Periodic WEB -> LOCAL sync error: ${e.message}`);
    }
  }, 5000);

  log("SYNC_FROM_WEB=true -> Sync WEB -> LOCAL ACTIVADA");
} else {
  log("SYNC_FROM_WEB desactivada o no aplicable");
}

// -------------------------------------------
// HTTP SERVER
const PORT = process.env.PORT || 4000;

server.listen(PORT, "0.0.0.0", () => {
  log(`🚀 Backend running on port ${PORT}`);
});