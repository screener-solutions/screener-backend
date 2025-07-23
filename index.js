// screener-backend/index.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
const OpenAI = require("openai");
const { Pool } = require("pg");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Restrict CORS to frontend only
app.use(cors({
  origin: "https://screener-agent-connect.vercel.app"
}));
app.use(bodyParser.json());

/**
 * CREATE SCREENING — inserts a new prompt into the DB
 */
app.post("/screening", async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const id = uuidv4();

  try {
    await pool.query("INSERT INTO screenings (id, prompt) VALUES ($1, $2)", [id, prompt]);
    console.log("✅ New screening created:", { id, prompt });
    res.json({ id });
  } catch (err) {
    console.error("❌ Error inserting into DB:", err);
    res.status(500).json({ error: "Could not create screening" });
  }
});

/**
 * GET SCREENING — retrieves the prompt from DB by ID
 */
app.get("/screening/:id", async (req, res) => {
  const { id } = req.params;
  console.log("🔍 Fetching screening ID:", id);

  try {
    const result = await pool.query("SELECT prompt FROM screenings WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      console.log("❌ Screening NOT found:", id);
      return res.status(404).json({ error: "Invalid screening ID" });
    }

    const prompt = result.rows[0].prompt;
    console.log("✅ Screening found:", prompt);
    res.json({ prompt });
  } catch (err) {
    console.error("❌ Error fetching from DB:", err);
    res.status(500).json({ error: "Could not retrieve screening" });
  }
});

/**
 * POST RESPONSE — OpenAI call using screening prompt from DB
 */
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
    console.error("❌ Error handling response:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

/**
 * DEBUG SCREENINGS — shows recent entries in the DB
 */
app.get("/debug/screenings", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM screenings ORDER BY created_at DESC LIMIT 50");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: "Unable to fetch debug info" });
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
