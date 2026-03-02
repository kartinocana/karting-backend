// ================================================
// API ROUTER PRINCIPAL
// Unifica y organiza todas las rutas del backend
// con protección ante routers mal exportados
// ================================================

const express = require("express");
const path = require("path");
const router = express.Router();

// Helper: carga un router de forma segura
function attachRoute(mountPath, routeRelPath) {
  const resolved = path.join(__dirname, routeRelPath);

  try {
    const mod = require(resolved);

    // Un router de Express es una función (app o router)
    if (typeof mod === "function") {
      router.use(mountPath, mod);
      console.log(`✅ Ruta registrada: ${mountPath} -> ${routeRelPath}`);
    } else {
      console.error(
        `⚠ Ruta ${mountPath} ignorada: ${routeRelPath} no exporta un router válido (tipo: ${typeof mod})`
      );
    }
  } catch (err) {
    console.error(
      `⚠ Error cargando router para ${mountPath} desde ${routeRelPath}:`,
      err.message
    );
  }
}

// =========================
// Rutas principales
// =========================
attachRoute("/drivers", "./routes/drivers");
attachRoute("/history", "./routes/history");
attachRoute("/karts", "./routes/karts");
attachRoute("/sessions", "./routes/sessions");
attachRoute("/teams", "./routes/teams");
attachRoute("/participants", "./routes/participants");
attachRoute("/penalties", "./routes/penalties");
attachRoute("/race-control", "./routes/raceControl");
attachRoute("/rankings", "./routes/rankings");
// OJO: /results eliminado porque decidiste no usarlo
// attachRoute("/results", "./routes/results");
attachRoute("/timing-input", "./routes/timingInput");
attachRoute("/timing-points", "./routes/timingPoints");
attachRoute("/transponders", "./routes/transponders");

// =========================
// Mantenimiento
// =========================
attachRoute("/maintenance", "./routes/maintenanceAlerts");
attachRoute("/maintenance-alerts", "./routes/maintenanceAlerts");

// =========================
// Estado del sistema
// =========================
router.get("/", (req, res) => {
  res.json({
    status: "API Online ✔",
    version: "1.0.0",
    routes: [
      "/drivers",
      "/history",
      "/karts",
      "/sessions",
      "/teams",
      "/participants",
      "/penalties",
      "/race-control",
      "/rankings",
      // "/results",  // eliminado
      "/timing-input",
      "/timing-points",
      "/transponders",
      "/maintenance",
      "/maintenance-alerts",
    ],
  });
});

// =========================
// Exportar API router
// =========================
module.exports = router;
