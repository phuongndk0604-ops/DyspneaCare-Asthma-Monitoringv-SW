const express = require("express");
const router = express.Router();
const { dbGet } = require("../db");

router.post("/", (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.json({ success: false, error: "Missing credentials!" });
    }

    const user = dbGet("SELECT * FROM users WHERE username = ?", [username]);

    if (!user) {
      return res.json({ success: false, error: "User does not exist!" });
    }

    if (password !== user.password) {
      return res.json({ success: false, error: "Incorrect password!" });
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      patient_code: user.patient_code,
    };

    res.json({
      success: true,
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        patient_code: user.patient_code,
        first_name: user.first_name,
        last_name: user.last_name,
        email: user.email,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
