// Fetch-Wrapper für API-Calls
const api = {
  async request(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      credentials: 'same-origin'
    };
    if (body !== undefined) opts.body = JSON.stringify(body);

    const res = await fetch(url, opts);
    const data = res.headers.get('content-type')?.includes('application/json')
      ? await res.json()
      : null;

    if (!res.ok) {
      if (res.status === 401) {
        window.location.href = '/login.html';
        return;
      }
      throw new Error(data?.error || `Fehler ${res.status}`);
    }
    return data;
  },

  get: (url) => api.request('GET', url),
  post: (url, body) => api.request('POST', url, body),
  put: (url, body) => api.request('PUT', url, body),
  delete: (url) => api.request('DELETE', url),
};

// Globaler Session-State
let currentUser = null;

async function loadCurrentUser() {
  try {
    currentUser = await api.get('/api/auth/me');
    return currentUser;
  } catch {
    window.location.href = '/login.html';
  }
}

// Hilfsfunktionen
function showAlert(container, message, type = 'error') {
  const div = document.createElement('div');
  div.className = `alert alert-${type}`;
  div.textContent = message;
  container.prepend(div);
  setTimeout(() => div.remove(), 5000);
}

function isoToDE(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}.${y}`;
}

function getISOWeek(d) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date - week1) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function getMondayOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatWeekLabel(monday) {
  const sunday = addDays(monday, 6);
  const kw = getISOWeek(monday);
  const fmtOpts = { day: '2-digit', month: '2-digit' };
  const monStr = monday.toLocaleDateString('de-DE', fmtOpts);
  const sunStr = sunday.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `KW ${kw} · ${monStr}–${sunStr}`;
}

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const WEEKDAYS_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

function timeToSlot(time) {
  const [h, m] = time.split(':').map(Number);
  return (h - 6) * 2 + Math.floor(m / 30); // Slot 0 = 06:00
}

function timeDiffSlots(start, end) {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return ((eh * 60 + em) - (sh * 60 + sm)) / 30;
}

// Logout
function setupLogout() {
  const btn = document.getElementById('btn-logout');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    await api.post('/api/auth/logout');
    window.location.href = '/login.html';
  });
}

// Tabs: Scroll-Indikator (Fade-Gradient rechts wenn Inhalt überläuft)
function setupTabsScroll() {
  const wrapper = document.querySelector('.tabs-wrapper');
  const tabs = document.querySelector('.admin-tabs');
  if (!wrapper || !tabs) return;

  function update() {
    const canScroll = tabs.scrollWidth > tabs.clientWidth;
    const atEnd = tabs.scrollLeft + tabs.clientWidth >= tabs.scrollWidth - 4;
    wrapper.classList.toggle('scrollable', canScroll && !atEnd);
  }

  update();
  tabs.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update, { passive: true });
}

// Hamburger-Menü
function setupHamburger() {
  const btn = document.getElementById('nav-hamburger');
  const menu = document.getElementById('nav-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = menu.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', String(isOpen));
  });

  // Schließen wenn ein Nav-Link angeklickt wird
  menu.querySelectorAll('a').forEach(a => {
    a.addEventListener('click', () => {
      menu.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    });
  });

  // Schließen bei Klick außerhalb
  document.addEventListener('click', (e) => {
    if (!btn.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove('open');
      btn.classList.remove('open');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}
