// screener-backend/index.js

require("dotenv").config(); // Load env vars FIRST

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
const { Pool } = require("pg");
const OpenAI = require("openai");

// OpenAI setup
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// PostgreSQL connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// Ensure screenings table exists
async function ensureTable() {
  console.log("🛠 Checking screenings table...");
  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout TO 5000"); // 5 seconds timeout
    await client.query(`
      CREATE TABLE IF NOT EXISTS screenings (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ screenings table is ready.");
  } catch (err) {
    console.error("❌ Error creating table:", err);
  } finally {
    client.release();
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({
  origin: [
    "https://screener-agent-connect.vercel.app",
    "https://app.screener.solutions"
  ],
  credentials: true
}));

// Create screening
app.post("/screening", async (req, res) => {
  const {
    id,
    jobTitle,
    companyName,
    jobDescription,
    candidateName,
    candidateEmail
  } = req.body;

  if (!id || !jobTitle || !companyName || !jobDescription) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  const prompt = `You are Screener, a conversational agent focused on screening candidates for specific positions and scoring them based on their responses. You should conduct interviews, screen candidates, and evaluate their technical skills and problem-solving abilities using varying and simple challenges. You should generate a single aggregate score from 0 to 100 based on the candidate's overall match for the role, providing a brief summary of strengths and areas for improvement. Before each use, it will receive information about the role to match the candidate to the specific requirements. The interview will be conducted in a conversational manner, asking one question at a time and gathering the candidate's answer before moving on to the next question. The interview should consist of 10 to 15 questions, starting with questions about experience and including 1 or 2 questions about problem-solving and way of thinking relevant to the role. You should be professional and insightful in your interactions, using a casual but not too casual tone. You should avoid any discriminatory or biased language, ensure confidentiality, and always aim to provide accurate and constructive evaluations. This version is focused solely on assisting companies in the hiring process. You're will be screening a candidate for the role of ${jobTitle} at ${companyName}. Use the following job description to guide your questions:\n\n${jobDescription}`;

  try {
    await pool.query(
      `
      INSERT INTO screenings
      (id, prompt, job_title, company_name, job_description, candidate_name, candidate_email)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
      [id, prompt, jobTitle, companyName, jobDescription, candidateName || null, candidateEmail || null]
    );

    console.log("✅ New screening stored in DB:", { id });
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error inserting screening:", err);
    res.status(500).json({ error: "Failed to store screening." });
  }
});

// Get screening prompt
app.get("/screening/:id", async (req, res) => {
  const { id } = req.params;
  console.log("🔍 Fetching screening ID:", id);

  try {
    const result = await pool.query("SELECT prompt FROM screenings WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      console.log("❌ Screening NOT found:", id);
      return res.status(404).json({ error: "Invalid screening ID" });
    }

    console.log("✅ Screening found:", id);
    res.json({ prompt: result.rows[0].prompt });
  } catch (err) {
    console.error("❌ Error fetching screening:", err);
    res.status(500).json({ error: "Failed to retrieve screening." });
  }
});

// Respond to screening
app.post("/screening/:id/respond", async (req, res) => {
  const { messages } = req.body;
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT prompt FROM screenings WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Invalid screening ID" });
    }

    const prompt = result.rows[0].prompt;

    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "system", content: prompt }, ...messages],
    });

    res.json({ reply: response.choices[0].message });
  } catch (err) {
    console.error("❌ Error during screening response:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// Save candidate info after screening has started
app.post("/screening/:id/start", async (req, res) => {
  const { id } = req.params;
  const { candidateName, candidateEmail } = req.body;

  if (!candidateName || !candidateEmail) {
    return res.status(400).json({ error: "Missing candidate info" });
  }

  try {
    await pool.query(
      "UPDATE screenings SET candidate_name = $1, candidate_email = $2 WHERE id = $3",
      [candidateName, candidateEmail, id]
    );
    console.log("✅ Candidate info saved for screening:", id);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ Error saving candidate info:", err);
    res.status(500).json({ error: "Failed to save candidate info" });
  }
});

// Debug route
app.get("/debug/screenings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM screenings ORDER BY created_at DESC LIMIT 10");
    res.json(result.rows);
  } catch (err) {
    console.error("❌ Error fetching debug data:", err);
    res.status(500).json({ error: "Failed to load debug data." });
  }
});

// Start server
app.listen(PORT, async () => {
  await ensureTable();
  console.log(`🚀 Server running on port ${PORT}`);
});
