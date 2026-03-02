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
  cors: {
    origin: "*", // ajusta luego si quieres
  },
});

// ✅ Entregar IO a Express para que /api/led pueda emitir eventos
if (typeof app.setSocketIO === "function") {
  app.setSocketIO(io);
} else {
  log("⚠️ app.setSocketIO no existe. Revisa backend/src/index.js");
}

io.on("connection", (socket) => {
  log(`🟢 Socket conectado ${socket.id}`);

  socket.on("disconnect", () => {
    log(`🔴 Socket desconectado ${socket.id}`);
  });
});

// -------------------------------------------
// INICIAR CRONONET TCP (PASANDO IO)
// -------------------------------------------
const RUN_MODE = (process.env.RUN_MODE || "local").toLowerCase();

if (RUN_MODE === "local") {
  const { startCronoNetServer } = require("./src/cronoNet");
  startCronoNetServer(io);
  log("🟢 RUN_MODE=local → CronoNet ACTIVADO");
} else {
  log("🌍 RUN_MODE=cloud → CronoNet DESACTIVADO");
}

// -------------------------------------------
// INICIAR SERVIDOR HTTP
// -------------------------------------------
const PORT = process.env.PORT || 4000;

server.listen(PORT, "0.0.0.0", () => {
  log(`🚀 Backend running on port ${PORT} (IPv4 forced)`);
});


