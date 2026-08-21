
# WICO Project — Implementation Log

This document records all changes made during the WICO project development session, organized by requirement. Use this as a prompt reference for replicating similar work.

---

## 1. Fix: SQLite native binding error ("Could not locate the bindings file")

**Problem:** `npm start` failed because `sqlite3@6` had no prebuilt binary for Node.js v20.15.0 on Windows x64, and no Visual Studio build tools were available to compile from source.

**Solution:** Replaced `sqlite3` with `sql.js` (pure WebAssembly SQLite, no native compilation).

### Changes

**`package.json`** — replace dependency
```json
// remove
"sqlite3": "^6.0.1"
// add
"sql.js": "^1.14.1"
```

**`db.js`** — full rewrite:
- Use `initSqlJs()` (async WASM initialization)
- Load/save database from file using `db.export()` + `fs.writeFileSync()`
- Export synchronous wrapper functions: `dbRun()`, `dbAll()`, `dbGet()` — matching the `better-sqlite3` API style
- Auto-save to disk after every write operation
- Fix `ai_analysis` table schema (had broken `water_data_id` column — replaced with `local_name`)
- Export `ready` promise for async startup
- Export `gracefulShutdown()` to save on SIGINT/SIGTERM

**`routes/*.js`** (data.js, analysis.js, locations.js) — convert from callback style to synchronous try/catch:
```js
// Before (sqlite3 callback)
db.all(sql, params, (err, rows) => {
  if (err) return res.status(500).json({ error: err.message });
  res.json(rows);
});

// After (sql.js + wrapper)
try {
  const rows = dbAll(sql, params);
  res.json(rows);
} catch (err) {
  res.status(500).json({ error: err.message });
}
```

**`index.js`** — wrap `app.listen()` in `ready.then()`

---

## 2. Prepare for deployment

### Security & middleware

**`package.json`** — add `helmet`, `cors`, `morgan`; remove unused `bcrypt`, `express-session`, `nodemailer`

**`index.js`**:
- `helmet()` — security headers (CSP disabled for Leaflet CDN)
- `cors()` — allow ESP IoT devices from any origin
- `morgan()` — request logging (combined in prod, dev in dev)
- Static file caching: `maxAge: '1d'` in production
- 404 catch-all handler (JSON for `/api/*`, text for pages)
- Global error handler (hides stack trace in production)
- Graceful shutdown on SIGINT/SIGTERM

### Configuration

**`.env`**:
```env
PORT=3000
NODE_ENV=production
DB_PATH=data/database.db
SESSION_SECRET=change-this-to-a-random-string-in-production
```

**`db.js`** — read `DB_PATH` from `process.env`, auto-create directory, enable WAL mode

**`package.json`** — add `"private": true`, `"engines": { "node": ">=18.0.0" }`, description

**`.gitignore`** — add `/data/`, `database.db`, `.env` (already had)

---

## 3. Change web language to English

All user-facing text across frontend and backend English.

### Files changed

| File | What changed |
|---|---|
| `public/home.html` | All headings, labels, placeholders, button text, modal titles |
| `public/script.js` | All user strings: alerts, confirms, chart titles, error messages |
| `public/home.css` | CSS comments only (not user-facing) |
| `routes/data.js` | `"Missing data"`, `toLocaleTimeString("en-US")` |
| `routes/analysis.js` | `"Missing data"`, `"No analysis data available."` |
| `routes/locations.js` | All error messages: `"Location name cannot be empty"`, `"Invalid coordinates"`, `"Location not found"`, etc. |
| `index.js` | `"Server running at..."`, `"Received signal..."`, `"Page not found!"`, `"Endpoint not found"`, `"Internal server error"` |

---

## 4. Add AI analysis with Google Gemini

### What was added

A button-triggered AI analysis feature. User selects a location, clicks a time range button, and the server fetches water data, sends it to Gemini, and returns the analysis.

### Backend

**New files: `services/ai.js`**
- Builds a prompt with location name, data table, WHO standard thresholds
- Calls Gemini API (`gemini-2.5-flash` model)
- Prompt asks for: overall assessment, per-parameter analysis, concerns, recommendations

**Prompt structure sent to Gemini:**
```
You are a water quality analysis expert. Analyze data for "{location}".
Data Range: {range}, Readings: {count}

Data table (markdown):
| Timestamp | Turbidity | TDS | pH | Temperature |

Thresholds:
- Turbidity: <5 NTU ideal, >10 poor
- TDS: <300 ppm excellent, >900 poor
- pH: 6.5-8.5 safe
- Temperature: 20-30°C typical

Please provide:
1. Overall Assessment
2. Per-Parameter Analysis (value, trend, vs standards)
3. Potential Concerns
4. Recommendations

Format with markdown headings and bullet points, be specific with numbers.
```

**`routes/analysis.js`** — new endpoint:
```
POST /api/analysis/generate
Body: { local_name, range }

range options: "last" | "1d" | "3d" | "7d"
```

Logic:
1. Validate `local_name` and `range`
2. Query `water_data` by range:
   - `"last"` → `SELECT ... LIMIT 1`
   - `"1d"/"3d"/"7d"` → `SELECT ... WHERE created_at >= datetime('now', '-N days')`
3. If no data → `400 "No water data found for this range"`
4. Call `generateAnalysis()` from `services/ai.js`
5. `INSERT INTO ai_analysis (local_name, data_range, data_points, analysis)`
6. Return `{ success, id, local_name, data_range, data_points, analysis, created_at }`

**`db.js`** — added columns to `ai_analysis` table:
```sql
data_range TEXT NOT NULL DEFAULT 'last',
data_points INTEGER DEFAULT 0,
```
Auto-migration: drops old table if missing these columns.

**`GET /api/analysis/latest/:local_name`** — now returns `data_range` and `data_points`

### Frontend

**`public/home.html`** — AI modal redesigned:

```
┌───────────────────────────────────────┐
│ 🤖 AI Analysis — {location}          │
│                                       │
│ ┌─── Analysis Content ──────────────┐ │
│ │ (scrollable analysis text)        │ │
│ │ (markdown rendered)               │ │
│ └───────────────────────────────────┘ │
│ 📊 Last 3 Days · 12 readings · 2m ago│
│                                       │
│ ─── Generate New Analysis ────        │
│                                       │
│  [Last Reading] [24 Hours]            │
│  [3 Days]      [7 Days]              │
│                                       │
│  (loading/error status shown here)    │
└───────────────────────────────────────┘
```

**`public/script.js`**:
- `loadAnalysis()` — fetches `GET /api/analysis/latest/{name}`, shows latest analysis with metadata; if none → show "Generate one below" hint
- `generateAnalysis(range)` — calls `POST /api/analysis/generate`, disables buttons during loading, shows spinner, displays result or error
- `enableButtons(bool)` — enables/disables range buttons during request
- `markedParse(text)` — Simple markdown renderer (headings `#` `##` `###`, bold `**`, bullet `*`, newlines)
- `RANGE_LABELS` — mapping of range codes to display labels

**`public/home.css`** — overflow scroll for long analysis:
```css
.analysis-modal { overflow: hidden; }
#analysisLatest { flex: 1; overflow: hidden; display: flex; flex-direction: column; min-height: 0; }
#analysisContent { overflow-y: auto; flex: 1; min-height: 0; }
```

### Installation

```bash
npm install @google/generative-ai
```

### Configuration

```env
GEMINI_API_KEY=your-gemini-api-key
# Get free key at https://aistudio.google.com/apikey
```

### Error handling

- No water data → `400 "No water data found for this location in the selected range."`
- Missing API key → `500 "AI service not configured. Set GEMINI_API_KEY in .env"`
- Gemini API error → `500 "AI analysis failed: {error message}"`
- Frontend shows status messages during loading/error

---

## File tree (final)

```
├── .env
├── .gitignore
├── index.js
├── package.json
├── db.js
├── data/
│   └── database.db
├── services/
│   └── ai.js                  ← NEW: Gemini integration
├── routes/
│   ├── data.js
│   ├── analysis.js
│   └── locations.js
├── public/
│   ├── home.html
│   ├── home.css
│   ├── script.js
│   └── font/
└── docs/
    └── IMPLEMENTATION-LOG.md  ← this file
```

---

## Key patterns used

**sql.js (WASM SQLite) wrapper:**
```js
// db.js
function dbRun(sql, params = []) {
  db.run(sql, params);
  const r = db.exec("SELECT last_insert_rowid() AS id, changes() AS changes");
  save();
  return { lastInsertRowid: Number(r[0].values[0][0]), changes: Number(r[0].values[0][1]) };
}

function dbAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length) stmt.bind([...params]);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

function dbGet(sql, params = []) {
  const rows = dbAll(sql, params);
  return rows[0] || null;
}
```

**Async route handler pattern:**
```js
router.post("/generate", async (req, res) => {
  try {
    // ... sync DB queries
    const result = await generateAnalysis(data);
    // ... save to DB
    res.json({ success: true, ... });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});
```

**Env-based config:**
```js
const PORT = process.env.PORT || 3000;
const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, "database.db"));
```
