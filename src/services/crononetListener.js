const net = require("net");
const processPacket = require("./processPacket");

const RUN_MODE = (process.env.RUN_MODE || "cloud").toLowerCase();

if (RUN_MODE !== "local") {
  console.log("🌍 RUN_MODE=cloud → crononetListener desactivado");
  module.exports = {};
  return;
}

let activeListeners = {};

function startDecoderListener(tp) {
  if (RUN_MODE !== "local") {
    console.log("🌍 RUN_MODE=cloud → crononetListener NO se inicia");
    return;
  }

  const key = `${tp.id}-${tp.decoder_port}`;

  // evitar duplicados
  if (activeListeners[key]) {
    console.log(`⏩ Listener ya activo para ${tp.name}`);
    return;
  }

  const server = net.createServer((socket) => {
    console.log(`📨 Conexión entrante desde decoder ${tp.name}`);

    socket.on("data", (data) => {
      const raw = data.toString().trim();
      console.log(`📡 RAW ${tp.name}:`, raw);
      processPacket(tp, raw);
    });

    socket.on("error", (err) => {
      console.error(`❌ Error socket en ${tp.name}:`, err);
    });

    socket.on("close", () => {
      console.log(`🔌 Decoder ${tp.name} desconectado`);
    });
  });

  server.on("error", (err) => {
    // clave: no reventar si el puerto está pillado
    if (err && err.code === "EADDRINUSE") {
      console.error(`⚠️ Puerto en uso ${tp.decoder_port} (${tp.name}) → se omite listener`);
      return;
    }
    console.error(`❌ Error listener ${tp.name}:`, err);
  });

  server.listen(tp.decoder_port, "0.0.0.0", () => {
    console.log(`🟢 Listener activo: ${tp.name} → puerto ${tp.decoder_port}`);
    activeListeners[key] = server;
  });
}

async function loadAllListeners(pool) {
  if (RUN_MODE !== "local") {
    console.log("🌍 RUN_MODE=cloud → crononetListener NO se inicia");
    return;
  }

  console.log("📡 Cargando decoders...");
  const result = await pool.query("SELECT * FROM timing_points ORDER BY id ASC");

  for (const tp of result.rows) startDecoderListener(tp);

  console.log("🟢 Todos los listeners inicializados.");
}

module.exports = { startDecoderListener, loadAllListeners };