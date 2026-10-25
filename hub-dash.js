/* ══════════════════════════════════════════════════════════════════════
   WCIB MATHS — DEPARTMENT HUB DASHBOARD
   ----------------------------------------------------------------------
   Shared by index.html (Next 7 Days + Upcoming Exams) and calendar.html
   (School Calendar). The rendering logic below is ported from the Scheme
   of Work dashboard so the two sites stay visually and behaviourally the
   same; the CSS that goes with it lives in hub.css.

   Data sources — the same files the Scheme of Work reads:
     data/wcib_academic_key_dates_2026_27.csv   via school-calendar.js
     data/wcib_term_weeks_2026_27.csv           term, week number, cycle
     exam-dates.js (loaded from the SoW site)   Pearson external exams

   Load order on each page:
     <script src="https://wcibmaths.github.io/sow/exam-dates.js"></script>
     <script src="./school-calendar.js"></script>
     <script src="./hub-dash.js"></script>
   then call  WCIB_HUB.start('home')  or  WCIB_HUB.start('calendar').
   ══════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

var SCHOOL_CALENDAR = window.WCIB_SCHOOL_CALENDAR;
if (!SCHOOL_CALENDAR) { return; }
var esc = SCHOOL_CALENDAR.esc;

var KEY_DATES = [];
var TERM_WEEKS = [];
var PAGE = 'home';

/* How close the next Pearson paper has to be before Upcoming Exams takes a
   full card instead of folding into one line. */
var EXAM_NEAR_DAYS = 28;

function todayISO() { return SCHOOL_CALENDAR.todayISO(); }

/* ── Date helpers (ported from the SoW) ───────────────────────────── */
function parseLocalDate(year, month, day) {
  var d = new Date(Number(year), Number(month), Number(day));
  return isNaN(d.getTime()) ? null : d;
}
function parseIsoDate(raw) {
  var m = String(raw || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? parseLocalDate(m[1], Number(m[2]) - 1, m[3]) : null;
}

/* One window is published as several daily rows ("… (start)", "… (end)").
   Strip the suffix so they can be merged back into a single entry. */
var WINDOW_SUFFIX_RX = /\s*[(\[](?:start|starts|starting|begin|begins|end|ends|ending|day\s*\d+(?:\s*of\s*\d+)?)[)\]]\s*$/i;
function windowEventName(name) {
  var out = String(name || '').trim(), prev = '';
  while (out !== prev) { prev = out; out = out.replace(WINDOW_SUFFIX_RX, '').trim(); }
  return out;
}
/* The audience is shown on its own line, so drop it from the details to stop
   rows reading "Year 11 · Year 11 · M9A". */
function cleanEventDetails(details, audience) {
  var drop = String(audience || '').trim().toLowerCase();
  return String(details || '')
    .split(/\s*·\s*/)
    .filter(function (part) {
      var p = part.trim();
      if (!p) return false;
      if (drop && p.toLowerCase() === drop) return false;
      return !/^aggregated from \d+ consecutive daily entries\.?$/i.test(p);
    })
    .join(' · ');
}
function keyDateType(row) {
  if (row.event_type === 'reporting_deadline') return 'Reporting Deadline';
  var c = String(row.category || '').toLowerCase();
  if (/holiday|break|closed/.test(c)) return 'Holiday';
  if (/term|orientation/.test(c)) return 'Term Date';
  if (/mock/.test(c)) return 'Mock Exam';
  if (/exam|assessment|testing|progress/.test(c)) return 'Internal Exam Window';
  if (/deadline|reporting|data/.test(c)) return 'Deadline';
  return 'Whole-school';
}

/* ── Pearson external exams (ported from the SoW) ─────────────────── */
var RELEVANT_EXTERNAL_CODES = {
  '4MA1': 1, '4PM1': 1,
  'WMA11': 1, 'WMA12': 1, 'WMA13': 1, 'WMA14': 1,
  'WST01': 1, 'WST02': 1, 'WST03': 1,
  'WME01': 1, 'WME02': 1, 'WME03': 1,
  'WFM01': 1, 'WFM02': 1, 'WFM03': 1,
  'WDM11': 1
};
function externalSeriesList() {
  return (typeof EXTERNAL_EXAM_SERIES !== 'undefined') ? EXTERNAL_EXAM_SERIES : [];
}
function externalExamList() {
  return (typeof EXTERNAL_EXAMS !== 'undefined') ? EXTERNAL_EXAMS : [];
}
function externalExamQualification(exam) {
  var supplied = String((exam && (exam.qualification || exam.qual)) || '').trim();
  if (supplied) return supplied;
  var code = String((exam && exam.code) || '').toUpperCase();
  if (code === '4MA1' || code === '4PM1') return 'International GCSE';
  if (/^W(?:MA|ST|ME|FM|DM)/.test(code)) return 'International A Level';
  return '';
}
function externalExamFamily(exam) {
  var code = String((exam && exam.code) || '').toUpperCase();
  var qualification = externalExamQualification(exam).toLowerCase();
  if ((code === '4MA1' || code === '4PM1') && /igcse|international gcse/.test(qualification)) return 'igcse';
  if (/^W(?:MA|ST|ME|FM|DM)/.test(code) && /ial|international a level/.test(qualification)) return 'ial';
  return '';
}
function isRelevantExternalExam(exam) {
  return !!exam &&
    RELEVANT_EXTERNAL_CODES[String(exam.code || '').toUpperCase()] === 1 &&
    !!externalExamFamily(exam);
}
function getExternalExamSeriesWindows(referenceDate, count) {
  count = count || 3;
  var today = new Date(referenceDate); today.setHours(0, 0, 0, 0);
  var out = [];
  for (var year = today.getFullYear(); year <= today.getFullYear() + 2; year++) {
    externalSeriesList().forEach(function (s) {
      var start = parseLocalDate(year, s.startMonth, 1);
      var end = parseLocalDate(year, s.endMonth + 1, 0);
      if (!start || !end) return;
      end.setHours(23, 59, 59, 999);
      if (end >= today) {
        out.push({ id: s.key + '-' + year, seriesKey: s.key, label: s.label + ' ' + year, year: year, start: start, end: end });
      }
    });
  }
  return out.sort(function (a, b) { return a.start - b.start; }).slice(0, count);
}
function externalExamBelongsToWindow(exam, win) {
  var d = parseIsoDate(exam.date);
  if (!d || !win || d < win.start || d > win.end) return false;
  var family = externalExamFamily(exam);
  var month = d.getMonth();
  if (win.seriesKey === 'oct-nov') {
    /* Pearson IAL October and International GCSE October/November are one tab. */
    return (family === 'ial' && month === 9) || (family === 'igcse' && (month === 9 || month === 10));
  }
  if (win.seriesKey === 'jan-feb') return month === 0 || month === 1;
  if (win.seriesKey === 'may-june') return month === 4 || month === 5;
  return false;
}
function relevantExams() {
  return externalExamList()
    .filter(isRelevantExternalExam)
    .map(function (e) { var c = {}; for (var k in e) c[k] = e[k]; c.d = parseIsoDate(e.date); return c; })
    .filter(function (e) { return e.d; })
    .sort(function (a, b) { return a.d - b.d; });
}

/* ── Date-group list: the SoW dashboard's renderer ────────────────── */
function typePill(e) {
  var t = e.type, ev = String(e.event || '').toLowerCase();
  if (/deadline/.test(ev)) return '<span class="type-pill tp-deadline">Deadline</span>';
  if (t === 'Mock Exam') return '<span class="type-pill tp-mock">Mock</span>';
  if (t === 'Internal Assessment') return '<span class="type-pill tp-assessment">Assessment</span>';
  if (t === 'External Exam') return '<span class="type-pill tp-exam">Exam</span>';
  if (t === 'Internal Exam Window') return '<span class="type-pill tp-exam">Exam</span>';
  if (t === 'Deadline' || t === 'Reporting Deadline') return '<span class="type-pill tp-deadline">Deadline</span>';
  if (t === 'Holiday') return '<span class="type-pill tp-holiday">Holiday</span>';
  if (t === 'Term Date') return '<span class="type-pill tp-holiday">Term Date</span>';
  return '<span class="type-pill tp-note">Note</span>';
}
function renderGroupedDates(rows, emptyText) {
  if (!rows.length) {
    return '<p style="color:var(--dark-gray);font-size:13px;margin:0;">' + esc(emptyText) + '</p>';
  }
  var groups = [];
  var index = {};
  rows.forEach(function (row) {
    var key = row.date.toISOString().slice(0, 10);
    if (!index[key]) { index[key] = []; groups.push(index[key]); }
    index[key].push(row);
  });
  var dayName = function (d) {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  };
  /* A window shows its span once, under its start date, instead of one row per day. */
  var whenLabel = function (e) {
    return (e.endDate && e.endDate > e.date) ? dayName(e.date) + ' – ' + dayName(e.endDate) : '';
  };
  return '<div class="dash-date-groups">' + groups.map(function (group) {
    return '<section class="dash-date-group">' +
      '<div class="dash-date-label">' +
        group[0].date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) +
      '</div>' +
      '<ul class="dash-event-list">' + group.map(function (e) {
        return '<li>' +
          '<span class="dash-event-bullet">&bull;</span>' +
          '<span class="dash-event-content">' +
            '<span class="dash-event-name">' + esc(e.event) + '</span>' +
            (whenLabel(e) ? '<span class="dash-event-when">' + esc(whenLabel(e)) + '</span>' : '') +
            '<span class="dash-event-meta">' + esc(e.appliesTo) +
              (e.details ? ' &middot; ' + esc(e.details) : '') + ' ' + typePill(e) +
            '</span>' +
          '</span>' +
          '<span></span>' +
        '</li>';
      }).join('') + '</ul>' +
    '</section>';
  }).join('') + '</div>';
}

/* ── Merged calendar rows (ported from the SoW) ───────────────────── */
function calendarRows() {
  var merged = [];
  var index = {};
  KEY_DATES.filter(function (e) { return e.start_date && !SCHOOL_CALENDAR.isExternal(e); })
    .forEach(function (e) {
      var start = parseIsoDate(e.start_date);
      var end = parseIsoDate(e.end_date || e.start_date) || start;
      if (!start) return;
      var name = windowEventName(e.event);
      var key = name.toLowerCase() + '|' + SCHOOL_CALENDAR.audience(e);
      var row = index[key];
      var fresh = function (k) {
        var r = {
          start: start, end: end, event: name, term: e.term, category: e.category,
          event_type: e.event_type, eventId: e.event_id,
          audience: SCHOOL_CALENDAR.audience(e),
          details: cleanEventDetails(SCHOOL_CALENDAR.details(e), SCHOOL_CALENDAR.audience(e))
        };
        index[k] = r; merged.push(r);
      };
      if (!row) { fresh(key); return; }
      /* Only fold in rows that continue the same window, never a repeat of the
         same name months later. */
      if ((start - row.end) / 86400000 > 4) { fresh(key + '|' + e.event_id); return; }
      if (start < row.start) row.start = start;
      if (end > row.end) row.end = end;
      if (!row.details) row.details = cleanEventDetails(SCHOOL_CALENDAR.details(e), SCHOOL_CALENDAR.audience(e));
    });
  return merged.sort(function (a, b) {
    return (a.start - b.start) || a.event.localeCompare(b.event);
  });
}
function calendarEventHtml(row, today) {
  var category = String(row.category || '').toLowerCase();
  var isKey = /adventure|exam|assessment/.test(category) || row.event_type === 'reporting_deadline';
  var isBreak = /holiday|half.term|break/.test(category);
  var past = row.end < today;
  var fmt = function (d) {
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };
  var when = row.end > row.start ? fmt(row.start) + ' – ' + fmt(row.end) : fmt(row.start);
  return '<div class="cal-event' + (isKey ? ' is-key' : '') + (isBreak ? ' is-break' : '') +
      (past ? ' is-past' : '') + '" data-calendar-event="' + esc(row.eventId) + '">' +
    '<div class="cal-event-name">' + esc(row.event) + '</div>' +
    '<div class="cal-event-when">' + esc(when) + '</div>' +
    (row.details ? '<div class="cal-event-meta">' + esc(row.details) + '</div>' : '') +
  '</div>';
}
function nextMonthKey(today) {
  var d = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/* Events overlapping the next 7 days. Term-length rows are background, not
   something coming up, so anything longer than 21 days is left out. */
function events7(today) {
  var end = new Date(today); end.setDate(end.getDate() + 7);
  return calendarRows()
    .filter(function (r) {
      return r.end >= today && r.start <= end && (r.end - r.start) / 86400000 <= 21;
    })
    .map(function (r) {
      return {
        date: r.start,
        endDate: r.end > r.start ? r.end : null,
        event: r.event,
        details: r.details,
        appliesTo: r.audience,
        type: keyDateType({ category: r.category, event_type: r.event_type })
      };
    });
}

/* ── School Calendar page ─────────────────────────────────────────── */
function renderCalendar() {
  var host = document.getElementById('calendar-content');
  if (!host) return;
  var today = parseIsoDate(todayISO()) || new Date();
  var rows = calendarRows();
  var horizon = new Date(today); horizon.setDate(horizon.getDate() + 21);

  var soon = rows.filter(function (row) {
    return row.end >= today && row.start <= horizon && (row.end - row.start) / 86400000 <= 21;
  });
  var upcoming = '<section class="cal-upcoming">' +
    '<div class="cal-upcoming-head">' +
      '<h3>Next 3 weeks</h3>' +
      '<span>' + today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + '</span>' +
    '</div>' +
    (soon.length
      ? soon.map(function (row) { return calendarEventHtml(row, today); }).join('')
      : '<p class="cal-empty">Nothing scheduled in the next three weeks.</p>') +
  '</section>';

  var months = [];
  var byMonth = {};
  rows.forEach(function (row) {
    var key = row.start.getFullYear() + '-' + String(row.start.getMonth() + 1).padStart(2, '0');
    if (!byMonth[key]) {
      byMonth[key] = { key: key, date: new Date(row.start.getFullYear(), row.start.getMonth(), 1), rows: [] };
      months.push(byMonth[key]);
    }
    byMonth[key].rows.push(row);
  });
  var thisMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  var monthsHtml = months.sort(function (a, b) { return a.date - b.date; }).map(function (month) {
    var open = month.key >= thisMonth && month.key <= nextMonthKey(today);
    var withTerm = month.rows.filter(function (row) { return row.term; })[0];
    var term = withTerm ? withTerm.term : '';
    return '<section class="cal-month' + (open ? '' : ' collapsed') + '" data-cal-month="' + month.key + '">' +
      '<button type="button" class="cal-month-head" aria-expanded="' + open + '">' +
        '<span class="cal-month-chevron" aria-hidden="true">▼</span>' +
        '<span class="cal-month-name">' +
          month.date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) + '</span>' +
        (term ? '<span class="cal-month-term">' + esc(term) + '</span>' : '') +
        '<span class="cal-month-count">' + month.rows.length + ' date' + (month.rows.length === 1 ? '' : 's') + '</span>' +
      '</button>' +
      '<div class="cal-month-body">' +
        month.rows.map(function (row) { return calendarEventHtml(row, today); }).join('') +
      '</div>' +
    '</section>';
  }).join('');

  host.innerHTML = SCHOOL_CALENDAR.notice(store.state, 'WCIB_HUB.reload()') +
    upcoming + '<div class="cal-months">' + monthsHtml + '</div>';

  host.querySelectorAll('.cal-month-head').forEach(function (head) {
    head.addEventListener('click', function () {
      var collapsed = head.parentElement.classList.toggle('collapsed');
      head.setAttribute('aria-expanded', String(!collapsed));
    });
  });
}

/* ── Home: Next 7 Days + Upcoming Exams ───────────────────────────── */
var selectedSeriesId = '';
var examsForced = false;

var ICN_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>';
var ICN_CAP = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10 12 5 2 10l10 5 10-5z"></path><path d="M6 12v5c3 3 9 3 12 0v-5"></path></svg>';

function card(icon, title, link, body) {
  return '<div class="card hod-card hod-fixed-card">' +
    '<div class="hod-card-head">' +
      '<div class="card-title"><span class="ct-icon">' + icon + '</span>' + title + '</div>' +
      (link || '') +
    '</div>' + body +
  '</div>';
}

function renderSevenDays() {
  var host = document.getElementById('home-insights');
  if (!host) return;
  var today = parseIsoDate(todayISO()) || new Date();
  var eventsHtml = SCHOOL_CALENDAR.notice(store.state, 'WCIB_HUB.reload()') +
    renderGroupedDates(events7(today), 'No school events or assessments in the next 7 days.');
  host.innerHTML = card(ICN_CAL, 'Next 7 Days',
    '<a class="hod-card-link" href="./calendar.html">View full calendar →</a>', eventsHtml);
}

function renderExams() {
  var host = document.getElementById('home-exams');
  if (!host) return;
  var today = parseIsoDate(todayISO()) || new Date();

  var exams = relevantExams();
  var nextExam = exams.filter(function (e) { return e.d >= today; })[0] || null;
  var daysAway = nextExam ? Math.round((nextExam.d - today) / 86400000) : null;
  var near = examsForced || (daysAway !== null && daysAway <= EXAM_NEAR_DAYS);

  if (!near) {
    var when = nextExam
      ? nextExam.d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      : '';
    var strip = nextExam
      ? '<div class="xq">' +
          '<span class="xq-ico">' + ICN_CAP + '</span>' +
          '<span class="xq-txt">Next external exam in <b>' + daysAway + ' days</b> &mdash; ' +
            esc(nextExam.code) + ' ' + esc(nextExam.paper) + ' &middot; ' + esc(nextExam.yg) +
            ' &middot; ' + esc(when) + '</span>' +
          '<button type="button" class="xq-act" id="xq-show">Show exam timetable</button>' +
        '</div>'
      : '';
    host.innerHTML = strip;
    var show = document.getElementById('xq-show');
    if (show) show.addEventListener('click', function () { examsForced = true; renderExams(); });
    return;
  }

  var windows = getExternalExamSeriesWindows(today, 3);
  var selected = windows.filter(function (w) { return w.id === selectedSeriesId; })[0] || windows[0] || null;
  if (selected) selectedSeriesId = selected.id;
  var extRows = selected
    ? exams.filter(function (e) { return externalExamBelongsToWindow(e, selected); })
        .map(function (e) {
          return {
            date: e.d,
            event: e.exam + ' · ' + e.paper,
            details: (e.code || '') + (e.session ? ' · ' + e.session : ''),
            appliesTo: e.yg || '',
            type: 'External Exam'
          };
        })
    : [];
  var tabs = windows.length
    ? '<div class="assess-tog-wrap">' + windows.map(function (w) {
        return '<button type="button" class="assess-tog-btn' + (w.id === selectedSeriesId ? ' active' : '') +
          '" data-series="' + esc(w.id) + '">' + esc(w.label) + '</button>';
      }).join('') + '</div>'
    : '';
  var extHtml = tabs + renderGroupedDates(extRows,
    'No relevant Edexcel Maths or Further Maths exams are scheduled for this series.');
  var pearsonLink = '<a class="hod-card-link" href="https://qualifications.pearson.com/en/support/support-topics/exams/exam-timetables.html#tab-Internationalcentres" target="_blank" rel="noopener noreferrer">View Pearson timetable →</a>';

  host.innerHTML = card(ICN_CAP, 'Upcoming Exams', pearsonLink, extHtml);

  host.querySelectorAll('.assess-tog-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      selectedSeriesId = btn.getAttribute('data-series');
      renderExams();
    });
  });
}

/* ── Sidebar ──────────────────────────────────────────────────────── */
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function setText(id, value) {
  var el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderNow() {
  var todayIso = todayISO();
  var t = parseIsoDate(todayIso);
  if (!t) return;
  var dateStr = t.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  setText('now-dow', t.toLocaleDateString('en-GB', { weekday: 'long' }));
  setText('now-date', String(t.getDate()));
  setText('now-month', t.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }));
  setText('tb-date', dateStr);
  setText('sb-date', dateStr);

  var greeting = document.getElementById('greeting');
  if (greeting) {
    var hour = Number(new Intl.DateTimeFormat('en-GB', {
      timeZone: SCHOOL_CALENDAR.ZONE, hour: '2-digit', hour12: false
    }).format(new Date()));
    greeting.textContent = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  }

  /* Week containing today; a weekend straight after a teaching week still
     counts as that week until the next one starts. */
  var current = TERM_WEEKS.filter(function (w) { return w.start_date <= todayIso && todayIso <= w.end_date; })[0];
  if (!current) {
    var started = TERM_WEEKS.filter(function (w) { return w.start_date <= todayIso; });
    var last = started[started.length - 1];
    if (last) {
      var gapDays = (parseIsoDate(todayIso) - parseIsoDate(last.end_date)) / 86400000;
      if (gapDays <= 2) current = last;
    }
  }
  var next = TERM_WEEKS.filter(function (w) { return w.start_date > todayIso; })[0];
  var w = current || next;
  if (w) {
    var total = TERM_WEEKS.filter(function (x) { return x.term === w.term; }).length;
    setText('now-term', w.term);
    setText('now-week', w.week_number + ' of ' + total + ' · ' + w.week_code + (current ? '' : ' (next)'));
    setText('now-cycle', w.cycle);
    setText('kd-term', w.term.replace(/\s*20\d\d\/\d\d$/, ''));
  }

  var upcoming = events7(t)[0];
  var exam = relevantExams().filter(function (e) { return e.d >= t; })[0];
  var pick = null;
  if (upcoming && exam) {
    pick = upcoming.date <= exam.d
      ? { when: upcoming.date, text: upcoming.event + ' · ' + upcoming.appliesTo }
      : { when: exam.d, text: exam.code + ' ' + exam.paper + ' · ' + exam.yg };
  } else if (upcoming) {
    pick = { when: upcoming.date, text: upcoming.event + ' · ' + upcoming.appliesTo };
  } else if (exam) {
    pick = { when: exam.d, text: exam.code + ' ' + exam.paper + ' · ' + exam.yg };
  }
  var nextEl = document.getElementById('now-next');
  if (nextEl) {
    if (pick) {
      var gap = Math.round((pick.when - t) / 86400000);
      var rel = gap <= 0 ? 'Today' : gap === 1 ? 'Tomorrow' : 'In ' + gap + ' days';
      nextEl.innerHTML = '<b>Next up</b>' + esc(rel) + ' — ' + esc(pick.text);
    } else {
      nextEl.innerHTML = '<b>Next up</b>Nothing scheduled';
    }
  }
}

/* ── Data ─────────────────────────────────────────────────────────── */
function renderAll() {
  renderNow();
  if (PAGE === 'calendar') { renderCalendar(); } else { renderSevenDays(); renderExams(); }
}

var store = SCHOOL_CALENDAR.createStore('wcib_hub_key_dates_2026_27', function (state) {
  KEY_DATES = state.rows;
  renderAll();
});

function loadTermWeeks() {
  return fetch('data/wcib_term_weeks_2026_27.csv', { cache: 'no-store' })
    .then(function (r) { if (!r.ok) throw new Error('Term weeks HTTP ' + r.status); return r.text(); })
    .then(function (text) {
      TERM_WEEKS = SCHOOL_CALENDAR.parseCsv(text).filter(function (w) { return w.start_date; });
      renderAll();
    })
    .catch(function () { /* the Now block keeps its placeholder text */ });
}

window.WCIB_HUB = {
  start: function (page) {
    PAGE = page === 'calendar' ? 'calendar' : 'home';
    renderAll();
    loadTermWeeks();
    store.refresh();
  },
  reload: function () { return store.refresh(); }
};

})();
