const express = require("express");
const router = express.Router();
const pool = require("../../db");

// =====================================================
// GET /api/maintenance/karts/overview
// (PÚBLICO – dashboard)
// =====================================================
router.get("/karts/overview", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        number,
        maintenance_status,
        hours_used,
        service_interval,
        next_service_at,
        alert_margin,
        last_service,
        notes,
        transponder
      FROM karts
      ORDER BY number ASC
    `);

    res.json(rows);
  } catch (err) {
    console.error("❌ GET /maintenance/karts/overview:", err);
    res.status(500).json({ error: "Overview error" });
  }
});

// =====================================================
// POST /api/maintenance/karts/:id/add-hours
// (PÚBLICO – sumar horas y recalcular estado)
// body: { hours }  (puede ser decimal)
// =====================================================
router.post("/karts/:id/add-hours", async (req, res) => {
  try {
    const kartId = Number(req.params.id);
    const hours = Number(req.body.hours);

    if (!Number.isFinite(kartId) || kartId <= 0) {
      return res.status(400).json({ error: "kart_id inválido" });
    }
    if (!Number.isFinite(hours) || hours <= 0) {
      return res.status(400).json({ error: "hours debe ser > 0" });
    }

    const { rows } = await pool.query(
      `
      UPDATE karts
      SET
        hours_used = COALESCE(hours_used, 0) + $1,
        maintenance_status = CASE
          WHEN next_service_at IS NULL OR service_interval IS NULL THEN 'ok'
          WHEN (next_service_at - (COALESCE(hours_used, 0) + $1)) <= 0 THEN 'overdue'
          WHEN (next_service_at - (COALESCE(hours_used, 0) + $1)) <= COALESCE(alert_margin, 0) THEN 'warn'
          ELSE 'ok'
        END
      WHERE id = $2
      RETURNING id, number, hours_used, next_service_at, service_interval, alert_margin, maintenance_status
      `,
      [hours, kartId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Kart no encontrado" });
    }

    res.json({ status: "hours_added", kart: rows[0] });
  } catch (err) {
    console.error("❌ POST /maintenance/karts/:id/add-hours:", err);
    res.status(500).json({ error: "Add hours error" });
  }
});

// =====================================================
// GET /api/maintenance/tasks
// (PÚBLICO)
// =====================================================
router.get("/tasks", async (req, res) => {
  try {
    const status = req.query.status || "open";

    let q = `
      SELECT mt.*, k.number AS kart_number
      FROM maintenance_tasks mt
      LEFT JOIN karts k ON k.id = mt.kart_id
    `;

    const params = [];

    if (status !== "all") {
      q += ` WHERE mt.status = $1`;
      params.push(status);
    }

    q += ` ORDER BY mt.created_at DESC`;

    const { rows } = await pool.query(q, params);
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /maintenance/tasks:", err);
    res.status(500).json({ error: "Tasks list error" });
  }
});

// =====================================================
// POST /api/maintenance/tasks
// (PÚBLICO)
// =====================================================
router.post("/tasks", async (req, res) => {
  try {
    const { kart_id, rule_id } = req.body;

    if (!kart_id) {
      return res.status(400).json({ error: "kart_id es obligatorio" });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO maintenance_tasks (kart_id, rule_id, status, created_at)
      VALUES ($1, $2, 'open', NOW())
      RETURNING *
      `,
      [kart_id, rule_id || null]
    );

    res.json({ status: "created", task: rows[0] });
  } catch (err) {
    console.error("❌ POST /maintenance/tasks:", err);
    res.status(500).json({ error: "Create error" });
  }
});

// =====================================================
// PUT /api/maintenance/tasks/:id/complete
// (PÚBLICO)
// =====================================================
router.put("/tasks/:id/complete", async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await client.query("BEGIN");

    const tQ = await client.query(
      `
      SELECT t.*, r.rule_type, r.rule_value
      FROM maintenance_tasks t
      LEFT JOIN maintenance_rules r ON r.id = t.rule_id
      WHERE t.id = $1
      FOR UPDATE
      `,
      [id]
    );

    if (!tQ.rows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "Tarea no encontrada" });
    }

    const t = tQ.rows[0];

    const doneQ = await client.query(
      `
      UPDATE maintenance_tasks
      SET status = 'done',
          completed_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [id]
    );

    // ✅ Si la regla es por horas, actualizar checkpoint
    if (t.rule_id && t.rule_type === "hours") {
      const interval = Number(t.rule_value || 0);
      if (interval > 0) {
        // Preferimos la due_hours (hora exacta del ciclo), si existe.
        // Si no existe, usamos hours_used actual del kart.
        let newLastDone = t.due_hours != null ? Number(t.due_hours) : null;

        if (!Number.isFinite(newLastDone)) {
          const kQ = await client.query(`SELECT COALESCE(hours_used,0) AS hours_used FROM karts WHERE id=$1`, [t.kart_id]);
          newLastDone = Number(kQ.rows[0]?.hours_used || 0);
        }

        await client.query(
          `
          INSERT INTO maintenance_rule_state (kart_id, rule_id, last_done_hours, last_done_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (kart_id, rule_id)
          DO UPDATE SET last_done_hours = EXCLUDED.last_done_hours,
                        last_done_at = NOW()
          `,
          [t.kart_id, t.rule_id, newLastDone]
        );
      }
    }

    await client.query("COMMIT");
    res.json({ status: "completed", task: doneQ.rows[0] });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error("❌ COMPLETE task:", err);
    res.status(500).json({ error: "Complete error" });
  } finally {
    client.release();
  }
});
// =====================================================
// DELETE /api/maintenance/tasks/:id
// (PÚBLICO)
// =====================================================
router.delete("/tasks/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: "ID inválido" });
    }

    await pool.query(
      "DELETE FROM maintenance_tasks WHERE id = $1",
      [id]
    );

    res.json({ status: "deleted" });
  } catch (err) {
    console.error("❌ DELETE task:", err);
    res.status(500).json({ error: "Delete error" });
  }
});

module.exports = router;


