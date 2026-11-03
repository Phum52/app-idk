/* ตรวจเขต: บันทึกการตรวจความสะอาดประจำวัน ออฟไลน์ ข้อมูลเก็บในเครื่องเท่านั้น */
(function () {
  'use strict';

  const KEY = 'inspect.v1';
  const VERSION = '1.0';
  const DEFAULT_ITEMS = ['ลานกีฬาเปตอง', 'โต๊ะหินอ่อน', 'ม้านั่งใต้ต้นจามจุรี'];
  const REASONS = ['มีขยะ', 'ใบไม้/ฝุ่นเยอะ', 'เปียก/ลื่น', 'มีคราบสกปรก', 'ชำรุด/เสียหาย'];
  const LIM = { name: 60, note: 200, daynote: 300, title: 40 };
  const PAGE_DAYS = 45;
  const EPOCH = '1970-01-01';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = s => String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  /* ---------- วันที่ (เวลาท้องถิ่น เก็บเป็น YYYY-MM-DD) ---------- */
  const DAY = 86400000;
  const pad = n => String(n).padStart(2, '0');
  const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const today = () => ymd(new Date());
  function parseYmd(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(typeof s === 'string' ? s : '');
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3]);
    return d.getFullYear() === +m[1] && d.getMonth() === +m[2] - 1 && d.getDate() === +m[3] ? d : null;
  }
  function shift(s, n) { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); }
  const diff = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / DAY);

  const fWeekday = new Intl.DateTimeFormat('th-TH', { weekday: 'long' });
  const fWeekdayS = new Intl.DateTimeFormat('th-TH', { weekday: 'short' });
  const fMonthL = new Intl.DateTimeFormat('th-TH', { month: 'long' });
  const fMonthS = new Intl.DateTimeFormat('th-TH', { month: 'short' });
  const fDayMonth = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short' });
  const be = d => d.getFullYear() + 543;
  const nf = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 0 });

  // สัปดาห์ที่ของเดือน: สัปดาห์ที่ 1 คือสัปดาห์ที่มีวันที่ 1 ของเดือน
  function weekOfMonth(d, ws) {
    const off = (new Date(d.getFullYear(), d.getMonth(), 1).getDay() - ws + 7) % 7;
    return Math.floor((d.getDate() - 1 + off) / 7) + 1;
  }
  // สัปดาห์ที่ของปี: สัปดาห์ที่ 1 คือสัปดาห์ที่มีวันที่ 1 ม.ค.
  function weekOfYear(d, ws) {
    const jan1 = new Date(d.getFullYear(), 0, 1);
    const off = (jan1.getDay() - ws + 7) % 7;
    const doy = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - jan1) / DAY);
    return Math.floor((doy + off) / 7) + 1;
  }
  const weekKey = (d, ws) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${weekOfMonth(d, ws)}`;

  /* ---------- ข้อมูล ---------- */
  const str = (v, max) => (typeof v === 'string' || typeof v === 'number') ? String(v).trim().slice(0, max) : '';
  function blank() {
    return {
      v: 1, title: '', weekStart: 1, remind: '', startDate: today(),
      items: DEFAULT_ITEMS.map(name => ({ id: uid(), name, since: EPOCH, until: '' })),
      days: {},
    };
  }

  function sanitize(raw) {
    const out = { v: 1, title: '', weekStart: 1, remind: '', startDate: today(), items: [], days: {} };
    if (!raw || typeof raw !== 'object') return out;
    out.title = str(raw.title, LIM.title);
    out.weekStart = raw.weekStart === 0 ? 0 : 1;
    out.remind = /^([01]\d|2[0-3]):[0-5]\d$/.test(raw.remind) ? raw.remind : '';
    out.startDate = parseYmd(raw.startDate) ? raw.startDate : today();
    const ids = new Set();
    (Array.isArray(raw.items) ? raw.items : []).slice(0, 50).forEach(i => {
      if (!i || typeof i !== 'object') return;
      const name = str(i.name, LIM.name);
      if (!name) return;
      let id = str(i.id, 40) || uid();
      if (ids.has(id)) id = uid();
      ids.add(id);
      out.items.push({
        id, name,
        since: parseYmd(i.since) ? i.since : EPOCH,
        until: parseYmd(i.until) ? i.until : '',
      });
    });
    let n = 0;
    const src = raw.days && typeof raw.days === 'object' ? raw.days : {};
    Object.keys(src).sort().forEach(k => {
      if (!parseYmd(k) || n >= 5000) return;
      const day = src[k];
      if (!day || typeof day !== 'object') return;
      const r = {};
      const sr = day.r && typeof day.r === 'object' ? day.r : {};
      Object.keys(sr).forEach(id => {
        const x = sr[id];
        if (!ids.has(id) || !x || typeof x !== 'object' || (x.s !== 'c' && x.s !== 'd')) return;
        r[id] = { s: x.s, t: Number(x.t) || 0, n: x.s === 'd' ? str(x.n, LIM.note) : '' };
      });
      const note = str(day.note, LIM.daynote);
      if (Object.keys(r).length || note) { out.days[k] = { r, note }; n++; }
    });
    return out;
  }

  function load() {
    let raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { /* ใช้ในหน่วยความจำ */ }
    if (!raw) return blank();
    try { return sanitize(JSON.parse(raw)); }
    catch (e) {
      try { localStorage.setItem(KEY + '.bad', raw); } catch (e2) { /* ไม่เป็นไร */ }
      return blank();
    }
  }
  let saveWarned = false;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) {
      if (!saveWarned) { saveWarned = true; toast('บันทึกลงเครื่องไม่ได้ ข้อมูลอาจหายเมื่อปิดแอป'); }
    }
  }
  let state = load();
  save();
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ไม่เป็นไร */ }

  /* ---------- ตัวช่วยอ่านข้อมูล ---------- */
  const item = id => state.items.find(i => i.id === id);
  function itemsForDay(d) {
    const rec = state.days[d];
    return state.items.filter(i => (i.since <= d && (!i.until || d <= i.until)) || (rec && rec.r[i.id]));
  }
  function ensureDay(d) { return state.days[d] || (state.days[d] = { r: {}, note: '' }); }
  function tidyDay(d) {
    const x = state.days[d];
    if (x && !Object.keys(x.r).length && !x.note) delete state.days[d];
  }

  // kind: none | missed | pending | partial | issue | clean
  function dayInfo(d) {
    const L = itemsForDay(d), rec = state.days[d];
    let c = 0, bad = 0;
    L.forEach(i => { const x = rec && rec.r[i.id]; if (x) { if (x.s === 'c') c++; else bad++; } });
    const u = L.length - c - bad;
    let kind;
    if (!L.length) kind = 'none';
    else if (c + bad === 0) kind = d === today() ? 'pending' : 'missed';
    else if (u > 0) kind = 'partial';
    else kind = bad ? 'issue' : 'clean';
    return { L, c, bad, u, kind };
  }
  const complete = k => k === 'clean' || k === 'issue';

  function firstDate() {
    const ks = Object.keys(state.days).sort();
    return ks.length && ks[0] < state.startDate ? ks[0] : state.startDate;
  }

  function streak() {
    let d = today();
    if (!complete(dayInfo(d).kind)) d = shift(d, -1);
    let n = 0;
    while (n < 3650 && complete(dayInfo(d).kind)) { n++; d = shift(d, -1); }
    return n;
  }

  function periodStats(from) {
    const t = today();
    let days = 0, full = 0, missed = 0, bad = 0;
    const per = {};
    state.items.filter(i => !i.until || i.until >= t).forEach(i => { per[i.id] = { c: 0, d: 0 }; });
    for (let d = from; d <= t; d = shift(d, 1)) {
      const info = dayInfo(d);
      if (info.kind === 'none') continue;
      if (d === t && info.kind === 'pending') continue;
      days++;
      if (complete(info.kind)) full++;
      if (info.kind === 'missed') missed++;
      const rec = state.days[d];
      info.L.forEach(i => {
        const x = rec && rec.r[i.id];
        if (!x) return;
        if (x.s === 'd') bad++;
        if (per[i.id]) per[i.id][x.s]++;
      });
    }
    return { days, full, missed, bad, per };
  }

  /* ---------- สถานะหน้าจอ ---------- */
  let tab = 'today';
  let sel = null;                 // วันที่กำลังดู (null = วันนี้)
  let hist = PAGE_DAYS;           // จำนวนวันที่แสดงในประวัติ
  let speriod = 'month';          // สรุป: month | all
  let view = null;
  let sheetOpen = false, sheetPushed = false, ignorePop = 0;
  const curDate = () => sel || today();

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('plain', 'show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
  }
  function arm(btn, text) {
    if (btn.dataset.armed) return true;
    btn.dataset.armed = '1';
    btn.dataset.orig = btn.textContent;
    btn.textContent = text;
    setTimeout(() => {
      if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = btn.dataset.orig; }
    }, 3000);
    return false;
  }

  /* ---------- ไอคอน ---------- */
  const I = {
    gear: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2.2"/><circle cx="9" cy="17" r="2.2"/></svg>',
    prev: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    cal: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>',
    ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    no: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  /* ---------- หน้าวันนี้ ---------- */
  function topBar() {
    return `<header class="top">
      <div class="top-l">${state.title ? '<span class="hello">ตรวจเขตประจำวัน</span>' : ''}<h1>${esc(state.title || 'ตรวจเขต')}</h1></div>
      <div class="top-r"><button class="round glass" data-action="settings" aria-label="ตั้งค่า">${I.gear}</button></div>
    </header>`;
  }

  function weekChips(dt) {
    const ws = state.weekStart;
    return `<span class="badge">สัปดาห์ที่ ${weekOfMonth(dt, ws)} ของเดือน</span><span class="badge soft">สัปดาห์ที่ ${weekOfYear(dt, ws)} ของปี</span>`;
  }

  function itemCard(i, n, rec, d) {
    const x = rec && rec.r[i.id];
    const s = x ? x.s : '';
    let when = '';
    if (x) when = x.t && ymd(new Date(x.t)) === d ? 'ตรวจ ' + new Date(x.t).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', hour12: false }) + ' น.' : 'บันทึกย้อนหลัง';
    const why = s === 'd' ? `<div class="why">
        <div class="pick">${REASONS.map(r => `<button type="button" class="chip" data-action="reason" data-id="${esc(i.id)}" data-v="${esc(r)}">${esc(r)}</button>`).join('')}</div>
        <input class="input" data-note="${esc(i.id)}" maxlength="${LIM.note}" autocomplete="off" placeholder="สิ่งที่พบ (ไม่ใส่ก็ได้)" value="${esc(x.n || '')}">
      </div>` : '';
    return `<section class="item glass ${s === 'c' ? 'ok' : s === 'd' ? 'bad' : ''}">
      <div class="item-h"><span class="n">${n}</span><h3>${esc(i.name)}</h3><span class="when">${when}</span></div>
      <div class="judge" role="radiogroup" aria-label="${esc(i.name)}">
        <button class="j clean ${s === 'c' ? 'on' : ''}" data-action="mark" data-id="${esc(i.id)}" data-v="c" role="radio" aria-checked="${s === 'c'}">${I.ok}สะอาด</button>
        <button class="j dirty ${s === 'd' ? 'on' : ''}" data-action="mark" data-id="${esc(i.id)}" data-v="d" role="radio" aria-checked="${s === 'd'}">${I.no}ไม่สะอาด</button>
      </div>
      ${why}
    </section>`;
  }

  function todayPage(anim) {
    const d = curDate(), isToday = d === today(), dt = parseYmd(d);
    const info = dayInfo(d), rec = state.days[d];
    const marked = info.c + info.bad;
    const pct = info.L.length ? marked / info.L.length : 0;
    let body;
    if (!info.L.length) {
      body = `<div class="empty glass"><div class="mark">${I.cal.replace('width="18" height="18"', 'width="40" height="40"')}</div>
        <h2>ยังไม่มีรายการที่ต้องตรวจ</h2><p>เพิ่มจุดที่ต้องตรวจได้ที่ตั้งค่า เช่น ลานกีฬา โต๊ะ ม้านั่ง</p>
        <button class="btn primary" data-action="settings">ไปที่ตั้งค่า</button></div>`;
    } else {
      body = info.L.map((i, k) => itemCard(i, k + 1, rec, d)).join('');
      if (complete(info.kind)) {
        body += info.bad
          ? `<div class="done-banner issue">ตรวจครบแล้ว พบจุดไม่สะอาด ${info.bad} จุด</div>`
          : '<div class="done-banner">ตรวจครบแล้ว สะอาดทุกจุด</div>';
      }
      body += `<div class="field"><label for="day-note">โน้ตของวันนี้ (ไม่ใส่ก็ได้)</label>
        <textarea class="input" id="day-note" maxlength="${LIM.daynote}" placeholder="เช่น ฝนตกช่วงเช้า">${esc(rec ? rec.note : '')}</textarea></div>`;
    }
    return `<div class="wrap${anim ? ' enter' : ''}">
      ${topBar()}
      <section class="today-card glass deep">
        <div class="lbl">${esc(fWeekday.format(dt))}${isToday ? ' · วันนี้' : ''}</div>
        <div class="num">${dt.getDate()} ${esc(fMonthS.format(dt))}<small>${be(dt)}</small></div>
        <div class="chips-row">${weekChips(dt)}</div>
        ${info.L.length ? `<div class="prog"><span>ตรวจแล้ว ${marked}/${info.L.length} จุด</span>${info.bad ? `<span>ไม่สะอาด ${info.bad}</span>` : ''}</div>
        <div class="bar"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>` : ''}
      </section>
      <div class="datebar">
        <button class="round glass" data-action="prevday" aria-label="วันก่อนหน้า">${I.prev}</button>
        <label class="datechip glass">${I.cal}<span>เลือกวันที่</span>
          <input type="date" id="jump" max="${today()}" value="${d}" aria-label="เลือกวันที่"></label>
        <button class="round glass" data-action="nextday" aria-label="วันถัดไป" ${isToday ? 'disabled' : ''}>${I.next}</button>
      </div>
      ${isToday ? '' : `<p class="past-note">กำลังดูย้อนหลัง · กรอกวันที่ลืมได้เลย</p>
        <button class="btn soft back-today" data-action="gotoday">กลับมาวันนี้</button>`}
      ${body}
    </div>`;
  }

  /* ---------- หน้าประวัติ ---------- */
  function dayRow(d) {
    const dt = parseYmd(d), info = dayInfo(d);
    let sub;
    switch (info.kind) {
      case 'clean': sub = '<span class="dsub clean">สะอาดทุกจุด</span>'; break;
      case 'issue': sub = `<span class="dsub issue">ไม่สะอาด ${info.bad} จุด</span>`; break;
      case 'partial': sub = `<span class="dsub">ตรวจแล้ว ${info.c + info.bad}/${info.L.length} จุด</span>`; break;
      case 'missed': sub = '<span class="dsub missed">ลืมตรวจ</span>'; break;
      case 'pending': sub = '<span class="dsub">ยังไม่ได้ตรวจ</span>'; break;
      default: sub = '<span class="dsub">ไม่มีจุดตรวจ</span>';
    }
    const rec = state.days[d];
    const dots = info.L.map(i => { const x = rec && rec.r[i.id]; return `<i class="${x ? x.s : ''}"></i>`; }).join('');
    return `<button class="day glass" data-action="goday" data-d="${d}">
      <span class="dnum ${info.kind}"><b>${dt.getDate()}</b><small>${esc(fWeekdayS.format(dt))}</small></span>
      <span class="dinfo"><span class="dname">${esc(fWeekday.format(dt))}ที่ ${esc(fDayMonth.format(dt))}</span>${sub}</span>
      <span class="dots" aria-hidden="true">${dots}</span>
    </button>`;
  }

  function historyPage(anim) {
    const t = today(), first = firstDate();
    const all = [];
    for (let d = t; d >= first && all.length < 5000; d = shift(d, -1)) all.push(d);
    const shown = all.slice(0, hist);
    const groups = [];
    shown.forEach(d => {
      const dt = parseYmd(d), k = weekKey(dt, state.weekStart);
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) groups.push(g = { k, dt, days: [] });
      g.days.push(d);
    });
    const body = groups.map(g => {
      const rows = g.days.filter(d => dayInfo(d).kind !== 'none');
      const full = rows.filter(d => complete(dayInfo(d).kind)).length;
      return `<div class="group-h"><span>สัปดาห์ที่ ${weekOfMonth(g.dt, state.weekStart)} · ${esc(fMonthL.format(g.dt))} ${be(g.dt)}</span>
        <span class="gr">ครบ ${full}/${rows.length} วัน<button class="copy" data-action="copyweek" data-d="${g.days[0]}">คัดลอก</button></span></div>
        <div class="list">${g.days.map(dayRow).join('')}</div>`;
    }).join('');
    return `<div class="wrap${anim ? ' enter' : ''}">
      <header class="top"><div class="top-l"><h1>ประวัติ</h1></div>
        <div class="top-r"><button class="round glass" data-action="settings" aria-label="ตั้งค่า">${I.gear}</button></div></header>
      <p class="note">แตะวันที่เพื่อดูหรือกรอกย้อนหลัง · กด "คัดลอก" เพื่อเอารายงานสัปดาห์ไปวางใน LINE</p>
      ${body}
      ${all.length > hist ? '<button class="btn soft more" data-action="more">ดูย้อนหลังเพิ่ม</button>' : ''}
    </div>`;
  }

  /* ---------- หน้าสรุป ---------- */
  function statsPage(anim) {
    const t = today(), dt = parseYmd(t);
    const from = speriod === 'month' ? ymd(new Date(dt.getFullYear(), dt.getMonth(), 1)) : firstDate();
    const st = periodStats(from);
    const sk = streak();
    const rows = state.items.filter(i => !i.until || i.until >= t).map(i => {
      const p = st.per[i.id] || { c: 0, d: 0 }, n = p.c + p.d;
      const pct = n ? Math.round(p.c / n * 100) : null;
      return `<div class="rate glass">
        <div class="rate-h"><h3>${esc(i.name)}</h3><b>${pct === null ? '-' : pct + '%'}</b></div>
        <div class="bar"><i style="width:${pct === null ? 0 : pct}%"></i></div>
        <span class="note">${n ? `สะอาด ${p.c} ครั้ง · ไม่สะอาด ${p.d} ครั้ง` : 'ยังไม่มีข้อมูล'}</span>
      </div>`;
    }).join('');
    const label = speriod === 'month' ? `เดือน${fMonthL.format(dt)}` : 'ทั้งหมด';
    return `<div class="wrap${anim ? ' enter' : ''}">
      <header class="top"><div class="top-l"><h1>สรุป</h1></div>
        <div class="top-r"><button class="round glass" data-action="settings" aria-label="ตั้งค่า">${I.gear}</button></div></header>
      <div class="seg two" style="--i:${speriod === 'all' ? 1 : 0}" role="tablist">
        <i></i>
        <button class="${speriod === 'month' ? 'on' : ''}" data-action="sp" data-v="month" role="tab" aria-selected="${speriod === 'month'}">เดือนนี้</button>
        <button class="${speriod === 'all' ? 'on' : ''}" data-action="sp" data-v="all" role="tab" aria-selected="${speriod === 'all'}">ทั้งหมด</button>
      </div>
      <div class="stat-grid">
        <div class="stat good glass"><b>${sk}<small>วัน</small></b><span>ตรวจครบติดต่อกัน</span></div>
        <div class="stat glass"><b>${st.full}<small>/${st.days} วัน</small></b><span>ตรวจครบ (${esc(label)})</span></div>
        <div class="stat ${st.missed ? 'bad' : ''} glass"><b>${st.missed}<small>วัน</small></b><span>ลืมตรวจ</span></div>
        <div class="stat ${st.bad ? 'bad' : ''} glass"><b>${st.bad}<small>ครั้ง</small></b><span>พบไม่สะอาด</span></div>
      </div>
      <h2 class="cap-title">สะอาดกี่เปอร์เซ็นต์ (${esc(label)})</h2>
      ${rows || '<p class="note">ยังไม่มีจุดตรวจ</p>'}
      <button class="btn primary" data-action="copyweek" data-d="${t}">คัดลอกรายงานสัปดาห์นี้</button>
    </div>`;
  }

  /* ---------- วาดหน้าจอ ---------- */
  function render(anim) {
    $('#app').innerHTML = tab === 'today' ? todayPage(anim) : tab === 'history' ? historyPage(anim) : statsPage(anim);
    const dock = $('#dock');
    dock.dataset.tab = tab;
    $$('.tab', dock).forEach(b => {
      const on = b.dataset.tab === tab;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }
  function setTab(t) { tab = t; window.scrollTo(0, 0); render(true); }
  function goDay(d) {
    sel = d === today() ? null : d;
    tab = 'today';
    window.scrollTo(0, 0);
    render(true);
  }

  /* ---------- ติ๊กสะอาด/ไม่สะอาด ---------- */
  function mark(id, v) {
    const d = curDate();
    if (!item(id)) return;
    const day = ensureDay(d), cur = day.r[id];
    if (cur && cur.s === v) delete day.r[id];
    else day.r[id] = { s: v, t: Date.now(), n: v === 'd' && cur ? cur.n : '' };
    tidyDay(d);
    save();
    const y = window.scrollY;
    render(false);
    window.scrollTo(0, y);
  }

  /* ---------- รายงานข้อความ (คัดลอกไปวางใน LINE) ---------- */
  function weekText(anchor) {
    const ws = state.weekStart, dt = parseYmd(anchor), key = weekKey(dt, ws);
    const t = today(), first = firstDate();
    const days = [];
    for (let k = -6; k <= 6; k++) {
      const d = shift(anchor, k);
      if (d > t || d < first) continue;
      const x = parseYmd(d);
      if (weekKey(x, ws) === key) days.push(d);
    }
    days.sort();
    const lines = [];
    lines.push(`รายงานตรวจเขต${state.title ? ' ' + state.title : ''}`);
    lines.push(`สัปดาห์ที่ ${weekOfMonth(dt, ws)} ของเดือน${fMonthL.format(dt)} ${be(dt)} (สัปดาห์ที่ ${weekOfYear(dt, ws)} ของปี)`);
    days.forEach(d => {
      const x = parseYmd(d), info = dayInfo(d), rec = state.days[d];
      if (info.kind === 'none') return;
      lines.push('');
      lines.push(`${fWeekday.format(x)}ที่ ${x.getDate()} ${fMonthL.format(x)} ${be(x)}`);
      if (info.kind === 'missed') { lines.push('- ไม่ได้ตรวจ'); return; }
      info.L.forEach(i => {
        const r = rec && rec.r[i.id];
        const s = r ? (r.s === 'c' ? 'สะอาด' : 'ไม่สะอาด' + (r.n ? ` (${r.n})` : '')) : 'ยังไม่ได้ตรวจ';
        lines.push(`- ${i.name}: ${s}`);
      });
      if (rec && rec.note) lines.push(`โน้ต: ${rec.note}`);
    });
    return lines.join('\n');
  }
  async function copyText(txt, okMsg) {
    try { await navigator.clipboard.writeText(txt); toast(okMsg); return true; }
    catch (e) {
      // สำรอง: เปิดให้เลือกคัดลอกเอง
      view = { type: 'text' };
      openSheet(`<div class="sheet-head"><h2>คัดลอกข้อความนี้</h2>${closeBtn}</div>
        <div class="stack"><textarea class="input mono" id="manual" readonly style="height:240px"></textarea>
        <p class="note">คัดลอกอัตโนมัติไม่ได้ กดค้างที่ข้อความ เลือกทั้งหมด แล้วคัดลอก</p></div>`);
      const ta = $('#manual'); ta.value = txt; ta.focus(); ta.select();
      return false;
    }
  }

  /* ---------- แผ่นล่าง ---------- */
  const closeBtn = '<button class="frost-btn" data-action="close" aria-label="ปิด">×</button>';
  function openSheet(html) {
    const sheet = $('#sheet');
    const first = !sheetOpen;
    $('#sheet-body').innerHTML = html;
    if (first) {
      sheetOpen = true;
      document.body.classList.add('sheet-open');
      sheet.hidden = false;
      try { history.pushState({ sheet: 1 }, ''); sheetPushed = true; } catch (e) { sheetPushed = false; }
      requestAnimationFrame(() => requestAnimationFrame(() => sheet.classList.add('open')));
    }
    $('.panel').scrollTop = 0;
  }
  function hideSheet() {
    if (!sheetOpen) return;
    sheetOpen = false; sheetPushed = false; view = null;
    document.body.classList.remove('sheet-open');
    const sheet = $('#sheet');
    sheet.classList.remove('open');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setTimeout(() => { if (!sheetOpen) { sheet.hidden = true; $('#sheet-body').innerHTML = ''; } }, 450);
  }
  function closeSheet() {
    if (sheetPushed) { ignorePop++; hideSheet(); history.back(); } else hideSheet();
  }
  window.addEventListener('popstate', () => {
    if (ignorePop > 0) { ignorePop--; return; }
    if (sheetOpen) hideSheet();
  });
  function unwindAll() {
    const n = sheetPushed ? 1 : 0;
    sheetPushed = false;
    hideSheet();
    render(true);
    if (n) { try { history.go(-n); } catch (e) { /* ไม่เป็นไร */ } }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });

  /* ---------- แจ้งเตือนรายวัน (ใช้ได้เฉพาะในแอป APK) ---------- */
  function notifier() {
    try {
      const c = window.Capacitor;
      if (c && c.isNativePlatform && c.isNativePlatform() && c.registerPlugin) return c.registerPlugin('LocalNotifications');
    } catch (e) { /* ไม่เป็นไร */ }
    return null;
  }
  async function applyReminder(askPermission) {
    const ln = notifier();
    if (!ln) return false;
    try {
      await ln.cancel({ notifications: [{ id: 1 }] });
      if (!state.remind) return true;
      if (askPermission) {
        const p = await ln.requestPermissions();
        if (!p || p.display !== 'granted') { toast('ยังไม่ได้อนุญาตการแจ้งเตือน ไปเปิดที่ตั้งค่าของเครื่อง'); return false; }
      }
      const [h, m] = state.remind.split(':').map(Number);
      await ln.schedule({ notifications: [{
        id: 1,
        title: 'ถึงเวลาตรวจเขตแล้ว',
        body: state.items.filter(i => !i.until).map(i => i.name).join(' · ').slice(0, 120) || 'อย่าลืมบันทึกการตรวจวันนี้',
        schedule: { on: { hour: h, minute: m }, allowWhileIdle: true },
      }] });
      return true;
    } catch (e) {
      toast('ตั้งแจ้งเตือนไม่สำเร็จ: ' + String((e && e.message) || e).slice(0, 80));
      return false;
    }
  }

  /* ---------- ตั้งค่า ---------- */
  function itemRows() {
    const act = state.items.filter(i => !i.until);
    return act.map((i, k) => `<div class="irow">
      <input class="input i-name" data-id="${esc(i.id)}" maxlength="${LIM.name}" value="${esc(i.name)}" aria-label="ชื่อจุดตรวจ">
      <button class="frost-btn" data-action="imove" data-id="${esc(i.id)}" data-v="-1" aria-label="เลื่อนขึ้น" ${k === 0 ? 'disabled' : ''}>↑</button>
      <button class="frost-btn" data-action="imove" data-id="${esc(i.id)}" data-v="1" aria-label="เลื่อนลง" ${k === act.length - 1 ? 'disabled' : ''}>↓</button>
      <button class="frost-btn del" data-action="idel" data-id="${esc(i.id)}" aria-label="ลบ">×</button>
    </div>`).join('');
  }
  function refreshItems() { const box = $('#items'); if (box) box.innerHTML = itemRows(); }

  function showSettings() {
    view = { type: 'settings' };
    const native = !!notifier();
    openSheet(`
      <div class="sheet-head"><h2>ตั้งค่า<span class="sub">ตรวจเขต เวอร์ชัน ${VERSION} · ข้อมูลอยู่ในเครื่องนี้เท่านั้น</span></h2>${closeBtn}</div>
      <div class="stack">
        <div class="field"><label for="p-title">ชื่อเขต/พื้นที่ (ไม่ใส่ก็ได้)</label>
          <input class="input" id="p-title" maxlength="${LIM.title}" autocomplete="off" placeholder="เช่น เขต 3 หมู่บ้านสุขใจ" value="${esc(state.title)}"></div>

        <div class="sect">จุดที่ต้องตรวจ</div>
        <div class="stack" style="margin-top:0;gap:8px" id="items">${itemRows()}</div>
        <div class="irow"><input class="input" id="n-item" maxlength="${LIM.name}" autocomplete="off" placeholder="เพิ่มจุดตรวจใหม่ เช่น ห้องน้ำ">
          <button class="btn primary" style="height:46px;padding:0 18px" data-action="iadd">เพิ่ม</button></div>

        <div class="sect">สัปดาห์เริ่มวัน</div>
        <div class="seg two" id="ws" style="--i:${state.weekStart === 0 ? 1 : 0}">
          <i></i>
          <button class="${state.weekStart === 1 ? 'on' : ''}" data-action="ws" data-v="1">จันทร์</button>
          <button class="${state.weekStart === 0 ? 'on' : ''}" data-action="ws" data-v="0">อาทิตย์</button>
        </div>
        <p class="note">สัปดาห์ที่ของเดือน: สัปดาห์ที่มีวันที่ 1 นับเป็นสัปดาห์ที่ 1</p>

        <div class="sect">แจ้งเตือนไม่ให้ลืมตรวจ</div>
        ${native ? `<div class="row2">
            <input class="input" id="r-time" type="time" value="${esc(state.remind || '08:00')}" aria-label="เวลาแจ้งเตือน">
            <button class="btn primary" data-action="remindon">${state.remind ? 'เปลี่ยนเวลา' : 'เปิดแจ้งเตือน'}</button></div>
          <p class="note">${state.remind ? `เปิดอยู่ ทุกวันเวลา ${esc(state.remind)} น.` : 'ปิดอยู่'}</p>
          ${state.remind ? '<button class="btn soft" data-action="remindoff">ปิดแจ้งเตือน</button>' : ''}`
          : '<p class="note">การแจ้งเตือนใช้ได้เฉพาะแอปที่ติดตั้งจากไฟล์ APK ชุดนี้ ไม่ทำงานบนเว็บหรือเบราว์เซอร์</p>'}

        <div class="sect">สำรองข้อมูล</div>
        <div class="field"><label for="backup">ข้อมูลสำรอง (คัดลอกเก็บไว้ในที่ปลอดภัย)</label>
          <textarea class="input mono" id="backup" readonly></textarea></div>
        <button class="btn primary" data-action="copybackup">คัดลอกข้อมูลสำรอง</button>
        <div class="field"><label for="restore">กู้คืนจากข้อมูลสำรอง</label>
          <textarea class="input mono" id="restore" placeholder="วางข้อมูลสำรองที่นี่"></textarea></div>
        <button class="btn soft" data-action="restore">กู้คืนข้อมูล</button>
        <button class="btn danger" data-action="erase">ลบข้อมูลทั้งหมด</button>
        <p class="note">ถ้าถอนการติดตั้งแอปหรือล้างข้อมูลแอป ข้อมูลจะหาย ควรคัดลอกข้อมูลสำรองไว้เป็นระยะ</p>
      </div>`);
    $('#backup').value = JSON.stringify(state);
  }

  async function copyBackup() {
    const ta = $('#backup');
    try { await navigator.clipboard.writeText(ta.value); toast('คัดลอกแล้ว นำไปวางเก็บไว้ได้เลย'); }
    catch (e) { ta.focus(); ta.select(); toast('คัดลอกอัตโนมัติไม่ได้ กดค้างที่ข้อความแล้วเลือกคัดลอก'); }
  }

  function restore(btn) {
    const txt = $('#restore').value.trim();
    if (!txt) return toast('วางข้อมูลสำรองก่อนนะ');
    let parsed;
    try { parsed = JSON.parse(txt); } catch (e) { return toast('ข้อมูลสำรองไม่ถูกต้อง'); }
    if (!parsed || !Array.isArray(parsed.items) || typeof parsed.days !== 'object' || !parsed.days) return toast('ข้อมูลสำรองไม่ถูกต้อง');
    const clean = sanitize(parsed);
    if (!arm(btn, 'แตะอีกครั้งเพื่อแทนที่ข้อมูลปัจจุบัน')) return;
    state = clean; sel = null;
    save(); unwindAll();
    toast(`กู้คืนแล้ว ${Object.keys(clean.days).length} วัน`);
    applyReminder(false);
  }

  function moveItem(id, dir) {
    const act = state.items.filter(i => !i.until);
    const k = act.findIndex(i => i.id === id), j = k + dir;
    if (k < 0 || j < 0 || j >= act.length) return;
    const a = state.items.indexOf(act[k]), b = state.items.indexOf(act[j]);
    [state.items[a], state.items[b]] = [state.items[b], state.items[a]];
    save(); refreshItems(); render(false);
  }
  function addItem() {
    const inp = $('#n-item'), name = inp.value.trim().slice(0, LIM.name);
    if (!name) { toast('พิมพ์ชื่อจุดตรวจก่อนนะ'); inp.focus(); return; }
    if (state.items.filter(i => !i.until).length >= 30) { toast('เพิ่มได้ไม่เกิน 30 จุด'); return; }
    state.items.push({ id: uid(), name, since: today(), until: '' });
    save(); inp.value = ''; refreshItems(); render(false);
    toast('เพิ่มแล้ว');
  }
  function delItem(btn) {
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1'; btn.dataset.orig = btn.textContent;
      btn.textContent = 'ลบ?'; btn.classList.add('armed');
      setTimeout(() => { if (btn.isConnected) { delete btn.dataset.armed; btn.textContent = btn.dataset.orig; btn.classList.remove('armed'); } }, 3000);
      return;
    }
    const i = item(btn.dataset.id);
    if (!i) return;
    // ซ่อนจากวันนี้เป็นต้นไป ประวัติเก่าที่ตรวจไปแล้วยังอยู่
    const t = today();
    if (state.days[t]) { delete state.days[t].r[i.id]; tidyDay(t); }
    i.until = shift(t, -1);
    save(); refreshItems(); render(false);
    toast('ลบจุดตรวจแล้ว (ประวัติเก่ายังอยู่)');
  }

  /* ---------- จัดการการกด ---------- */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const id = el.dataset.id;
    switch (el.dataset.action) {
      case 'tab': setTab(el.dataset.tab); break;
      case 'mark': mark(id, el.dataset.v); break;
      case 'reason': {
        const inp = $(`[data-note="${CSS.escape(id)}"]`);
        if (!inp) break;
        const cur = inp.value.trim();
        if (cur.includes(el.dataset.v)) break;
        inp.value = (cur ? cur + ', ' : '') + el.dataset.v;
        inp.dispatchEvent(new Event('input', { bubbles: true }));
        break;
      }
      case 'prevday': goDay(shift(curDate(), -1)); break;
      case 'nextday': if (curDate() < today()) goDay(shift(curDate(), 1)); break;
      case 'gotoday': goDay(today()); break;
      case 'goday': goDay(el.dataset.d); break;
      case 'more': hist += PAGE_DAYS; render(false); break;
      case 'sp': speriod = el.dataset.v; render(false); break;
      case 'copyweek': copyText(weekText(el.dataset.d), 'คัดลอกรายงานแล้ว นำไปวางใน LINE ได้เลย'); break;
      case 'settings': showSettings(); break;
      case 'iadd': addItem(); break;
      case 'imove': moveItem(id, Number(el.dataset.v)); break;
      case 'idel': delItem(el); break;
      case 'ws': {
        state.weekStart = el.dataset.v === '0' ? 0 : 1;
        save();
        const seg = $('#ws');
        seg.style.setProperty('--i', state.weekStart === 0 ? 1 : 0);
        $$('button', seg).forEach(b => b.classList.toggle('on', b === el));
        render(false);
        break;
      }
      case 'remindon': {
        const v = $('#r-time').value;
        if (!/^\d{2}:\d{2}$/.test(v)) { toast('เลือกเวลาก่อนนะ'); break; }
        state.remind = v; save();
        applyReminder(true).then(ok => { if (ok) { toast(`ตั้งแจ้งเตือนทุกวัน ${v} น. แล้ว`); if (sheetOpen && view && view.type === 'settings') showSettings(); } });
        break;
      }
      case 'remindoff':
        state.remind = ''; save();
        applyReminder(false).then(() => { toast('ปิดแจ้งเตือนแล้ว'); if (sheetOpen && view && view.type === 'settings') showSettings(); });
        break;
      case 'copybackup': copyBackup(); break;
      case 'restore': restore(el); break;
      case 'erase':
        if (!arm(el, 'แตะอีกครั้งเพื่อลบทุกอย่าง')) break;
        state = blank(); sel = null; save(); unwindAll();
        toast('ลบข้อมูลทั้งหมดแล้ว');
        applyReminder(false);
        break;
      case 'close': closeSheet(); break;
    }
  });

  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset && t.dataset.note) {
      const day = state.days[curDate()], x = day && day.r[t.dataset.note];
      if (x && x.s === 'd') { x.n = t.value.trim().slice(0, LIM.note); save(); }
    } else if (t.id === 'day-note') {
      const d = curDate(), v = t.value.trim().slice(0, LIM.daynote);
      if (v) ensureDay(d).note = v; else if (state.days[d]) state.days[d].note = '';
      tidyDay(d); save();
    }
  });
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'jump') {
      if (parseYmd(t.value) && t.value <= today()) goDay(t.value);
      else if (t.value) toast('เลือกวันในอนาคตไม่ได้');
    } else if (t.id === 'p-title') {
      state.title = t.value.trim().slice(0, LIM.title); save(); render(false);
    } else if (t.classList && t.classList.contains('i-name')) {
      const i = item(t.dataset.id), v = t.value.trim().slice(0, LIM.name);
      if (!i) return;
      if (!v) { t.value = i.name; toast('ชื่อจุดตรวจต้องไม่ว่าง'); return; }
      i.name = v; save(); render(false);
    }
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.isComposing) return;
    if (e.target.id === 'n-item') { e.preventDefault(); addItem(); }
  });

  // ข้ามวัน: เมื่อกลับเข้าแอป ให้ขึ้นวันใหม่ (ถ้ากำลังดูวันนี้อยู่)
  let shownDay = today();
  function onResume() {
    if (document.visibilityState !== 'visible') return;
    if (shownDay !== today()) {
      shownDay = today();
      if (!sheetOpen) render(false);
    }
  }
  document.addEventListener('visibilitychange', onResume);

  render(true);
  if (state.remind) applyReminder(false);
})();
