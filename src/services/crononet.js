
const net = require('net');
const axios = require('axios');

const CRONONET_IP = process.env.CRONONET_IP;
const CRONONET_PORT = process.env.CRONONET_PORT;
const CRONONET_USER = process.env.CRONONET_USER;
const CRONONET_PASS = process.env.CRONONET_PASS;

const API_PORT = process.env.PORT || 4000;
const API_URL = `http://localhost:${API_PORT}/api/timing/lap`;

// Buffer para datos que pueden llegar troceados
let partialBuffer = '';

function startCronoNetConnection() {
  if (!CRONONET_IP || !CRONONET_PORT) {
    console.log('⚠ CronoNet no configurado (CRONONET_IP/PORT). No se inicia la conexión TCP.');
    return;
  }

  function connect() {
    console.log(`⏳ Conectando a CronoNet ${CRONONET_IP}:${CRONONET_PORT}...`);

    const client = new net.Socket();

    client.connect(Number(CRONONET_PORT), CRONONET_IP, () => {
      console.log(`🔌 Conectado a CronoNet en ${CRONONET_IP}:${CRONONET_PORT}`);
      if (CRONONET_USER && CRONONET_PASS) {
        const auth = `USER=${CRONONET_USER};PASS=${CRONONET_PASS}
`;
        client.write(auth);
        console.log('🔐 Autenticación enviada a CronoNet');
      }
    });

    client.on('data', buffer => {
      const text = buffer.toString();
      partialBuffer += text;

      let index;
      while ((index = partialBuffer.indexOf('\n')) >= 0) {
        const line = partialBuffer.slice(0, index).trim();
        partialBuffer = partialBuffer.slice(index + 1);
        if (line.length > 0) {
          handleLine(line);
        }
      }
    });

    client.on('close', () => {
      console.log('⚠ Conexión TCP con CronoNet cerrada. Reintentando en 3s...');
      setTimeout(connect, 3000);
    });

    client.on('error', err => {
      console.log('❌ Error en conexión CronoNet:', err.message);
    });
  }

  connect();
}

function handleLine(line) {
  console.log('📥 Línea recibida CronoNet:', line);

  // Ejemplo de formato esperado:
  // TRANS=ABC123;TIME=2025-01-15T14:33:02.452
  const match = line.match(/TRANS=([^;]+);TIME=([\d\-T:.]+)/);
  if (!match) {
    console.log('⚠ Formato de línea no reconocido:', line);
    return;
  }

  const transponderCode = match[1];
  const timestamp = match[2];

  console.log(`➡ Registrando vuelta: ${transponderCode} @ ${timestamp}`);

  axios.post(API_URL, { transponderCode, timestamp })
    .then(res => {
      console.log('✔ Vuelta registrada OK');
    })
    .catch(err => {
      if (err.response) {
        console.log('❌ Error API /timing/lap:', err.response.data);
      } else {
        console.log('❌ Error enviando a API /timing/lap:', err.message);
      }
    });
}

module.exports = { startCronoNetConnection };
