'use strict';

/* ============================================================
   Full Moon Festival Lineup App
   Depends on LINEUP_DATA global from data/lineup.js
   ============================================================ */

const STAGE_COLOURS = {
  'Outdoor Main Stage': '#2AFF00',
  'Bunka':             '#FF3D6B',
  'Groove2Funk':       '#FF7A00',
  'ReVival':           '#AA55FF',
  'Hot Wax':           '#FFD100',
  'Volume':            '#20A5FF',
  'RoomTour':          '#FF4488',
  'The Pub':           '#6EF9F5'
};

const DEFAULT_COLOUR = '#888888';

let currentView = 'lineup';
let currentDay  = 'Friday';
let timelineTimer = null;

/* ── Reminders (localStorage) ─────────────────────────────── */

const REMINDERS = new Set(JSON.parse(localStorage.getItem('fmf_reminders') || '[]'));

function reminderKey(act) {
  return `${act.name}|${act.day}|${act.start}`;
}

function saveReminders() {
  localStorage.setItem('fmf_reminders', JSON.stringify([...REMINDERS]));
}

const MONTH_MAP = {
  January:'01', February:'02', March:'03', April:'04',
  May:'05', June:'06', July:'07', August:'08', September:'09',
  October:'10', November:'11', December:'12'
};

function buildICS(act) {
  const [d, m, y] = LINEUP_DATA.dates[act.day].split(' ');
  const dateBase = `${y}${MONTH_MAP[m]}${String(d).padStart(2, '0')}`;
  const dtStart  = `${dateBase}T${act.start.replace(':', '')}00`;

  let dtEnd;
  if (act.end < act.start) {
    const next = new Date(parseInt(y), Object.keys(MONTH_MAP).indexOf(m), parseInt(d) + 1);
    dtEnd = `${next.getFullYear()}${String(next.getMonth()+1).padStart(2,'0')}${String(next.getDate()).padStart(2,'0')}T${act.end.replace(':','') }00`;
  } else {
    dtEnd = `${dateBase}T${act.end.replace(':', '')}00`;
  }

  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${act.name} @ ${act.stage}`,
    'LOCATION:Ross Hill Farm, Richmond Hill, Douglas, Isle of Man',
    'DESCRIPTION:Full Moon Festival 2026',
    `UID:${act.name.replace(/\W+/g, '-')}-${dtStart}@fmf2026`,
    'BEGIN:VALARM', 'TRIGGER:-PT15M', 'ACTION:DISPLAY',
    'DESCRIPTION:Starting in 15 minutes', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR'
  ].join('\r\n');
}

function handleBell(btn) {
  const act = {
    name:  btn.dataset.name,
    stage: btn.dataset.stage,
    day:   btn.dataset.day,
    start: btn.dataset.start,
    end:   btn.dataset.end
  };
  const key = reminderKey(act);

  if (REMINDERS.has(key)) {
    REMINDERS.delete(key);
    btn.classList.remove('set');
    btn.setAttribute('aria-label', `Set reminder for ${act.name}`);
  } else {
    const ics  = buildICS(act);
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${act.name.replace(/\s+/g, '-')}.ics`;
    a.click();
    URL.revokeObjectURL(url);
    REMINDERS.add(key);
    btn.classList.add('set');
    btn.setAttribute('aria-label', `Remove reminder for ${act.name}`);
  }
  saveReminders();
}

/* ── Helpers ──────────────────────────────────────────────── */

function stageColour(stage) {
  return STAGE_COLOURS[stage] || DEFAULT_COLOUR;
}

function timeToMins(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* Initials from act name (up to 2 chars) */
function initials(name) {
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* ── Lineup View ──────────────────────────────────────────── */

function renderLineupView(day) {
  const el = document.getElementById('lineup-view');
  const acts = LINEUP_DATA.acts.filter(a => a.day === day);

  if (acts.length === 0) {
    el.innerHTML = `<div class="empty-day">No acts scheduled for ${day}</div>`;
    return;
  }

  const grouped = {};
  for (const stage of LINEUP_DATA.stages) grouped[stage] = [];
  for (const act of acts) {
    if (!grouped[act.stage]) grouped[act.stage] = [];
    grouped[act.stage].push(act);
  }
  for (const stage of Object.keys(grouped)) {
    grouped[stage].sort((a, b) => a.start.localeCompare(b.start));
  }

  const dateLabel = LINEUP_DATA.dates[day] || day;

  const nowMinsL  = new Date().getHours() * 60 + new Date().getMinutes();
  const nowAdjL   = nowMinsL < OVERNIGHT_CUTOFF ? nowMinsL + 1440 : nowMinsL;

  let html = `<div class="lineup-inner"><div class="lineup-header">Line-Up &mdash; ${dateLabel}</div>`;

  for (const stage of LINEUP_DATA.stages) {
    const list = grouped[stage];
    if (!list || list.length === 0) continue;

    const colour = stageColour(stage);
    const collapseClass = '';

    html += `
      <div class="stage-section ${collapseClass}" style="--stage-color:${colour}">
        <div class="stage-header" onclick="toggleStage(this.parentElement)">
          <div class="stage-header-left">
            <div class="stage-pip"></div>
            <span class="stage-name">${escHtml(stage)}</span>
            <span class="stage-count">${list.length}</span>
          </div>
          <span class="stage-chevron" aria-hidden="true">›</span>
        </div>
        <div class="acts-list">`;

    for (const act of list) {
      const ini     = initials(act.name);
      const past    = adjMins(act.start) < nowAdjL ? 'act-row--past' : '';
      const rKey    = reminderKey(act);
      const bellSet = REMINDERS.has(rKey) ? 'set' : '';
      html += `
          <div class="act-row ${past}">
            <div class="act-avatar" aria-hidden="true">${ini}</div>
            <div class="act-info">
              <div class="act-name">${escHtml(act.name)}</div>
              <div class="act-time">${act.start} – ${act.end}</div>
            </div>
            <span class="act-type">${escHtml(act.type)}</span>
            <button class="bell-btn ${bellSet}"
              onclick="handleBell(this)"
              data-name="${escHtml(act.name)}"
              data-stage="${escHtml(act.stage)}"
              data-day="${act.day}"
              data-start="${act.start}"
              data-end="${act.end}"
              aria-label="${bellSet ? 'Remove' : 'Set'} reminder for ${escHtml(act.name)}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
            </button>
          </div>`;
    }

    html += `</div></div>`;
  }

  html += `</div>`;
  el.innerHTML = html;
}

/* ── Timeline View ────────────────────────────────────────── */

const OVERNIGHT_CUTOFF = 6 * 60; // times before 06:00 belong to the night before

function adjMins(hhmm) {
  const m = timeToMins(hhmm);
  return m < OVERNIGHT_CUTOFF ? m + 1440 : m;
}

function renderTimelineView(day) {
  const el = document.getElementById('timeline-view');
  const acts = LINEUP_DATA.acts.filter(a => a.day === day);

  if (acts.length === 0) {
    el.innerHTML = `<div class="empty-day">No acts scheduled for ${day}</div>`;
    return;
  }

  const starts = acts.map(a => adjMins(a.start));
  const ends   = acts.map((a, i) => {
    let e = adjMins(a.end);
    return e <= starts[i] ? starts[i] + 60 : e;
  });

  const winStart    = Math.floor(Math.min(...starts) / 60) * 60;
  const winEnd      = Math.ceil(Math.max(...ends)   / 60) * 60;
  const winDuration = winEnd - winStart;
  const tickCount   = winDuration / 60;
  const tickPct     = (100 / tickCount).toFixed(4) + '%';

  // Each hour column gets at least 200px so names fit
  const MIN_TICK   = 200;
  const totalWidth = tickCount * MIN_TICK;

  // Time ruler
  let ruler = '<div class="timeline-ruler">';
  for (let i = 0; i < tickCount; i++) {
    ruler += `<div class="time-tick">${minsToTime((winStart + i * 60) % 1440)}</div>`;
  }
  ruler += '</div>';

  // Current time
  const nowRaw = new Date();
  const nowMins = nowRaw.getHours() * 60 + nowRaw.getMinutes();
  const nowAdj  = nowMins < OVERNIGHT_CUTOFF ? nowMins + 1440 : nowMins;
  const nowPct  = ((nowAdj - winStart) / winDuration) * 100;
  const showNow = nowPct >= 0 && nowPct <= 100;

  // Stage rows
  const grouped = {};
  for (const stage of LINEUP_DATA.stages) grouped[stage] = [];
  for (const act of acts) {
    if (!grouped[act.stage]) grouped[act.stage] = [];
    grouped[act.stage].push(act);
  }

  let rows = '';
  for (const stage of LINEUP_DATA.stages) {
    const list = grouped[stage];
    if (!list || list.length === 0) continue;

    const colour = stageColour(stage);

    let blocks = '';
    for (const act of list) {
      const s = adjMins(act.start);
      let e   = adjMins(act.end);
      if (e <= s) e = s + 60;

      const left  = ((s - winStart) / winDuration * 100).toFixed(3);
      const width = ((e - s)        / winDuration * 100).toFixed(3);
      const tooltip  = `${escHtml(act.name)} · ${act.start}–${act.end}`;
      const pastCls  = s < nowAdj ? 'tl-block--past' : '';
      const rKeyTl   = reminderKey(act);
      const bellSetTl = REMINDERS.has(rKeyTl) ? 'set' : '';

      blocks += `
        <div class="tl-block ${pastCls}" style="left:calc(${left}% + 2px);width:calc(${width}% - 4px);background:${colour};" data-tooltip="${tooltip}">
          <div class="tl-block-inner">
            <span class="tl-block-name">${escHtml(act.name)}</span>
            <span class="tl-block-time">${act.start}–${act.end}</span>
          </div>
          <button class="bell-btn bell-btn--block ${bellSetTl}"
            onclick="handleBell(this)"
            data-name="${escHtml(act.name)}"
            data-stage="${escHtml(act.stage)}"
            data-day="${act.day}"
            data-start="${act.start}"
            data-end="${act.end}"
            aria-label="${bellSetTl ? 'Remove' : 'Set'} reminder for ${escHtml(act.name)}">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
          </button>
        </div>`;
    }

    rows += `
      <div class="timeline-stage" style="--stage-color:${colour}">
        <div class="timeline-stage-header">
          <div class="timeline-stage-name-wrap">
            <div class="timeline-stage-pip"></div>
            <div class="timeline-stage-name">${escHtml(stage)}</div>
          </div>
        </div>
        <div class="timeline-track" style="--tick-pct:${tickPct}">
          ${blocks}
        </div>
      </div>`;
  }

  // Single now-line spanning the full height of all stages
  const nowLine = showNow
    ? `<div class="now-line" style="left:${nowPct.toFixed(3)}%"><div class="now-label">${minsToTime(nowMins)}</div></div>`
    : '';

  el.innerHTML = `
    <div class="timeline-scroll">
      <div class="timeline-inner" style="min-width:${totalWidth}px">
        ${ruler}
        <div class="timeline-stages">
          ${nowLine}
          ${rows}
        </div>
      </div>
    </div>`;

  // Refresh now-line every minute
  if (timelineTimer) clearInterval(timelineTimer);
  if (currentView === 'timeline') {
    timelineTimer = setInterval(() => {
      if (currentView === 'timeline') renderTimelineView(currentDay);
    }, 60000);
  }
}

/* ── Stage collapse (mobile) ──────────────────────────────── */

function toggleStage(section) {
  if (window.innerWidth >= 768) return;
  section.classList.toggle('collapsed');
}

/* ── View switch ──────────────────────────────────────────── */

function switchView(view) {
  if (view === currentView) return;
  currentView = view;

  document.querySelectorAll('.view-btn').forEach(btn => {
    const on = btn.dataset.view === view;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  const lineup   = document.getElementById('lineup-view');
  const timeline = document.getElementById('timeline-view');

  const [show, hide] = view === 'lineup'
    ? [lineup, timeline]
    : [timeline, lineup];

  hide.classList.remove('active', 'visible');
  hide.setAttribute('aria-hidden', 'true');
  show.classList.add('active');
  show.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    if (view === 'lineup') renderLineupView(currentDay);
    else renderTimelineView(currentDay);
    requestAnimationFrame(() => show.classList.add('visible'));
  });

  if (view !== 'timeline' && timelineTimer) {
    clearInterval(timelineTimer);
    timelineTimer = null;
  }
}

/* ── Day switch ───────────────────────────────────────────── */

function switchDay(day) {
  if (day === currentDay) return;
  currentDay = day;

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.day === day);
  });

  const view = document.getElementById(currentView + '-view');
  view.classList.remove('visible');

  setTimeout(() => {
    if (currentView === 'lineup') renderLineupView(day);
    else renderTimelineView(day);
    requestAnimationFrame(() => view.classList.add('visible'));
  }, 160);
}

/* ── Init ─────────────────────────────────────────────────── */

function initApp() {
  if (typeof LINEUP_DATA === 'undefined') {
    document.getElementById('app').innerHTML =
      '<div class="empty-day">Error: data not found. Run <code>node scripts/convert.js</code> first.</div>';
    return;
  }

  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });

  document.querySelectorAll('.day-btn').forEach(btn => {
    btn.addEventListener('click', () => switchDay(btn.dataset.day));
  });

  renderLineupView(currentDay);
  requestAnimationFrame(() => {
    document.getElementById('lineup-view').classList.add('visible');
  });
}

document.addEventListener('DOMContentLoaded', initApp);
