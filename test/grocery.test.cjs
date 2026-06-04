/* Unit tests for the grocery engine machinery (parse / classify / label / build).
   No dependencies — run with:  node test/grocery.test.cjs
   These guard against regressions as new menu items appear week to week. */
const G = require('../grocery.js');

let pass = 0; const fails = [];
function eq(actual, expected, msg) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) pass++; else fails.push(`${msg}\n      got ${a}\n      exp ${e}`);
}
function ok(cond, msg) { if (cond) pass++; else fails.push(msg); }

/* ---------------- parseItem: quantities, units, fractions, ranges ---------------- */
const pi = G.parseItem;
eq(pi('1.25 lb chicken breasts'), { num: 1.25, unit: 'lb', name: 'chicken breasts' }, 'decimal lb');
eq(pi('6 eggs'),                   { num: 6, unit: '', name: 'eggs' }, 'count, no unit');
eq(pi('garlic'),                   { num: null, unit: '', name: 'garlic' }, 'unitless staple');
eq(pi('1 1/2 tsp minced garlic'),  { num: 1.5, unit: 'tsp', name: 'minced garlic' }, 'mixed fraction');
eq(pi('1/2 cup flour'),            { num: 0.5, unit: 'cup', name: 'flour' }, 'fraction');
eq(pi('3-4 bone-in pork chops'),   { num: 4, unit: '', name: 'bone-in pork chops' }, 'range -> upper');
eq(pi('2 cans tuna'),              { num: 2, unit: 'can', name: 'tuna' }, 'plural unit -> singular');
eq(pi('24 oz greek yogurt'),       { num: 24, unit: 'oz', name: 'greek yogurt' }, 'oz');
eq(pi('1 carton tomato soup'),     { num: 1, unit: 'carton', name: 'tomato soup' }, 'carton unit');
eq(pi('6 slices bread'),           { num: 6, unit: 'slice', name: 'bread' }, 'slices');

/* ---------------- classify: every aisle + tricky disambiguations ---------------- */
const c = G.classify;
eq(c('chicken breasts'), 'Meat & Seafood', 'chicken -> meat');
eq(c('ground beef'),     'Meat & Seafood', 'beef -> meat');
eq(c('deli turkey'),     'Meat & Seafood', 'turkey -> meat');
eq(c('beef broth'),      'Pantry & Dry Goods', 'beef broth -> pantry (NOT meat)');
eq(c('tomato soup'),     'Pantry & Dry Goods', 'tomato soup -> pantry (NOT produce)');
eq(c('rolled oats'),     'Pantry & Dry Goods', 'oats -> pantry');
eq(c('pineapple juice'), 'Condiments & Sauces', 'juice -> condiments (NOT produce)');
eq(c('soy sauce'),       'Condiments & Sauces', 'soy sauce -> condiments');
eq(c('rice vinegar'),    'Condiments & Sauces', 'vinegar -> condiments');
eq(c('swiss cheese'),    'Dairy & Eggs', 'cheese -> dairy (NOT meat via "swiss")');
eq(c('greek yogurt'),    'Dairy & Eggs', 'yogurt -> dairy');
eq(c('butter'),          'Dairy & Eggs', 'butter -> dairy');
eq(c('bread'),           'Bakery', 'bread -> bakery');
eq(c('tomato'),          'Produce', 'tomato singular -> produce');
eq(c('cherry tomatoes'), 'Produce', 'tomatoes plural -> produce');
eq(c('bell pepper'),     'Produce', 'bell pepper -> produce (NOT filtered)');
eq(c('asparagus'),       'Produce', 'asparagus -> produce');
ok(c('tofu') === 'Other', 'unknown ingredient -> Other (documents the classifier gap)');

/* ---------------- label: summing, counts, mixed units, plural folding ------------ */
const L = G.label;
eq(L('chicken breasts', [{ num: 1.25, unit: 'lb' }, { num: 1.1, unit: 'lb' }]), '~2.4 lb Chicken breasts', 'sum lb');
eq(L('eggs', [{ num: 6, unit: '' }, { num: 1, unit: '' }]), '7 Eggs', 'sum counts');
eq(L('bread', [{ num: 6, unit: 'slice' }, { num: 6, unit: 'slice' }]), '12 slice Bread', 'sum slices (integer)');
eq(L('butter', [{ num: null, unit: '' }, { num: 2, unit: 'tbsp' }]), 'Butter', 'mixed/unitless -> name only');
eq(L('milk', [{ num: null, unit: '' }, { num: null, unit: '' }]), 'Milk', 'all unitless -> name only');

/* ---------------- build + skip on a synthetic menu ------------------------------- */
const menu = [
  { day: 'Monday', meal: 'dinner', name: 'A', grocery: '1.25 lb chicken breasts; garlic' },
  { day: 'Thursday', meal: 'dinner', name: 'B', grocery: '1.1 lb chicken breasts; 1 lemon' },
  { day: 'Tuesday', meal: 'dinner', name: 'C', grocery: '1 egg; 6 eggs' },        // plural folding
  { day: 'Wednesday', meal: 'lunch', name: 'Dinner Leftovers', grocery: '' },     // excluded
  { day: 'Friday', meal: 'breakfast', name: 'D' },                                // no grocery field -> excluded
];
const built = G.build(menu, {});
function find(b, name) { return b.flatMap(s => s.items).find(i => i.name === name); }
eq(find(built, 'chicken breasts').label, '~2.4 lb Chicken breasts', 'build: shared item summed');
eq(find(built, 'eggs').label, '7 Eggs', 'build: egg/eggs folded + summed');
ok(!find(built, ''), 'build: leftovers + no-grocery meals contribute nothing');

const skipped = G.build(menu, { 'Thursday|dinner': true });
ok(/1\.3 lb/.test(find(skipped, 'chicken breasts').label), 'skip: Thursday dropped -> chicken ~1.3 lb (Mon only)');
ok(!find(skipped, 'lemon'), 'skip: Thursday-only item (lemon) removed entirely');

/* ---------------- report ---------------- */
console.log(`\n${pass} passed, ${fails.length} failed`);
if (fails.length) { console.log('\nFAILURES:'); fails.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
console.log('✓ all green');
