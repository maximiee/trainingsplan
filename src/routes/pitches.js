const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// GET /api/pitches
router.get('/', requireAuth, (req, res) => {
  const pitches = db.prepare(`
    SELECT p.*, l.name as location_name
    FROM pitches p
    LEFT JOIN locations l ON p.location_id = l.id
    ORDER BY l.name, p.id
  `).all();
  res.json(pitches);
});

// POST /api/pitches
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, surface, location_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const info = db.prepare('INSERT INTO pitches (name, surface, location_id) VALUES (?, ?, ?)')
    .run(name, surface || 'Rasen', location_id ? parseInt(location_id) : null);
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/pitches/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, surface, location_id } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  db.prepare('UPDATE pitches SET name = ?, surface = ?, location_id = ? WHERE id = ?')
    .run(name, surface || 'Rasen', location_id ? parseInt(location_id) : null, parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
