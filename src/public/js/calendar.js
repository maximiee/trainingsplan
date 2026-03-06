// ── Konstanten ──────────────────────────────────────────────
const SLOT_HEIGHT = 30; // px pro 30-Min-Slot

// Konfiguration je Modus
const VIEW_CONFIG = {
  week: {
    dayIndices: [0, 1, 2, 3, 4], // Mo–Fr
    startHour:  15,
    endHour:    23,
    label:      'Wochentage'
  },
  weekend: {
    dayIndices: [5, 6],           // Sa–So
    startHour:  10,
    endHour:    23,
    label:      'Wochenende'
  }
};

function getConfig() { return VIEW_CONFIG[viewMode]; }
function totalSlots() { const c = getConfig(); return (c.endHour - c.startHour) * 2; }
function totalHeight() { return SLOT_HEIGHT * totalSlots(); }

// ── Zustand ─────────────────────────────────────────────────
let currentMonday   = getMondayOfWeek(new Date());
let currentSeasonId = null;
let pitches         = [];
let seasons         = [];
let userRole        = 'trainer';
let userTeamIds     = [];
let viewMode        = 'week'; // 'week' | 'weekend'

// ── Init ─────────────────────────────────────────────────────
async function init() {
  const user = await loadCurrentUser();
  userRole    = user.role;
  userTeamIds = (user.teams || []).map(t => t.id);
  updateNavUser(user);
  setupLogout();

  const params = new URLSearchParams(window.location.search);
  if (params.has('week')) currentMonday = parseWeekParam(params.get('week'));

  [pitches, seasons] = await Promise.all([
    api.get('/api/pitches'),
    api.get('/api/seasons')
  ]);

  populateSeasonSelect();

  const active = seasons.find(s => s.is_active);
  if (active) currentSeasonId = active.id;
  else if (seasons.length > 0) currentSeasonId = seasons[0].id;

  if (params.has('season_id')) currentSeasonId = parseInt(params.get('season_id'));

  const sel = document.getElementById('season-select');
  if (sel && currentSeasonId) sel.value = currentSeasonId;

  if (params.has('mode') && VIEW_CONFIG[params.get('mode')]) {
    viewMode = params.get('mode');
  }

  setupControls();
  updateModeButtons();
  await renderWeek();
}

function updateNavUser(user) {
  const el = document.getElementById('nav-user');
  if (el) el.textContent = user.name;
  const trainerLink = document.getElementById('nav-trainer');
  if (trainerLink) trainerLink.style.display = user.role === 'trainer' ? '' : 'none';
  const adminLink = document.getElementById('nav-admin');
  if (adminLink) adminLink.style.display = user.role === 'admin' ? '' : 'none';
  const newBtn = document.getElementById('btn-new-session');
  if (newBtn) newBtn.style.display = '';
}

function populateSeasonSelect() {
  const sel = document.getElementById('season-select');
  if (!sel) return;
  sel.innerHTML = seasons.map(s =>
    `<option value="${s.id}">${s.name}${s.is_active ? ' ✓' : ''}</option>`
  ).join('');
}

function updateModeButtons() {
  document.getElementById('btn-mode-week')?.classList.toggle('active', viewMode === 'week');
  document.getElementById('btn-mode-weekend')?.classList.toggle('active', viewMode === 'weekend');
}

function setupControls() {
  document.getElementById('btn-mode-week')?.addEventListener('click', () => {
    viewMode = 'week'; updateModeButtons(); renderWeek();
  });
  document.getElementById('btn-mode-weekend')?.addEventListener('click', () => {
    viewMode = 'weekend'; updateModeButtons(); renderWeek();
  });

  document.getElementById('btn-prev')?.addEventListener('click', () => navigate(-7));
  document.getElementById('btn-next')?.addEventListener('click', () => navigate(7));
  document.getElementById('btn-today')?.addEventListener('click', () => {
    currentMonday = getMondayOfWeek(new Date());
    renderWeek();
  });
  document.getElementById('season-select')?.addEventListener('change', e => {
    currentSeasonId = parseInt(e.target.value);
    renderWeek();
  });
  document.getElementById('btn-export-pdf')?.addEventListener('click', () => {
    window.open(`/api/export/pdf?week=${weekParam()}&season_id=${currentSeasonId}`, '_blank');
  });
  document.getElementById('btn-export-excel-week')?.addEventListener('click', () => {
    window.open(`/api/export/excel?mode=week&week=${weekParam()}&season_id=${currentSeasonId}`, '_blank');
  });
  document.getElementById('btn-export-excel-season')?.addEventListener('click', () => {
    window.open(`/api/export/excel?mode=season&season_id=${currentSeasonId}`, '_blank');
  });
  document.getElementById('btn-new-session')?.addEventListener('click', () => openCalSessionModal());
  document.getElementById('cal-session-cancel')?.addEventListener('click', () => {
    document.getElementById('cal-session-modal').classList.add('hidden');
  });
  document.getElementById('btn-profile')?.addEventListener('click', openProfileModal);
  document.getElementById('profile-modal-close')?.addEventListener('click', () => {
    document.getElementById('profile-modal').classList.add('hidden');
  });
}

function navigate(days) {
  currentMonday = addDays(currentMonday, days);
  renderWeek();
}

// ── Woche rendern ─────────────────────────────────────────────
async function renderWeek() {
  // URL-Param aktualisieren
  const url = new URL(window.location);
  url.searchParams.set('week', weekParam());
  if (currentSeasonId) url.searchParams.set('season_id', currentSeasonId);
  window.history.replaceState({}, '', url);

  const label = document.getElementById('week-label');
  if (label) label.textContent = formatWeekLabel(currentMonday);

  if (!currentSeasonId) {
    const c = document.getElementById('calendar-container');
    if (c) c.innerHTML = `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);gap:16px">
        <span>Noch keine Saison angelegt.</span>
        <a href="/admin.html#seasons" class="btn btn-primary">Saison erstellen</a>
      </div>`;
    return;
  }

  const cfg        = getConfig();
  const rangeStart = toISO(addDays(currentMonday, cfg.dayIndices[0]));
  const rangeEnd   = toISO(addDays(currentMonday, cfg.dayIndices[cfg.dayIndices.length - 1]));

  const [sessions, matches] = await Promise.all([
    api.get(`/api/sessions?start=${rangeStart}&end=${rangeEnd}&season_id=${currentSeasonId}`),
    api.get(`/api/matches?season_id=${currentSeasonId}`)
  ]);

  const weekMatches = matches.filter(m => m.date >= rangeStart && m.date <= rangeEnd);

  buildCalendarGrid(sessions, weekMatches);
  renderMatchesBar(weekMatches);
  renderLegend(sessions);
}

// ── Kalender-Grid aufbauen ────────────────────────────────────
function buildCalendarGrid(sessions, matches = []) {
  const container = document.getElementById('calendar-container');
  if (!container) return;
  container.innerHTML = '';

  const cfg        = getConfig();
  const TSLOTS     = totalSlots();
  const THEIGHT    = totalHeight();
  const pitchCount = pitches.length;
  const colCount   = cfg.dayIndices.length * pitchCount;
  const colTemplate = `repeat(${colCount}, 1fr)`;

  const today = toISO(new Date());

  // ── Kopfzeile: Wochentage ──
  const head = document.createElement('div');
  head.className = 'cal-head';

  const gutter1 = document.createElement('div');
  gutter1.className = 'cal-time-gutter';
  head.appendChild(gutter1);

  const daysHead = document.createElement('div');
  daysHead.className = 'cal-days-head';
  daysHead.style.gridTemplateColumns = colTemplate;
  daysHead.style.display = 'grid';
  daysHead.style.flex = '1';

  for (const d of cfg.dayIndices) {
    const day = addDays(currentMonday, d);
    const iso = toISO(day);
    const isToday = iso === today;
    const el = document.createElement('div');
    el.className = 'cal-day-label' + (isToday ? ' today' : '');
    el.style.gridColumn = `span ${pitchCount}`;
    el.innerHTML = `<strong>${WEEKDAYS_LONG[d]}</strong>&nbsp;<span style="font-weight:400;font-size:11px">${day.toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'})}</span>`;
    daysHead.appendChild(el);
  }
  head.appendChild(daysHead);
  container.appendChild(head);

  // ── Sub-Kopfzeile: Platz-Namen ──
  const subHead = document.createElement('div');
  subHead.className = 'cal-subhead';

  const gutter2 = document.createElement('div');
  gutter2.className = 'cal-time-gutter';
  subHead.appendChild(gutter2);

  const pitchLabels = document.createElement('div');
  pitchLabels.className = 'cal-pitch-labels';
  pitchLabels.style.gridTemplateColumns = colTemplate;
  pitchLabels.style.display = 'grid';
  pitchLabels.style.flex = '1';

  for (const d of cfg.dayIndices) {
    for (const pitch of pitches) {
      const el = document.createElement('div');
      el.className = 'cal-pitch-label';
      el.textContent = pitch.name;
      pitchLabels.appendChild(el);
    }
  }
  subHead.appendChild(pitchLabels);
  container.appendChild(subHead);

  // ── Scrollbarer Körper ──
  const bodyScroll = document.createElement('div');
  bodyScroll.className = 'cal-body-scroll';

  const bodyInner = document.createElement('div');
  bodyInner.className = 'cal-body-inner';
  bodyInner.style.height = `${THEIGHT}px`;

  // Zeitspalte
  const timeCol = document.createElement('div');
  timeCol.className = 'cal-time-col';
  timeCol.style.height = `${THEIGHT}px`;

  for (let slot = 0; slot < TSLOTS; slot++) {
    if (slot % 2 === 0) {
      const h = cfg.startHour + slot / 2;
      const tick = document.createElement('div');
      tick.className = 'cal-time-tick';
      tick.style.top = `${slot * SLOT_HEIGHT}px`;
      tick.textContent = `${String(h).padStart(2,'0')}:00`;
      timeCol.appendChild(tick);
    }
  }
  bodyInner.appendChild(timeCol);

  // Spalten-Grid (Tage × N Plätze)
  const colsGrid = document.createElement('div');
  colsGrid.className = 'cal-pitch-cols';
  colsGrid.style.gridTemplateColumns = colTemplate;
  colsGrid.style.height = `${THEIGHT}px`;

  for (const d of cfg.dayIndices) {
    const day = addDays(currentMonday, d);
    const iso = toISO(day);
    const daySessions = sessions.filter(s => s.date === iso);

    for (let pi = 0; pi < pitches.length; pi++) {
      const pitch = pitches[pi];
      const col = document.createElement('div');
      col.className = 'cal-pitch-col' + (pi === 0 ? ' day-start' : '');
      col.style.height = `${THEIGHT}px`;

      // Gitterlinien
      for (let slot = 0; slot < TSLOTS; slot++) {
        const line = document.createElement('div');
        line.className = `cal-grid-line ${slot % 2 === 0 ? 'hour' : 'half'}`;
        line.style.top = `${slot * SLOT_HEIGHT}px`;
        col.appendChild(line);
      }

      // Trainingsblöcke für diesen Tag + Platz
      const colSessions = daySessions.filter(s => s.pitch_id === pitch.id);
      for (const s of colSessions) {
        const block = createBlock(s, colSessions, cfg.startHour);
        if (block) col.appendChild(block);
      }

      // Spiel-Blöcke für diesen Tag + Platz
      const colMatches = matches.filter(m => m.date === iso && m.pitch_id === pitch.id && m.time);
      for (const m of colMatches) {
        const block = createMatchBlock(m, cfg.startHour);
        if (block) col.appendChild(block);
      }

      colsGrid.appendChild(col);
    }
  }

  bodyInner.appendChild(colsGrid);
  bodyScroll.appendChild(bodyInner);
  container.appendChild(bodyScroll);

}

// ── Trainingsblock erstellen ──────────────────────────────────
function createBlock(session, colSessions, startHour) {
  const startSlot = timeToSlot(session.start_time, startHour);
  const spans     = timeDiffSlots(session.start_time, session.end_time);
  if (spans <= 0 || startSlot < 0 || startSlot >= totalSlots()) return null;

  // Parallele Sessions auf demselben Platz → Breite aufteilen
  const concurrent = colSessions.filter(o =>
    o.id !== session.id &&
    o.start_time < session.end_time &&
    o.end_time   > session.start_time
  );
  const group      = [session, ...concurrent].sort((a, b) => a.id - b.id);
  const groupSize  = group.length;
  const groupIndex = group.findIndex(x => x.id === session.id);

  const block = document.createElement('div');
  block.className = 'training-block';
  if (session.type === 'spiel')   block.classList.add('type-spiel');
  if (session.type === 'turnier') block.classList.add('type-turnier');
  if (session.is_cancelled) {
    block.classList.add('cancelled');
  } else if (userTeamIds.some(id => session.teams?.some(t => t.id === id))) {
    block.classList.add('own-team');
  } else if (userTeamIds.length > 0) {
    block.classList.add('other-team');
  }

  const teamColor = session.teams?.[0]?.color || '#3498db';
  block.style.background = teamColor;
  block.style.color = isLight(teamColor) ? '#1a1a2e' : '#ffffff';

  block.style.top    = `${startSlot * SLOT_HEIGHT + 1}px`;
  block.style.height = `${spans * SLOT_HEIGHT - 3}px`;
  block.style.left   = `${(groupIndex / groupSize) * 100}%`;
  block.style.right  = `${((groupSize - groupIndex - 1) / groupSize) * 100}%`;

  const teamNames = session.teams?.map(t => t.name).join(' + ') || '–';
  const typeLabel = session.type !== 'training' ? ` · ${session.type}` : '';
  block.innerHTML = `
    <span class="block-name">${teamNames}${typeLabel}</span>
    <span class="block-time">${session.start_time}–${session.end_time}</span>
  `;

  block.addEventListener('click', e => {
    e.stopPropagation();
    showSessionPopup(session, e);
  });

  return block;
}

// ── Spiel-Block erstellen ─────────────────────────────────────
function createMatchBlock(match, startHour) {
  const startSlot = timeToSlot(match.time, startHour);
  if (startSlot < 0 || startSlot >= totalSlots()) return null;
  const spans = 3; // 90 Minuten

  const block = document.createElement('div');
  block.className = 'match-block';
  block.style.top    = `${startSlot * SLOT_HEIGHT + 1}px`;
  block.style.height = `${Math.min(spans, totalSlots() - startSlot) * SLOT_HEIGHT - 3}px`;
  block.innerHTML = `
    <span class="block-name">🏆 ${match.team_name} vs. ${match.opponent || '?'}</span>
    <span class="block-time">${match.time} Uhr${match.half_pitch ? ' · ½ Platz' : ''}</span>
  `;
  block.addEventListener('click', e => { e.stopPropagation(); showMatchPopup(match, e); });
  return block;
}

// ── Match-Popup ───────────────────────────────────────────────
function showMatchPopup(match, event) {
  document.querySelector('.session-popup')?.remove();

  const popup = document.createElement('div');
  popup.className = 'session-popup';
  popup.innerHTML = `
    <button class="btn-close-popup">×</button>
    <h4>🏆 ${match.team_name} vs. ${match.opponent || '?'}</h4>
    <div class="popup-row"><span class="popup-label">Datum</span><span>${isoToDE(match.date)}</span></div>
    <div class="popup-row"><span class="popup-label">Anstoß</span><span>${match.time ? match.time + ' Uhr' : '–'}</span></div>
    <div class="popup-row"><span class="popup-label">Platz</span><span>${match.pitch_name || '–'}${match.half_pitch ? ' (halber Platz)' : ''}</span></div>
  `;
  popup.querySelector('.btn-close-popup').addEventListener('click', () => popup.remove());
  document.body.appendChild(popup);

  const x = Math.min(event.clientX + 10, window.innerWidth  - 290);
  const y = Math.min(event.clientY + 10, window.innerHeight - 160);
  popup.style.left = `${x}px`;
  popup.style.top  = `${y}px`;
  setTimeout(() => document.addEventListener('click', () => popup.remove(), { once: true }), 50);
}

// ── Session-Popup ─────────────────────────────────────────────
function showSessionPopup(session, event) {
  document.querySelector('.session-popup')?.remove();

  const popup = document.createElement('div');
  popup.className = 'session-popup';

  const teamNames = session.teams?.map(t => t.name).join(', ') || '–';
  popup.innerHTML = `
    <button class="btn-close-popup">×</button>
    <h4>${teamNames}</h4>
    <div class="popup-row"><span class="popup-label">Datum</span><span>${isoToDE(session.date)}</span></div>
    <div class="popup-row"><span class="popup-label">Zeit</span><span>${session.start_time}–${session.end_time} Uhr</span></div>
    <div class="popup-row"><span class="popup-label">Platz</span><span>${session.pitch_name}</span></div>
    <div class="popup-row"><span class="popup-label">Typ</span><span>${session.type}</span></div>
    ${session.note ? `<div class="popup-row"><span class="popup-label">Notiz</span><span>${session.note}</span></div>` : ''}
    ${session.is_cancelled ? '<div style="color:var(--danger);margin-top:6px;font-size:12px">⚫ Abgesagt</div>' : ''}
    <div class="popup-actions">
      <button class="btn btn-sm btn-danger" data-del="${session.id}">Löschen</button>
      ${session.is_cancelled ? '' : `<button class="btn btn-sm btn-warning" data-cancel="${session.id}">Absagen</button>`}
    </div>
  `;

  popup.querySelector('.btn-close-popup').addEventListener('click', () => popup.remove());

  popup.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!confirm('Einheit wirklich löschen?')) return;
    await api.delete(`/api/sessions/${session.id}`);
    popup.remove();
    renderWeek();
  });
  popup.querySelector('[data-cancel]')?.addEventListener('click', async () => {
    await api.put(`/api/sessions/${session.id}`, { is_cancelled: 1 });
    popup.remove();
    renderWeek();
  });

  document.body.appendChild(popup);

  // Popup positionieren
  const x = Math.min(event.clientX + 10, window.innerWidth  - 290);
  const y = Math.min(event.clientY + 10, window.innerHeight - 220);
  popup.style.left = `${x}px`;
  popup.style.top  = `${y}px`;

  setTimeout(() => document.addEventListener('click', () => popup.remove(), { once: true }), 50);
}

// ── Spiele-Leiste ─────────────────────────────────────────────
function renderMatchesBar(matches) {
  const bar  = document.getElementById('matches-bar');
  const list = document.getElementById('matches-list');
  if (!bar || !list) return;

  if (matches.length === 0) { bar.style.display = 'none'; return; }
  bar.style.display = '';
  list.innerHTML = '';

  for (const m of matches) {
    const d = new Date(m.date);
    const wi = (d.getDay() + 6) % 7;
    const isHeim = m.location === 'heim';
    const chip = document.createElement('span');
    chip.className = 'match-chip';
    chip.innerHTML = `
      <span class="chip-dot" style="background:${m.team_color}"></span>
      ${isHeim ? '🏠' : '✈️'}&nbsp;<strong>${m.team_name}</strong>&nbsp;vs.&nbsp;${m.opponent || '?'}
      &nbsp;·&nbsp;${WEEKDAYS[wi]}.&nbsp;${m.time ? m.time + ' Uhr' : ''}
    `;
    list.appendChild(chip);
  }
}

// ── Legende ───────────────────────────────────────────────────
function renderLegend(sessions) {
  const container = document.getElementById('legend');
  if (!container) return;

  const teamsMap = new Map();
  for (const s of sessions) {
    for (const t of (s.teams || [])) teamsMap.set(t.id, t);
  }

  container.innerHTML = '<span style="font-size:11px;color:var(--text-muted);font-weight:600;margin-right:4px">Legende:</span>';
  for (const team of teamsMap.values()) {
    const item = document.createElement('div');
    item.className = 'legend-item' + (userTeamIds.includes(team.id) ? ' own-team' : '');
    item.innerHTML = `<span class="legend-swatch" style="background:${team.color}"></span>${team.name}`;
    container.appendChild(item);
  }
}

// ── Hilfsfunktionen ───────────────────────────────────────────
function timeToSlot(time, startHour) {
  const [h, m] = time.split(':').map(Number);
  return (h - (startHour ?? getConfig().startHour)) * 2 + Math.floor(m / 30);
}

function timeDiffSlots(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 30;
}

function isLight(hex) {
  const c = hex.replace('#', '');
  const r = parseInt(c.substr(0,2),16);
  const g = parseInt(c.substr(2,2),16);
  const b = parseInt(c.substr(4,2),16);
  return (r*299 + g*587 + b*114) / 1000 > 155;
}

function weekParam() {
  const kw = getISOWeek(currentMonday);
  return `${currentMonday.getFullYear()}-W${String(kw).padStart(2,'0')}`;
}

function parseWeekParam(str) {
  if (str.includes('-W')) {
    const [year, wk] = str.split('-W');
    const jan4 = new Date(parseInt(year), 0, 4);
    const day  = jan4.getDay() || 7;
    const mon  = new Date(jan4);
    mon.setDate(jan4.getDate() - day + 1 + (parseInt(wk) - 1) * 7);
    mon.setHours(0,0,0,0);
    return mon;
  }
  return getMondayOfWeek(new Date(str));
}

// ── Einheit anlegen Modal ─────────────────────────────────────
function openCalSessionModal() {
  const modal = document.getElementById('cal-session-modal');
  const form  = document.getElementById('cal-session-form');
  if (!modal || !form) return;

  // Platz-Select befüllen
  const pitchSel = form.querySelector('[name=pitch_id]');
  pitchSel.innerHTML = pitches.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

  // Zeitslots befüllen
  ['start_time', 'end_time'].forEach(field => {
    const sel = form.querySelector(`[name=${field}]`);
    sel.innerHTML = '';
    for (let h = 6; h <= 23; h++) {
      for (let m = 0; m < 60; m += 30) {
        const val = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
        sel.innerHTML += `<option value="${val}">${val}</option>`;
      }
    }
    if (field === 'start_time') sel.value = '17:00';
    if (field === 'end_time')   sel.value = '18:30';
  });

  // Teams-Checkboxen
  const teamBox = document.getElementById('cal-teams-checks');
  api.get('/api/teams').then(allTeams => {
    teamBox.innerHTML = allTeams.filter(t => t.is_active).map(t => `
      <label class="checkbox-item">
        <input type="checkbox" name="teamIds" value="${t.id}" ${userTeamIds.includes(t.id) ? 'checked' : ''}>
        <span class="color-dot" style="background:${t.color}"></span>${t.name}
      </label>`).join('');
  });

  // Wochentag auf aktuellen Wochentag vorbelegen
  const wd = new Date().getDay();
  form.querySelector('[name=weekday]').value = wd === 0 ? 6 : wd - 1;

  // Saison-Enddatum als Standard für valid_until
  const activeSeason = seasons.find(s => s.is_active) || seasons[0];
  if (activeSeason) form.querySelector('[name=valid_until]').value = activeSeason.end_date;

  form.onsubmit = async (e) => {
    e.preventDefault();
    const teamIds = [...form.querySelectorAll('[name=teamIds]:checked')].map(el => parseInt(el.value));
    const data = {
      season_id:   currentSeasonId,
      pitch_id:    parseInt(form.querySelector('[name=pitch_id]').value),
      date:        toISO(addDays(currentMonday, parseInt(form.querySelector('[name=weekday]').value))),
      start_time:  form.querySelector('[name=start_time]').value,
      end_time:    form.querySelector('[name=end_time]').value,
      type:        'training',
      teamIds,
      recurring:   true,
      weekday:     parseInt(form.querySelector('[name=weekday]').value),
      valid_until: form.querySelector('[name=valid_until]').value
    };
    try {
      await api.post('/api/sessions', data);
      modal.classList.add('hidden');
      renderWeek();
    } catch (err) {
      alert(err.message);
    }
  };

  modal.classList.remove('hidden');
}

// ── Profil Modal ──────────────────────────────────────────────
async function openProfileModal() {
  const modal = document.getElementById('profile-modal');
  if (!modal) return;

  // Teams nur anzeigen
  const teamBox = document.getElementById('profile-teams-checks');
  const myTeams = (await api.get('/api/auth/me')).teams || [];
  teamBox.innerHTML = myTeams.length
    ? myTeams.map(t => `
        <span style="display:flex;align-items:center;gap:5px;font-size:13px;padding:3px 8px;border:1px solid #dde1e7;border-radius:6px;background:#f8f9fa">
          <span style="width:10px;height:10px;border-radius:50%;background:${t.color};display:inline-block"></span>${t.name}
        </span>`).join('')
    : '<span style="color:var(--text-muted);font-size:13px">Keine Mannschaft zugeordnet</span>';
  document.getElementById('btn-save-teams').style.display = 'none';
  document.getElementById('profile-teams-msg').textContent = 'Mannschaften können nur vom Admin geändert werden.';

  // Passwort-Formular
  const pwForm = document.getElementById('profile-pw-form');
  pwForm.onsubmit = async (e) => {
    e.preventDefault();
    const msg = document.getElementById('profile-pw-msg');
    try {
      await api.post('/api/auth/change-password', {
        currentPassword: pwForm.querySelector('[name=currentPassword]').value,
        newPassword:     pwForm.querySelector('[name=newPassword]').value
      });
      pwForm.reset();
      msg.textContent = '✓ Passwort geändert';
      msg.style.color = 'var(--success)';
    } catch (err) {
      msg.textContent = err.message;
      msg.style.color = 'var(--danger)';
    }
  };

  modal.classList.remove('hidden');
}

document.addEventListener('DOMContentLoaded', init);
