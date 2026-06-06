/* grocery.js — build the week's grocery list from clean per-meal contributions.
   Pure logic (no DOM) so it's testable in node. Used by app.js for skip-a-meal:
   each menu entry carries a `grocery` field (clean, scaled, buy-only items);
   the list is the union of non-skipped meals, with like items merged + summed.

   Exposes Grocery.build(menu, skipped); require()-able in node. */
(function (root) {
  'use strict';

  const AISLE_ORDER = ['Produce', 'Meat & Seafood', 'Dairy & Eggs', 'Bakery',
    'Pantry & Dry Goods', 'Condiments & Sauces', 'Other'];

  // Aisle rules, first match wins. Order disambiguates (e.g. "beef broth"->Pantry,
  // "tomato soup"->Pantry, "pineapple juice"->Condiments — all before Produce/Meat).
  const RULES = [
    // Condiments BEFORE Pantry so "rice vinegar" isn't grabbed by the "rice" keyword.
    ['Condiments & Sauces', /\b(soy sauce|fish sauce|hoisin|oyster sauce|sriracha|ketchup|mustard|mayo|mayonnaise|worcestershire|vinegar|pesto|salsa|sauce|honey|syrup|sesame oil|balsamic|teriyaki|sherry|shaoxing|cooking wine|liquid smoke|juice|dressing|vinaigrette|hummus)\b/],
    ['Pantry & Dry Goods', /\b(broth|stock|flour|breadcrumbs?|panko|sugar|rice|pasta|noodles?|rotini|spaghetti|oats|cornstarch|chia|seeds?|granola|soup|baking|nuts?|walnuts?|cashews?|almonds?)\b/],
    ['Bakery', /\b(bread|buns?|rolls?|bagels?|tortillas?|naan|pita|loaf|loaves)\b/],
    ['Dairy & Eggs', /\b(eggs?|milk|cream|butter|cheese|parmesan|mozzarella|cheddar|feta|swiss|yogurt|sour cream|ricotta)\b/],
    ['Meat & Seafood', /\b(chicken|beef|pork|steaks?|thighs?|breasts?|quarters?|ground|bacon|sausage|ham|turkey|tuna|salmon|shrimp|chorizo|ribs)\b/],
    ['Produce', /\b(onions?|garlic|asparagus|potato(?:es)?|lemons?|limes?|ginger|rosemary|parsley|oregano|herbs?|thyme|basil|cilantro|tomato(?:es)?|lettuce|berr(y|ies)|pineapple|scallions?|green onion|avocados?|cabbage|coleslaw|carrots?|celery|spinach|kale|mushrooms?|cucumbers?|zucchini|apples?|bananas?|broccoli|cauliflower|shallots?|leeks?|corn|greens?|vegetables?|fruit|peppers?|chili(?:es)?|bok choy|snap peas?|green beans?|broccolini)\b/],
  ];

  function classify(name) {
    for (const [aisle, re] of RULES) if (re.test(name)) return aisle;
    return 'Other';
  }
  function title(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  const UNIT = {
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb', oz: 'oz', ounce: 'oz', ounces: 'oz',
    cup: 'cup', cups: 'cup', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
    tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', clove: 'clove', cloves: 'clove',
    can: 'can', cans: 'can', slice: 'slice', slices: 'slice', sprig: 'sprig', sprigs: 'sprig',
    bunch: 'bunch', head: 'head', heads: 'head', loaf: 'loaf', loaves: 'loaf',
    dozen: 'dozen', stick: 'stick', sticks: 'stick', carton: 'carton', cartons: 'carton',
  };

  function toNum(tok) {
    tok = tok.trim();
    if (tok.includes('-')) tok = tok.split('-').pop().trim();   // range -> upper (buy enough)
    if (/^\d+\s+\d+\/\d+$/.test(tok)) { const [w, f] = tok.split(/\s+/); const [a, b] = f.split('/'); return +w + (+a / +b); }
    if (/^\d+\/\d+$/.test(tok)) { const [a, b] = tok.split('/'); return +a / +b; }
    return parseFloat(tok);
  }

  // "1.25 lb chicken breasts" -> {num:1.25, unit:'lb', name:'chicken breasts'}
  // "6 eggs" -> {num:6, unit:'', name:'eggs'} ; "garlic" -> {num:null, unit:'', name:'garlic'}
  function parseItem(item) {
    let s = (item || '').trim();
    const m = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*-\s*\d+(?:\.\d+)?)?)\s*(.*)$/);
    if (!m) return { num: null, unit: '', name: s.toLowerCase().replace(/\s+/g, ' ').trim() };
    let n = toNum(m[1]); let rest = m[2]; let unit = '';
    const um = rest.match(/^([a-z]+)\.?\s+(.*)$/i);
    if (um && UNIT[um[1].toLowerCase()]) { unit = UNIT[um[1].toLowerCase()]; rest = um[2]; }
    return { num: n, unit, name: rest.toLowerCase().replace(/\s+/g, ' ').trim() };
  }

  // Fold simple plurals so "egg"/"eggs", "tomato"/"tomatoes" group together.
  function singular(n) {
    if (/(asparagus|hummus|molasses|greens|oats)$/.test(n)) return n;
    return (n.endsWith('s') && n.length > 3) ? n.replace(/s$/, '') : n;
  }

  function fmtNum(x) {
    const r = Math.round(x * 100) / 100;
    if (Math.abs(r - Math.round(r)) < 1e-9) return String(Math.round(r));
    return '~' + (Math.round(x * 10) / 10);
  }

  function label(name, contribs) {
    const units = new Set(contribs.map(c => c.unit));
    const allNum = contribs.every(c => c.num != null);
    if (allNum && units.size === 1) {
      const u = [...units][0];
      const sum = contribs.reduce((a, c) => a + c.num, 0);
      return (fmtNum(sum) + (u ? ' ' + u : '') + ' ' + title(name)).trim();
    }
    return title(name);   // mixed units / unitless staple -> just the name
  }

  // menu: [{day, meal, name, grocery, ingredients}], skipped: {"Day|meal": true}
  function build(menu, skipped) {
    skipped = skipped || {};
    const groups = {};   // name -> {name, aisle, contribs:[{num,unit,day,meal}]}
    for (const m of menu) {
      if (skipped[m.day + '|' + m.meal]) continue;
      if (/leftover/i.test(m.name)) continue;
      const src = (m.grocery && m.grocery.trim()) ? m.grocery : '';   // require curated contributions
      if (!src) continue;
      for (const raw of src.split(';').map(s => s.trim()).filter(Boolean)) {
        const p = parseItem(raw);
        if (!p.name) continue;
        const key = singular(p.name);
        const g = groups[key] || (groups[key] = { name: p.name, contribs: [] });
        if (p.name.length > g.name.length) g.name = p.name;   // keep the fullest display name
        g.contribs.push({ num: p.num, unit: p.unit, day: m.day, meal: m.meal });
      }
    }
    const byAisle = {};
    for (const k in groups) {
      const g = groups[k];
      g.aisle = classify(g.name);
      g.label = label(g.name, g.contribs);
      g.days = [...new Set(g.contribs.map(c => c.day.slice(0, 3) + ' ' + c.meal[0]))];
      (byAisle[g.aisle] = byAisle[g.aisle] || []).push(g);
    }
    const out = [];
    for (const a of AISLE_ORDER) {
      if (byAisle[a]) out.push({ aisle: a, items: byAisle[a].sort((x, y) => x.name.localeCompare(y.name)) });
    }
    return out;
  }

  const api = { build, parseItem, classify, label, AISLE_ORDER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Grocery = api;
})(typeof window !== 'undefined' ? window : this);
