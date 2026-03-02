const express = require("express");
const router = express.Router();
const pool = require("../../db");

function toNumberOrNull(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ================================
// GET /api/maintenance/rules
// ================================
router.get("/", async (req, res) => {
  try {
    // SELECT * para no romper si tu tabla tiene columnas distintas
    const { rows } = await pool.query(`
      SELECT *
      FROM maintenance_rules
      ORDER BY id ASC
    `);
    res.json(rows);
  } catch (err) {
    console.error("❌ GET /rules:", err);
    res.status(500).json({
      error: "Rules fetch error",
      detail: err.message, // <--- para ver el motivo en el navegador
    });
  }
});

// ================================
// POST /api/maintenance/rules
// ================================
router.post("/", async (req, res) => {
  try {
    const { name, description, active, interval_hours, rule_type, rule_value } = req.body;

    // Tu BD exige interval_hours NOT NULL.
    // Compat: si no viene interval_hours, usamos rule_value.
    const finalIntervalHours = toNumberOrNull(interval_hours) ?? toNumberOrNull(rule_value);

    if (finalIntervalHours === null) {
      return res.status(400).json({
        error: "interval_hours es obligatorio (o envía rule_value).",
      });
    }

    const finalRuleType =
      (typeof rule_type === "string" && rule_type.trim()) ? rule_type.trim() : "hours";

    const finalRuleValue = toNumberOrNull(rule_value) ?? finalIntervalHours;

    // Tu BD exige name NOT NULL.
    const finalName =
      (typeof name === "string" && name.trim()) ||
      (typeof description === "string" && description.trim()) ||
      `${finalRuleType} ${finalIntervalHours}h`;

    const { rows } = await pool.query(
      `
      INSERT INTO maintenance_rules
        (name, interval_hours, active, rule_type, rule_value, description)
      VALUES
        ($1,   $2,            COALESCE($3, true), $4,      $5,        $6)
      RETURNING *
      `,
      [finalName, finalIntervalHours, active, finalRuleType, finalRuleValue, description || null]
    );

    res.json({ status: "created", rule: rows[0] });
  } catch (err) {
    console.error("❌ POST /rules:", err);
    res.status(500).json({
      error: "Rule creation error",
      detail: err.message, // <--- IMPORTANTÍSIMO: verás exactamente qué falta
    });
  }
});

// ================================
// PUT /api/maintenance/rules/:id
// ================================
router.put("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, description, active, interval_hours, rule_type, rule_value } = req.body;

    const finalIntervalHours = toNumberOrNull(interval_hours) ?? toNumberOrNull(rule_value);
    if (finalIntervalHours === null) {
      return res.status(400).json({
        error: "interval_hours es obligatorio (o envía rule_value).",
      });
    }

    const finalRuleType =
      (typeof rule_type === "string" && rule_type.trim()) ? rule_type.trim() : "hours";

    const finalRuleValue = toNumberOrNull(rule_value) ?? finalIntervalHours;

    const finalName =
      (typeof name === "string" && name.trim()) ||
      (typeof description === "string" && description.trim()) ||
      `${finalRuleType} ${finalIntervalHours}h`;

    const { rows } = await pool.query(
      `
      UPDATE maintenance_rules
      SET name = $1,
          interval_hours = $2,
          active = COALESCE($3, active),
          rule_type = $4,
          rule_value = $5,
          description = $6
      WHERE id = $7
      RETURNING *
      `,
      [finalName, finalIntervalHours, active, finalRuleType, finalRuleValue, description || null, id]
    );

    res.json({ status: "updated", rule: rows[0] });
  } catch (err) {
    console.error("❌ PUT /rules:", err);
    res.status(500).json({
      error: "Rule update error",
      detail: err.message,
    });
  }
});

// ================================
// DELETE /api/maintenance/rules/:id
// ================================
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM maintenance_rules WHERE id = $1", [id]);
    res.json({ status: "deleted" });
  } catch (err) {
    console.error("❌ DELETE /rules:", err);
    res.status(500).json({
      error: "Rule delete error",
      detail: err.message,
    });
  }
});

module.exports = router;