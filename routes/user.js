const express = require("express");
const router = express.Router();
const { dbRun, dbAll } = require("../db");

router.get("/", (req, res) => {
  try {
    const rows = dbAll(
      "SELECT id, role, username, patient_code, first_name, last_name FROM users ORDER BY id ASC"
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json([]);
  }
});

router.put("/:id", (req, res) => {
  try {
    const { first_name, last_name, username, role, password } = req.body;
    const { id } = req.params;

    if (!first_name || !last_name || !username || !role) {
      return res.status(400).json({ success: false, error: "Missing required fields" });
    }

    if (password) {
      dbRun(
        "UPDATE users SET first_name = ?, last_name = ?, username = ?, role = ?, password = ? WHERE id = ?",
        [first_name, last_name, username, role, password, id]
      );
    } else {
      dbRun(
        "UPDATE users SET first_name = ?, last_name = ?, username = ?, role = ? WHERE id = ?",
        [first_name, last_name, username, role, id]
      );
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
