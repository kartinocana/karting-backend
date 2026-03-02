const express = require("express");
const router = express.Router();
const pool = require("../../db");


// GET all transponders
router.get("/", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM transponders ORDER BY id ASC");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error GET /transponders:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// CREATE transponder
router.post("/", async (req, res) => {
  try {
    const { code, driver_id, kart_id } = req.body;
    if (!code) return res.status(400).json({ error: "Código obligatorio" });
    const q = `
      INSERT INTO transponders (code, driver_id, kart_id)
      VALUES ($1,$2,$3)
      RETURNING *
    `;
    const values = [code, driver_id || null, kart_id || null];
    const result = await pool.query(q, values);
    res.json({ status: "ok", created: result.rows[0] });
  } catch (err) {
    console.error("❌ Error POST /transponders:", err);
    res.status(500).json({ error: "Insert error" });
  }
});

// DELETE transponder
router.delete("/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    await pool.query("DELETE FROM transponders WHERE id=$1", [id]);
    res.json({ status: "deleted" });
  } catch (err) {
    console.error("❌ Error DELETE /transponders:", err);
    res.status(500).json({ error: "Delete error" });
  }
});

module.exports = router;
