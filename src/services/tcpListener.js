const net = require("net");
const pool = require("../lib/db");

let activeListeners = {};

function startDecoderListener(point) {
  const key = `${point.decoder_ip}:${point.decoder_port}`;

  // Si ya está escuchando, ignorar
  if (activeListeners[key]) {
    console.log(`🔵 Listener ya activo para ${key}`);
    return;
  }

  console.log(`📡 Iniciando listener TCP para ${point.name} (${key})`);

  const server = net.createServer(socket => {
    console.log(`🟢 Conexión entrante desde decoder ${key}`);

    socket.on("data", async data => {
      const raw = data.toString().trim();
      console.log(`📥 Paquete recibido (${point.name}):`, raw);

      // Ejemplo de formato: "CAR:12345;TIME:12345678"
      // Adáptalo según tu decoder real
      const parsed = parseDecoderData(raw);

      if (parsed) {
        await pool.query(
          `
          INSERT INTO timing_log_raw (transponder, timestamp, timing_point)
          VALUES ($1, $2, $3)
          `,
          [parsed.transponder, parsed.timestamp, point.id]
        );

        console.log(`✅ Guardado paso de transponder ${parsed.transponder}`);
      }
    });

    socket.on("error", err => {
      console.error(`❌ Error en conexión TCP (${point.name}):`, err);
    });

    socket.on("close", () => {
      console.log(`🔴 Cliente desconectado de ${point.name}`);
    });
  });

  server.listen(point.decoder_port, point.decoder_ip, () => {
    console.log(`🟢 Listener activo en ${key}`);
  });

  server.on("error", err => {
    console.error(`❌ Error listener ${key}:`, err);
  });

  activeListeners[key] = server;
}

function parseDecoderData(raw) {
  try {
    // Ejemplo de formato CronoNet
    // CAR:231123;LAP:34500

    const parts = raw.split(";");
    const transp = parts[0].replace("CAR:", "");
    const ms = Number(parts[1].replace("LAP:", ""));

    if (!transp || isNaN(ms)) return null;

    return {
      transponder: transp,
      timestamp: new Date().toISOString()
    };
  } catch (e) {
    console.error("❌ Error parseando paquete:", raw);
    return null;
  }
}

module.exports = { startDecoderListener };
