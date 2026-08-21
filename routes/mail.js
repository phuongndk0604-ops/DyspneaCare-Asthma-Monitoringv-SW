const express = require("express");
const nodemailer = require("nodemailer");
const router = express.Router();
const { dbGet } = require("../db");

router.post("/forgot-password", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ success: false, error: "Please enter your username" });
    }

    const user = dbGet("SELECT * FROM users WHERE username = ?", [username]);

    if (!user) {
      return res.status(404).json({ success: false, error: "Account not found" });
    }

    if (!user.email) {
      return res.status(400).json({ success: false, error: "This account has no email set" });
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: `"Asthma Cybernetics System" <${process.env.MAIL_USER}>`,
      to: user.email,
      subject: "Password Recovery",
      html: `
        <h3>Hello ${user.first_name || user.username}</h3>
        <p>Your password is:</p>
        <div style="padding:10px;background:#f2f2f2;font-size:18px;">
          <b>${user.password}</b>
        </div>
      `,
    });

    res.json({ success: true, message: "Password sent to your email" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: "Failed to send email" });
  }
});

module.exports = router;
