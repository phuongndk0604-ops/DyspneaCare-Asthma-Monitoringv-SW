const express = require("express");
const router = express.Router();
const { dbRun, dbGet, dbAll } = require("../db");
const { generateHealthAnalysis } = require("../services/ai");

function getDateStr(date) {
  const d = new Date(date);
  return d.toISOString().split("T")[0];
}

router.post("/generate", async (req, res) => {
  try {
    let { patient_code, date } = req.body;

    if (!patient_code) {
      return res.status(400).json({ success: false, error: "patient_code is required" });
    }

    if (!date) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      date = getDateStr(yesterday);
    } else if (date === "today") {
      date = getDateStr(new Date());
    } else {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        return res.status(400).json({ success: false, error: "Invalid date format. Use YYYY-MM-DD." });
      }
      date = getDateStr(parsed);
    }

    const rows = dbAll(
      "SELECT * FROM sensor_data WHERE patient_code = ? AND DATE(created_at) = ? ORDER BY created_at ASC",
      [patient_code, date]
    );

    if (!rows || rows.length === 0) {
      return res.status(400).json({
        success: false,
        error: "No sensor data found for this patient on the selected date.",
      });
    }

    const analysis = await generateHealthAnalysis({
      patient_code,
      date,
      rows,
    });

    const existing = dbGet(
      "SELECT id FROM ai_analysis WHERE patient_code = ? AND date = ?",
      [patient_code, date]
    );

    let id;
    if (existing) {
      dbRun(
        "UPDATE ai_analysis SET analysis = ?, data_points = ?, created_at = CURRENT_TIMESTAMP WHERE id = ?",
        [analysis, rows.length, existing.id]
      );
      id = existing.id;
    } else {
      const result = dbRun(
        "INSERT INTO ai_analysis (patient_code, date, data_points, analysis) VALUES (?, ?, ?, ?)",
        [patient_code, date, rows.length, analysis]
      );
      id = result.lastInsertRowid;
    }

    const saved = dbGet("SELECT * FROM ai_analysis WHERE id = ?", [id]);

    res.json({
      success: true,
      id: saved.id,
      patient_code: saved.patient_code,
      date: saved.date,
      data_points: saved.data_points,
      analysis: saved.analysis,
      created_at: saved.created_at,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/latest/:patient_code", (req, res) => {
  try {
    const row = dbGet(
      "SELECT * FROM ai_analysis WHERE patient_code = ? ORDER BY created_at DESC LIMIT 1",
      [req.params.patient_code]
    );
    res.json(row || null);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/list/:patient_code", (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 5));
    const offset = (page - 1) * limit;

    const total = dbGet(
      "SELECT COUNT(*) as count FROM ai_analysis WHERE patient_code = ?",
      [req.params.patient_code]
    )?.count || 0;

    const rows = dbAll(
      "SELECT * FROM ai_analysis WHERE patient_code = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
      [req.params.patient_code, limit, offset]
    );

    res.json({
      analyses: rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/:patient_code", (req, res) => {
  try {
    const { date } = req.query;
    let row;
    if (date) {
      row = dbGet(
        "SELECT * FROM ai_analysis WHERE patient_code = ? AND date = ?",
        [req.params.patient_code, date]
      );
    } else {
      row = dbGet(
        "SELECT * FROM ai_analysis WHERE patient_code = ? ORDER BY created_at DESC LIMIT 1",
        [req.params.patient_code]
      );
    }
    res.json(row || null);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
