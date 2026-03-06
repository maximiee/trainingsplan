const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// GET /api/matches?season_id=X&team_id=Y
router.get('/', requireAuth, (req, res) => {
  const { season_id, team_id } = req.query;
  let query = `
    SELECT m.*, t.name as team_name, t.color as team_color
    FROM match_appointments m JOIN teams t ON t.id = m.team_id WHERE 1=1
  `;
  const params = [];
  if (season_id) { query += ' AND m.season_id = ?'; params.push(season_id); }
  if (team_id) { query += ' AND m.team_id = ?'; params.push(team_id); }
  query += ' ORDER BY m.date, m.time';

  res.json(db.prepare(query).all(...params));
});

// POST /api/matches
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { team_id, season_id, date, time, opponent, location, venue, fussball_de_match_id } = req.body;
  if (!team_id || !date) {
    return res.status(400).json({ error: 'Team und Datum erforderlich' });
  }

  // Aktive Saison als Standard
  const effectiveSeasonId = season_id || db.prepare('SELECT id FROM seasons WHERE is_active = 1').get()?.id;
  if (!effectiveSeasonId) {
    return res.status(400).json({ error: 'Keine aktive Saison' });
  }

  const info = db.prepare(`
    INSERT INTO match_appointments (team_id, season_id, date, time, opponent, location, venue, fussball_de_match_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(team_id, effectiveSeasonId, date, time || null, opponent || null, location || 'heim', venue || null, fussball_de_match_id || null);

  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/matches/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { team_id, date, time, opponent, location, venue } = req.body;
  db.prepare(`
    UPDATE match_appointments SET team_id = ?, date = ?, time = ?, opponent = ?, location = ?, venue = ? WHERE id = ?
  `).run(team_id, date, time || null, opponent || null, location || 'heim', venue || null, parseInt(req.params.id));
  res.json({ ok: true });
});

// DELETE /api/matches/:id
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  db.prepare('DELETE FROM match_appointments WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
