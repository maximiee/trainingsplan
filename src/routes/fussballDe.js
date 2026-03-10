const express = require('express');
const cheerio = require('cheerio');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const BASE = 'https://www.fussball.de';

async function fetchMatches(teamId, type) {
  const url = `${BASE}/ajax.team.${type}.games/-/mode/PAGE/team-id/${teamId}`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!res.ok) throw new Error(`fussball.de ${type}: HTTP ${res.status}`);
  const html = await res.text();
  return parseMatchesHtml(html, teamId);
}

function parseMatchesHtml(html, ownTeamId) {
  const $ = cheerio.load(html);
  const matches = [];

  // Datum/Zeit steht in tr.row-headline, danach folgen Spielzeilen mit .club-name
  // Alle club-name Elemente kommen paarweise: [home, away, home, away, ...]
  const clubNames = [];
  $('.club-name').each((_, el) => clubNames.push($(el).text().trim()));

  const headlines = [];
  $('tr.row-headline').each((_, el) => {
    headlines.push($(el).text().trim());
  });

  console.log(`[fussball.de] Headlines: ${headlines.length}, ClubNames: ${clubNames.length}`);
  if (headlines.length > 0) console.log('[fussball.de] Beispiel-Headline:', headlines[0]);
  if (clubNames.length > 0) console.log('[fussball.de] Beispiel-ClubNames:', clubNames.slice(0, 4));

  // Jede Headline gilt für ein Spiel, club-names kommen paarweise
  for (let i = 0; i < headlines.length; i++) {
    const headline = headlines[i];
    const homeTeam = clubNames[i * 2] || '';
    const awayTeam = clubNames[i * 2 + 1] || '';

    // Datum parsen: z.B. "Samstag, 21.03.2026 11:00 Uhr"
    const dateMatch = headline.match(/(\d{2}\.\d{2}\.\d{4})/);
    const timeMatch = headline.match(/(\d{2}:\d{2})/);

    const dateStr = dateMatch ? dateMatch[1] : '';
    const timeStr = timeMatch ? timeMatch[1] : '';

    // DD.MM.YYYY → YYYY-MM-DD
    let dateISO = '';
    if (dateStr) {
      const [d, m, y] = dateStr.split('.');
      dateISO = `${y}-${m}-${d}`;
    }

    // Ergebnis aus der Spielzeile lesen (für vergangene Spiele)
    // Typische Selektoren: .column-score, .ergebnis, .result
    const rows = $('tr').filter((_, el) => {
      const text = $(el).text();
      return text.includes(homeTeam) && text.includes(awayTeam);
    });
    let result = '';
    if (rows.length > 0) {
      const scoreEl = rows.first().find('.column-score, .ergebnis, .result, [class*="score"], [class*="result"]');
      const scoreText = scoreEl.text().trim();
      const scoreMatch = scoreText.match(/(\d+)\s*:\s*(\d+)/);
      if (scoreMatch) result = `${scoreMatch[1]}:${scoreMatch[2]}`;
    }

    matches.push({ date: dateISO, time: timeStr, homeTeam, awayTeam, result });
  }

  return matches;
}

// GET /api/fussball-de/games/:teamId
router.get('/games/:teamId', requireAuth, async (req, res) => {
  const { teamId } = req.params;

  try {
    const [next, prev] = await Promise.all([
      fetchMatches(teamId, 'next'),
      fetchMatches(teamId, 'prev')
    ]);

    console.log(`[fussball.de] Ergebnis: next=${next.length} prev=${prev.length}`);
    if (next.length > 0) console.log('[fussball.de] Erstes Spiel:', JSON.stringify(next[0]));

    res.json({ next, prev });
  } catch (err) {
    console.log(`[fussball.de] Fehler: ${err.message}`);
    res.status(502).json({ error: err.message });
  }
});

module.exports = router;
