const express = require('express');
const db = require('../db/database');
const { requireAuth, requireActive } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// GET /api/matches?season_id=X&team_id=Y
router.get('/', requireAuth, (req, res) => {
  const { season_id, team_id } = req.query;
  let query = `
    SELECT m.*, t.name as team_name, t.color as team_color,
           p.name as pitch_name
    FROM match_appointments m
    JOIN teams t ON t.id = m.team_id
    LEFT JOIN pitches p ON p.id = m.pitch_id
    WHERE 1=1
  `;
  const params = [];
  if (season_id) { query += ' AND m.season_id = ?'; params.push(season_id); }
  if (team_id) { query += ' AND m.team_id = ?'; params.push(team_id); }
  query += ' ORDER BY m.date, m.time';

  res.json(db.prepare(query).all(...params));
});

// Hilfsfunktion: Darf Trainer dieses Match bearbeiten?
function canTrainerEditMatch(req, team_id) {
  if (req.session.role === 'admin') return true;
  const myTeamIds = (req.session.teams || []).map(t => t.id);
  return myTeamIds.includes(parseInt(team_id));
}

// Trainingseinheiten eines Teams an einem Datum absagen
function cancelTrainingOnMatchDay(team_id, date) {
  const sessions = db.prepare(`
    SELECT ts.id FROM training_sessions ts
    JOIN session_teams st ON st.session_id = ts.id
    WHERE st.team_id = ? AND ts.date = ? AND ts.is_cancelled = 0
  `).all(team_id, date);
  const cancel = db.prepare('UPDATE training_sessions SET is_cancelled = 1 WHERE id = ?');
  for (const s of sessions) cancel.run(s.id);
  return sessions.length;
}

// POST /api/matches
router.post('/', requireAuth, requireActive, (req, res) => {
  const { team_id, season_id, date, time, opponent, location, venue, pitch_id, fussball_de_match_id } = req.body;
  if (!team_id || !date) {
    return res.status(400).json({ error: 'Team und Datum erforderlich' });
  }
  if (!canTrainerEditMatch(req, team_id)) {
    return res.status(403).json({ error: 'Keine Berechtigung für dieses Team' });
  }

  // Aktive Saison als Standard
  const effectiveSeasonId = season_id || db.prepare('SELECT id FROM seasons WHERE is_active = 1').get()?.id;
  if (!effectiveSeasonId) {
    return res.status(400).json({ error: 'Keine aktive Saison' });
  }

  const halfPitch = req.body.half_pitch ? 1 : 0;
  const info = db.prepare(`
    INSERT INTO match_appointments (team_id, season_id, date, time, opponent, location, venue, pitch_id, half_pitch, fussball_de_match_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(team_id, effectiveSeasonId, date, time || null, opponent || null, location || 'heim', venue || null, pitch_id || null, halfPitch, fussball_de_match_id || null);

  const cancelled = halfPitch ? 0 : cancelTrainingOnMatchDay(parseInt(team_id), date);
  res.status(201).json({ id: info.lastInsertRowid, cancelledTrainings: cancelled });
});

// PUT /api/matches/:id
router.put('/:id', requireAuth, requireActive, (req, res) => {
  const { team_id, date, time, opponent, location, venue, pitch_id } = req.body;
  const match = db.prepare('SELECT team_id, date FROM match_appointments WHERE id = ?').get(parseInt(req.params.id));
  if (!match) return res.status(404).json({ error: 'Nicht gefunden' });
  if (!canTrainerEditMatch(req, match.team_id)) {
    return res.status(403).json({ error: 'Keine Berechtigung für dieses Team' });
  }
  const halfPitch = req.body.half_pitch ? 1 : 0;
  db.prepare(`
    UPDATE match_appointments SET team_id = ?, date = ?, time = ?, opponent = ?, location = ?, venue = ?, pitch_id = ?, half_pitch = ? WHERE id = ?
  `).run(team_id, date, time || null, opponent || null, location || 'heim', venue || null, pitch_id || null, halfPitch, parseInt(req.params.id));

  const cancelled = halfPitch ? 0 : cancelTrainingOnMatchDay(parseInt(team_id), date);
  res.json({ ok: true, cancelledTrainings: cancelled });
});

// DELETE /api/matches/:id
router.delete('/:id', requireAuth, requireActive, (req, res) => {
  const match = db.prepare('SELECT team_id FROM match_appointments WHERE id = ?').get(parseInt(req.params.id));
  if (!match) return res.status(404).json({ error: 'Nicht gefunden' });
  if (!canTrainerEditMatch(req, match.team_id)) {
    return res.status(403).json({ error: 'Keine Berechtigung für dieses Team' });
  }
  db.prepare('DELETE FROM match_appointments WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
