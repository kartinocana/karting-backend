const express = require("express");
const pool = require("../../db");
const router = express.Router();

/* -------- POST: INSCRIBIR PARTICIPANTE -------- */

router.post("/championships/:championshipId/participants", async (req, res) => {
  const championshipId = Number(req.params.championshipId);
  const {
    racecontrol_driver_id,
    category,
    number,
    kart_id,
    nickname,
    weight
  } = req.body;

  try {

    const q = `
      INSERT INTO kart_champ.championship_participants
      (championship_id, racecontrol_driver_id, category, number, kart_id, nickname, weight)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (championship_id, racecontrol_driver_id)
      DO UPDATE SET
        category = EXCLUDED.category,
        number = EXCLUDED.number,
        kart_id = EXCLUDED.kart_id,
        nickname = EXCLUDED.nickname,
        weight = EXCLUDED.weight
      RETURNING *;
    `;

    const values = [
      championshipId,
      racecontrol_driver_id,
      category || null,
      number || null,
      kart_id || null,
      nickname || null,
      weight || null
    ];

    const result = await pool.query(q, values);
    res.json(result.rows[0]);

  } catch (err) {
    console.error("PARTICIPANTS POST ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

/* -------- GET: LISTAR PARTICIPANTES -------- */

// -------- GET: LISTAR PARTICIPANTES --------
router.get("/championships/:championshipId/participants", async (req, res) => {
  const championshipId = Number(req.params.championshipId);

  try {
    const q = `
    SELECT
  p.racecontrol_driver_id,
  d.name,
  p.category,
  p.number,
  p.kart_id,
  k.number AS kart_number,   -- 👈 NUEVO
  p.nickname,
  p.weight,
  p.active
FROM kart_champ.championship_participants p
LEFT JOIN public.drivers d
  ON d.id = p.racecontrol_driver_id
LEFT JOIN public.karts k          -- 👈 NUEVO JOIN
  ON k.id = p.kart_id
WHERE p.championship_id = $1
ORDER BY p.category, d.name;

    `;

    const result = await pool.query(q, [championshipId]);

    // 🔹 MUY IMPORTANTE: SIEMPRE DEVOLVER ARRAY
    res.json(result.rows || []);
  } catch (err) {
    console.error("PARTICIPANTS GET ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});


module.exports = router;
