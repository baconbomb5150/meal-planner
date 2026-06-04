/* Meal Planner phone app — vanilla JS, no build step.
   APP_DATA is injected inline by index.html (generated from the Sheet export):
     { generated, recipes:[...pool], menu:[...21 entries], grocery:{section:[items]} } */

'use strict';

/* ------------------------------------------------------------------ helpers */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const RECIPES = APP_DATA.recipes || [];
const MENU = APP_DATA.menu || [];
const WEEK_GROCERY = APP_DATA.grocery || {};
const WEEK_ID = APP_DATA.generated || 'week';
const POOL = Object.fromEntries(RECIPES.map(r => [r.name, r]));
const DAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner'];
const MEAL_LABEL = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' };

function parseSteps(instructions) {
  return (instructions || '')
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}
function splitIngredients(s) { return (s || '').split(';').map(x => x.trim()).filter(Boolean); }

/* Merge a menu entry with its pool recipe so detail/cook have everything. */
function recipeFor(entry) {
  const base = POOL[entry.name] || {};
  return {
    name: entry.name,
    cuisine: entry.cuisine || base.cuisine || '',
    effort: entry.effort || base.effort || '',
    protein: base.protein || '',
    url: entry.url || base.url || '',
    image: (entry.image && entry.image.startsWith('http')) ? entry.image : (base.image || ''),
    ingredients: entry.ingredients || base.ingredients || '',
    instructions: entry.instructions || base.instructions || '',
  };
}

/* ----------------------------------------------------------- view switching */
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === name));
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('main').scrollTop = 0;
}

/* ================================================================ THIS WEEK */
function renderHome() {
  const wrap = $('#home .pad');
  wrap.innerHTML = '';
  if (!MENU.length) {
    wrap.innerHTML = `<div class="grocery-empty">No meal plan loaded yet.<br><br>
      Run the weekly plan, then <b>export-app-data</b> + <b>build.py</b>.</div>`;
    return;
  }
  const nSkipped = Object.values(skips).filter(Boolean).length;
  if (nSkipped) {
    wrap.appendChild(el('div', 'skipbanner',
      `⊘ ${nSkipped} meal${nSkipped > 1 ? 's' : ''} skipped — removed from your grocery list`));
  }

  const byDay = {};
  MENU.forEach(m => { (byDay[m.day] = byDay[m.day] || []).push(m); });

  DAY_ORDER.filter(d => byDay[d]).forEach(day => {
    wrap.appendChild(el('div', 'section-label', day));
    byDay[day].sort((a, b) => MEAL_ORDER.indexOf(a.meal) - MEAL_ORDER.indexOf(b.meal));
    byDay[day].forEach(m => {
      const rec = recipeFor(m);
      const leftovers = /leftover/i.test(m.name);
      const key = m.day + '|' + m.meal;
      const skipped = !!skips[key];
      const icon = m.meal === 'dinner' ? '🍽️' : m.meal === 'breakfast' ? '🍳' : '🥪';
      const card = el('div', 'card' + (skipped ? ' skipped' : ''));
      card.innerHTML = `
        ${rec.image ? `<img src="${esc(rec.image)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;noimg&quot;>${icon}</div>'">`
                    : `<div class="noimg">${icon}</div>`}
        <div class="meta">
          <div class="mealtag">${MEAL_LABEL[m.meal] || m.meal}${m.source === 'new' ? ' · <span class="newbadge">NEW</span>' : ''}${skipped ? ' · <span class="skiptag">SKIPPED</span>' : ''}</div>
          <div class="name">${esc(m.name)}</div>
          <div class="tags">
            ${rec.cuisine ? `<span class="pill">${esc(rec.cuisine)}</span>` : ''}
            ${rec.effort ? `<span class="pill">${esc(rec.effort)}</span>` : ''}
          </div>
        </div>
        ${leftovers ? '' : `<button class="skipbtn" title="${skipped ? 'Add back' : 'Skip this meal'}">${skipped ? '↩︎' : '⊘'}</button>`}`;
      card.onclick = () => leftovers ? openLeftovers() : openRecipe(rec, m.meal);
      const sb = $('.skipbtn', card);
      if (sb) sb.onclick = e => {
        e.stopPropagation();
        skips[key] = !skips[key]; saveSkips(); renderHome();
      };
      wrap.appendChild(card);
    });
  });
}

function openLeftovers() {
  const v = $('#recipe');
  v.innerHTML = `<div class="detail-h"><h2>Dinner Leftovers</h2></div>
    <div class="grocery-empty">🍱<br><br>Reheat last night's dinner — no recipe needed,
    and nothing extra to buy.</div>`;
  showView('recipe');
}

/* ================================================================ RECIPE */
function openRecipe(r, meal) {
  const v = $('#recipe');
  const hasSteps = parseSteps(r.instructions).length > 0;
  const scaledNote = meal === 'dinner'
    ? `<div class="scalenote">⚖️ Amounts scaled for your household (~3.5 servings — cooks a little extra for leftover lunches)</div>`
    : '';
  v.innerHTML = `
    ${r.image ? `<img class="hero" src="${esc(r.image)}" alt="" onerror="this.style.display='none'">` : ''}
    <div class="detail-h">
      <h2>${esc(r.name)}</h2>
      <div class="tags">
        ${r.cuisine ? `<span class="pill">${esc(r.cuisine)}</span>` : ''}
        ${r.effort ? `<span class="pill">${esc(r.effort)}</span>` : ''}
        ${r.protein ? `<span class="pill">${esc(r.protein)}</span>` : ''}
      </div>
    </div>
    ${hasSteps ? `<button class="bigbtn" id="startCook">▶  Start cooking</button>` : ''}
    ${scaledNote}
    <div class="ingredients">
      <h3>Ingredients</h3>
      <ul>${splitIngredients(r.ingredients).map(i => `<li>${esc(i)}</li>`).join('') || '<li>—</li>'}</ul>
    </div>
    <div class="pad"></div>`;
  if (hasSteps) $('#startCook', v).onclick = () => enterCook(r);
  showView('recipe');
}

/* ===================================================================== COOK
   The headline feature: big now/next, screen-awake, read-aloud, tap/voice. */
let cook = { recipe: null, steps: [], i: 0 };
let wakeLock = null;
let recog = null;
let timer = { id: null, remain: 0, total: 0 };

async function requestWakeLock() {
  try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); }
  catch (_) { /* not fatal */ }
}
function releaseWakeLock() { try { wakeLock && wakeLock.release(); } catch (_) {} wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && $('#cook').classList.contains('active')) requestWakeLock();
});

function speak(text) {
  if (!('speechSynthesis' in window)) return;
  try { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.rate = 0.95; speechSynthesis.speak(u); } catch (_) {}
}

function enterCook(r) {
  cook = { recipe: r, steps: parseSteps(r.instructions), i: 0 };
  $('#cookTitle').textContent = r.name;
  $('#cook').classList.add('active');
  requestWakeLock();
  startVoice();
  renderStep(true);
}
function exitCook() {
  $('#cook').classList.remove('active');
  clearTimer();
  releaseWakeLock();
  stopVoice();
  try { speechSynthesis.cancel(); } catch (_) {}
}

function findDuration(text) {
  const m = text.match(/(\d+)\s*(hour|hr|minute|min|second|sec)/i);
  if (!m) return 0;
  const n = +m[1], u = m[2].toLowerCase();
  if (u.startsWith('h')) return n * 3600;
  if (u.startsWith('m')) return n * 60;
  return n;
}
function fmt(s) { const m = Math.floor(s / 60), ss = s % 60; return `${m}:${String(ss).padStart(2, '0')}`; }

function renderStep(announce) {
  const { steps, i } = cook;
  $('#cookDots').innerHTML = steps.map((_, k) => `<span class="dot ${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('');
  $('#cookStepNo').textContent = `Step ${i + 1} of ${steps.length}`;
  $('#cookStepText').textContent = steps[i];

  const nextWrap = $('#cookNext');
  if (i + 1 < steps.length) nextWrap.innerHTML = `<b>NEXT</b>${esc(steps[i + 1])}`;
  else nextWrap.innerHTML = `<b>LAST STEP</b>You're almost done 🎉`;

  clearTimer();
  const dur = findDuration(steps[i]);
  const tEl = $('#cookTimer');
  if (dur) {
    timer.total = timer.remain = dur;
    tEl.style.display = 'inline-flex';
    tEl.className = 'timer';
    tEl.innerHTML = `⏱  Tap to start ${fmt(dur)}`;
    tEl.onclick = e => { e.stopPropagation(); toggleTimer(); };
  } else {
    tEl.style.display = 'none';
  }

  $('#cookPrev').disabled = i === 0;
  $('#cookNextBtn').textContent = i + 1 < steps.length ? 'Next  ▸' : 'Done ✓';
  if (announce) speak(steps[i]);
}

function nextStep() {
  if (cook.i + 1 < cook.steps.length) { cook.i++; renderStep(true); }
  else { speak('All done. Enjoy!'); const r = cook.recipe; exitCook(); openRecipe(r); }
}
function prevStep() { if (cook.i > 0) { cook.i--; renderStep(true); } }
function repeatStep() { speak(cook.steps[cook.i]); }

function toggleTimer() {
  const tEl = $('#cookTimer');
  if (timer.id) { clearTimer(); tEl.className = 'timer'; tEl.innerHTML = `⏱  Tap to start ${fmt(timer.total)}`; return; }
  tEl.className = 'timer running';
  timer.id = setInterval(() => {
    timer.remain--;
    if (timer.remain <= 0) {
      clearInterval(timer.id); timer.id = null;
      tEl.className = 'timer done'; tEl.innerHTML = `⏱  Time's up!`;
      beep(); speak('Timer done.');
    } else {
      tEl.innerHTML = `⏱  ${fmt(timer.remain)}`;
    }
  }, 1000);
  tEl.innerHTML = `⏱  ${fmt(timer.remain)}`;
}
function clearTimer() { if (timer.id) { clearInterval(timer.id); timer.id = null; } }
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.5, 1].forEach(t => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; o.type = 'sine';
      g.gain.setValueAtTime(0.001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.3);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.32);
    });
  } catch (_) {}
}

function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { $('#cookMic').classList.add('off'); return; }
  try {
    recog = new SR();
    recog.continuous = true; recog.interimResults = false; recog.lang = 'en-US';
    recog.onresult = e => {
      const said = e.results[e.results.length - 1][0].transcript.toLowerCase();
      if (/\b(next|continue|forward|done)\b/.test(said)) nextStep();
      else if (/\b(back|previous|go back)\b/.test(said)) prevStep();
      else if (/\b(repeat|again|what)\b/.test(said)) repeatStep();
      else if (/\b(timer|start timer)\b/.test(said)) { const t = $('#cookTimer'); if (t.style.display !== 'none') toggleTimer(); }
    };
    recog.onend = () => { if ($('#cook').classList.contains('active')) { try { recog.start(); } catch (_) {} } };
    recog.start();
    $('#cookMic').classList.remove('off');
  } catch (_) { $('#cookMic').classList.add('off'); }
}
function stopVoice() { if (recog) { try { recog.onend = null; recog.stop(); } catch (_) {} recog = null; } }

/* ================================================================= GROCERY
   Pre-populated from the week's consolidated list. Check-off persists per
   device (localStorage), and resets automatically when a new week is built. */
let checks = loadChecks();
function loadChecks() {
  try {
    const s = JSON.parse(localStorage.getItem('mp_checks'));
    if (s && s.week === WEEK_ID) return s.items || {};
  } catch (_) {}
  return {};
}
function saveChecks() { localStorage.setItem('mp_checks', JSON.stringify({ week: WEEK_ID, items: checks })); }

// skipped meals (per device, reset on a new week) — drive both home + grocery
let skips = loadSkips();
function loadSkips() {
  try { const s = JSON.parse(localStorage.getItem('mp_skips')); if (s && s.week === WEEK_ID) return s.set || {}; } catch (_) {}
  return {};
}
function saveSkips() { localStorage.setItem('mp_skips', JSON.stringify({ week: WEEK_ID, set: skips })); }

const collapsed = {};
function renderGrocery() {
  const v = $('#grocery .pad');
  const built = Grocery.build(MENU, skips);          // computed from non-skipped meals
  const all = built.flatMap(s => s.items);
  if (!all.length) {
    v.innerHTML = `<div class="grocery-empty">No grocery list for this week yet.</div>`;
    return;
  }
  const total = all.length;
  const done = all.filter(it => checks[it.name]).length;
  const nSkipped = Object.values(skips).filter(Boolean).length;

  let html = `<div class="section-label">Week of ${esc(WEEK_ID)}${nSkipped ? ` · ${nSkipped} meal${nSkipped > 1 ? 's' : ''} skipped` : ''}</div>
    <div class="grocery-head">
      <div class="progress"><span style="width:${total ? (done / total * 100) : 0}%"></span></div>
      <div style="color:var(--muted);font-size:13px;white-space:nowrap">${done}/${total}</div>
    </div>
    <div style="margin-bottom:14px"><button class="linkbtn" id="resetGro">Uncheck all</button></div>`;

  built.forEach(sec => {
    const rows = sec.items.map(it => ({ name: it.name, label: it.label, days: it.days, checked: !!checks[it.name] }))
      .sort((a, b) => a.checked - b.checked); // checked sink to bottom
    const left = rows.filter(r => !r.checked).length;
    const isCol = collapsed[sec.aisle];
    html += `<div class="aisle ${isCol ? 'collapsed' : ''}" data-aisle="${esc(sec.aisle)}">
      <div class="aisle-h"><span class="caret">▼</span>
        <span class="nm">${esc(sec.aisle)}</span>
        <span class="ct">${left ? left + ' left' : 'all ✓'}</span></div>
      <div class="items">
        ${rows.map(r => `<div class="gitem ${r.checked ? 'checked' : ''}" data-key="${esc(r.name)}">
            <div class="box">${r.checked ? '✓' : ''}</div>
            <div><span class="label">${esc(r.label)}</span>
              <span class="flag">${esc(r.days.join(', '))}</span></div>
          </div>`).join('')}
      </div></div>`;
  });
  v.innerHTML = html;

  $('#resetGro', v).onclick = () => { checks = {}; saveChecks(); renderGrocery(); };
  $$('.aisle-h', v).forEach(h => h.onclick = () => {
    const a = h.parentElement.dataset.aisle; collapsed[a] = !collapsed[a]; renderGrocery();
  });
  $$('.gitem', v).forEach(g => g.onclick = () => {
    const k = g.dataset.key; checks[k] = !checks[k]; saveChecks(); renderGrocery();
  });
}

/* ================================================================= GATE
   Lightweight shared-passphrase screen. The repo is public, so only the
   SHA-256 HASH of the passphrase lives here — never the passphrase itself. */
const PASS_HASH = 'fc939fae5c3459c79f267b082eb83a53097c637243311e422479fba019842ec2';

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}
function showGate() {
  if (localStorage.getItem('mp_unlocked') === '1') return;
  const ov = el('div', 'gate');
  ov.innerHTML = `<div class="gate-box">
      <div class="gate-emoji">🍳</div>
      <h2>Meal Planner</h2>
      <p>Enter the passphrase</p>
      <input id="gateInput" type="password" autocapitalize="none" autocorrect="off"
             autocomplete="off" spellcheck="false" placeholder="passphrase">
      <button id="gateBtn">Unlock</button>
      <div class="gate-err" id="gateErr"></div>
    </div>`;
  document.body.appendChild(ov);
  const tryUnlock = async () => {
    const v = $('#gateInput').value.trim().toLowerCase();
    if (!v) return;
    if (await sha256hex(v) === PASS_HASH) {
      localStorage.setItem('mp_unlocked', '1');
      ov.remove();
    } else {
      $('#gateErr').textContent = 'Nope — try again';
      $('#gateInput').value = '';
      $('#gateInput').focus();
    }
  };
  $('#gateBtn', ov).onclick = tryUnlock;
  $('#gateInput', ov).addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
  $('#gateInput', ov).focus();
}

/* ===================================================================== WIRE */
function init() {
  showGate();
  renderHome();
  renderGrocery();

  $$('.tabbar button').forEach(b => b.onclick = () => {
    if (b.dataset.tab === 'grocery') renderGrocery();
    if (b.dataset.tab === 'home') renderHome();
    showView(b.dataset.tab);
  });
  $('#backHome').onclick = () => showView('home');

  $('#cookClose').onclick = exitCook;
  $('#cookNow').onclick = nextStep;
  $('#cookNextBtn').onclick = e => { e.stopPropagation(); nextStep(); };
  $('#cookPrev').onclick = e => { e.stopPropagation(); prevStep(); };
  $('#cookRepeat').onclick = e => { e.stopPropagation(); repeatStep(); };

  showView('home');
}
document.addEventListener('DOMContentLoaded', init);
