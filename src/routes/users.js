const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/roleCheck');
const router = express.Router();

// PUT /api/users/me – eigenes Profil aktualisieren (Name, Email)
router.put('/me', requireAuth, (req, res) => {
  const { name, email } = req.body;
  if (!name || !email) return res.status(400).json({ error: 'Name und E-Mail erforderlich' });

  const conflict = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, req.session.userId);
  if (conflict) return res.status(409).json({ error: 'E-Mail bereits vergeben' });

  db.prepare('UPDATE users SET name = ?, email = ? WHERE id = ?').run(name, email, req.session.userId);
  req.session.userName = name;
  res.json({ ok: true });
});

// PUT /api/users/me/teams – eigene Teamzuordnung ändern
router.put('/me/teams', requireAuth, (req, res) => {
  const { teamIds } = req.body;
  const userId = req.session.userId;

  db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(userId);
  if (Array.isArray(teamIds)) {
    const insert = db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)');
    for (const tid of teamIds) insert.run(userId, tid);
  }

  const teams = db.prepare(`
    SELECT t.id, t.name, t.color FROM user_teams ut
    JOIN teams t ON t.id = ut.team_id WHERE ut.user_id = ?
  `).all(userId);
  req.session.teams = teams;

  res.json({ ok: true, teams });
});

// GET /api/users – alle User (Admin)
router.get('/', requireAuth, requireAdmin, (req, res) => {
  const users = db.prepare(`
    SELECT id, name, email, role, is_active, created_at FROM users ORDER BY name
  `).all();

  const result = users.map(u => {
    const teams = db.prepare(`
      SELECT t.id, t.name FROM user_teams ut JOIN teams t ON t.id = ut.team_id WHERE ut.user_id = ?
    `).all(u.id);
    return { ...u, teams };
  });

  res.json(result);
});

// POST /api/users – neuer User (Admin)
router.post('/', requireAuth, requireAdmin, (req, res) => {
  const { name, email, password, role, teamIds } = req.body;
  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
  }
  if (!['admin', 'trainer'].includes(role)) {
    return res.status(400).json({ error: 'Ungültige Rolle' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'E-Mail bereits vergeben' });
  }

  const hash = bcrypt.hashSync(password, 12);
  const info = db.prepare(
    "INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)"
  ).run(name, email, hash, role);

  const userId = info.lastInsertRowid;
  if (Array.isArray(teamIds)) {
    const insert = db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)');
    for (const tid of teamIds) insert.run(userId, tid);
  }

  res.status(201).json({ id: userId });
});

// PUT /api/users/:id – User bearbeiten (Admin)
router.put('/:id', requireAuth, requireAdmin, (req, res) => {
  const { name, email, role, teamIds } = req.body;
  const userId = parseInt(req.params.id);

  if (!name || !email || !role) {
    return res.status(400).json({ error: 'Fehlende Pflichtfelder' });
  }

  db.prepare('UPDATE users SET name = ?, email = ?, role = ? WHERE id = ?')
    .run(name, email, role, userId);

  // Teams neu setzen
  db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(userId);
  if (Array.isArray(teamIds)) {
    const insert = db.prepare('INSERT OR IGNORE INTO user_teams (user_id, team_id) VALUES (?, ?)');
    for (const tid of teamIds) insert.run(userId, tid);
  }

  res.json({ ok: true });
});

// POST /api/users/:id/reset-password (Admin)
router.post('/:id/reset-password', requireAuth, requireAdmin, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    return res.status(400).json({ error: 'Passwort muss mindestens 8 Zeichen haben' });
  }
  const hash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, parseInt(req.params.id));
  res.json({ ok: true });
});

// POST /api/users/:id/deactivate (Admin)
router.post('/:id/deactivate', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'Eigenen Account nicht deaktivierbar' });
  }
  db.prepare('UPDATE users SET is_active = 0 WHERE id = ?').run(userId);
  res.json({ ok: true });
});

// POST /api/users/:id/activate (Admin)
router.post('/:id/activate', requireAuth, requireAdmin, (req, res) => {
  db.prepare('UPDATE users SET is_active = 1 WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// DELETE /api/users/:id (Admin)
router.delete('/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'Eigenen Account nicht löschbar' });
  }
  db.prepare('DELETE FROM user_teams WHERE user_id = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ ok: true });
});

module.exports = router;
