const express = require("express");
const router = express.Router();
const pool = require("../../db");

router.get("/", async (req, res) => {
  const { rows } = await pool.query(
    "SELECT current_database(), * FROM driver_levels"
  );
  console.log("GET LEVELS FROM DB:", rows);
  res.json(rows);
});



// POST crear
router.post("/", async (req, res) => {
  const { code, name, color } = req.body;

  const { rows } = await pool.query(
    `
    INSERT INTO driver_levels (code, name, color)
    VALUES ($1, $2, $3)
    RETURNING *
    `,
    [code, name, color || "#334155"]
  );

  res.json(rows[0]);
});

// DELETE
router.delete("/:id", async (req, res) => {
  await pool.query("DELETE FROM driver_levels WHERE id = $1", [
    req.params.id
  ]);
  res.json({ ok: true });
});

module.exports = router;
