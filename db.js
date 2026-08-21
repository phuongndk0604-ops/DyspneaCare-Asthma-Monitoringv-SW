const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, "database.db"));

let db = null;

function save() {
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function dbRun(sql, params = []) {
  db.run(sql, params);
  const r = db.exec("SELECT last_insert_rowid() AS id, changes() AS changes");
  save();
  return {
    lastInsertRowid: Number(r[0].values[0][0]),
    changes: Number(r[0].values[0][1]),
  };
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

async function init() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    const dir = path.dirname(DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL DEFAULT 'patient',
      patient_code TEXT UNIQUE,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      email TEXT,
      first_name TEXT,
      last_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sensor_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT NOT NULL,
      heart_rate REAL DEFAULT 0,
      spo2 REAL DEFAULT 0,
      body_temp REAL DEFAULT 0,
      nox REAL DEFAULT 0,
      pm25 REAL DEFAULT 0,
      air_temp REAL DEFAULT 0,
      humidity REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS doctor_advice (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT NOT NULL,
      doctor_id INTEGER NOT NULL,
      advice TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ai_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      patient_code TEXT NOT NULL,
      date TEXT NOT NULL,
      data_points INTEGER DEFAULT 0,
      analysis TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(patient_code, date)
    )
  `);

  const admin = dbGet("SELECT id FROM users WHERE id = 1");
  if (!admin) {
    db.run(
      `INSERT INTO users (id, role, username, password, first_name, last_name)
       VALUES (1, 'admin', 'admin', '123456', 'System', 'Admin')`
    );
  }

  const doctor = dbGet("SELECT id FROM users WHERE id = 2");
  if (!doctor) {
    db.run(
      `INSERT INTO users (id, role, username, password, first_name, last_name)
       VALUES (2, 'doctor', 'doctor01', '123456', 'Nguyen', 'Van A')`
    );
  }

  save();
}

const ready = init();

function gracefulShutdown() {
  if (db) save();
}

module.exports = { dbRun, dbAll, dbGet, ready, gracefulShutdown };
