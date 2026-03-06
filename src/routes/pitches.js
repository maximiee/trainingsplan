const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// GET /api/pitches
router.get('/', requireAuth, (req, res) => {
  const pitches = db.prepare('SELECT * FROM pitches ORDER BY id').all();
  res.json(pitches);
});

// POST /api/pitches
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, surface } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name erforderlich' });
  }
  const info = db.prepare('INSERT INTO pitches (name, surface) VALUES (?, ?)').run(name, surface || 'Rasen');
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/pitches/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, surface } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Name erforderlich' });
  }
  db.prepare('UPDATE pitches SET name = ?, surface = ? WHERE id = ?')
    .run(name, surface || 'Rasen', parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
