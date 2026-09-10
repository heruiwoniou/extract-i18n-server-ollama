import "dotenv/config";
import { Ollama } from "ollama";
import express from "express";
import { createTranslator, modelChain, repairMojibake } from "./translate.mjs";

const app = express();
const port = process.env.PORT || 9878;

const ollama = new Ollama({
  host: process.env.OLLAMA_BASE || "http://127.0.0.1:11434",
});

// Primary model (e.g. a cloud model), with an optional local fallback
// model that takes over when the primary is unavailable. After a primary
// failure the primary is skipped for 60s instead of being retried per call.
const translateWithFallback = createTranslator(
  modelChain(
    process.env.OLLAMA_MODEL || "gemma2:2b",
    process.env.OLLAMA_FALLBACK_MODEL || "gemma2:2b"
  )
);

app.get("/translate", async (req, res) => {
  const text = repairMojibake(req.query.text);
  const to = req.query.to;

  const requestBody = `{ to: "${to}", translation_value: "${text}" }`;

  console.log(`Receive request [${req.method}](${req.url}): ${requestBody}`);

  try {
    const { content, model } = await translateWithFallback(ollama, requestBody);
    console.log(`Translated (model: ${model}): ${content}`);
    res.send(content);
  } catch (e) {
    res.statusMessage = e.message;
    console.warn("Translate error:", e.message);
    res.sendStatus(400).end();
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
