const net = require("net");

const RUN_MODE = (process.env.RUN_MODE || "local").toLowerCase();
if (RUN_MODE !== "local") {
  console.log("🌍 RUN_MODE=cloud → crononetListener NO se inicia");
  module.exports = {};
  return;
}
const processPacket = require("./processPacket");

let activeListeners = {};

function startDecoderListener(tp) {
  const key = `${tp.id}-${tp.decoder_port}`;

  // evitar duplicados
  if (activeListeners[key]) {
    console.log(`⏩ Listener ya activo para ${tp.name}`);
    return;
  }

  const server = net.createServer(socket => {
    console.log(`📨 Conexión entrante desde decoder ${tp.name}`);

    socket.on("data", data => {
      const raw = data.toString().trim();
      console.log(`📡 RAW ${tp.name}:`, raw);

      processPacket(tp, raw);
    });

    socket.on("error", err => {
      console.error(`❌ Error socket en ${tp.name}:`, err);
    });

    socket.on("close", () => {
      console.log(`🔌 Decoder ${tp.name} desconectado`);
    });
  });

  server.listen(tp.decoder_port, "0.0.0.0", () => {
    console.log(`🟢 Listener activo: ${tp.name} → puerto ${tp.decoder_port}`);
  });

  server.on("error", err => {
    console.error(`❌ Error listener ${tp.name}:`, err);
  });

  activeListeners[key] = server;
}

async function loadAllListeners(pool) {
  console.log("📡 Cargando decoders...");

  const result = await pool.query("SELECT * FROM timing_points ORDER BY id ASC");

  for (const tp of result.rows) {
    startDecoderListener(tp);
  }

  console.log("🟢 Todos los listeners inicializados.");
}

module.exports = { startDecoderListener, loadAllListeners };
