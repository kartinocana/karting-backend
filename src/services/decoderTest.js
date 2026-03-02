// src/services/decoderTest.js
const net = require("net");
const axios = require("axios");

/**
 * Testea conexión con CronoNet / decoder según protocolo
 * Devuelve { ok: boolean, message: string }
 */
async function testDecoderConnection({
  ip,
  port,
  protocol = "HTTP_POST",
  username,
  password,
}) {
  protocol = protocol || "HTTP_POST";

  // Normalizamos nombres
  if (protocol === "POST(http)") protocol = "HTTP_POST";
  if (protocol === "POST_SSL(https)" || protocol === "POST SSL(https)") {
    protocol = "HTTPS_POST";
  }

  // ==== HTTP / HTTPS POST ====
  if (protocol === "HTTP_POST" || protocol === "HTTPS_POST") {
    const scheme = protocol === "HTTPS_POST" ? "https" : "http";
    const url = `${scheme}://${ip}:${port}/`;

    try {
      const config = {
        timeout: 2000,
      };
      if (username && password) {
        config.auth = { username, password };
      }
      await axios.get(url, config); // solo vemos si responde algo
      return { ok: true, message: `HTTP OK contra ${url}` };
    } catch (err) {
      return {
        ok: false,
        message: `Error HTTP contra ${ip}:${port} -> ${err.message}`,
      };
    }
  }

  // ==== TCP / TCP_SSL / UDP: sólo probamos apertura de puerto TCP ====
  if (protocol === "TCP" || protocol === "TCP_SSL" || protocol === "UDP") {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let finished = false;

      const done = (ok, msg) => {
        if (finished) return;
        finished = true;
        socket.destroy();
        resolve({ ok, message: msg });
      };

      socket.setTimeout(2000);

      socket.on("connect", () => {
        done(true, `Conexión TCP OK a ${ip}:${port}`);
      });

      socket.on("timeout", () => {
        done(false, `Timeout conectando a ${ip}:${port}`);
      });

      socket.on("error", (err) => {
        done(false, `Error conectando a ${ip}:${port} -> ${err.message}`);
      });

      socket.connect(port, ip);
    });
  }

  return { ok: false, message: `Protocolo no soportado: ${protocol}` };
}

module.exports = { testDecoderConnection };
