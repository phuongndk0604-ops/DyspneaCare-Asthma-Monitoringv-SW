const express = require("express");
const router = express.Router();
const { dbRun, dbAll, dbGet } = require("../db");

const MEDICAL_AMENITIES = [
  "hospital", "clinic", "pharmacy",
  "doctors", "health_centre", "dentist", "nursing_home",
];

router.get("/nearby-facilities", async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) {
      return res.status(400).json({ error: "lat and lon query params required" });
    }

    const amenities = MEDICAL_AMENITIES;
    const filter = amenities
      .map(a => `nwr["amenity"="${a}"](around:5000,${lat},${lon});`)
      .join(" ");
    const query = `[out:json];(${filter});out center;`;
    const url = "https://overpass-api.de/api/interpreter?data=" + encodeURIComponent(query);

    const response = await fetch(url, {
      headers: { "User-Agent": "Asthma-Cybernetics-Health-Monitor/1.0" },
    });

    if (!response.ok) {
      console.error("Overpass status", response.status);
      return res.status(502).json({ error: "Map service unavailable. Try again." });
    }

    const data = await response.json();
    res.json(data);
  } catch (err) {
    console.error("Overpass error:", err.message);
    res.status(502).json({ error: "Map service unavailable. Try again." });
  }
});

router.post("/data", (req, res) => {
  try {
    const { patient_code, heart_rate, spo2, body_temp, nox, pm25, air_temp, humidity } = req.body;
    dbRun(
      "INSERT INTO sensor_data (patient_code, heart_rate, spo2, body_temp, nox, pm25, air_temp, humidity) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [patient_code, heart_rate, spo2, body_temp, nox, pm25, air_temp, humidity]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/data/:patient_code", (req, res) => {
  try {
    const row = dbGet(
      "SELECT * FROM sensor_data WHERE patient_code = ? ORDER BY id DESC LIMIT 1",
      [req.params.patient_code]
    );
    res.json(row || {});
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/history/:patient_code", (req, res) => {
  try {
    const rows = dbAll(
      "SELECT * FROM sensor_data WHERE patient_code = ? ORDER BY id DESC LIMIT 50",
      [req.params.patient_code]
    );
    res.json(rows);
  } catch (err) {
    console.error("History error:", err.message);
    res.status(500).json([]);
  }
});

router.get("/advice/:patient_code", (req, res) => {
  try {
    const row = dbGet(
      "SELECT * FROM doctor_advice WHERE patient_code = ? ORDER BY id DESC LIMIT 1",
      [req.params.patient_code]
    );
    res.json({ content: row?.advice || "No advice from doctor yet" });
  } catch (err) {
    res.status(500).json({ content: "" });
  }
});

router.put("/advice/:patient_code", (req, res) => {
  try {
    const { doctor_id, content } = req.body;
    dbRun(
      "INSERT INTO doctor_advice (patient_code, doctor_id, advice) VALUES (?, ?, ?)",
      [req.params.patient_code, doctor_id, content]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/patients", (req, res) => {
  try {
    const rows = dbAll(
      "SELECT id, patient_code, username, first_name, last_name FROM users WHERE role = 'patient'"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

router.get("/patient/:patient_code", (req, res) => {
  try {
    const row = dbGet(
      "SELECT id, patient_code, username, email, first_name, last_name FROM users WHERE patient_code = ?",
      [req.params.patient_code]
    );
    res.json(row || {});
  } catch (err) {
    res.status(500).json({});
  }
});

module.exports = router;
