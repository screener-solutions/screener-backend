// screener-backend/index.js

const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const OpenAI = require("openai");
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

// Sample in-memory prompts by ID (normally you'd use a DB)
const screeningPrompts = {
  "abc123": "You're a recruiter. Ask the candidate about their experience with team leadership.",
  "xyz789": "You're screening for a frontend developer. Ask about React and JavaScript experience."
};

app.get("/screening/:id", (req, res) => {
  const prompt = screeningPrompts[req.params.id];
  if (!prompt) return res.status(404).json({ error: "Invalid screening ID" });
  res.json({ prompt });
});

app.post("/screening/:id/respond", async (req, res) => {
  const { messages } = req.body;
  const prompt = screeningPrompts[req.params.id];
  if (!prompt) return res.status(404).json({ error: "Invalid screening ID" });

  try {
    const response = await openai.createChatCompletion({
      model: "gpt-4",
      messages: [
        { role: "system", content: prompt },
        ...messages
      ]
    });
    res.json({ reply: response.data.choices[0].message });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
