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
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, age_group, color, fussball_de_id } = req.body;
  if (!name || !color) {
    return res.status(400).json({ error: 'Name und Farbe erforderlich' });
  }
  db.prepare(
    'UPDATE teams SET name = ?, age_group = ?, color = ?, fussball_de_id = ? WHERE id = ?'
  ).run(name, age_group || null, color, fussball_de_id || null, parseInt(req.params.id));
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

module.exports = router;
