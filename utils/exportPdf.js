const PDFDocument = require("pdfkit");

function exportLapsToPDF(laps, res) {
  const doc = new PDFDocument();
  doc.pipe(res);

  doc.fontSize(20).text("Reporte de Vueltas", { align: "center" });
  doc.moveDown();

  laps.forEach(l => {
    doc.fontSize(12).text(
      `Vuelta ${l.lap_number} — ${l.lap_time_ms} ms `
    );
  });

  doc.end();
}

module.exports = { exportLapsToPDF };
