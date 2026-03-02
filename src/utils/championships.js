async function recalcChampionship(pool, championshipId) {
  await pool.query(`
    CALL kart_champ.recalculate_championship($1)
  `, [championshipId]);
}

module.exports = { recalcChampionship };
