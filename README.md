# Meal Planner — phone app

A tiny static web app (PWA) for cooking and shopping from the weekly meal plan.

- **Recipes** — browse the dinner pool with photos.
- **Cook mode** — big now/next steps, screen stays awake, reads steps aloud,
  tap anywhere (or voice on Android) to advance, per-step timers. Built for
  hands-free use at the stove.
- **Groceries** — ingredients grouped by store aisle, tap to check off, state
  saved on the device.

## Files

- `index.html` — the app (recipe data baked in)
- `app.css` / `app.js` — styling + logic
- `build.py` — regenerates `index.html` from `recipes_full.json`
- `recipes_full.json` — recipe data (a snapshot of the planner's pool)

## Updating each week

Refresh `recipes_full.json` from the meal-planner sheet, then:

```
python3 build.py
git add -A && git commit -m "Update week" && git push
```

GitHub Pages serves the latest version automatically.
