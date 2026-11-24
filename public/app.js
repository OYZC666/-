'use strict';

/* =========================================================
   时间站 · TimeHub
   纯前端，数据保存在 localStorage
   ========================================================= */

/* ---------- 工具 ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const store = {
  get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  },
  set(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      /* 忽略隐私模式等写入失败 */
    }
  }
};

const uid = () =>
  window.crypto && crypto.randomUUID
    ? crypto.randomUUID()
    : 'id' + Math.random().toString(36).slice(2, 10);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const DAY_MS = 86400000;

function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fmtDate(d) {
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 · 周' + WEEK[d.getDay()];
}

function splitMs(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    d: Math.floor(total / 86400),
    h: Math.floor((total % 86400) / 3600),
    m: Math.floor((total % 3600) / 60),
    s: total % 60,
    total: total
  };
}

function fmtClock(ms) {
  const t = splitMs(ms);
  const h = Math.floor(t.total / 3600);
  return h > 0 ? h + ':' + pad(Math.floor((t.total % 3600) / 60)) + ':' + pad(t.s) : pad(t.m) + ':' + pad(t.s);
}

function fmtDur(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return m + ' 分钟';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? h + ' 小时 ' + mm + ' 分' : h + ' 小时';
}

let toastTimer = 0;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

/* ---------- 主题 ---------- */
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const btn = $('#themeToggle');
  btn.textContent = theme === 'dark' ? '☀️' : '🌙';
  btn.title = theme === 'dark' ? '切换到浅色模式' : '切换到深色模式';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#000000' : '#f5f5f7');
}

function initTheme() {
  const saved = store.get('th.theme', null);
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  applyTheme(saved || (prefersDark ? 'dark' : 'light'));
  $('#themeToggle').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    store.set('th.theme', next);
  });
}

/* ---------- 标签页 ---------- */
const TABS = ['countdown', 'timer', 'ledger', 'growth', 'fun', 'insight'];

function switchTab(name) {
  if (!TABS.includes(name)) name = 'countdown';
  $$('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === name));
  $$('.panel').forEach((p) => p.classList.toggle('active', p.id === 'panel-' + name));
  try {
    history.replaceState(null, '', '#' + name);
  } catch (e) {
    /* file:// 下可能被拒绝 */
  }
  if (name === 'insight') {
    renderProgress();
    renderStats();
  }
  if (name === 'growth') {
    renderHabits();
    renderReviews();
    renderHeatmap();
  }
  if (name === 'fun') {
    renderCapsules();
    renderPicks();
  }
}

function initTabs() {
  $$('.tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  const brand = $('.brand');
  if (brand) {
    brand.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('countdown');
    });
  }
  const hash = (location.hash || '').replace('#', '');
  switchTab(TABS.includes(hash) ? hash : 'countdown');
}

/* =========================================================
   一、倒计时
   ========================================================= */
const EV_KEY = 'th.events';

const PRESET_EVENTS = [
  { name: '考研初试', at: '2026-12-19T08:30', tag: '考试', note: '2027 届' },
  { name: '英语四级', at: '2026-12-12T09:00', tag: '考试', note: 'CET-4' },
  { name: '英语六级', at: '2026-12-12T15:00', tag: '考试', note: 'CET-6' },
  { name: '圣诞节', at: '2026-12-25T00:00', tag: '节日', note: '' },
  { name: '元旦', at: '2027-01-01T00:00', tag: '节日', note: '' },
  { name: '春节', at: '2027-02-06T00:00', tag: '节日', note: '' },
  { name: '元宵节', at: '2027-02-20T00:00', tag: '节日', note: '' },
  { name: '清明节', at: '2027-04-05T00:00', tag: '节日', note: '' },
  { name: '劳动节', at: '2027-05-01T00:00', tag: '节日', note: '' },
  { name: '高考', at: '2027-06-07T09:00', tag: '考试', note: '' },
  { name: '端午节', at: '2027-06-09T00:00', tag: '节日', note: '' },
  { name: '中秋节', at: '2027-09-15T00:00', tag: '节日', note: '' },
  { name: '国庆节', at: '2027-10-01T00:00', tag: '节日', note: '' }
];

let events = [];

const TAG_EMOJI = { 考试: '📚', 节日: '🎉', 纪念日: '💝', 自定义: '⏳' };

function upcomingEvents() {
  const now = Date.now();
  return events
    .filter((e) => new Date(e.at).getTime() > now - 1000)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
}

function renderEvents() {
  const grid = $('#eventGrid');
  const list = upcomingEvents();
  if (!list.length) {
    grid.innerHTML = '<div class="empty">还没有未来的倒计时，点右上角「＋ 添加」创建一个值得期待的日子。</div>';
    return;
  }
  grid.innerHTML = list
    .map((e) => {
      const d = new Date(e.at);
      return (
        '<article class="event-card" data-id="' + e.id + '" tabindex="0">' +
        '<div class="event-emoji">' + (TAG_EMOJI[e.tag] || '⏳') + '</div>' +
        '<div class="event-body">' +
        '<div class="event-name">' + esc(e.name) + '</div>' +
        '<div class="event-date">' + fmtDate(d) + (e.note ? ' · ' + esc(e.note) : '') + '</div>' +
        '<div class="event-sub" data-sub="' + e.id + '">—</div>' +
        '</div>' +
        '<div class="event-days"><b data-days="' + e.id + '">0</b><span>天</span></div>' +
        '<button class="event-del" data-del="' + e.id + '" title="删除" aria-label="删除">×</button>' +
        '</article>'
      );
    })
    .join('');
  updateEventCounts();
}

function updateEventCounts() {
  const now = Date.now();
  $$('[data-days]').forEach((el) => {
    const e = events.find((x) => x.id === el.dataset.days);
    if (!e) return;
    const t = splitMs(new Date(e.at).getTime() - now);
    let num;
    let unit;
    let sub;
    if (t.total <= 0) {
      num = 0;
      unit = '天';
      sub = '已结束';
    } else if (t.d > 0) {
      num = t.d;
      unit = '天';
      sub = t.h + ' 时 ' + t.m + ' 分 ' + t.s + ' 秒';
    } else if (t.h > 0) {
      num = t.h;
      unit = '小时';
      sub = t.m + ' 分 ' + t.s + ' 秒';
    } else {
      num = t.m;
      unit = '分钟';
      sub = t.s + ' 秒';
    }
    el.textContent = num;
    const unitEl = el.parentElement ? el.parentElement.querySelector('span') : null;
    if (unitEl) unitEl.textContent = unit;
    const subEl = document.querySelector('[data-sub="' + e.id + '"]');
    if (subEl) subEl.textContent = sub;
  });
}

let heroEventId = null;

function updateHero() {
  const list = upcomingEvents();
  const nameEl = $('#heroName');
  const daysEl = $('#heroDays');
  const unitEl = $('#heroUnit');
  const metaEl = $('#heroMeta');
  const clockEl = $('#heroClock');

  if (!list.length) {
    nameEl.textContent = '暂时没有安排';
    daysEl.textContent = '—';
    unitEl.textContent = '';
    metaEl.textContent = '添加一个考试、节日或纪念日吧';
    clockEl.textContent = '——';
    if (heroEventId !== null) {
      heroEventId = null;
      renderEvents();
    }
    return;
  }
  const e = list[0];
  if (e.id !== heroEventId) {
    heroEventId = e.id;
    renderEvents();
  }
  const d = new Date(e.at);
  const t = splitMs(d.getTime() - Date.now());
  nameEl.textContent = (TAG_EMOJI[e.tag] || '⏳') + ' ' + e.name;
  if (t.total <= 0) {
    daysEl.textContent = '0';
    unitEl.textContent = '天';
  } else if (t.d > 0) {
    daysEl.textContent = t.d;
    unitEl.textContent = '天';
  } else if (t.h > 0) {
    daysEl.textContent = t.h;
    unitEl.textContent = '小时';
  } else {
    daysEl.textContent = t.m;
    unitEl.textContent = '分钟';
  }
  metaEl.textContent = fmtDate(d);
  clockEl.textContent = t.d > 0
    ? t.h + ' 小时 ' + t.m + ' 分 ' + t.s + ' 秒'
    : t.m + ' 分 ' + t.s + ' 秒';
}

function updateDayStrip() {
  const now = new Date();
  const pct = ((now - startOfDay(now)) / DAY_MS) * 100;
  const p = Math.min(100, Math.max(0, pct));
  $('#dayPct').textContent = Math.round(p) + '%';
  $('#dayBar').style.width = p + '%';
}

/* 弹窗 */
let editingId = null;

function openEventModal(id) {
  editingId = id || null;
  const modal = $('#eventModal');
  const nameInput = $('#evName');
  const timeInput = $('#evTime');
  const tagInput = $('#evTag');

  if (editingId) {
    const e = events.find((x) => x.id === editingId);
    if (!e) return;
    $('#modalTitle').textContent = '编辑倒计时';
    nameInput.value = e.name;
    timeInput.value = (e.at || '').slice(0, 16);
    tagInput.value = e.tag || '自定义';
  } else {
    $('#modalTitle').textContent = '添加倒计时';
    nameInput.value = '';
    const tomorrow = new Date(Date.now() + DAY_MS);
    tomorrow.setHours(9, 0, 0, 0);
    timeInput.value =
      tomorrow.getFullYear() + '-' + pad(tomorrow.getMonth() + 1) + '-' + pad(tomorrow.getDate()) + 'T09:00';
    tagInput.value = '考试';
  }
  modal.hidden = false;
  setTimeout(() => nameInput.focus(), 50);
}

function closeEventModal() {
  $('#eventModal').hidden = true;
  editingId = null;
}

function saveEvent() {
  const name = $('#evName').value.trim();
  const at = $('#evTime').value;
  const tag = $('#evTag').value;
  if (!name) {
    toast('请填写名称');
    return;
  }
  if (!at) {
    toast('请选择日期和时间');
    return;
  }
  const ts = Date.now();
  if (editingId) {
    const e = events.find((x) => x.id === editingId);
    if (e) {
      e.name = name;
      e.at = at;
      e.tag = tag;
      e.updatedAt = ts;
      commitUpsert('events', e);
    }
    toast('已更新');
  } else {
    const e = { id: uid(), name: name, at: at, tag: tag, note: '', updatedAt: ts };
    events.push(e);
    commitUpsert('events', e);
    toast('已添加');
  }
  renderEvents();
  updateHero();
  closeEventModal();
}


function initCountdown() {
  renderEvents();
  updateHero();

  $('#addEventBtn').addEventListener('click', () => openEventModal(null));
  $('#evSave').addEventListener('click', saveEvent);

  $('#eventModal').addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) closeEventModal();
  });

  $('#eventGrid').addEventListener('click', (e) => {
    const del = e.target.closest('[data-del]');
    if (del) {
      const id = del.dataset.del;
      const ev = events.find((x) => x.id === id);
      if (!ev) return;
      if (window.confirm('删除倒计时「' + ev.name + '」？')) {
        events = events.filter((x) => x.id !== id);
        commitDelete('events', id);
        renderEvents();
        updateHero();
        toast('已删除');
      }
      return;
    }
    const card = e.target.closest('.event-card');
    if (card) openEventModal(card.dataset.id);
  });

  $('#eventGrid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const card = e.target.closest('.event-card');
      if (card) openEventModal(card.dataset.id);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#eventModal').hidden) closeEventModal();
  });

  $('#evName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveEvent();
  });
}

/* ---------- 生日倒计时（支持阳历 / 农历） ---------- */
const BDAY_KEY = 'th.birthdays';
let birthdays = [];

let editingBdayId = null;
let bdCalendar = 'solar';

/* 计算下一次生日 */
function birthdayInfo(b, now) {
  now = now || new Date();
  const today = startOfDay(now);
  if (!b || !(b.month >= 1) || !(b.day >= 1)) return null;

  let next = null;
  let lunarYear = 0;
  let nextLunar = null;
  let age = 0;

  if (b.calendar === 'lunar') {
    if (b.month > 12 || b.day > 30) return null;
    const nowL = solarToLunar(now.getFullYear(), now.getMonth() + 1, now.getDate());
    if (!nowL) return null;
    for (let L = nowL.year; L <= nowL.year + 1 && !next; L++) {
      let d = null;
      if (b.isLeap && leapMonthOfYear(L) === b.month) d = lunarToSolar(L, b.month, b.day, true);
      if (!d) d = lunarToSolar(L, b.month, b.day, false);
      if (d && startOfDay(d) >= today) {
        next = d;
        lunarYear = L;
        nextLunar = solarToLunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
      }
    }
    if (!next) return null;
    if (b.year) age = lunarYear - b.year;
  } else {
    if (b.month > 12 || b.day > 31) return null;
    const make = (y) => {
      const dim = new Date(y, b.month, 0).getDate();
      return new Date(y, b.month - 1, Math.min(b.day, dim));
    };
    let d = make(now.getFullYear());
    if (d < today) d = make(now.getFullYear() + 1);
    next = d;
    nextLunar = solarToLunar(d.getFullYear(), d.getMonth() + 1, d.getDate());
    if (b.year) age = d.getFullYear() - b.year;
  }

  const days = Math.round((startOfDay(next) - today) / DAY_MS);
  return { date: next, lunar: nextLunar, days: days, age: age > 0 ? age : 0 };
}

function bdayMetaText(b) {
  if (b.calendar === 'lunar') return '农历 ' + lunarMonthName(b.month, b.isLeap) + lunarDayName(b.day);
  return '公历 ' + b.month + ' 月 ' + b.day + ' 日';
}

function bdaySubText(b, info) {
  const d = info.date;
  const parts = ['下次 ' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日'];
  if (info.lunar) parts.push('农历' + lunarDateName(info.lunar));
  if (info.age) parts.push(info.days === 0 ? '今天满 ' + info.age + ' 岁' : '将满 ' + info.age + ' 岁');
  return parts.join(' · ');
}

function renderBirthdays() {
  const grid = $('#bdayGrid');
  const now = new Date();
  const rows = birthdays
    .map((b) => ({ b: b, info: birthdayInfo(b, now) }))
    .filter((r) => r.info)
    .sort((a, b) => a.info.days - b.info.days);

  if (!rows.length) {
    grid.innerHTML = '<div class="empty">还没有生日记录。添加家人、朋友或自己的生日，支持阳历与农历。</div>';
    return;
  }

  grid.innerHTML = rows
    .map(
      (r) =>
        '<article class="event-card bday-card' + (r.info.days === 0 ? ' today' : '') +
        '" data-bday-id="' + r.b.id + '" tabindex="0">' +
        '<div class="event-emoji">' + (r.info.days === 0 ? '🎉' : '🎂') + '</div>' +
        '<div class="event-body">' +
        '<div class="event-name">' + esc(r.b.name) + '</div>' +
        '<div class="event-date">' + bdayMetaText(r.b) + '</div>' +
        '<div class="event-sub" data-bday-sub="' + r.b.id + '">' + esc(bdaySubText(r.b, r.info)) + '</div>' +
        '</div>' +
        '<div class="event-days"><b data-bday-days="' + r.b.id + '">' +
        (r.info.days === 0 ? '今天' : r.info.days) + '</b><span>' +
        (r.info.days === 0 ? '生日快乐' : '天') + '</span></div>' +
        '<button class="event-del" data-bday-del="' + r.b.id + '" title="删除" aria-label="删除">×</button>' +
        '</article>'
    )
    .join('');
}

function updateBirthdayCounts() {
  const now = new Date();
  $$('[data-bday-days]').forEach((el) => {
    const b = birthdays.find((x) => x.id === el.dataset.bdayDays);
    if (!b) return;
    const info = birthdayInfo(b, now);
    if (!info) return;
    el.textContent = info.days === 0 ? '今天' : info.days;
    const unit = el.parentElement ? el.parentElement.querySelector('span') : null;
    if (unit) unit.textContent = info.days === 0 ? '生日快乐' : '天';
    const sub = document.querySelector('[data-bday-sub="' + b.id + '"]');
    if (sub) sub.textContent = bdaySubText(b, info);
    const card = el.closest('.bday-card');
    if (card) card.classList.toggle('today', info.days === 0);
  });
}

function fillBdayMonths() {
  const sel = $('#bdMonth');
  sel.innerHTML = '';
  for (let m = 1; m <= 12; m++) {
    sel.add(new Option(bdCalendar === 'lunar' ? lunarMonthName(m, false) : m + ' 月', String(m)));
  }
}

function fillBdayDays(keepDay) {
  const month = Number($('#bdMonth').value) || 1;
  const sel = $('#bdDay');
  sel.innerHTML = '';
  const max = bdCalendar === 'lunar' ? 30 : new Date(2000, month, 0).getDate();
  for (let d = 1; d <= max; d++) {
    sel.add(new Option(bdCalendar === 'lunar' ? lunarDayName(d) : d + ' 日', String(d)));
  }
  sel.value = String(Math.min(keepDay || 1, max));
}

function bdayFromForm() {
  const yv = $('#bdYear').value.trim();
  return {
    id: editingBdayId || uid(),
    name: $('#bdName').value.trim() || '这位朋友',
    calendar: bdCalendar,
    month: Number($('#bdMonth').value) || 1,
    day: Number($('#bdDay').value) || 1,
    isLeap: bdCalendar === 'lunar' && $('#bdLeap').checked,
    year: yv ? Number(yv) : null
  };
}

function updateBdayPreview() {
  const box = $('#bdPreview');
  const info = birthdayInfo(bdayFromForm(), new Date());
  if (!info) {
    box.textContent = '这个日期无法计算，请检查月份和日期。';
    return;
  }
  const d = info.date;
  const when = info.days === 0 ? '就是今天 🎉' : '还有 ' + info.days + ' 天';
  box.textContent =
    '下次生日：' + d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日' +
    (info.lunar ? '（农历' + lunarDateName(info.lunar) + '）' : '') + ' · ' + when +
    (info.age ? ' · 将满 ' + info.age + ' 岁' : '');
}

function syncBdayForm() {
  $('#bdLeapWrap').hidden = bdCalendar !== 'lunar';
  $$('#bdCalendar .seg-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.cal === bdCalendar));
  updateBdayPreview();
}

function openBdayModal(id) {
  editingBdayId = id || null;
  const b = id ? birthdays.find((x) => x.id === id) : null;
  const now = new Date();
  bdCalendar = b ? b.calendar : 'solar';

  $('#bdayModalTitle').textContent = b ? '编辑生日' : '添加生日';
  $('#bdName').value = b ? b.name : '';
  $('#bdYear').value = b && b.year ? String(b.year) : '';
  $('#bdLeap').checked = !!(b && b.isLeap);

  fillBdayMonths();
  $('#bdMonth').value = String(b ? b.month : now.getMonth() + 1);
  fillBdayDays(b ? b.day : Math.min(now.getDate(), 28));
  syncBdayForm();
  $('#bdayModal').hidden = false;
  setTimeout(() => $('#bdName').focus(), 50);
}

function closeBdayModal() {
  $('#bdayModal').hidden = true;
  editingBdayId = null;
}

function saveBday() {
  const name = $('#bdName').value.trim();
  if (!name) {
    toast('请填写称呼');
    return;
  }
  const b = bdayFromForm();
  b.name = name;
  b.updatedAt = Date.now();
  if (b.year && (b.year < 1900 || b.year > 2099)) {
    toast('出生年份需在 1900 - 2099 之间');
    return;
  }
  if (!birthdayInfo(b, new Date())) {
    toast('这个日期不存在，请检查');
    return;
  }
  if (editingBdayId) {
    const idx = birthdays.findIndex((x) => x.id === editingBdayId);
    if (idx >= 0) birthdays[idx] = b;
    toast('已更新');
  } else {
    birthdays.push(b);
    toast('已添加生日');
  }
  commitUpsert('birthdays', b);
  renderBirthdays();
  closeBdayModal();
}

function initBirthdays() {
  renderBirthdays();

  $('#addBdayBtn').addEventListener('click', () => openBdayModal(null));
  $('#bdSave').addEventListener('click', saveBday);

  $('#bdayModal').addEventListener('click', (e) => {
    if (e.target.closest('[data-bday-close]')) closeBdayModal();
  });

  $('#bdCalendar').addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const month = Number($('#bdMonth').value) || 1;
    const day = Number($('#bdDay').value) || 1;
    bdCalendar = btn.dataset.cal;
    fillBdayMonths();
    $('#bdMonth').value = String(month);
    fillBdayDays(day);
    if (bdCalendar !== 'lunar') $('#bdLeap').checked = false;
    syncBdayForm();
  });

  $('#bdMonth').addEventListener('change', () => {
    fillBdayDays(1);
    updateBdayPreview();
  });
  $('#bdDay').addEventListener('change', updateBdayPreview);
  $('#bdLeap').addEventListener('change', updateBdayPreview);
  $('#bdName').addEventListener('input', updateBdayPreview);
  $('#bdYear').addEventListener('input', updateBdayPreview);

  $('#bdayGrid').addEventListener('click', (e) => {
    const del = e.target.closest('[data-bday-del]');
    if (del) {
      const id = del.dataset.bdayDel;
      const b = birthdays.find((x) => x.id === id);
      if (b && window.confirm('删除「' + b.name + '」的生日？')) {
        birthdays = birthdays.filter((x) => x.id !== id);
        commitDelete('birthdays', id);
        renderBirthdays();
        toast('已删除');
      }
      return;
    }
    const card = e.target.closest('[data-bday-id]');
    if (card) openBdayModal(card.dataset.bdayId);
  });

  $('#bdayGrid').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const card = e.target.closest('[data-bday-id]');
      if (card) openBdayModal(card.dataset.bdayId);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#bdayModal').hidden) closeBdayModal();
  });

  $('#bdName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveBday();
  });
}

/* =========================================================
   二、计时器
   ========================================================= */
const RING_R = 100;
const RING_C = 2 * Math.PI * RING_R;

const PRESET_GROUPS = {
  exam: [
    { name: '考研政治', min: 180 },
    { name: '考研英语', min: 180 },
    { name: '考研数学', min: 180 },
    { name: '考研专业课', min: 180 },
    { name: '四级 130 分钟', min: 130 },
    { name: '六级 130 分钟', min: 130 },
    { name: '高考语文 150 分钟', min: 150 },
    { name: '高考数学 120 分钟', min: 120 }
  ],
  train: [
    { name: '英语阅读 1 篇', min: 18 },
    { name: '完形填空', min: 15 },
    { name: '翻译', min: 20 },
    { name: '小作文', min: 15 },
    { name: '大作文', min: 30 },
    { name: '数学选填', min: 50 },
    { name: '数学大题 1 道', min: 15 },
    { name: '政治分析题 1 道', min: 20 },
    { name: '申论小题', min: 30 }
  ],
  pomo: [
    { name: '专注 25 分钟', min: 25, kind: 'pomo-focus' },
    { name: '短休息 5 分钟', min: 5, kind: 'pomo-break' },
    { name: '长休息 15 分钟', min: 15, kind: 'pomo-break' }
  ]
};

const tState = {
  mode: 'countdown',
  running: false,
  durationMs: 25 * 60000,
  remainMs: 25 * 60000,
  elapsedMs: 0,
  baseMs: 0,
  endAt: 0,
  startAt: 0,
  presetName: '倒计时',
  kind: 'custom',
  timerId: 0
};

let audioCtx = null;
let finishTitleTimer = 0;

function ensureAudio() {
  try {
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  } catch (e) {
    audioCtx = null;
  }
}

function beep(times) {
  ensureAudio();
  if (!audioCtx) return;
  try {
    let t = audioCtx.currentTime;
    for (let i = 0; i < times; i++) {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.34);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.4);
      t += 0.5;
    }
  } catch (e) {
    /* 忽略音频失败 */
  }
}

function currentMs() {
  return tState.mode === 'countdown' ? tState.remainMs : tState.elapsedMs;
}

function paintTimer() {
  const display = $('#timerDisplay');
  display.textContent = fmtClock(currentMs());

  $('#timerKind').textContent = tState.mode === 'stopwatch' ? '秒表' : tState.presetName;
  $('#timerNote').textContent = tState.mode === 'stopwatch' ? '正计时' : fmtDur(tState.durationMs / 1000);

  let progress;
  if (tState.mode === 'countdown') {
    progress = tState.durationMs > 0 ? tState.remainMs / tState.durationMs : 0;
  } else {
    progress = (tState.elapsedMs % 60000) / 60000;
  }
  const fg = $('#ringFg');
  fg.style.strokeDashoffset = String(RING_C * (1 - Math.min(1, Math.max(0, progress))));
  fg.style.stroke = tState.mode === 'countdown' && tState.remainMs <= 60000 && tState.remainMs > 0 ? 'var(--red)' : '';

  const startBtn = $('#timerStart');
  startBtn.textContent = tState.running
    ? '暂停'
    : tState.mode === 'countdown' && tState.remainMs < tState.durationMs && tState.remainMs > 0
      ? '继续'
      : '开始';
}

function stopTicking() {
  if (tState.timerId) {
    clearInterval(tState.timerId);
    tState.timerId = 0;
  }
}

function tickTimer() {
  if (!tState.running) return;
  const now = Date.now();
  if (tState.mode === 'countdown') {
    tState.remainMs = Math.max(0, tState.endAt - now);
    if (tState.remainMs <= 0) {
      tState.remainMs = 0;
      paintTimer();
      finishTimer();
      return;
    }
  } else {
    tState.elapsedMs = tState.baseMs + (now - tState.startAt);
  }
  paintTimer();
}

function startTimer() {
  if (tState.running) return;
  ensureAudio();
  if (tState.mode === 'countdown') {
    if (tState.remainMs <= 0) tState.remainMs = tState.durationMs;
    tState.endAt = Date.now() + tState.remainMs;
  } else {
    tState.startAt = Date.now();
  }
  tState.running = true;
  stopTicking();
  tState.timerId = setInterval(tickTimer, 100);
  paintTimer();
}

function pauseTimer() {
  if (tState.mode === 'countdown') {
    tState.remainMs = Math.max(0, tState.endAt - Date.now());
  } else if (tState.startAt) {
    tState.baseMs = tState.baseMs + (Date.now() - tState.startAt);
    tState.elapsedMs = tState.baseMs;
  }
  tState.running = false;
  stopTicking();
  paintTimer();
  document.title = '时间站 · 倒计时与专注工具';
}

function finishTimer() {
  tState.running = false;
  stopTicking();
  tState.remainMs = 0;
  paintTimer();
  beep(3);

  const card = $('#timerCard');
  card.classList.remove('time-up');
  void card.offsetWidth;
  card.classList.add('time-up');
  setTimeout(() => card.classList.remove('time-up'), 3200);

  if (tState.kind === 'pomo-focus') {
    bumpPomo();
    toast('专注完成，休息一下吧 ☕️');
  } else {
    toast('时间到！');
  }

  document.title = '⏰ 时间到 · 时间站';
  clearTimeout(finishTitleTimer);
  finishTitleTimer = setTimeout(() => {
    document.title = '时间站 · 倒计时与专注工具';
  }, 8000);
}

function resetTimer() {
  tState.running = false;
  stopTicking();
  if (tState.mode === 'countdown') {
    tState.remainMs = tState.durationMs;
  } else {
    tState.elapsedMs = 0;
    tState.baseMs = 0;
    tState.startAt = 0;
  }
  paintTimer();
  document.title = '时间站 · 倒计时与专注工具';
}

function setPreset(min, name, kind) {
  tState.mode = 'countdown';
  tState.running = false;
  stopTicking();
  tState.durationMs = min * 60000;
  tState.remainMs = min * 60000;
  tState.presetName = name;
  tState.kind = kind || 'custom';
  paintTimer();
  startTimer();
}

function toggleMode() {
  tState.running = false;
  stopTicking();
  if (tState.mode === 'countdown') {
    tState.mode = 'stopwatch';
    tState.elapsedMs = 0;
    tState.baseMs = 0;
    tState.startAt = 0;
    tState.presetName = '秒表';
    tState.kind = 'stopwatch';
    $('#timerMode').textContent = '倒计时';
  } else {
    tState.mode = 'countdown';
    tState.durationMs = 25 * 60000;
    tState.remainMs = 25 * 60000;
    tState.presetName = '倒计时';
    tState.kind = 'custom';
    $('#timerMode').textContent = '秒表';
  }
  paintTimer();
  document.title = '时间站 · 倒计时与专注工具';
}

function getPomo() {
  const map = store.get('th.pomo', {});
  return map[dayKey()] || 0;
}

function bumpPomo() {
  const map = store.get('th.pomo', {});
  map[dayKey()] = (map[dayKey()] || 0) + 1;
  store.set('th.pomo', map);
  $('#pomoCount').textContent = String(map[dayKey()]);
}

function chipsHTML(items, group) {
  return items
    .map(
      (it) =>
        '<button class="chip" data-group="' + group + '" data-min="' + it.min + '" data-name="' +
        esc(it.name) + '" data-kind="' + (it.kind || group) + '">' + esc(it.name) + '</button>'
    )
    .join('');
}

function initTimer() {
  $('#ringFg').style.strokeDasharray = String(RING_C);
  $('#ringFg').style.strokeDashoffset = '0';

  $('#examChips').innerHTML = chipsHTML(PRESET_GROUPS.exam, 'exam');
  $('#trainChips').innerHTML = chipsHTML(PRESET_GROUPS.train, 'train');
  $('#pomoChips').innerHTML = chipsHTML(PRESET_GROUPS.pomo, 'pomo');
  $('#pomoCount').textContent = String(getPomo());

  $('#timerStart').addEventListener('click', () => {
    if (tState.running) pauseTimer();
    else startTimer();
  });
  $('#timerReset').addEventListener('click', resetTimer);
  $('#timerMode').addEventListener('click', toggleMode);

  ['#examChips', '#trainChips', '#pomoChips'].forEach((sel) => {
    $(sel).addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const min = Number(chip.dataset.min);
      const kind = chip.dataset.kind;
      setPreset(min, chip.dataset.name, kind === 'pomo' ? 'custom' : kind);
      switchTab('timer');
      toast(chip.dataset.name + ' · ' + min + ' 分钟开始');
    });
  });

  $('#customGo').addEventListener('click', () => {
    const min = Math.round(Number($('#customMin').value));
    if (!min || min < 1 || min > 600) {
      toast('请输入 1 - 600 之间的分钟数');
      return;
    }
    setPreset(min, '自定义 ' + min + ' 分钟', 'custom');
    toast(min + ' 分钟开始');
  });

  document.addEventListener('keydown', (e) => {
    if (e.code !== 'Space') return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || e.target.isContentEditable) return;
    if (!$('#panel-timer').classList.contains('active')) return;
    e.preventDefault();
    if (tState.running) pauseTimer();
    else startTimer();
  });

  paintTimer();
}

/* =========================================================
   三、时间账本
   ========================================================= */
const LOG_KEY = 'th.logs';
const CATS = {
  study: { name: '学习', color: '#0071e3' },
  work: { name: '工作', color: '#5856d6' },
  rest: { name: '休息', color: '#34c759' },
  play: { name: '娱乐', color: '#ff9f0a' },
  phone: { name: '刷手机', color: '#ff453a' },
  commute: { name: '通勤', color: '#8e8e93' },
  other: { name: '其他', color: '#aeaeb2' }
};
const WASTE = ['play', 'phone'];

const TIP = {
  phone: '试试把手机放到够不到的地方，先专注 25 分钟再奖励自己刷一会儿。',
  play: '娱乐不是罪，给娱乐设一个明确的结束时间，玩得更尽兴也更不心虚。',
  rest: '休息是计划的一部分，但可以换成短而规律的休息，避免越休越累。',
  study: '学习时间很充足，记得穿插休息，效率比时长更重要。',
  work: '工作占比很高，别忘了给自己留一点空白时间。',
  commute: '通勤是隐藏的黄金时段，可以变成听书、背单词或听播客的时间。',
  other: '把「其他」拆得细一点，你会更清楚时间究竟去了哪里。'
};

let ledger = [];

function getRecs(key) {
  return ledger.filter((r) => r.date === key);
}

function addRecord(name, cat, sec) {
  const rec = {
    id: uid(),
    date: dayKey(),
    name: name || '未命名',
    cat: cat,
    sec: Math.max(1, Math.round(sec)),
    at: Date.now(),
    updatedAt: Date.now()
  };
  ledger.push(rec);
  commitUpsert('ledger', rec);
  renderLedger();
}

function catOptionsHTML() {
  return Object.keys(CATS)
    .map((k) => '<option value="' + k + '">' + CATS[k].name + '</option>')
    .join('');
}

function renderSummary() {
  const recs = getRecs(dayKey());
  const total = recs.reduce((a, r) => a + r.sec, 0);
  $('#summaryTotal').textContent = total ? '已记录 ' + fmtDur(total) : '还没有记录';

  const byCat = {};
  recs.forEach((r) => {
    byCat[r.cat] = (byCat[r.cat] || 0) + r.sec;
  });

  const bars = $('#catBars');
  const cats = Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]);
  if (!cats.length) {
    bars.innerHTML = '<div class="empty small">今天还没有记录。用上面的「实时记录」或「补记」开始吧。</div>';
  } else {
    bars.innerHTML = cats
      .map((k) => {
        const c = CATS[k] || CATS.other;
        const pct = Math.max(2, Math.round((byCat[k] / total) * 100));
        return (
          '<div class="cat-row">' +
          '<span class="cat-dot" style="background:' + c.color + '"></span>' +
          '<span class="cat-name">' + c.name + '</span>' +
          '<div class="cat-track"><i style="width:' + pct + '%;background:' + c.color + '"></i></div>' +
          '<span class="cat-val">' + fmtDur(byCat[k]) + '</span>' +
          '</div>'
        );
      })
      .join('');
  }

  renderBlackhole(total, byCat);
}

function renderBlackhole(total, byCat) {
  const box = $('#blackhole');
  const wasteSec = WASTE.reduce((a, k) => a + (byCat[k] || 0), 0);

  if (total <= 0) {
    box.innerHTML =
      '<div class="blackhole info"><span class="bh-icon">🕳️</span><div>' +
      '<b>开始记录，才能看见时间去了哪里。</b><br>先记下今天做过的几件事，我来帮你找出时间黑洞。</div></div>';
    return;
  }

  if (wasteSec >= 600 && wasteSec / total >= 0.3) {
    const topCat = WASTE.map((k) => [k, byCat[k] || 0]).sort((a, b) => b[1] - a[1])[0][0];
    const pct = Math.round((wasteSec / total) * 100);
    box.innerHTML =
      '<div class="blackhole warn"><span class="bh-icon">⚠️</span><div>' +
      '<b>发现时间黑洞：' + CATS[topCat].name + '消耗了 ' + pct + '% 的可记录时间</b><br>' +
      '今天有 ' + fmtDur(wasteSec) + ' 被' + CATS[topCat].name + '吃掉了。' + TIP[topCat] +
      '</div></div>';
    return;
  }

  const studySec = (byCat.study || 0) + (byCat.work || 0);
  if (studySec / total >= 0.6) {
    box.innerHTML =
      '<div class="blackhole ok"><span class="bh-icon">🌿</span><div>' +
      '<b>今天很扎实：学习与工作占了 ' + Math.round((studySec / total) * 100) + '%</b><br>' +
      '保持这个节奏，记得给自己安排真正的休息。</div></div>';
    return;
  }

  box.innerHTML =
    '<div class="blackhole ok"><span class="bh-icon">✅</span><div>' +
    '<b>时间分配看起来比较均衡。</b><br>继续记录，数据越多，你越能看清自己的节奏。</div></div>';
}

function renderWeek() {
  const arr = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const sec = getRecs(k).reduce((a, r) => a + r.sec, 0);
    arr.push({ d: d, k: k, sec: sec });
  }
  const maxMin = Math.max(60, arr.reduce((m, a) => Math.max(m, a.sec / 60), 0));
  const today = dayKey();
  $('#weekChart').innerHTML = arr
    .map((a) => {
      const min = Math.round(a.sec / 60);
      const h = Math.max(a.sec ? 6 : 3, Math.round((a.sec / 60 / maxMin) * 118));
      return (
        '<div class="week-col" title="' + a.k + ' · ' + fmtDur(a.sec) + '">' +
        '<span class="week-val">' + (min || '') + '</span>' +
        '<div class="week-bar' + (a.k === today ? ' today' : '') + '" style="height:' + h + 'px"></div>' +
        '<span class="week-label">' + (a.k === today ? '今天' : '周' + WEEK[a.d.getDay()]) + '</span>' +
        '</div>'
      );
    })
    .join('');
}

function renderLogList() {
  const recs = getRecs(dayKey()).slice().sort((a, b) => b.at - a.at);
  const box = $('#logList');
  if (!recs.length) {
    box.innerHTML = '<div class="empty small">今天还没有明细记录。</div>';
    return;
  }
  box.innerHTML = recs
    .map((r) => {
      const c = CATS[r.cat] || CATS.other;
      const t = new Date(r.at);
      return (
        '<div class="log-row">' +
        '<span class="cat-dot" style="background:' + c.color + '"></span>' +
        '<span class="log-name">' + esc(r.name) + '</span>' +
        '<span class="log-tag">' + c.name + '</span>' +
        '<span class="log-dur">' + fmtDur(r.sec) + '</span>' +
        '<span class="log-time">' + pad(t.getHours()) + ':' + pad(t.getMinutes()) + '</span>' +
        '<button class="log-del" data-log-del="' + r.id + '" title="删除" aria-label="删除">×</button>' +
        '</div>'
      );
    })
    .join('');
}

function renderLedger() {
  renderSummary();
  renderWeek();
  renderLogList();
}

let live = { running: false, start: 0, name: '', cat: 'study' };

function paintLive() {
  $('#liveTime').textContent = fmtClock(Date.now() - live.start);
}

function toggleLive() {
  const btn = $('#liveToggle');
  const nameInput = $('#liveName');
  const catInput = $('#liveCat');

  if (!live.running) {
    live.running = true;
    live.start = Date.now();
    live.name = nameInput.value.trim();
    live.cat = catInput.value;
    btn.textContent = '结束';
    btn.classList.remove('primary');
    btn.classList.add('stop');
    $('#liveHint').textContent = '计时中…';
    nameInput.disabled = true;
    catInput.disabled = true;
    paintLive();
    return;
  }

  live.running = false;
  const sec = Math.round((Date.now() - live.start) / 1000);
  btn.textContent = '开始';
  btn.classList.remove('stop');
  btn.classList.add('primary');
  $('#liveHint').textContent = '未开始';
  nameInput.disabled = false;
  catInput.disabled = false;
  $('#liveTime').textContent = '00:00:00';

  if (sec >= 10) {
    addRecord(live.name || CATS[live.cat].name, live.cat, sec);
    toast('已记录 ' + fmtDur(sec));
  } else {
    toast('时长太短，未记录');
  }
}

function initLedger() {
  const opts = catOptionsHTML();
  $('#liveCat').innerHTML = opts;
  $('#quickCat').innerHTML = opts;
  $('#liveCat').value = 'study';
  $('#quickCat').value = 'study';

  $('#liveToggle').addEventListener('click', toggleLive);

  $('#quickAdd').addEventListener('click', () => {
    const name = $('#quickName').value.trim();
    const cat = $('#quickCat').value;
    const min = Number($('#quickMin').value);
    if (!min || min <= 0) {
      toast('请输入有效的分钟数');
      return;
    }
    addRecord(name || CATS[cat].name, cat, min * 60);
    $('#quickName').value = '';
    $('#quickMin').value = '';
    toast('已补记 ' + fmtDur(min * 60));
  });

  $('#quickMin').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') $('#quickAdd').click();
  });

  $('#logList').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-log-del]');
    if (!btn) return;
    const id = btn.dataset.logDel;
    ledger = ledger.filter((r) => r.id !== id);
    commitDelete('ledger', id);
    renderLedger();
    renderHeatmap();
    toast('已删除');
  });

  renderLedger();
}

/* =========================================================
   四、洞察
   ========================================================= */
const QUOTES = [
  '你如何度过一天，就如何度过一生。',
  '时间不是挤出来的，是选出来的。',
  '专注一小时，胜过焦虑一整天。',
  '计划不是为了约束，而是为了少一点犹豫。',
  '把大目标，拆成今天能完成的一小步。',
  '休息也是计划的一部分。',
  '记录时间，是夺回时间的第一步。',
  '别让刷手机，偷走你原本想做的事。',
  '今天的一小步，是明天的底气。',
  '慢一点没关系，别停下就好。',
  '把注意力放在哪里，人生就在哪里生根。',
  '先完成，再完美。'
];

let quoteIdx = new Date().getDate() % QUOTES.length;

function progressRow(label, pct, extra) {
  const p = Math.min(100, Math.max(0, pct));
  return (
    '<div class="prog-row">' +
    '<div class="prog-top"><span>' + label + '</span><span>' + (extra || Math.floor(p) + '%') + '</span></div>' +
    '<div class="prog-track"><i style="width:' + p.toFixed(1) + '%"></i></div>' +
    '</div>'
  );
}

function renderProgress() {
  const now = new Date();
  const dayP = ((now - startOfDay(now)) / DAY_MS) * 100;

  const weekStart = new Date(now);
  const dow = (now.getDay() + 6) % 7; // 周一为一周开始
  weekStart.setDate(now.getDate() - dow);
  weekStart.setHours(0, 0, 0, 0);
  const weekP = ((now - weekStart) / (7 * DAY_MS)) * 100;

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthP = ((now - monthStart) / (monthEnd - monthStart)) * 100;

  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearEnd = new Date(now.getFullYear() + 1, 0, 1);
  const yearP = ((now - yearStart) / (yearEnd - yearStart)) * 100;

  const box = $('#progressList');
  if (!box) return;
  box.innerHTML =
    progressRow('今天', dayP) +
    progressRow('本周', weekP) +
    progressRow('本月', monthP) +
    progressRow('今年 · ' + now.getFullYear(), yearP);
}

function renderLife() {
  const box = $('#lifeContent');
  if (!box) return;
  const saved = store.get('th.birthday', '');

  if (!saved) {
    box.innerHTML =
      '<p class="muted small">输入生日，看看时间在你生命里走了多远。数据只存在本地。</p>' +
      '<div class="custom-row"><input type="date" id="bdayInput"><button class="btn sm" id="bdaySave">保存</button></div>';
    $('#bdaySave').addEventListener('click', () => {
      const v = $('#bdayInput').value;
      if (!v) {
        toast('请选择生日');
        return;
      }
      store.set('th.birthday', v);
      renderLife();
      toast('已保存');
    });
    return;
  }

  const birth = new Date(saved + 'T00:00:00');
  const now = new Date();
  const lived = Math.floor((now - birth) / DAY_MS);
  const lifeDays = Math.round(80 * 365.25);
  const pct = Math.min(100, Math.max(0, (lived / lifeDays) * 100));
  const remain = Math.max(0, lifeDays - lived);

  let next = new Date(now.getFullYear(), birth.getMonth(), birth.getDate());
  const today0 = startOfDay(now);
  if (next < today0) next = new Date(now.getFullYear() + 1, birth.getMonth(), birth.getDate());
  const toBday = Math.max(0, Math.ceil((next - now) / DAY_MS));

  box.innerHTML =
    '<div class="life-num"><b>' + lived.toLocaleString('zh-CN') + '</b><span>天</span></div>' +
    '<p class="muted small">按 80 岁计算，你已走过人生的 ' + pct.toFixed(1) + '%，还剩约 ' +
    remain.toLocaleString('zh-CN') + ' 天。</p>' +
    '<div class="prog-track"><i style="width:' + pct.toFixed(1) + '%"></i></div>' +
    '<div class="life-foot"><span>距离下一个生日还有 <b>' + toBday + '</b> 天</span>' +
    '<button class="btn ghost sm" id="bdayEdit">重新设置</button></div>';

  $('#bdayEdit').addEventListener('click', () => {
    store.set('th.birthday', '');
    renderLife();
  });
}

function renderStats() {
  const box = $('#statGrid');
  if (!box) return;
  const recs = getRecs(dayKey());
  const total = recs.reduce((a, r) => a + r.sec, 0);
  const focus = recs.filter((r) => r.cat === 'study' || r.cat === 'work').reduce((a, r) => a + r.sec, 0);
  const waste = recs.filter((r) => WASTE.includes(r.cat)).reduce((a, r) => a + r.sec, 0);
  const eff = total ? Math.round((focus / total) * 100) : 0;

  box.innerHTML =
    '<div class="stat"><div class="v">' + getPomo() + '</div><div class="k">今日专注（番茄）</div></div>' +
    '<div class="stat"><div class="v">' + (total ? fmtDur(focus) : '—') + '</div><div class="k">学习 / 工作</div></div>' +
    '<div class="stat"><div class="v">' + (total ? eff + '%' : '—') + '</div><div class="k">有效时间占比</div></div>' +
    '<div class="stat"><div class="v">' + (total ? fmtDur(waste) : '—') + '</div><div class="k">疑似时间黑洞</div></div>';
}

function renderQuote() {
  $('#quoteText').textContent = QUOTES[quoteIdx];
}

function initInsight() {
  renderProgress();
  renderLife();
  renderStats();
  renderQuote();
  $('#quoteNext').addEventListener('click', () => {
    quoteIdx = (quoteIdx + 1) % QUOTES.length;
    renderQuote();
  });
}

/* =========================================================
   启动
   ========================================================= */
function tick() {
  updateHero();
  updateEventCounts();
  updateBirthdayCounts();
  updateCapsuleCounts();
  updateDayStrip();
  if (live.running) paintLive();
  if ($('#panel-insight').classList.contains('active')) renderProgress();

  if (tState.running) {
    document.title = fmtClock(currentMs()) + ' · 时间站';
  }
}

/* =========================================================
   协同同步：所有访问者共享同一份数据
   ========================================================= */
const CACHE_KEY = 'th.cache.v2';
const COLLECTIONS = ['events', 'birthdays', 'ledger', 'habits', 'reviews', 'capsules', 'picks'];

let habits = [];
let reviews = [];
let capsules = [];
let picks = [];
let syncRev = 0;
let syncInstance = '';
let syncOnline = false;

function cleanList(list) {
  return (Array.isArray(list) ? list : []).filter((x) => x && !x.deleted);
}

function allState() {
  return { events, birthdays, ledger, habits, reviews, capsules, picks };
}

function localHasData() {
  return COLLECTIONS.some((k) => cleanList(allState()[k]).length > 0);
}

function stateFrom(j) {
  return Object.assign({ rev: j.rev, instanceId: j.instanceId }, j.data);
}

function applyState(s) {
  if (!s) return;
  events = cleanList(s.events);
  birthdays = cleanList(s.birthdays);
  ledger = cleanList(s.ledger);
  habits = cleanList(s.habits);
  reviews = cleanList(s.reviews);
  capsules = cleanList(s.capsules);
  picks = cleanList(s.picks);
  if (typeof s.rev === 'number') syncRev = s.rev;
  if (s.instanceId) syncInstance = s.instanceId;
  cacheState();
  renderAll();
}

function cacheState() {
  store.set(CACHE_KEY, Object.assign({ rev: syncRev }, allState()));
}

function updateSyncUI() {
  const dot = $('#syncDot');
  const txt = $('#syncText');
  if (!dot || !txt) return;
  dot.className = 'sync-dot ' + (syncOnline ? 'on' : 'off');
  txt.textContent = syncOnline ? '协同中 · 修改会实时共享' : '离线 · 修改暂存本机，联网后自动同步';
}

async function fetchState() {
  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw new Error('bad');
    const j = await r.json();
    syncOnline = true;
    if (j.instanceId !== syncInstance && localHasData()) {
      await postRestore();
    } else if (j.rev !== syncRev || j.instanceId !== syncInstance) {
      applyState(stateFrom(j));
    }
  } catch (e) {
    syncOnline = false;
  }
  updateSyncUI();
}

async function postRestore() {
  const r = await fetch('/api/restore', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: allState() })
  });
  if (!r.ok) throw new Error('bad');
  const j = await r.json();
  applyState(stateFrom(j));
}

function isEmptyServer(d) {
  return !d || COLLECTIONS.every((k) => !Array.isArray(d[k]) || d[k].filter((x) => !x.deleted).length === 0);
}

function seedLocal() {
  const now = Date.now();
  if (!events.length) {
    const legacy = store.get(EV_KEY, null);
    if (Array.isArray(legacy) && legacy.length) {
      events = legacy.map((e) => Object.assign({}, e, { id: e.id || uid(), updatedAt: now }));
    } else {
      events = PRESET_EVENTS.map((e, i) =>
        Object.assign({ id: 'ev-preset-' + i, updatedAt: now }, e)
      );
    }
  }
  if (!birthdays.length) {
    const legacy = store.get(BDAY_KEY, null);
    if (Array.isArray(legacy)) birthdays = legacy.map((b) => Object.assign({}, b, { updatedAt: now }));
  }
  if (!ledger.length) {
    const legacy = store.get(LOG_KEY, null);
    if (legacy && typeof legacy === 'object') {
      Object.keys(legacy).forEach((date) => {
        (Array.isArray(legacy[date]) ? legacy[date] : []).forEach((r) => {
          ledger.push({
            id: r.id || uid(),
            date: date,
            name: r.name || '未命名',
            cat: r.cat || 'other',
            sec: r.sec || 0,
            at: r.at || now,
            updatedAt: now
          });
        });
      });
    }
  }
  if (!picks.length) {
    picks = PRESET_PICKS.map((p, i) => ({
      id: 'pk-preset-' + i,
      title: p.title,
      options: p.options.slice(),
      lastResult: '',
      updatedAt: now
    }));
  }
}

async function sendOps(ops) {
  cacheState();
  try {
    const r = await fetch('/api/mutate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: ops })
    });
    if (!r.ok) throw new Error('bad');
    const j = await r.json();
    syncOnline = true;
    applyState(stateFrom(j));
  } catch (e) {
    syncOnline = false;
  }
  updateSyncUI();
}

function commitUpsert(coll, item) {
  sendOps([{ op: 'upsert', coll: coll, item: item }]);
}

function commitDelete(coll, id) {
  sendOps([{ op: 'delete', coll: coll, id: id, ts: Date.now() }]);
}

function renderAll() {
  renderEvents();
  updateHero();
  renderBirthdays();
  updateBirthdayCounts();
  renderLedger();
  renderHabits();
  renderReviews();
  renderHeatmap();
  renderCapsules();
  renderPicks();
  renderProgress();
  renderStats();
}

async function initSync() {
  const cached = store.get(CACHE_KEY, null);
  if (cached && !isEmptyServer(cached)) applyState(cached);

  try {
    const r = await fetch('/api/state', { cache: 'no-store' });
    if (!r.ok) throw new Error('bad');
    const j = await r.json();
    syncOnline = true;
    syncInstance = j.instanceId || '';
    if (isEmptyServer(j.data)) {
      seedLocal();
      cacheState();
      renderAll();
      await postRestore();
    } else if (localHasData()) {
      await postRestore();
    } else {
      applyState(stateFrom(j));
    }
  } catch (e) {
    syncOnline = false;
  }

  updateSyncUI();
  setInterval(() => {
    if (!document.hidden) fetchState();
  }, 4000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) fetchState();
  });
}

/* =========================================================
   三、习惯打卡
   ========================================================= */
const HABIT_EMOJI = ['📚', '🏃', '💧', '🧘', '🌙', '💪', '✍️', '🎧'];
let editingHabitId = null;
let hbEmoji = '📚';

function habitStreak(h) {
  const checks = h.checks || {};
  const d = startOfDay(new Date());
  if (!checks[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (checks[dayKey(d)] && n < 3660) {
    n += 1;
    d.setDate(d.getDate() - 1);
  }
  return n;
}

function renderHabits() {
  const grid = $('#habitGrid');
  if (!grid) return;
  if (!habits.length) {
    grid.innerHTML = '<div class="empty">还没有习惯。添加「背单词」「早起」「运动」，每天点一下打卡。</div>';
    return;
  }
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const todayK = dayKey(now);
  const monthPrefix = y + '-' + pad(m + 1) + '-';

  grid.innerHTML = habits
    .map((h) => {
      const checks = h.checks || {};
      const checked = !!checks[todayK];
      let monthCount = 0;
      let cells = '';
      for (let d = 1; d <= dim; d++) {
        const k = monthPrefix + pad(d);
        const on = !!checks[k];
        if (on) monthCount += 1;
        cells +=
          '<i class="' + (on ? 'on' : '') + (k === todayK ? ' today' : '') +
          (k > todayK ? ' future' : '') + '" title="' + k + '"></i>';
      }
      return (
        '<article class="card habit-card" data-habit-id="' + h.id + '">' +
        '<div class="habit-top"><span class="habit-emoji">' + esc(h.emoji || '✅') + '</span>' +
        '<div class="habit-info"><b>' + esc(h.name) + '</b>' +
        '<span class="hint">连续 ' + habitStreak(h) + ' 天 · 本月 ' + monthCount + ' 次</span></div>' +
        '<button class="habit-del" data-habit-del="' + h.id + '" aria-label="删除">×</button></div>' +
        '<div class="habit-month">' + cells + '</div>' +
        '<button class="btn ' + (checked ? 'ghost' : 'primary') + ' sm habit-check" data-habit-check="' + h.id + '">' +
        (checked ? '今日已打卡' : '今日打卡') + '</button></article>'
      );
    })
    .join('');
}

function toggleHabit(id) {
  const h = habits.find((x) => x.id === id);
  if (!h) return;
  h.checks = h.checks || {};
  const k = dayKey();
  if (h.checks[k]) delete h.checks[k];
  else h.checks[k] = true;
  h.updatedAt = Date.now();
  commitUpsert('habits', h);
  renderHabits();
  renderHeatmap();
  toast(h.checks[k] ? '打卡成功，连续 ' + habitStreak(h) + ' 天' : '已取消打卡');
}

function openHabitModal(id) {
  editingHabitId = id || null;
  const h = id ? habits.find((x) => x.id === id) : null;
  $('#habitModalTitle').textContent = h ? '编辑习惯' : '添加习惯';
  $('#hbName').value = h ? h.name : '';
  hbEmoji = h ? h.emoji || '📚' : HABIT_EMOJI[0];
  $$('#hbEmojiRow button').forEach((b) => b.classList.toggle('active', b.dataset.emoji === hbEmoji));
  $('#habitModal').hidden = false;
  setTimeout(() => $('#hbName').focus(), 50);
}

function closeHabitModal() {
  $('#habitModal').hidden = true;
  editingHabitId = null;
}

function saveHabit() {
  const name = $('#hbName').value.trim();
  if (!name) {
    toast('请填写习惯名称');
    return;
  }
  const old = editingHabitId ? habits.find((x) => x.id === editingHabitId) : null;
  const item = {
    id: old ? old.id : uid(),
    name: name,
    emoji: hbEmoji,
    checks: old ? old.checks || {} : {},
    createdAt: old ? old.createdAt || Date.now() : Date.now(),
    updatedAt: Date.now()
  };
  const i = habits.findIndex((x) => x.id === item.id);
  if (i >= 0) habits[i] = item;
  else habits.push(item);
  commitUpsert('habits', item);
  renderHabits();
  renderHeatmap();
  closeHabitModal();
  toast(old ? '已更新' : '已添加习惯');
}

function initHabits() {
  renderHabits();
  $('#addHabitBtn').addEventListener('click', () => openHabitModal(null));
  $('#hbSave').addEventListener('click', saveHabit);
  $('#habitModal').addEventListener('click', (e) => {
    if (e.target.closest('[data-habit-close]')) closeHabitModal();
  });
  $('#hbEmojiRow').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    hbEmoji = b.dataset.emoji;
    $$('#hbEmojiRow button').forEach((x) => x.classList.toggle('active', x === b));
  });
  $('#hbName').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveHabit();
  });
  $('#habitGrid').addEventListener('click', (e) => {
    const del = e.target.closest('[data-habit-del]');
    if (del) {
      const id = del.dataset.habitDel;
      const h = habits.find((x) => x.id === id);
      if (h && window.confirm('删除习惯「' + h.name + '」？')) {
        habits = habits.filter((x) => x.id !== id);
        commitDelete('habits', id);
        renderHabits();
        renderHeatmap();
        toast('已删除');
      }
      return;
    }
    const chk = e.target.closest('[data-habit-check]');
    if (chk) toggleHabit(chk.dataset.habitCheck);
    const card = e.target.closest('.habit-card');
    if (card && e.target.closest('.habit-top')) openHabitModal(card.dataset.habitId);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#habitModal').hidden) closeHabitModal();
  });
}

/* =========================================================
   四、每日复盘
   ========================================================= */
let reviewDate = dayKey();

function findReview(date) {
  return reviews.find((r) => r.date === date);
}

function fmtDateTime(v) {
  const d = new Date(v);
  if (isNaN(d.getTime())) return '—';
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function renderReviewHistory() {
  const box = $('#reviewHistory');
  if (!box) return;
  const list = reviews.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);
  if (!list.length) {
    box.innerHTML = '<div class="empty small">还没有复盘记录，从今天开始吧。</div>';
  } else {
    box.innerHTML = list
      .map(
        (r) =>
          '<button class="review-item" data-review-date="' + r.date + '"><b>' + r.date + '</b>' +
          '<span>' + esc((r.next || r.good || '（空）').slice(0, 42)) + '</span></button>'
      )
      .join('');
  }
  const now = new Date();
  const dow = (now.getDay() + 6) % 7;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
  const weekCount = reviews.filter((r) => new Date(r.date + 'T00:00:00') >= start).length;
  const stat = $('#reviewWeekStat');
  if (stat) stat.textContent = '本周已复盘 ' + weekCount + ' 天';
}

function renderReviews() {
  const input = $('#reviewDate');
  if (!input) return;
  if (!input.value) input.value = reviewDate;
  reviewDate = input.value;
  const rv = findReview(reviewDate);
  const active = document.activeElement;
  const typing = active && active.closest && active.closest('.review-card') && active.tagName !== 'BUTTON';
  if (!typing) {
    $('#rvGood').value = rv ? rv.good : '';
    $('#rvBad').value = rv ? rv.bad : '';
    $('#rvNext').value = rv ? rv.next : '';
  }
  $('#reviewSavedHint').textContent = rv
    ? '已保存 ' + fmtDateTime(rv.updatedAt)
    : '还没有这一天的复盘';
  renderReviewHistory();
}

function loadReviewForm(date) {
  reviewDate = date;
  $('#reviewDate').value = date;
  const rv = findReview(date);
  $('#rvGood').value = rv ? rv.good : '';
  $('#rvBad').value = rv ? rv.bad : '';
  $('#rvNext').value = rv ? rv.next : '';
  $('#reviewSavedHint').textContent = rv ? '已保存 ' + fmtDateTime(rv.updatedAt) : '还没有这一天的复盘';
}

function saveReview() {
  const date = $('#reviewDate').value || dayKey();
  const good = $('#rvGood').value.trim();
  const bad = $('#rvBad').value.trim();
  const next = $('#rvNext').value.trim();
  if (!good && !bad && !next) {
    toast('写点什么再保存吧');
    return;
  }
  const old = findReview(date);
  const item = {
    id: old ? old.id : 'rv-' + date,
    date: date,
    good: good,
    bad: bad,
    next: next,
    updatedAt: Date.now()
  };
  const i = reviews.findIndex((r) => r.date === date);
  if (i >= 0) reviews[i] = item;
  else reviews.push(item);
  commitUpsert('reviews', item);
  renderReviews();
  renderHeatmap();
  toast('复盘已保存');
}

function initReviews() {
  const input = $('#reviewDate');
  input.value = dayKey();
  reviewDate = input.value;
  $('#reviewSave').addEventListener('click', saveReview);
  input.addEventListener('change', () => {
    reviewDate = input.value || dayKey();
    renderReviews();
  });
  $('#reviewHistory').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-review-date]');
    if (btn) loadReviewForm(btn.dataset.reviewDate);
  });
  renderReviews();
}

/* =========================================================
   五、活动热力图
   ========================================================= */
function renderHeatmap() {
  const box = $('#heatmap');
  if (!box) return;
  const score = {};
  ledger.forEach((r) => {
    score[r.date] = (score[r.date] || 0) + (r.sec || 0) / 60;
  });
  habits.forEach((h) => {
    Object.keys(h.checks || {}).forEach((k) => {
      if (h.checks[k]) score[k] = (score[k] || 0) + 30;
    });
  });
  reviews.forEach((r) => {
    score[r.date] = (score[r.date] || 0) + 15;
  });

  const today = startOfDay(new Date());
  const start = new Date(today);
  start.setDate(today.getDate() - (52 * 7 + today.getDay()));
  let cells = '';
  const d = new Date(start);
  while (d <= today) {
    const k = dayKey(d);
    const v = score[k] || 0;
    const lv = v <= 0 ? 0 : v < 30 ? 1 : v < 60 ? 2 : v < 120 ? 3 : 4;
    cells += '<i class="heat-cell lv' + lv + '" title="' + k + ' · 活跃 ' + Math.round(v) + ' 分"></i>';
    d.setDate(d.getDate() + 1);
  }
  box.innerHTML = cells;
}

/* =========================================================
   六、时间胶囊
   ========================================================= */
let editingCapsuleId = null;

function renderCapsules() {
  const grid = $('#capsuleGrid');
  if (!grid) return;
  if (!capsules.length) {
    grid.innerHTML = '<div class="empty">还没有时间胶囊。写一封给未来的自己，到期自动解锁。</div>';
    return;
  }
  const now = Date.now();
  const list = capsules.slice().sort((a, b) => new Date(a.openAt).getTime() - new Date(b.openAt).getTime());
  grid.innerHTML = list
    .map((c) => {
      const open = new Date(c.openAt).getTime();
      const unlocked = open <= now;
      const days = Math.max(0, Math.ceil((open - now) / DAY_MS));
      return (
        '<article class="card capsule-card' + (unlocked ? ' open' : '') + '">' +
        '<div class="capsule-head"><span class="capsule-icon">' + (unlocked ? '📬' : '🔒') + '</span>' +
        '<div class="capsule-title"><b>' + esc(c.title) + '</b>' +
        '<span class="hint">解锁于 ' + fmtDateTime(c.openAt) + '</span></div>' +
        '<button class="habit-del" data-capsule-del="' + c.id + '" aria-label="删除">×</button></div>' +
        (unlocked
          ? '<p class="capsule-text">' + esc(c.content).replace(/\n/g, '<br>') + '</p>'
          : '<div class="capsule-lock"><b data-capsule-count="' + c.id + '">还有 ' + days + ' 天</b><span>到时间才能打开</span></div>') +
        '</article>'
      );
    })
    .join('');
}

function updateCapsuleCounts() {
  const now = Date.now();
  $$('[data-capsule-count]').forEach((el) => {
    const c = capsules.find((x) => x.id === el.dataset.capsuleCount);
    if (!c) return;
    const left = new Date(c.openAt).getTime() - now;
    if (left <= 0) {
      renderCapsules();
      return;
    }
    el.textContent = '还有 ' + Math.ceil(left / DAY_MS) + ' 天';
  });
}

function openCapsuleModal() {
  editingCapsuleId = null;
  $('#cpTitle').value = '';
  $('#cpContent').value = '';
  const d = new Date(Date.now() + 365 * DAY_MS);
  $('#cpOpenAt').value =
    d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  $('#capsuleModal').hidden = false;
  setTimeout(() => $('#cpTitle').focus(), 50);
}

function closeCapsuleModal() {
  $('#capsuleModal').hidden = true;
}

function saveCapsule() {
  const title = $('#cpTitle').value.trim();
  const content = $('#cpContent').value.trim();
  const openAt = $('#cpOpenAt').value;
  if (!title) {
    toast('请填写标题');
    return;
  }
  if (!content) {
    toast('写点内容再封存');
    return;
  }
  if (!openAt || new Date(openAt).getTime() <= Date.now()) {
    toast('解锁时间需要晚于现在');
    return;
  }
  const item = {
    id: uid(),
    title: title,
    content: content,
    openAt: openAt,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  capsules.push(item);
  commitUpsert('capsules', item);
  renderCapsules();
  closeCapsuleModal();
  toast('已封存，到期自动解锁');
}

function initCapsules() {
  renderCapsules();
  $('#addCapsuleBtn').addEventListener('click', openCapsuleModal);
  $('#cpSave').addEventListener('click', saveCapsule);
  $('#capsuleModal').addEventListener('click', (e) => {
    if (e.target.closest('[data-capsule-close]')) closeCapsuleModal();
  });
  $('#capsuleGrid').addEventListener('click', (e) => {
    const del = e.target.closest('[data-capsule-del]');
    if (!del) return;
    const id = del.dataset.capsuleDel;
    const c = capsules.find((x) => x.id === id);
    if (c && window.confirm('删除时间胶囊「' + c.title + '」？')) {
      capsules = capsules.filter((x) => x.id !== id);
      commitDelete('capsules', id);
      renderCapsules();
      toast('已删除');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#capsuleModal').hidden) closeCapsuleModal();
  });
}

/* =========================================================
   七、随机决定器
   ========================================================= */
const PRESET_PICKS = [
  { title: '今天吃什么', options: ['火锅', '烧烤', '日料', '米线', '汉堡', '麻辣烫'] },
  { title: '今天做什么', options: ['散步', '看剧', '读书', '运动', '收拾房间', '早点睡'] },
  { title: '谁买单', options: ['我', '你', '他', 'AA', '猜拳输的'] }
];

let editingPickId = null;
const pickTimers = {};

function renderPicks() {
  const grid = $('#pickGrid');
  if (!grid) return;
  if (!picks.length) {
    grid.innerHTML = '<div class="empty">还没有决定器。新建一个，让随机帮你做决定。</div>';
    return;
  }
  grid.innerHTML = picks
    .map(
      (p) =>
        '<article class="card pick-card"><div class="pick-head"><b>' + esc(p.title) + '</b>' +
        '<button class="habit-del" data-pick-del="' + p.id + '" aria-label="删除">×</button></div>' +
        '<div class="pick-result" data-pick-result="' + p.id + '">' +
        (p.lastResult ? esc(p.lastResult) : '点击下方按钮抽取') + '</div>' +
        '<div class="pick-options">' +
        (p.options || []).map((o) => '<span>' + esc(o) + '</span>').join('') +
        '</div><div class="pick-actions">' +
        '<button class="btn primary sm" data-pick-draw="' + p.id + '">抽一个</button>' +
        '<button class="btn ghost sm" data-pick-edit="' + p.id + '">编辑</button></div></article>'
    )
    .join('');
}

function drawPick(id) {
  const p = picks.find((x) => x.id === id);
  if (!p || !p.options || !p.options.length || pickTimers[id]) return;
  const box = document.querySelector('[data-pick-result="' + id + '"]');
  let n = 0;
  pickTimers[id] = setInterval(() => {
    n += 1;
    if (box) box.textContent = p.options[Math.floor(Math.random() * p.options.length)];
    if (n >= 14) {
      clearInterval(pickTimers[id]);
      delete pickTimers[id];
      const result = p.options[Math.floor(Math.random() * p.options.length)];
      if (box) box.textContent = result;
      p.lastResult = result;
      p.updatedAt = Date.now();
      commitUpsert('picks', p);
    }
  }, 55);
}

function openPickModal(id) {
  editingPickId = id || null;
  const p = id ? picks.find((x) => x.id === id) : null;
  $('#pickModalTitle').textContent = p ? '编辑决定器' : '新建决定器';
  $('#pkTitle').value = p ? p.title : '';
  $('#pkOptions').value = p ? (p.options || []).join('\n') : '';
  $('#pickModal').hidden = false;
  setTimeout(() => $('#pkTitle').focus(), 50);
}

function closePickModal() {
  $('#pickModal').hidden = true;
  editingPickId = null;
}

function savePick() {
  const title = $('#pkTitle').value.trim();
  const options = $('#pkOptions')
    .value.split('\n')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!title) {
    toast('请填写标题');
    return;
  }
  if (options.length < 2) {
    toast('至少填写 2 个候选项');
    return;
  }
  const item = {
    id: editingPickId || uid(),
    title: title,
    options: options,
    lastResult: '',
    updatedAt: Date.now()
  };
  const i = picks.findIndex((x) => x.id === item.id);
  if (i >= 0) {
    item.lastResult = picks[i].lastResult || '';
    picks[i] = item;
  } else {
    picks.push(item);
  }
  commitUpsert('picks', item);
  renderPicks();
  closePickModal();
  toast('已保存');
}

function initPicks() {
  renderPicks();
  $('#addPickBtn').addEventListener('click', () => openPickModal(null));
  $('#pkSave').addEventListener('click', savePick);
  $('#pickModal').addEventListener('click', (e) => {
    if (e.target.closest('[data-pick-close]')) closePickModal();
  });
  $('#pickGrid').addEventListener('click', (e) => {
    const del = e.target.closest('[data-pick-del]');
    if (del) {
      const id = del.dataset.pickDel;
      const p = picks.find((x) => x.id === id);
      if (p && window.confirm('删除决定器「' + p.title + '」？')) {
        picks = picks.filter((x) => x.id !== id);
        commitDelete('picks', id);
        renderPicks();
        toast('已删除');
      }
      return;
    }
    const draw = e.target.closest('[data-pick-draw]');
    if (draw) drawPick(draw.dataset.pickDraw);
    const edit = e.target.closest('[data-pick-edit]');
    if (edit) openPickModal(edit.dataset.pickEdit);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#pickModal').hidden) closePickModal();
  });
}

function init() {
  initTheme();
  initTabs();
  initCountdown();
  initBirthdays();
  initTimer();
  initLedger();
  initInsight();
  initHabits();
  initReviews();
  initCapsules();
  initPicks();
  initSync();
  tick();
  setInterval(tick, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
