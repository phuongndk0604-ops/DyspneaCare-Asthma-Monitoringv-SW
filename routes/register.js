const express = require("express");
const router = express.Router();
const { dbRun, dbGet } = require("../db");

router.post("/", (req, res) => {
  try {
    const { first_name, last_name, username, email, password, confirm_password } = req.body;

    if (!first_name || !last_name || !username || !email || !password || !confirm_password) {
      return res.status(400).json({ success: false, error: "Please fill in all fields" });
    }

    if (password !== confirm_password) {
      return res.status(400).json({ success: false, error: "Passwords do not match" });
    }

    const existing = dbGet("SELECT * FROM users WHERE username = ? OR email = ?", [username, email]);

    if (existing) {
      if (existing.username === username) {
        return res.status(400).json({ success: false, error: "Username already exists" });
      }
      if (existing.email === email) {
        return res.status(400).json({ success: false, error: "Email already exists" });
      }
    }

    const patient_code = (Math.floor(100000 + Math.random() * 900000)).toString();

    dbRun(
      "INSERT INTO users (role, patient_code, username, password, email, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
      ["patient", patient_code, username, password, email, first_name, last_name]
    );

    res.json({ success: true, message: "Account created successfully", patient_code });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to create account" });
  }
});

module.exports = router;
