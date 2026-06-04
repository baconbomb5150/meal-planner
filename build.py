#!/usr/bin/env python3
"""Generate index.html for the phone app by baking recipe data inline.

Run this whenever the recipe pool / weekly plan changes:

    python3 build.py

It reads recipes_full.json (the same data the Google Sheet holds) and writes
a single self-contained index.html that links app.css + app.js. Because the
data is embedded, the app works offline straight from a file:// URL on a phone
or hosted statically (e.g. GitHub Pages) with no server or API.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "recipes_full.json")
OUT = os.path.join(HERE, "index.html")

with open(DATA, encoding="utf-8") as f:
    recipes = json.load(f)

# Compact JSON, safely escaped for inlining inside a <script> tag.
data_js = json.dumps(recipes, ensure_ascii=False).replace("</", "<\\/")

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
<link rel="stylesheet" href="app.css">
</head>
<body>

<header class="topbar">
  <button class="iconbtn" id="backHome" title="Home">‹</button>
  <h1>This Week</h1>
  <span class="sub">{len(recipes)} recipes</span>
</header>

<main>
  <section id="home"    class="view active"><div class="pad"></div></section>
  <section id="recipe"  class="view"></section>
  <section id="grocery" class="view"><div class="pad"></div></section>
</main>

<nav class="tabbar">
  <button data-tab="home"    class="active"><span class="ic">🍽️</span>Recipes</button>
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

<script>const RECIPES = {data_js};</script>
<script src="app.js"></script>
</body>
</html>
"""

with open(OUT, "w", encoding="utf-8") as f:
    f.write(html)

print(f"Wrote {OUT} with {len(recipes)} recipes embedded.")
