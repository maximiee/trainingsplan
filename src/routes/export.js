const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

function getWeekSessions(start, end, seasonId) {
  const sessions = db.prepare(`
    SELECT ts.*, p.name as pitch_name
    FROM training_sessions ts JOIN pitches p ON p.id = ts.pitch_id
    WHERE ts.date >= ? AND ts.date <= ? AND ts.season_id = ? AND ts.is_cancelled = 0
    ORDER BY ts.date, ts.start_time
  `).all(start, end, seasonId);

  return sessions.map(s => {
    const teams = db.prepare(
      'SELECT t.name FROM session_teams st JOIN teams t ON t.id = st.team_id WHERE st.session_id = ?'
    ).all(s.id).map(t => t.name);
    return { ...s, teams };
  });
}

function weekRange(weekParam) {
  // weekParam: YYYY-Www oder YYYY-MM-DD (erster Tag der Woche)
  let monday;
  if (weekParam && weekParam.includes('-W')) {
    const [year, week] = weekParam.split('-W');
    const jan4 = new Date(parseInt(year), 0, 4);
    const dayOfWeek = jan4.getDay() || 7;
    monday = new Date(jan4);
    monday.setDate(jan4.getDate() - dayOfWeek + 1 + (parseInt(week) - 1) * 7);
  } else {
    monday = new Date(weekParam || new Date());
    const day = monday.getDay() || 7;
    monday.setDate(monday.getDate() - day + 1);
  }
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
    label: `KW ${getISOWeek(monday)} · ${fmt(monday)}–${fmt(sunday)}`
  };
}

function getISOWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function fmt(d) {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const WEEKDAYS_DE = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

// GET /api/export/pdf?week=YYYY-Www&season_id=X
router.get('/pdf', requireAuth, (req, res) => {
  const { week, season_id } = req.query;

  const activeSeason = season_id
    ? db.prepare('SELECT * FROM seasons WHERE id = ?').get(season_id)
    : db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();

  if (!activeSeason) return res.status(400).json({ error: 'Keine Saison gefunden' });

  const range = weekRange(week);
  const sessions = getWeekSessions(range.start, range.end, activeSeason.id);
  const clubName = process.env.CLUB_NAME || 'Fussballverein';

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const filename = `Trainingsplan_${range.label.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  // Titel
  doc.fontSize(18).font('Helvetica-Bold').text(clubName, { align: 'center' });
  doc.fontSize(13).font('Helvetica').text(`Trainingsplan ${range.label}`, { align: 'center' });
  doc.fontSize(10).text(`Saison: ${activeSeason.name}`, { align: 'center' });
  doc.moveDown();

  // Tabelle
  const headers = ['Datum', 'Tag', 'Platz', 'Von', 'Bis', 'Teams', 'Typ', 'Notiz'];
  const colWidths = [70, 30, 80, 35, 35, 120, 55, 90];
  const tableTop = doc.y + 5;
  let x = 40;

  // Header
  doc.fontSize(8).font('Helvetica-Bold');
  headers.forEach((h, i) => {
    doc.text(h, x, tableTop, { width: colWidths[i] });
    x += colWidths[i];
  });
  doc.moveDown(0.3);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).stroke();

  // Zeilen
  doc.font('Helvetica').fontSize(8);
  if (sessions.length === 0) {
    doc.moveDown().text('Keine Einheiten in dieser Woche.', 40);
  } else {
    for (const s of sessions) {
      const d = new Date(s.date);
      const weekdayIdx = (d.getDay() + 6) % 7;
      const row = [
        d.toLocaleDateString('de-DE'),
        WEEKDAYS_DE[weekdayIdx],
        s.pitch_name,
        s.start_time,
        s.end_time,
        s.teams.join(', '),
        s.type,
        s.note || ''
      ];
      const rowY = doc.y + 3;
      x = 40;
      row.forEach((cell, i) => {
        doc.text(String(cell), x, rowY, { width: colWidths[i], lineBreak: false });
        x += colWidths[i];
      });
      doc.moveDown(1.2);
    }
  }

  // Fußzeile
  doc.fontSize(7).text(
    `Erstellt am ${new Date().toLocaleDateString('de-DE')} | ${clubName}`,
    40, doc.page.height - 40,
    { align: 'center', width: doc.page.width - 80 }
  );

  doc.end();
});

// GET /api/export/excel?mode=week|season&week=YYYY-Www&season_id=X
router.get('/excel', requireAuth, async (req, res) => {
  const { mode = 'week', week, season_id } = req.query;

  const activeSeason = season_id
    ? db.prepare('SELECT * FROM seasons WHERE id = ?').get(season_id)
    : db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();

  if (!activeSeason) return res.status(400).json({ error: 'Keine Saison gefunden' });

  const workbook = new ExcelJS.Workbook();
  workbook.creator = process.env.CLUB_NAME || 'Fussballverein';

  const headers = ['Datum', 'Wochentag', 'Platz', 'Von', 'Bis', 'Teams', 'Typ', 'Notiz'];

  let sessions, range;
  if (mode === 'season') {
    sessions = getWeekSessions(activeSeason.start_date, activeSeason.end_date, activeSeason.id);
    range = { label: activeSeason.name };
  } else {
    range = weekRange(week);
    sessions = getWeekSessions(range.start, range.end, activeSeason.id);
  }

  // Trainingseinheiten Sheet
  const sheet = workbook.addWorksheet('Trainingseinheiten');
  sheet.columns = headers.map((h, i) => ({
    header: h,
    key: h,
    width: [12, 12, 15, 8, 8, 30, 12, 25][i]
  }));
  sheet.getRow(1).font = { bold: true };

  for (const s of sessions) {
    const d = new Date(s.date);
    const weekdayIdx = (d.getDay() + 6) % 7;
    sheet.addRow({
      Datum: d.toLocaleDateString('de-DE'),
      Wochentag: WEEKDAYS_DE[weekdayIdx],
      Platz: s.pitch_name,
      Von: s.start_time,
      Bis: s.end_time,
      Teams: s.teams.join(', '),
      Typ: s.type,
      Notiz: s.note || ''
    });
  }

  // Spieltermine Sheet
  const matchSheet = workbook.addWorksheet('Spieltermine');
  matchSheet.columns = [
    { header: 'Datum', key: 'date', width: 12 },
    { header: 'Wochentag', key: 'weekday', width: 12 },
    { header: 'Team', key: 'team', width: 20 },
    { header: 'Uhrzeit', key: 'time', width: 10 },
    { header: 'Gegner', key: 'opponent', width: 25 },
    { header: 'Heimspiel', key: 'location', width: 12 },
    { header: 'Spielort', key: 'venue', width: 25 }
  ];
  matchSheet.getRow(1).font = { bold: true };

  const matches = db.prepare(`
    SELECT m.*, t.name as team_name FROM match_appointments m
    JOIN teams t ON t.id = m.team_id WHERE m.season_id = ? ORDER BY m.date
  `).all(activeSeason.id);

  for (const m of matches) {
    const d = new Date(m.date);
    const weekdayIdx = (d.getDay() + 6) % 7;
    matchSheet.addRow({
      date: d.toLocaleDateString('de-DE'),
      weekday: WEEKDAYS_DE[weekdayIdx],
      team: m.team_name,
      time: m.time || '',
      opponent: m.opponent || '',
      location: m.location === 'heim' ? 'Heimspiel' : 'Auswärts',
      venue: m.venue || ''
    });
  }

  const filename = `Trainingsplan_${range.label.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
});

module.exports = router;
