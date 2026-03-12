const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// GET /api/teams/public – ohne Auth (für Registrierung)
router.get('/public', (req, res) => {
  const teams = db.prepare('SELECT id, name, color FROM teams WHERE is_active = 1 ORDER BY name').all();
  res.json(teams);
});

// GET /api/teams
router.get('/', requireAuth, (req, res) => {
  const teams = db.prepare('SELECT * FROM teams WHERE is_active = 1 ORDER BY name').all();
  res.json(teams);
});

// GET /api/teams/all (inkl. inaktive, für Admin)
router.get('/all', requireAuth, requireAdmin, (req, res) => {
  const teams = db.prepare('SELECT * FROM teams ORDER BY is_active DESC, name').all();
  res.json(teams);
});

// GET /api/teams/overview – Kader-Übersicht aller aktiven Teams mit Trainern und Spielerzahlen
router.get('/overview', requireAuth, requireAdmin, (req, res) => {
  const teams = db.prepare('SELECT * FROM teams WHERE is_active = 1 ORDER BY age_group, name').all();

  const result = teams.map(team => {
    const trainers = db.prepare(`
      SELECT u.name FROM user_teams ut
      JOIN users u ON u.id = ut.user_id
      WHERE ut.team_id = ? AND u.is_active = 1
      ORDER BY u.name
    `).all(team.id).map(u => u.name);

    const squad = db.prepare(
      'SELECT year, gender, count FROM team_squad WHERE team_id = ? ORDER BY year DESC, gender'
    ).all(team.id);

    const total_m = squad.filter(s => s.gender === 'm').reduce((a, b) => a + b.count, 0);
    const total_w = squad.filter(s => s.gender === 'w').reduce((a, b) => a + b.count, 0);

    return { ...team, trainers, squad, total_m, total_w, total: total_m + total_w };
  });

  res.json(result);
});

// POST /api/teams
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, age_group, color, fussball_de_id } = req.body;
  if (!name || !color) {
    return res.status(400).json({ error: 'Name und Farbe erforderlich' });
  }
  const info = db.prepare(
    'INSERT INTO teams (name, age_group, color, fussball_de_id) VALUES (?, ?, ?, ?)'
  ).run(name, age_group || null, color, fussball_de_id || null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/teams/:id
router.put('/:id', requireAuth, (req, res) => {
  const teamId = parseInt(req.params.id);
  if (req.session.role !== 'admin') {
    const assigned = db.prepare('SELECT 1 FROM user_teams WHERE user_id = ? AND team_id = ?').get(req.session.userId, teamId);
    if (!assigned) return res.status(403).json({ error: 'Keine Berechtigung für dieses Team' });
  }
  const { name, age_group, color, fussball_de_id } = req.body;
  if (!name || !color) {
    return res.status(400).json({ error: 'Name und Farbe erforderlich' });
  }
  db.prepare(
    'UPDATE teams SET name = ?, age_group = ?, color = ?, fussball_de_id = ? WHERE id = ?'
  ).run(name, age_group || null, color, fussball_de_id || null, teamId);
  res.json({ ok: true });
});

// POST /api/teams/:id/deactivate
router.post('/:id/deactivate', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE teams SET is_active = 0 WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// POST /api/teams/:id/activate
router.post('/:id/activate', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE teams SET is_active = 1 WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// GET /api/teams/squad-aggregate – alle Kaderdaten nach Jahrgang+Geschlecht summiert (für Projektion)
router.get('/squad-aggregate', requireAuth, requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT year, gender, SUM(count) AS count
    FROM team_squad
    GROUP BY year, gender
    ORDER BY year, gender
  `).all();
  res.json(rows);
});

// GET /api/teams/:id/squad – Kader eines Teams
router.get('/:id/squad', requireAuth, (req, res) => {
  const teamId = parseInt(req.params.id);
  if (req.session.role !== 'admin') {
    const assigned = db.prepare('SELECT 1 FROM user_teams WHERE user_id = ? AND team_id = ?').get(req.session.userId, teamId);
    if (!assigned) return res.status(403).json({ error: 'Kein Zugriff' });
  }
  const entries = db.prepare(
    'SELECT id, year, gender, count, verein FROM team_squad WHERE team_id = ? ORDER BY year DESC, gender, verein'
  ).all(teamId);
  res.json(entries);
});

// PUT /api/teams/:id/squad – Kader speichern
router.put('/:id/squad', requireAuth, (req, res) => {
  const teamId = parseInt(req.params.id);
  if (req.session.role !== 'admin') {
    const assigned = db.prepare('SELECT 1 FROM user_teams WHERE user_id = ? AND team_id = ?').get(req.session.userId, teamId);
    if (!assigned) return res.status(403).json({ error: 'Kein Zugriff' });
  }
  const entries = req.body;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'Array erwartet' });

  const deleteAll = db.prepare('DELETE FROM team_squad WHERE team_id = ?');
  const insert = db.prepare(
    'INSERT INTO team_squad (team_id, year, gender, count, verein) VALUES (?, ?, ?, ?, ?)'
  );
  const VEREINE = ['TSV', 'MTV', 'TSG'];
  db.transaction(() => {
    deleteAll.run(teamId);
    for (const e of entries) {
      const count = parseInt(e.count) || 0;
      const verein = VEREINE.includes(e.verein) ? e.verein : 'TSV';
      if (count > 0 && e.year && (e.gender === 'm' || e.gender === 'w')) {
        insert.run(teamId, parseInt(e.year), e.gender, count, verein);
      }
    }
  })();
  res.json({ ok: true });
});

module.exports = router;
