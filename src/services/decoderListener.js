// Decoder listeners desactivados en este bundle.
// CronoNet envía los pasos por HTTP POST a /api/timing-input/crononet,
// así evitamos problemas de puertos TCP en el servidor Node.

async function startDecoderListeners() {
  console.log("📡 Listeners TCP desactivados (modo HTTP POST CronoNet).");
}

module.exports = { startDecoderListeners };
