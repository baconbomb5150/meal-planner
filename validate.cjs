/* Weekly grocery validation / lint.  Run after building each week's data:
     node validate.cjs [path-to-app_data.json]   (defaults to ./app_data.json)

   Surfaces anything that needs a human eye BEFORE publishing:
     ERRORS  (exit 1) — unclassified items ("Other"); a real meal with no contribution
     REVIEW  (exit 0) — possible un-merged duplicates, unit conflicts, suppressed sums
   This is the safety net for new menu items the heuristics haven't seen. */
const fs = require('fs');
const path = require('path');
const G = require('./grocery.js');

const file = path.resolve(process.argv[2] || './app_data.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const menu = data.menu || [];
const built = G.build(menu, {});
const items = built.flatMap(s => s.items);

const errors = [];
const review = [];

// 1) unclassified items
for (const s of built)
  if (s.aisle === 'Other')
    for (const it of s.items)
      errors.push(`Unclassified ("Other"): "${it.label}" — add a keyword to grocery.js RULES`);

// 2) a real (non-leftover) meal that contributes nothing to the list
for (const m of menu) {
  if (/leftover/i.test(m.name)) continue;
  if (!(m.grocery && m.grocery.trim()))
    errors.push(`No grocery contribution: ${m.day} ${m.meal} — "${m.name}"`);
}

// 3) possible un-merged duplicates within an aisle (one name is a whole-word part of
//    another). Ignore common qualifiers (red onion vs onion etc.) to cut noise.
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const QUALIFIER = /^(red|green|yellow|white|sweet|baby|new|cherry|russet|grape|fresh|ground|deli|sliced|shredded)\b/;
for (const s of built)
  for (let i = 0; i < s.items.length; i++)
    for (let j = i + 1; j < s.items.length; j++) {
      const a = s.items[i].name, b = s.items[j].name;
      const longer = a.length >= b.length ? a : b, shorter = a.length >= b.length ? b : a;
      if (longer === shorter) continue;
      if (!new RegExp('\\b' + esc(shorter) + '\\b').test(longer)) continue;
      if (QUALIFIER.test(longer.replace(shorter, '').trim()) || QUALIFIER.test(longer)) continue;
      review.push(`Possible duplicate in ${s.aisle}: "${a}" vs "${b}" — should these merge?`);
    }

// 4) items where a sum was suppressed (mixed unitless+qty, or conflicting units)
for (const it of items) {
  if (it.contribs.length < 2) continue;
  const nums = it.contribs.map(c => c.num);
  if (nums.some(n => n != null) && nums.some(n => n == null))
    review.push(`Sum suppressed (mixed): "${it.label}" — some meals gave a quantity, some didn't`);
  const units = new Set(it.contribs.filter(c => c.num != null).map(c => c.unit));
  if (units.size > 1)
    review.push(`Unit conflict (not summed): "${it.label}" — units: ${[...units].join(' / ')}`);
}

console.log(`Grocery validation — week ${data.generated || '?'} · ${menu.length} meals · ${items.length} items`);
if (errors.length) { console.log('\nERRORS (fix before publishing):'); errors.forEach(e => console.log('  ✗ ' + e)); }
if (review.length) { console.log('\nReview:'); review.forEach(r => console.log('  • ' + r)); }
if (!errors.length && !review.length) console.log('\n✓ clean — nothing flagged');
process.exit(errors.length ? 1 : 0);
