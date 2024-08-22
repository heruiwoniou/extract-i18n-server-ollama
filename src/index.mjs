import "dotenv/config";
import { Ollama } from "ollama";
import express from "express";

const app = express();
const port = process.env.PORT || 9878;

const ollama = new Ollama({
  host: process.env.OLLAMA_BASE || "http://127.0.0.1:11434",
});

app.get("/translate", async (req, res) => {
  const text = req.query.text;
  const to = req.query.to;

  const requestBody = `{ to: "${to}", translation_value: "${text}" }`;

  console.log(`Receive request: ${requestBody}`);
  const response = await ollama.chat({
    model: "icky/translate:latest",
    messages: [
      {
        role: "user",
        content: requestBody,
      },
    ],
  });

  const translated = response.message.content.replace(/(^\s*)|(\s*$)/, '');
  console.log(`Translated: ${response.message.content}`);

  if (translated === "error") {
    res.statusMessage = "error";
    res.sendStatus(400).end();
  } else {
    res.send(response.message.content);
  }
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
