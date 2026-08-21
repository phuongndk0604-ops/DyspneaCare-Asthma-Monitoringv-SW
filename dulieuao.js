require("dotenv").config();
const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

const DB_PATH = path.resolve(process.env.DB_PATH || path.join(__dirname, "database.db"));

function random(min, max, decimals = 1) {
  return Number((Math.random() * (max - min) + min).toFixed(decimals));
}

<<<<<<< HEAD
const patientCode = "531188";
=======
async function seed() {
  const SQL = await initSqlJs();
>>>>>>> c93ad96270f503dbf37b4448981040021dbd277a

  if (!fs.existsSync(DB_PATH)) {
    console.log("Database not found at", DB_PATH);
    return;
  }

  const buffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(buffer);

  const patients = db.exec("SELECT patient_code, first_name, last_name FROM users WHERE role = 'patient'");
  if (!patients[0]?.values?.length) {
    console.log("No patients found. Register a patient first.");
    return;
  }

  for (const row of patients[0].values) {
    const patientCode = row[0];
    const firstName = row[1] || "";
    const lastName = row[2] || "";

    for (let i = 0; i < 20; i++) {
      const dayOffset = Math.floor(i / 5);
      const readingInDay = i % 5;

      db.run(
        `INSERT INTO sensor_data (patient_code, heart_rate, spo2, body_temp, nox, pm25, air_temp, humidity, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ? || ' days', ? || ' hours'))`,
        [
          patientCode,
          random(65, 95),
          random(95, 100),
          random(36.2, 37.5),
          random(0.1, 0.8),
          random(10, 40),
          random(28, 35),
          random(55, 85),
          `-${dayOffset}`,
          `-${(readingInDay + 1) * 3}`,
        ]
      );
    }

    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
    console.log(`Seeded 20 readings for ${firstName} ${lastName} (${patientCode})`);
  }

  console.log("Done.");
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
