// backend/src/services/maintenanceEngine.js
const pool = require("../../db");

/**
 * Motor AUTOMÁTICO de mantenimiento.
 * - hours: ciclos garantizados (50→100→150…) usando maintenance_rule_state
 * - days/laps: sigue como estaba (umbral) pero evita duplicados OPEN
 */
async function runMaintenanceEngine() {
  console.log("🔧 Ejecutando motor de mantenimiento automático...");

  const { rows: karts } = await pool.query(`
    SELECT id, number, hours_used, last_service
    FROM karts
  `);

  const { rows: rules } = await pool.query(`
    SELECT id, rule_type, rule_value, description, active
    FROM maintenance_rules
    WHERE COALESCE(active, true) = true
  `);

  for (const kart of karts) {
    const hoursUsed = Number(kart.hours_used || 0);

    for (const rule of rules) {
      let triggered = false;
      let dueHours = null;

      // ======================
      // HOURS (CICLOS)
      // ======================
      if (rule.rule_type === "hours") {
        const interval = Number(rule.rule_value || 0);
        if (interval > 0) {
          // Obtener checkpoint (si no existe, lo creamos a 0)
          const stateQ = await pool.query(
            `
            INSERT INTO maintenance_rule_state (kart_id, rule_id, last_done_hours, last_done_at)
            VALUES ($1, $2, 0, NULL)
            ON CONFLICT (kart_id, rule_id) DO UPDATE SET kart_id = EXCLUDED.kart_id
            RETURNING last_done_hours
            `,
            [kart.id, rule.id]
          );

          const lastDone = Number(stateQ.rows[0]?.last_done_hours || 0);

          // Cuántas horas han pasado desde el último "done" de esa regla
          const delta = hoursUsed - lastDone;

          if (delta >= interval) {
            triggered = true;

            // Hora exacta donde tocaba (múltiplos)
            const steps = Math.floor(delta / interval);
            dueHours = lastDone + (steps * interval); // 50,100,150...
          }
        }
      }

      // ======================
      // DAYS (UMBRAL)
      // ======================
      if (rule.rule_type === "days") {
        if (kart.last_service) {
          const last = new Date(kart.last_service);
          const now = new Date();
          const diffDays = Math.floor((now - last) / (1000 * 60 * 60 * 24));
          if (diffDays >= Number(rule.rule_value || 0)) triggered = true;
        }
      }

      // ======================
      // LAPS (UMBRAL)
      // ======================
      if (rule.rule_type === "laps") {
        const lapsCount = await pool.query(
          `SELECT COUNT(*) FROM laps l
           JOIN session_participants sp ON sp.id = l.participant_id
           WHERE sp.kart_id = $1`,
          [kart.id]
        );
        if (Number(lapsCount.rows[0].count) >= Number(rule.rule_value || 0)) triggered = true;
      }

      if (!triggered) continue;

      console.log(`⚠️ REGLA DISPARADA → Kart ${kart.number}: ${rule.description}`);

      // Evitar duplicar: si hay tarea OPEN para ese kart+rule, no creamos otra
      const existing = await pool.query(
        `
        SELECT id FROM maintenance_tasks
        WHERE kart_id = $1 AND rule_id = $2 AND status = 'open'
        `,
        [kart.id, rule.id]
      );
      if (existing.rows.length > 0) continue;

      // Crear tarea (guardando due_hours si es hours)
      await pool.query(
        `
        INSERT INTO maintenance_tasks
          (kart_id, rule_id, status, created_at, due_hours)
        VALUES ($1, $2, 'open', NOW(), $3)
        `,
        [kart.id, rule.id, dueHours]
      );

      // Registrar alerta
      await pool.query(
        `
        INSERT INTO maintenance_alerts (kart_id, rule_id, created_at, message)
        VALUES ($1, $2, NOW(), $3)
        `,
        [kart.id, rule.id, `Regla activada: ${rule.description}`]
      );
    }
  }

  console.log("✅ Motor automático completado");
}

module.exports = { runMaintenanceEngine };
