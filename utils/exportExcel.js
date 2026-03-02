const ExcelJS = require("exceljs");

async function exportLapsToExcel(laps, res) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Vueltas");

  sheet.columns = [
    { header: "Lap", key: "lap_number", width: 10 },
    { header: "Tiempo (ms)", key: "lap_time_ms", width: 15 },
    { header: "S1", key: "sector1_ms", width: 10 },
    { header: "S2", key: "sector2_ms", width: 10 },
    { header: "S3", key: "sector3_ms", width: 10 },
  ];

  laps.forEach(l => sheet.addRow(l));

  await wb.xlsx.write(res);
}

module.exports = { exportLapsToExcel };
