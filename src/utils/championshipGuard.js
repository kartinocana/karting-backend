const pool = require("../../db");




/**
 * Verifica si un campeonato está bloqueado
 */
async function assertChampionshipEditable(championshipId) {
  const res = await pool.query(
    `
    SELECT status
    FROM kart_champ.championships
    WHERE id = $1
    `,
    [championshipId]
  );

  if (!res.rows.length) {
    throw new Error("Campeonato no encontrado");
  }

  if (res.rows[0].status === "official") {
    throw new Error("Campeonato OFICIAL: no se permiten cambios");
  }
}

module.exports = { assertChampionshipEditable };
