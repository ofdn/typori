# Typori — Font Specimen Tool

A browser-based, open-source font specimen and feedback tool for type designers and publishers. Works with any Unicode script — paste text in any language.

**Live demo:** https://&lt;your-username&gt;.github.io/typori/

---

## Features

- **Three views:** Paragraph (reading proof), Syllabic Grid (Brahmic/abugida testing), Device Mockup (UI context)
- **Any font:** Drag-and-drop or load TTF/OTF/WOFF/WOFF2 directly in the browser. No OS install needed.
- **Editable blocks:** Click any block to edit text, adjust font, size, line-height, letter-spacing, color, alignment
- **Syllabic Grid Generator:** Paste consonants + vowel signs, generate the full barakhadi grid. Templates for Odia and Devanagari included.
- **Export PNG / PDF** of the current specimen
- **Export/Import JSON** config — share a specimen layout without Git
- **Copy CSS snippet** for any block
- **Survey panel:** Attach feedback questions to any specimen; export questions and responses as JSON/CSV
- No login, no server, no database

---

## Local development

```bash
# Serve from the project root (any HTTP server works)
python3 -m http.server 8899
# then open http://localhost:8899
```

Opening `index.html` directly from the filesystem won't load the JSON templates (browser blocks local fetch). Use a local server.

---

## Deploy to GitHub Pages

1. Create a new GitHub repository (e.g. `typori`)
2. Push all project files to `main` branch:
   ```bash
   git init
   git add .
   git commit -m "Initial Typori v1"
   git branch -M main
   git remote add origin https://github.com/<your-username>/typori.git
   git push -u origin main
   ```
3. In the repo on GitHub, go to **Settings → Pages**
4. Under **Source**, choose **Deploy from a branch**, select **main**, folder **/ (root)**
5. Click Save. Your site will be live at `https://<your-username>.github.io/typori/` in ~1 minute.

No build step needed — it's a static site.

---

## Adding script templates

Drop a JSON file under `templates/syllabic-grid/<name>.json` following the structure of `odia.json`:

```json
{
  "name": "Script Name Barakhadi",
  "consonants": ["க", "ச", ...],
  "vowelSigns": [
    { "label": "—", "sign": "" },
    { "label": "ā", "sign": "ா" },
    ...
  ]
}
```

Then reference it in `index.html` with a `<button class="link-btn" data-template="<name>">` button.

---

## Contributing text and survey translations

No Git or code knowledge needed:

1. Open the Survey panel → edit question text
2. Click **Export Questions** → `typori-questions.json`
3. Email the file (or attach to a GitHub issue) and maintainers can add it to `questions/`

---

## Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `⌘ D` | Duplicate selected block |
| `⌘ +` / `⌘ –` | Increase / decrease font size |
| `⌘ E` | Export JSON config |
| `Esc` | Deselect block |

---

## File structure

```
index.html
css/main.css
js/app.js
templates/
  paragraph/default.json       — default paragraph specimen
  syllabic-grid/odia.json      — Odia barakhadi
  syllabic-grid/devanagari.json
questions/
  default_en.json              — default English survey questions
```

---

## v1 scope

Prioritised in this order:
1. Block/page model and all three views working
2. Local font loading, PNG/PDF export, JSON config, CSS copy
3. Syllabic grid generator
4. Survey panel with export

Not in v1: authentication, cloud storage, font variable-axis controls, multi-page layouts.
