const express = require('express');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

const WEEKDAYS_SHORT = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_FULL  = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function isoToDE(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}.${m}.${y}`;
}

function fmt(d) {
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function getISOWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

// Immer die aktuelle (heutige) Woche
function currentWeekRange() {
  const today = new Date();
  const day = today.getDay() || 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end:   sunday.toISOString().slice(0, 10),
    label: `KW ${getISOWeek(monday)} ${monday.getFullYear()} · ${fmt(monday)}–${fmt(sunday)}`
  };
}

// Einzelne Trainingseinheiten für eine Woche
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

// Wiederkehrende Einheiten (1× pro Recurrence, mit Zeitraum)
function getSeasonRecurrences(seasonId) {
  const recs = db.prepare(`
    SELECT r.*, p.name as pitch_name
    FROM recurrences r JOIN pitches p ON p.id = r.pitch_id
    WHERE r.season_id = ?
    ORDER BY r.weekday, r.start_time
  `).all(seasonId);

  return recs.map(r => {
    const firstSession = db.prepare(
      'SELECT id FROM training_sessions WHERE recurrence_id = ? AND is_exception = 0 LIMIT 1'
    ).get(r.id);
    const teams = firstSession ? db.prepare(
      'SELECT t.name FROM session_teams st JOIN teams t ON t.id = st.team_id WHERE st.session_id = ?'
    ).all(firstSession.id).map(t => t.name) : [];
    return { ...r, teams };
  });
}

// Einzeltermine (nicht wiederkehrend) einer Saison
function getSeasonSingleSessions(seasonId) {
  const sessions = db.prepare(`
    SELECT ts.*, p.name as pitch_name
    FROM training_sessions ts JOIN pitches p ON p.id = ts.pitch_id
    WHERE ts.season_id = ? AND ts.recurrence_id IS NULL AND ts.is_cancelled = 0
    ORDER BY ts.date, ts.start_time
  `).all(seasonId);

  return sessions.map(s => {
    const teams = db.prepare(
      'SELECT t.name FROM session_teams st JOIN teams t ON t.id = st.team_id WHERE st.session_id = ?'
    ).all(s.id).map(t => t.name);
    return { ...s, teams };
  });
}

// Spieltermine (gefiltert nach Zeitraum oder Saison)
function getMatches(seasonId, start, end) {
  let query = `
    SELECT m.*, t.name as team_name FROM match_appointments m
    JOIN teams t ON t.id = m.team_id WHERE m.season_id = ?
  `;
  const params = [seasonId];
  if (start) { query += ' AND m.date >= ?'; params.push(start); }
  if (end)   { query += ' AND m.date <= ?'; params.push(end); }
  query += ' ORDER BY m.date, m.time';
  return db.prepare(query).all(...params);
}

// ── PDF · immer aktuelle Woche ─────────────────────────────────
router.get('/pdf', requireAuth, (req, res) => {
  const { season_id } = req.query;

  const activeSeason = season_id
    ? db.prepare('SELECT * FROM seasons WHERE id = ?').get(season_id)
    : db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();
  if (!activeSeason) return res.status(400).json({ error: 'Keine Saison gefunden' });

  const range    = currentWeekRange();
  const sessions = getWeekSessions(range.start, range.end, activeSeason.id);
  const matches  = getMatches(activeSeason.id, range.start, range.end);
  const clubName = process.env.CLUB_NAME || 'Fussballverein';

  // Querformat A4: nutzbare Breite = 841 - 60 = 781 pt
  const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
  const filename = `Trainingsplan_${range.label.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  doc.pipe(res);

  const pageW = doc.page.width - 60; // 781

  // Titel
  doc.fontSize(16).font('Helvetica-Bold').text(clubName, { align: 'center' });
  doc.fontSize(11).font('Helvetica').text(`Trainingsplan · ${range.label}`, { align: 'center' });
  doc.fontSize(9).text(`Saison: ${activeSeason.name}`, { align: 'center' });
  doc.moveDown(0.8);

  // ── Trainingseinheiten ──
  doc.fontSize(10).font('Helvetica-Bold').text('Trainingseinheiten', 30);
  doc.moveDown(0.3);

  const tCols  = [30, 65, 90, 40, 40, 250, 246]; // Tag|Datum|Platz|Von|Bis|Teams|Notiz = 761
  const tHeads = ['Tag', 'Datum', 'Platz', 'Von', 'Bis', 'Teams', 'Notiz'];

  drawTableHeader(doc, tHeads, tCols, 30);

  if (sessions.length === 0) {
    doc.font('Helvetica').fontSize(8).moveDown(0.5).text('Keine Trainingseinheiten diese Woche.', 30);
  } else {
    doc.font('Helvetica').fontSize(8);
    for (const s of sessions) {
      const d = new Date(s.date);
      const row = [
        WEEKDAYS_SHORT[(d.getDay() + 6) % 7],
        fmt(d),
        s.pitch_name,
        s.start_time,
        s.end_time,
        s.teams.join(', '),
        s.note || ''
      ];
      drawTableRow(doc, row, tCols, 30);
    }
  }

  // ── Spieltermine ──
  if (matches.length > 0) {
    doc.moveDown(0.8);
    doc.fontSize(10).font('Helvetica-Bold').text('Spiele & Turniere', 30);
    doc.moveDown(0.3);

    const mCols  = [30, 65, 50, 200, 90, 90, 236]; // Tag|Datum|Zeit|Gegner|Team|Typ|Platz
    const mHeads = ['Tag', 'Datum', 'Zeit', 'Gegner', 'Team', 'Typ', 'Platz'];
    drawTableHeader(doc, mHeads, mCols, 30);
    doc.font('Helvetica').fontSize(8);

    for (const m of matches) {
      const d = new Date(m.date);
      const row = [
        WEEKDAYS_SHORT[(d.getDay() + 6) % 7],
        fmt(d),
        m.time || '–',
        m.opponent || '–',
        m.team_name,
        m.type === 'turnier' ? 'Turnier' : 'Spiel',
        m.pitch_name || (m.location === 'heim' ? 'Heimspiel' : 'Auswärts')
      ];
      drawTableRow(doc, row, mCols, 30);
    }
  }

  // Fußzeile
  doc.fontSize(7).font('Helvetica').text(
    `Erstellt am ${fmt(new Date())} | ${clubName}`,
    30, doc.page.height - 25,
    { align: 'center', width: pageW }
  );

  doc.end();
});

function drawTableHeader(doc, headers, colWidths, startX) {
  const y = doc.y;
  doc.fontSize(8).font('Helvetica-Bold');
  let x = startX;
  headers.forEach((h, i) => {
    doc.text(h, x, y, { width: colWidths[i], lineBreak: false });
    x += colWidths[i];
  });
  doc.moveDown(0.4);
  doc.moveTo(startX, doc.y).lineTo(startX + colWidths.reduce((a, b) => a + b, 0), doc.y).stroke();
  doc.moveDown(0.2);
}

function drawTableRow(doc, cells, colWidths, startX) {
  const y = doc.y;
  let x = startX;
  cells.forEach((cell, i) => {
    doc.text(String(cell), x, y, { width: colWidths[i], lineBreak: false });
    x += colWidths[i];
  });
  doc.moveDown(1.1);
}

// ── Excel ──────────────────────────────────────────────────────
router.get('/excel', requireAuth, async (req, res) => {
  const { mode = 'week', season_id } = req.query;

  const activeSeason = season_id
    ? db.prepare('SELECT * FROM seasons WHERE id = ?').get(season_id)
    : db.prepare('SELECT * FROM seasons WHERE is_active = 1').get();
  if (!activeSeason) return res.status(400).json({ error: 'Keine Saison gefunden' });

  const clubName = process.env.CLUB_NAME || 'Fussballverein';
  const workbook = new ExcelJS.Workbook();
  workbook.creator = clubName;

  let filename;

  if (mode === 'season') {
    filename = `Trainingsplan_Saison_${activeSeason.name.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    buildSeasonSheet(workbook, activeSeason, clubName);
  } else {
    const range = currentWeekRange();
    filename = `Trainingsplan_${range.label.replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`;
    buildWeekSheet(workbook, activeSeason, range, clubName);
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

function styleHeader(row) {
  row.font = { bold: true };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE9ECEF' } };
  row.border = {
    bottom: { style: 'thin', color: { argb: 'FFADB5BD' } }
  };
}

function styleSectionTitle(row, colCount) {
  row.font = { bold: true, size: 12 };
  row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0E4FF' } };
  for (let i = 1; i <= colCount; i++) {
    row.getCell(i).border = { bottom: { style: 'medium', color: { argb: 'FF4A90D9' } } };
  }
}

// Saison-Export: Wiederkehrende einmalig + Einzeltermine + Spiele
function buildSeasonSheet(workbook, season, clubName) {
  const sheet = workbook.addWorksheet('Trainingsplan');

  // Titel
  sheet.addRow([clubName]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([`Saison: ${season.name} · ${isoToDE(season.start_date)} – ${isoToDE(season.end_date)}`]);
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF555555' } };
  sheet.addRow([]);

  // ── Abschnitt: Wiederkehrende Einheiten ──
  const recTitleRow = sheet.addRow(['Wiederkehrende Trainingseinheiten']);
  styleSectionTitle(recTitleRow, 7);
  sheet.mergeCells(`A${sheet.rowCount}:G${sheet.rowCount}`);

  const recHeaderRow = sheet.addRow(['Wochentag', 'Von', 'Bis', 'Platz', 'Startzeit', 'Endzeit', 'Teams']);
  styleHeader(recHeaderRow);

  const recs = getSeasonRecurrences(season.id);
  for (const r of recs) {
    const row = sheet.addRow([
      WEEKDAYS_FULL[r.weekday],
      isoToDE(r.valid_from),
      isoToDE(r.valid_until),
      r.pitch_name,
      r.start_time,
      r.end_time,
      r.teams.join(', ')
    ]);
    row.getCell(1).font = { bold: true };
  }

  if (recs.length === 0) {
    sheet.addRow(['Keine wiederkehrenden Einheiten']);
  }

  sheet.addRow([]);

  // ── Abschnitt: Einzeltermine ──
  const singles = getSeasonSingleSessions(season.id);
  if (singles.length > 0) {
    const sTitleRow = sheet.addRow(['Einzeltermine']);
    styleSectionTitle(sTitleRow, 7);
    sheet.mergeCells(`A${sheet.rowCount}:G${sheet.rowCount}`);

    const sHeaderRow = sheet.addRow(['Datum', 'Wochentag', 'Platz', 'Startzeit', 'Endzeit', 'Teams', 'Typ']);
    styleHeader(sHeaderRow);

    for (const s of singles) {
      const d = new Date(s.date);
      sheet.addRow([
        isoToDE(s.date),
        WEEKDAYS_FULL[(d.getDay() + 6) % 7],
        s.pitch_name,
        s.start_time,
        s.end_time,
        s.teams.join(', '),
        s.type
      ]);
    }
    sheet.addRow([]);
  }

  // ── Abschnitt: Spiele & Turniere ──
  const matches = getMatches(season.id);
  const mTitleRow = sheet.addRow(['Spiele & Turniere']);
  styleSectionTitle(mTitleRow, 7);
  sheet.mergeCells(`A${sheet.rowCount}:G${sheet.rowCount}`);

  const mHeaderRow = sheet.addRow(['Datum', 'Wochentag', 'Team', 'Uhrzeit', 'Gegner', 'Typ', 'Platz']);
  styleHeader(mHeaderRow);

  for (const m of matches) {
    const d = new Date(m.date);
    sheet.addRow([
      isoToDE(m.date),
      WEEKDAYS_FULL[(d.getDay() + 6) % 7],
      m.team_name,
      m.time || '–',
      m.opponent || '–',
      m.type === 'turnier' ? 'Turnier' : 'Spiel',
      m.pitch_name || (m.location === 'heim' ? 'Heimspiel' : 'Auswärts')
    ]);
  }

  if (matches.length === 0) {
    sheet.addRow(['Keine Spiel- oder Turnierdaten']);
  }

  // Spaltenbreiten
  sheet.columns = [
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 },
    { width: 12 }, { width: 12 }, { width: 35 }
  ];
}

// Wochen-Export: individuelle Sessions + Spiele der Woche
function buildWeekSheet(workbook, season, range, clubName) {
  const sessions = getWeekSessions(range.start, range.end, season.id);
  const matches  = getMatches(season.id, range.start, range.end);

  const sheet = workbook.addWorksheet('Trainingswoche');

  // Titel
  sheet.addRow([clubName]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([`Trainingsplan · ${range.label}`]);
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF555555' } };
  sheet.addRow([`Saison: ${season.name}`]);
  sheet.getRow(3).font = { italic: true, color: { argb: 'FF888888' } };
  sheet.addRow([]);

  // ── Trainingseinheiten ──
  const tTitleRow = sheet.addRow(['Trainingseinheiten']);
  styleSectionTitle(tTitleRow, 7);
  sheet.mergeCells(`A${sheet.rowCount}:G${sheet.rowCount}`);

  const tHeaderRow = sheet.addRow(['Tag', 'Datum', 'Platz', 'Von', 'Bis', 'Teams', 'Notiz']);
  styleHeader(tHeaderRow);

  if (sessions.length === 0) {
    sheet.addRow(['Keine Trainingseinheiten diese Woche']);
  } else {
    for (const s of sessions) {
      const d = new Date(s.date);
      sheet.addRow([
        WEEKDAYS_FULL[(d.getDay() + 6) % 7],
        isoToDE(s.date),
        s.pitch_name,
        s.start_time,
        s.end_time,
        s.teams.join(', '),
        s.note || ''
      ]);
    }
  }

  if (matches.length > 0) {
    sheet.addRow([]);
    const mTitleRow = sheet.addRow(['Spiele & Turniere']);
    styleSectionTitle(mTitleRow, 7);
    sheet.mergeCells(`A${sheet.rowCount}:G${sheet.rowCount}`);

    const mHeaderRow = sheet.addRow(['Tag', 'Datum', 'Zeit', 'Team', 'Gegner', 'Typ', 'Platz']);
    styleHeader(mHeaderRow);

    for (const m of matches) {
      const d = new Date(m.date);
      sheet.addRow([
        WEEKDAYS_FULL[(d.getDay() + 6) % 7],
        isoToDE(m.date),
        m.time || '–',
        m.team_name,
        m.opponent || '–',
        m.type === 'turnier' ? 'Turnier' : 'Spiel',
        m.pitch_name || (m.location === 'heim' ? 'Heimspiel' : 'Auswärts')
      ]);
    }
  }

  sheet.columns = [
    { width: 12 }, { width: 14 }, { width: 16 }, { width: 10 },
    { width: 10 }, { width: 35 }, { width: 30 }
  ];
}

module.exports = router;
