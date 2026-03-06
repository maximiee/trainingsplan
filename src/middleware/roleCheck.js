function requireAdmin(req, res, next) {
  if (req.session && req.session.role === 'admin') {
    return next();
  }
  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.status(403).json({ error: 'Keine Berechtigung' });
  }
  res.status(403).send('Zugriff verweigert');
}

module.exports = { requireAdmin };
