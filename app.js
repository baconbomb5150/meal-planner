/* Meal Planner phone app — vanilla JS, no build step.
   RECIPES is injected inline by index.html (generated from recipes_full.json). */

'use strict';

/* ------------------------------------------------------------------ helpers */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
const esc = s => (s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const DINNERS = RECIPES.filter(r => r.meal_type === 'dinner');

/* Split a recipe's "1. step\n2. step" instructions into clean step strings. */
function parseSteps(instructions) {
  return (instructions || '')
    .split(/\r?\n/)
    .map(l => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);
}
function splitIngredients(s) {
  return (s || '').split(';').map(x => x.trim()).filter(Boolean);
}

/* ----------------------------------------------------------- view switching */
function showView(name) {
  $$('.view').forEach(v => v.classList.toggle('active', v.id === name));
  $$('.tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  $('main').scrollTop = 0;
}

/* ===================================================================== HOME */
function renderHome() {
  const wrap = $('#home .pad');
  wrap.innerHTML = '';
  wrap.appendChild(el('div', 'section-label', `${DINNERS.length} dinners in your pool`));
  DINNERS.forEach(r => {
    const card = el('div', 'card');
    card.innerHTML = `
      ${r.image ? `<img src="${esc(r.image)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=&quot;noimg&quot;>🍽️</div>'">`
                : `<div class="noimg">🍽️</div>`}
      <div class="meta">
        <div class="name">${esc(r.name)}</div>
        <div class="tags">
          <span class="pill">${esc(r.cuisine || '')}</span>
          <span class="pill">${esc(r.effort || '')}</span>
          ${r.protein ? `<span class="pill">${esc(r.protein)}</span>` : ''}
        </div>
      </div>`;
    card.onclick = () => openRecipe(r);
    wrap.appendChild(card);
  });
}

/* ================================================================ RECIPE */
let activeRecipe = null;

function openRecipe(r) {
  activeRecipe = r;
  const v = $('#recipe');
  const added = grocery.recipes.includes(r.name);
  v.innerHTML = `
    ${r.image ? `<img class="hero" src="${esc(r.image)}" alt="" onerror="this.style.display='none'">` : ''}
    <div class="detail-h">
      <h2>${esc(r.name)}</h2>
      <div class="tags">
        <span class="pill">${esc(r.cuisine || '')}</span>
        <span class="pill">${esc(r.effort || '')}</span>
        ${r.protein ? `<span class="pill">${esc(r.protein)}</span>` : ''}
      </div>
    </div>
    <button class="bigbtn" id="startCook">▶  Start cooking</button>
    <button class="ghostbtn ${added ? 'added' : ''}" id="addGro">
      ${added ? '✓ Added to groceries' : '＋ Add ingredients to groceries'}
    </button>
    <div class="ingredients">
      <h3>Ingredients</h3>
      <ul>${splitIngredients(r.ingredients).map(i => `<li>${esc(i)}</li>`).join('')}</ul>
    </div>
    <div class="pad"></div>`;
  $('#startCook', v).onclick = () => enterCook(r);
  $('#addGro', v).onclick = e => { addRecipeToGrocery(r); e.target.classList.add('added'); e.target.textContent = '✓ Added to groceries'; };
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

/* find a duration like "6 minutes", "10 min", "1 hour", "90 seconds" in a step */
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
  const dots = steps.map((_, k) => `<span class="dot ${k < i ? 'done' : k === i ? 'now' : ''}"></span>`).join('');
  $('#cookDots').innerHTML = dots;
  $('#cookStepNo').textContent = `Step ${i + 1} of ${steps.length}`;
  $('#cookStepText').textContent = steps[i];

  // next-step preview
  const nextWrap = $('#cookNext');
  if (i + 1 < steps.length) nextWrap.innerHTML = `<b>NEXT</b>${esc(steps[i + 1])}`;
  else nextWrap.innerHTML = `<b>LAST STEP</b>You're almost done 🎉`;

  // per-step timer
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
  else { speak('All done. Enjoy!'); exitCook(); openRecipe(cook.recipe); }
}
function prevStep() { if (cook.i > 0) { cook.i--; renderStep(true); } }
function repeatStep() { speak(cook.steps[cook.i]); }

/* timer */
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

/* voice control — lights up on Android Chrome; silently absent on iPhone */
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
   Auto-group ingredients into store aisles; persist checks in localStorage. */
const AISLE_ORDER = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery',
  'Frozen', 'Condiments & Sauces', 'Spices', 'Pantry & Dry Goods', 'Other'];

/* priority-ordered keyword rules: first match wins */
const RULES = [
  ['Spices', /\b(salt|pepper(?!\s*,?\s*(bell|red|green|yellow))|paprika|cumin|oregano|dried|cinnamon|chili powder|garlic powder|onion powder|nutmeg|cayenne|turmeric|curry powder|bay leaf|spice)\b/i],
  ['Condiments & Sauces', /\b(soy sauce|fish sauce|hoisin|oyster sauce|sriracha|ketchup|mustard|mayo|mayonnaise|vinegar|\boil\b|olive oil|sesame oil|pesto|salsa|sauce|broth|stock|honey|syrup|worcestershire|teriyaki|gochujang|miso|tahini)\b/i],
  ['Bakery', /\b(bread|tortilla|tortillas|bun|buns|roll|rolls|bagel|naan|pita|baguette|brioche)\b/i],
  ['Frozen', /\b(frozen|ice cream|frozen peas)\b/i],
  ['Dairy & Eggs', /\b(milk|cream|butter|cheese|parmesan|mozzarella|cheddar|feta|yogurt|yoghurt|egg|eggs|sour cream|ricotta|half and half|buttermilk)\b/i],
  ['Meat & Seafood', /\b(chicken|beef|pork|bacon|sausage|turkey|salmon|shrimp|prawn|fish|steak|ground|thigh|thighs|breast|ribs|chorizo|ham|brisket|tenderloin|fillet|cod|tuna|crab)\b/i],
  ['Produce', /\b(onion|garlic|tomato(?!\s*paste|\s*sauce)|cilantro|lime|lemon|bell pepper|jalapeno|jalapeño|spinach|kale|carrot|celery|potato|lettuce|avocado|cabbage|broccoli|zucchini|squash|apple|berr(y|ies)|mushroom|ginger|scallion|green onion|parsley|basil|cucumber|pineapple|corn|pepper|leek|shallot|herb|lime|cauliflower|asparagus|pea\b|peas|fruit|banana|orange)\b/i],
  ['Pantry & Dry Goods', /\b(rice|pasta|noodle|noodles|rotini|spaghetti|flour|sugar|bean|beans|can|canned|tomato paste|tomato sauce|breadcrumb|panko|cornstarch|baking|oats|quinoa|lentil|stock cube|sundried tomato|coconut milk|sesame seed|broth)\b/i],
];
function classify(ingredient) {
  for (const [aisle, re] of RULES) if (re.test(ingredient)) return aisle;
  return 'Other';
}

let grocery = loadGrocery();
function loadGrocery() {
  try { return JSON.parse(localStorage.getItem('mp_grocery')) || { items: {}, recipes: [] }; }
  catch (_) { return { items: {}, recipes: [] }; }
}
function saveGrocery() { localStorage.setItem('mp_grocery', JSON.stringify(grocery)); }

function addRecipeToGrocery(r) {
  if (!grocery.recipes.includes(r.name)) grocery.recipes.push(r.name);
  splitIngredients(r.ingredients).forEach(ing => {
    const key = ing.toLowerCase();
    if (!grocery.items[key]) grocery.items[key] = { text: ing, aisle: classify(ing), checked: false, from: [] };
    if (!grocery.items[key].from.includes(r.name)) grocery.items[key].from.push(r.name);
  });
  saveGrocery();
  renderGrocery();
}
function clearGrocery() {
  if (!confirm('Clear the whole grocery list?')) return;
  grocery = { items: {}, recipes: [] }; saveGrocery(); renderGrocery();
}

const collapsed = {};
function renderGrocery() {
  const v = $('#grocery .pad');
  const entries = Object.entries(grocery.items);
  if (!entries.length) {
    v.innerHTML = `<div class="grocery-empty">No groceries yet.<br><br>
      Open a recipe and tap <b>“Add ingredients to groceries”</b> to build this week's list.</div>`;
    return;
  }
  const total = entries.length;
  const done = entries.filter(([, it]) => it.checked).length;

  // count one-off ingredients (appear in only one recipe) for the flag
  let html = `<div class="grocery-head">
      <div class="progress"><span style="width:${total ? (done / total * 100) : 0}%"></span></div>
      <div style="color:var(--muted);font-size:13px;white-space:nowrap">${done}/${total}</div>
    </div>
    <div style="display:flex;gap:8px;margin-bottom:14px">
      <button class="linkbtn" id="clearGro">Clear list</button>
    </div>`;

  AISLE_ORDER.forEach(aisle => {
    const items = entries.filter(([, it]) => it.aisle === aisle)
      .sort((a, b) => (a[1].checked - b[1].checked)); // checked sink to bottom
    if (!items.length) return;
    const left = items.filter(([, it]) => !it.checked).length;
    const isCollapsed = collapsed[aisle];
    html += `<div class="aisle ${isCollapsed ? 'collapsed' : ''}" data-aisle="${esc(aisle)}">
      <div class="aisle-h"><span class="caret">▼</span>
        <span class="nm">${esc(aisle)}</span>
        <span class="ct">${left ? left + ' left' : 'all ✓'}</span></div>
      <div class="items">
        ${items.map(([key, it]) => {
          const oneOff = grocery.recipes.length > 1 && it.from.length === 1;
          return `<div class="gitem ${it.checked ? 'checked' : ''}" data-key="${esc(key)}">
            <div class="box">${it.checked ? '✓' : ''}</div>
            <div><span class="label">${esc(it.text)}</span>
              ${oneOff ? `<span class="flag">⌁ only in ${esc(it.from[0])}</span>` : ''}</div>
          </div>`;
        }).join('')}
      </div></div>`;
  });
  v.innerHTML = html;

  $('#clearGro', v).onclick = clearGrocery;
  $$('.aisle-h', v).forEach(h => h.onclick = () => {
    const a = h.parentElement.dataset.aisle; collapsed[a] = !collapsed[a]; renderGrocery();
  });
  $$('.gitem', v).forEach(g => g.onclick = () => {
    const it = grocery.items[g.dataset.key]; it.checked = !it.checked; saveGrocery(); renderGrocery();
  });
}

/* ================================================================= GATE
   Lightweight shared-passphrase screen. The repo is public, so only the
   SHA-256 HASH of the passphrase lives here — never the passphrase itself.
   Client-side only: keeps casual visitors out, not a determined attacker. */
const PASS_HASH = '444a5ce33d8698bbb3f672c603e63065660229d3d40bb487f86bb87fed419b71';

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

  // tab bar
  $$('.tabbar button').forEach(b => b.onclick = () => {
    if (b.dataset.tab === 'grocery') renderGrocery();
    showView(b.dataset.tab);
  });
  $('#backHome').onclick = () => showView('home');

  // cook controls
  $('#cookClose').onclick = exitCook;
  $('#cookNow').onclick = nextStep;          // tap-anywhere on the middle zone
  $('#cookNextBtn').onclick = e => { e.stopPropagation(); nextStep(); };
  $('#cookPrev').onclick = e => { e.stopPropagation(); prevStep(); };
  $('#cookRepeat').onclick = e => { e.stopPropagation(); repeatStep(); };

  showView('home');
}
document.addEventListener('DOMContentLoaded', init);
