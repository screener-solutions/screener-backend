// screener-backend/index.js

require("dotenv").config(); // Load env vars FIRST

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid"); // For generating unique IDs
const OpenAI = require("openai");

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Restrict CORS to Vercel frontend
app.use(cors({
  origin: "https://screener-agent-connect.vercel.app"
}));
app.use(bodyParser.json());

// In-memory "database"
const screeningPrompts = {
  abc123: "You're a recruiter. Ask the candidate about their experience with team leadership.",
  xyz789: "You're screening for a frontend developer. Ask about React and JavaScript experience.",
};

// 👇 Create screening route
app.post("/screening", (req, res) => {
  const { prompt } = req.body;

  if (!prompt) {
    return res.status(400).json({ error: "Prompt is required" });
  }

  const id = uuidv4();
  screeningPrompts[id] = prompt;

  console.log("✅ New screening created:", { id, prompt });

  res.json({ id });
});

// ✅ GET route with logging
app.get("/screening/:id", (req, res) => {
  const { id } = req.params;
  console.log("🔍 Fetching screening ID:", id);

  const prompt = screeningPrompts[id];

  if (!prompt) {
    console.log("❌ Screening NOT found for ID:", id);
    return res.status(404).json({ error: "Invalid screening ID" });
  }

  console.log("✅ Screening found:", prompt);
  res.json({ prompt });
});

// Handle response to screening
app.post("/screening/:id/respond", async (req, res) => {
  const { messages } = req.body;
  const prompt = screeningPrompts[req.params.id];

  if (!prompt) return res.status(404).json({ error: "Invalid screening ID" });

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "system", content: prompt }, ...messages],
    });

    res.json({ reply: response.choices[0].message });
  } catch (err) {
    console.error("❌ OpenAI error:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

// Optional debug route
app.get("/debug/screenings", (req, res) => {
  res.json(screeningPrompts);
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
