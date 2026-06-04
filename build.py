#!/usr/bin/env python3
"""Generate index.html for the phone app by baking the week's data inline.

Run this whenever the weekly plan changes:

    python3 sheets_helper.py export-app-data   # pull this week from the Sheet
    python3 build.py                           # bake it into index.html

It prefers app_data.json (the Sheet export: pool + this week's menu +
consolidated grocery list). If that's missing it falls back to recipes_full.json
(pool only). The data is embedded, so the app works offline from a file:// URL
or hosted statically (e.g. GitHub Pages) with no server or API.
"""

import hashlib
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "index.html")


def _ver(name):
    """Short content hash, appended to asset URLs so browsers never serve a
    stale app.js/app.css after a deploy (cache-busting)."""
    p = os.path.join(HERE, name)
    if not os.path.exists(p):
        return "1"
    with open(p, "rb") as fh:
        return hashlib.md5(fh.read()).hexdigest()[:8]

app_data_path = os.path.join(HERE, "app_data.json")
if os.path.exists(app_data_path):
    with open(app_data_path, encoding="utf-8") as f:
        app_data = json.load(f)
else:
    # Fallback: pool only, no weekly menu/grocery.
    with open(os.path.join(HERE, "recipes_full.json"), encoding="utf-8") as f:
        app_data = {"generated": "", "recipes": json.load(f), "menu": [], "grocery": {}}

recipes = app_data.get("recipes", [])
menu = app_data.get("menu", [])
week = app_data.get("generated", "")
subtitle = f"Week of {week}" if menu else f"{len(recipes)} recipes"

# Compact JSON, safely escaped for inlining inside a <script> tag.
data_js = json.dumps(app_data, ensure_ascii=False).replace("</", "<\\/")
css_v = _ver("app.css")
js_v = _ver("app.js")
gro_v = _ver("grocery.js")

html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1">
<meta name="theme-color" content="#14110f">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<title>Meal Planner</title>
<link rel="stylesheet" href="app.css?v={css_v}">
</head>
<body>

<header class="topbar">
  <button class="iconbtn" id="backHome" title="Home">‹</button>
  <h1>This Week</h1>
  <span class="sub">{subtitle}</span>
</header>

<main>
  <section id="home"    class="view active"><div class="pad"></div></section>
  <section id="recipe"  class="view"></section>
  <section id="grocery" class="view"><div class="pad"></div></section>
</main>

<nav class="tabbar">
  <button data-tab="home"    class="active"><span class="ic">🍽️</span>This Week</button>
  <button data-tab="grocery"><span class="ic">🛒</span>Groceries</button>
</nav>

<!-- COOK MODE overlay (the important screen) -->
<section id="cook">
  <div class="cook-top">
    <button class="iconbtn" id="cookClose" title="Exit">✕</button>
    <span class="title" id="cookTitle"></span>
    <span class="mic" id="cookMic"><span class="blob"></span>voice on</span>
  </div>
  <div class="dots" id="cookDots"></div>
  <div class="cook-now" id="cookNow">
    <div class="stepno" id="cookStepNo"></div>
    <div class="steptext" id="cookStepText"></div>
    <div class="timer" id="cookTimer" style="display:none"></div>
  </div>
  <div class="cook-next" id="cookNext"></div>
  <div class="tap-hint">tap anywhere above to go to the next step</div>
  <div class="cook-bar">
    <button id="cookPrev">◀ Back</button>
    <button id="cookRepeat">🔊 Repeat</button>
    <span class="spacer"></span>
    <button class="next" id="cookNextBtn">Next ▸</button>
  </div>
</section>

<script>const APP_DATA = {data_js};</script>
<script src="grocery.js?v={gro_v}"></script>
<script src="app.js?v={js_v}"></script>
</body>
</html>
"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Wrote {OUT}: {len(recipes)} recipes, {len(menu)} menu entries"
      f"{f', week of {week}' if week else ' (pool only — no app_data.json)'}.")
