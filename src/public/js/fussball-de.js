// fussball.de Spiele-Import – gemeinsam für Admin und Trainer
let _fdGames = [];
let _fdAppTeamId = null;

function closeFdModal() {
  document.getElementById('fd-modal').classList.add('hidden');
}

window.openFdGamesModal = async (appTeamId, fussballDeId) => {
  _fdAppTeamId = appTeamId;
  _fdGames = [];

  const modal = document.getElementById('fd-modal');
  const body = document.getElementById('fd-modal-body');
  modal.classList.remove('hidden');
  body.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:24px">Lade Spiele…</p>';

  try {
    const data = await api.get(`/api/fussball-de/games/${encodeURIComponent(fussballDeId)}`);
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

window.importFdGame = async (idx) => {
  const g = _fdGames[idx];
  if (!g) return;

  const dateISO = parseFdDate(g.date);
  const time = parseFdTime(g.time);

  let location = 'heim';
  let opponent = '';

  if (g.homeTeam && g.awayTeam) {
    const isHeim = confirm(
      `${g.homeTeam} vs. ${g.awayTeam}\n\nIst das ein HEIM-Spiel?\n→ OK = Heim\n→ Abbrechen = Auswärts`
    );
    location = isHeim ? 'heim' : 'auswaerts';
    opponent = isHeim ? g.awayTeam : g.homeTeam;
  } else {
    opponent = g.competition || '';
  }

  const btn = document.getElementById(`fd-btn-${idx}`);
  if (btn) { btn.disabled = true; btn.textContent = '…'; }

  try {
    await api.post('/api/matches', {
      team_id: _fdAppTeamId,
      date: dateISO,
      time: time || null,
      opponent: opponent || null,
      location
    });
    if (btn) {
      btn.textContent = '✓ Eingetragen';
      btn.className = 'btn btn-sm btn-secondary';
    }
  } catch (err) {
    alert('Fehler: ' + err.message);
    if (btn) { btn.disabled = false; btn.textContent = 'Eintragen'; }
  }
};
