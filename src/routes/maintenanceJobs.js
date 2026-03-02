// backend/src/routes/maintenanceJobs.js
const express = require("express");
const router = express.Router();
const pool = require("../../db");

/**
 * GET /api/maintenance/jobs
 * Lista de trabajos de taller
 */
router.get("/", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        j.id,
        j.kart_id,
        k.number AS kart_number,
        j.title,
        j.description,
        j.status,
        j.opened_at,
        j.closed_at
      FROM maintenance_jobs j
      LEFT JOIN karts k ON k.id = j.kart_id
      ORDER BY j.opened_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /maintenance/jobs:", err);
    res.status(500).json({ error: "Jobs fetch error" });
  }
});

/**
 * GET /api/maintenance/jobs/:id
 * Detalle de un job + tareas asociadas
 */
router.get("/:id", async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    const jobQ = await pool.query(
      `
      SELECT
        j.*,
        k.number AS kart_number
      FROM maintenance_jobs j
      LEFT JOIN karts k ON k.id = j.kart_id
      WHERE j.id = $1
      `,
      [jobId]
    );

    if (!jobQ.rows.length) {
      return res.status(404).json({ error: "Job no encontrado" });
    }

    const tasksQ = await pool.query(
      `
      SELECT
        t.*,
        r.rule_type,
        r.rule_value,
        r.description AS rule_description
      FROM maintenance_tasks t
      LEFT JOIN maintenance_rules r ON r.id = t.rule_id
      WHERE t.job_id = $1
      ORDER BY t.created_at ASC
      `,
      [jobId]
    );

    res.json({
      job: jobQ.rows[0],
      tasks: tasksQ.rows,
    });
  } catch (err) {
    console.error("❌ GET /maintenance/jobs/:id:", err);
    res.status(500).json({ error: "Job detail error" });
  }
});

/**
 * POST /api/maintenance/jobs
 * Crea un job nuevo
 * body: { kart_id, title, description }
 */
router.post("/", async (req, res) => {
  try {
    const { kart_id, title, description } = req.body;

    if (!kart_id) {
      return res.status(400).json({ error: "kart_id es obligatorio" });
    }

    const { rows } = await pool.query(
      `
      INSERT INTO maintenance_jobs
        (kart_id, title, description, status, opened_at)
      VALUES ($1, $2, $3, 'open', NOW())
      RETURNING *
      `,
      [kart_id, title || null, description || null]
    );

    res.json({ status: "created", job: rows[0] });
  } catch (err) {
    console.error("❌ POST /maintenance/jobs:", err);
    res.status(500).json({ error: "Job create error" });
  }
});

/**
 * PUT /api/maintenance/jobs/:id
 * Edita datos del job (título, descripción, status)
 */
router.put("/:id", async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    const { title, description, status } = req.body;

    const { rows } = await pool.query(
      `
      UPDATE maintenance_jobs
      SET
        title = COALESCE($1, title),
        description = COALESCE($2, description),
        status = COALESCE($3, status)
      WHERE id = $4
      RETURNING *
      `,
      [title || null, description || null, status || null, jobId]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Job no encontrado" });
    }

    res.json({ status: "updated", job: rows[0] });
  } catch (err) {
    console.error("❌ PUT /maintenance/jobs/:id:", err);
    res.status(500).json({ error: "Job update error" });
  }
});

/**
 * PUT /api/maintenance/jobs/:id/close
 * Cierra el job + marca tareas asociadas como done
 */
router.put("/:id/close", async (req, res) => {
  try {
    const jobId = Number(req.params.id);

    const jobQ = await pool.query(
      `
      UPDATE maintenance_jobs
      SET status = 'done',
          closed_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [jobId]
    );

    if (!jobQ.rows.length) {
      return res.status(404).json({ error: "Job no encontrado" });
    }

    // Marcar tareas como completadas
    await pool.query(
      `
      UPDATE maintenance_tasks
      SET status = 'done',
          completed_at = NOW()
      WHERE job_id = $1
      `,
      [jobId]
    );

    res.json({ status: "job_closed", job: jobQ.rows[0] });
  } catch (err) {
    console.error("❌ PUT /maintenance/jobs/:id/close:", err);
    res.status(500).json({ error: "Job close error" });
  }
});

/**
 * POST /api/maintenance/jobs/:id/tasks
 * Asigna una tarea existente a un job
 * body: { task_id }
 */
router.post("/:id/tasks", async (req, res) => {
  try {
    const jobId = Number(req.params.id);
    const { task_id } = req.body;

    if (!task_id) {
      return res.status(400).json({ error: "task_id es obligatorio" });
    }

    await pool.query(
      `
      UPDATE maintenance_tasks
      SET job_id = $1
      WHERE id = $2
      `,
      [jobId, task_id]
    );

    res.json({ status: "task_attached" });
  } catch (err) {
    console.error("❌ POST /maintenance/jobs/:id/tasks:", err);
    res.status(500).json({ error: "Attach task error" });
  }
});

module.exports = router;
