// screener-backend/index.js

require("dotenv").config(); // Load env vars FIRST

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false, // For Render's self-signed certs
  },
});

// Create table if not exists
async function ensureTable() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS screenings (
        id TEXT PRIMARY KEY,
        prompt TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log("✅ screenings table is ready.");
  } catch (err) {
    console.error("❌ Error creating screenings table:", err);
  }
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// CORS only for Vercel frontend
app.use(cors({
  origin: "https://screener-agent-connect.vercel.app",
}));

app.use(bodyParser.json());

// Create screening
app.post("/screening", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const id = uuidv4();

  try {
    await pool.query(
      "INSERT INTO screenings (id, prompt) VALUES ($1, $2)",
      [id, prompt]
    );
    console.log("✅ New screening created:", { id, prompt });
    res.json({ id });
  } catch (err) {
    console.error("❌ DB insert error:", err);
    res.status(500).json({ error: "DB insert failed" });
  }
});

// Get screening prompt
app.get("/screening/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT prompt FROM screenings WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      console.log("❌ Screening NOT found for ID:", id);
      return res.status(404).json({ error: "Invalid screening ID" });
    }

    console.log("✅ Screening found:", id);
    res.json({ prompt: result.rows[0].prompt });
  } catch (err) {
    console.error("❌ DB query error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// Respond to screening
app.post("/screening/:id/respond", async (req, res) => {
  const { messages } = req.body;

  try {
    const result = await pool.query(
      "SELECT prompt FROM screenings WHERE id = $1",
      [req.params.id]
    );

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
    console.error("❌ Error handling response:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// Optional debug route
app.get("/debug/screenings", async (req, res) => {
  const result = await pool.query("SELECT * FROM screenings ORDER BY created_at DESC LIMIT 10");
  res.json(result.rows);
});

// Start server
app.listen(PORT, async () => {
  await ensureTable();
  console.log(`🚀 Server running on port ${PORT}`);
});
