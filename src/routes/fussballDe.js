const express = require('express');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// GET /api/fussball-de/games/:teamId
// Lädt kommende + vergangene Spiele von api-fussball.de
router.get('/games/:teamId', requireAuth, async (req, res) => {
  const token = process.env.FUSSBALL_DE_TOKEN;
  if (!token) {
    return res.status(503).json({ error: 'FUSSBALL_DE_TOKEN nicht konfiguriert. Bitte in .env eintragen.' });
  }

  const { teamId } = req.params;
  const headers = { 'x-auth-token': token };

  try {
    const [nextRes, prevRes] = await Promise.all([
      fetch(`https://api-fussball.de/api/team/next_games/${teamId}`, { headers }),
      fetch(`https://api-fussball.de/api/team/prev_games/${teamId}`, { headers })
    ]);

    const nextText = await nextRes.text();
    const prevText = await prevRes.text();

    console.log(`[fussball.de] next_games status=${nextRes.status} body=${nextText}`);
    console.log(`[fussball.de] prev_games status=${prevRes.status} body=${prevText}`);

    if (nextRes.status === 401 || prevRes.status === 401) {
      return res.status(401).json({ error: 'Ungültiger FUSSBALL_DE_TOKEN' });
    }
    if (!nextRes.ok || !prevRes.ok) {
      return res.status(502).json({ error: `Fehler von api-fussball.de: next=${nextRes.status} prev=${prevRes.status}` });
    }

    const next = JSON.parse(nextText);
    const prev = JSON.parse(prevText);
    res.json({ next: next || [], prev: prev || [] });
  } catch (err) {
    console.log(`[fussball.de] Fehler: ${err.message}`);
    res.status(502).json({ error: `Verbindungsfehler: ${err.message}` });
  }
});

module.exports = router;
