const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// GET /api/locations
router.get('/', requireAuth, (req, res) => {
  const locations = db.prepare('SELECT * FROM locations ORDER BY name').all();
  res.json(locations);
});

// POST /api/locations
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  const info = db.prepare('INSERT INTO locations (name) VALUES (?)').run(name.trim());
  res.status(201).json({ id: info.lastInsertRowid });
});

// PUT /api/locations/:id
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Name erforderlich' });
  db.prepare('UPDATE locations SET name = ? WHERE id = ?').run(name.trim(), parseInt(req.params.id));
  res.json({ ok: true });
});

module.exports = router;
