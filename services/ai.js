const { GoogleGenerativeAI } = require("@google/generative-ai");

async function generateHealthAnalysis(data) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("AI service not configured. Set GEMINI_API_KEY in .env");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const rows = data.rows;
  const count = rows.length;

  const tableHeader = "| Time | Heart Rate (BPM) | SpO2 (%) | Body Temp (°C) | NOx (ppm) | PM2.5 (μg/m³) | Air Temp (°C) | Humidity (%) |";
  const tableSep = "|---|---|---|---|---|---|---|---|";
  const tableRows = rows.map(r =>
    `| ${r.created_at || ""} | ${r.heart_rate ?? ""} | ${r.spo2 ?? ""} | ${r.body_temp ?? ""} | ${r.nox ?? ""} | ${r.pm25 ?? ""} | ${r.air_temp ?? ""} | ${r.humidity ?? ""} |`
  ).join("\n");

  const prompt = `You are an asthma health analyst. Analyze this patient ("${data.patient_code}") for ${data.date} (${count} readings).

Data:
${tableHeader}
${tableSep}
${tableRows}

Thresholds: HR 60-100 BPM | SpO2 ≥95% normal, 90-94% caution, <90% critical | Body temp 36.1-37.2°C | NOx <0.5 ppm good | PM2.5 <15 good, 15-35 moderate, >35 poor | Air temp 20-28°C | Humidity 40-60% optimal

Provide a SHORT analysis (under 200 words):
1. **Summary** — 1-2 sentence overall status
2. **Key Risks** — specific abnormal readings and asthma triggers found
3. **Recommendations** — 2-3 brief actionable tips

Use plain markdown with bullet points. Be specific with numbers. Keep it concise.`;

  const result = await model.generateContent(prompt);
  return result.response.text();
}

module.exports = { generateHealthAnalysis };
