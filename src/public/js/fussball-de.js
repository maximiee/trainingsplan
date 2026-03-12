// fussball.de Spiele-Import – gemeinsam für Admin und Trainer
let _fdGames = [];
let _fdAppTeamId = null;
let _fdPitches = [];
let _fdImportIdx = null;

// Import-Bestätigungs-Modal einmalig in den DOM injizieren
(function injectFdImportModal() {
  if (document.getElementById('fd-import-modal')) return;
  const tpl = `
<div class="modal-overlay hidden" id="fd-import-modal">
  <div class="modal" style="max-width:420px">
    <h2 class="modal-title">Spiel eintragen</h2>
    <p id="fd-import-info" style="margin-bottom:16px;font-weight:500"></p>
    <div class="form-group">
      <label>Heim / Auswärts</label>
      <select id="fd-import-location" class="form-control">
        <option value="heim">Heimspiel</option>
        <option value="auswaerts">Auswärtsspiel</option>
      </select>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label>Platz</label>
      <select id="fd-import-pitch" class="form-control"></select>
    </div>
    <div class="modal-footer" style="margin-top:16px">
      <button type="button" class="btn btn-secondary" onclick="closeFdImportModal()">Abbrechen</button>
      <button type="button" class="btn btn-primary" onclick="confirmFdImport()">Eintragen</button>
    </div>
  </div>
</div>`;
  document.body.insertAdjacentHTML('beforeend', tpl);
})();

function closeFdModal() {
  document.getElementById('fd-modal').classList.add('hidden');
}

window.closeFdImportModal = () => {
  document.getElementById('fd-import-modal').classList.add('hidden');
};

window.openFdGamesModal = async (appTeamId, fussballDeId) => {
  _fdAppTeamId = appTeamId;
  _fdGames = [];

  const modal = document.getElementById('fd-modal');
  const body = document.getElementById('fd-modal-body');
  modal.classList.remove('hidden');
  body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:24px">Lade Spiele…</p>';

  try {
    const [data, pitches] = await Promise.all([
      api.get(`/api/fussball-de/games/${encodeURIComponent(fussballDeId)}`),
      _fdPitches.length ? Promise.resolve(_fdPitches) : api.get('/api/pitches')
    ]);
    _fdPitches = pitches;
    renderFdGames(data, appTeamId);
  } catch (err) {
    body.innerHTML = `<p style="color:var(--danger);padding:16px">${err.message}</p>`;
  }
};

function parseFdDate(dateStr) {
  if (!dateStr) return '';
  const m = dateStr.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) return dateStr.substring(0, 10);
  return '';
}

function parseFdTime(timeStr) {
  if (!timeStr) return '';
  const m = timeStr.match(/(\d{2}:\d{2})/);
  return m ? m[1] : '';
}

function renderFdGames(data, appTeamId) {
  const body = document.getElementById('fd-modal-body');
  const allGames = [
    ...(data.next || []).map(g => ({ ...g, _type: 'next' })),
    ...(data.prev || []).map(g => ({ ...g, _type: 'prev' }))
  ];

  if (allGames.length === 0) {
    body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:24px">Keine Spiele gefunden.</p>';
    return;
  }

  allGames.sort((a, b) => {
    const da = parseFdDate(a.date), db = parseFdDate(b.date);
    return da < db ? -1 : da > db ? 1 : 0;
  });

  _fdGames = allGames;

  const rows = allGames.map((g, i) => {
    const dateISO = parseFdDate(g.date);
    const dateDE = dateISO ? dateISO.split('-').reverse().join('.') : (g.date || '–');
    const time = parseFdTime(g.time);
    const isPast = g._type === 'prev';
    const result = g.result || '';
    const begegnung = (g.homeTeam && g.awayTeam)
      ? `${g.homeTeam} – ${g.awayTeam}`
      : (g.competition || '–');
    const aktion = isPast
      ? `<span style="font-weight:600;color:var(--text-muted)">${result || '–'}</span>`
      : `<button id="fd-btn-${i}" class="btn btn-sm btn-primary" onclick="importFdGame(${i})">Eintragen</button>`;

    return `<tr style="${isPast ? 'opacity:0.65' : ''}">
      <td>${dateDE}</td>
      <td>${time || '–'}</td>
      <td style="max-width:240px">${begegnung}</td>
      <td>${aktion}</td>
    </tr>`;
  });

  body.innerHTML = `
    <div style="overflow-x:auto">
      <table style="width:100%;font-size:14px">
        <thead><tr>
          <th style="width:90px">Datum</th>
          <th style="width:60px">Zeit</th>
          <th>Begegnung</th>
          <th style="width:110px"></th>
        </tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
    </div>`;
}

window.importFdGame = (idx) => {
  const g = _fdGames[idx];
  if (!g) return;

  _fdImportIdx = idx;

  const dateISO = parseFdDate(g.date);
  const dateDE = dateISO ? dateISO.split('-').reverse().join('.') : (g.date || '');
  const time = parseFdTime(g.time);
  const begegnung = (g.homeTeam && g.awayTeam)
    ? `${g.homeTeam} – ${g.awayTeam}`
    : (g.competition || '');

  document.getElementById('fd-import-info').textContent =
    `${dateDE}${time ? ' · ' + time : ''} · ${begegnung}`;

  // Platz-Dropdown befüllen
  const pitchSel = document.getElementById('fd-import-pitch');
  pitchSel.innerHTML = '<option value="">– kein Platz –</option>';
  for (const p of _fdPitches) {
    pitchSel.innerHTML += `<option value="${p.id}">${p.location_name ? p.location_name + ' – ' : ''}${p.name}</option>`;
  }

  // Standard Heim/Auswärts vorauswählen anhand Teamname
  const locationSel = document.getElementById('fd-import-location');
  if (g.homeTeam && g.awayTeam) {
    locationSel.value = 'heim'; // Nutzer wählt selbst
  }

  document.getElementById('fd-import-modal').classList.remove('hidden');
};

window.confirmFdImport = async () => {
  const idx = _fdImportIdx;
  const g = _fdGames[idx];
  if (!g) return;

  const dateISO = parseFdDate(g.date);
  const time = parseFdTime(g.time);
  const location = document.getElementById('fd-import-location').value;
  const pitchId = document.getElementById('fd-import-pitch').value || null;

  let opponent = '';
  if (g.homeTeam && g.awayTeam) {
    opponent = location === 'heim' ? g.awayTeam : g.homeTeam;
  } else {
    opponent = g.competition || '';
  }

  const confirmBtn = document.querySelector('#fd-import-modal .btn-primary');
  confirmBtn.disabled = true;
  confirmBtn.textContent = '…';

  try {
    await api.post('/api/matches', {
      team_id: _fdAppTeamId,
      date: dateISO,
      time: time || null,
      opponent: opponent || null,
      location,
      pitch_id: pitchId ? parseInt(pitchId) : null
    });

    document.getElementById('fd-import-modal').classList.add('hidden');

    const btn = document.getElementById(`fd-btn-${idx}`);
    if (btn) {
      btn.textContent = '✓ Eingetragen';
      btn.className = 'btn btn-sm btn-secondary';
      btn.disabled = true;
    }
  } catch (err) {
    alert('Fehler: ' + err.message);
  } finally {
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Eintragen';
  }
};
