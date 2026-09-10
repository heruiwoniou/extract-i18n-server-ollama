# Translation server with ollama

This is an http interface service for translation.

The translation system prompt is sent with every request, so **any** ollama
model can be used — local or cloud (`-cloud` suffixed) — without creating a
custom Modelfile. A local fallback model takes over automatically when the
primary model is unavailable (e.g. cloud quota exhausted).

## Ollama Run

### Install

see the [Ollama Website](https://ollama.com/)

### Models

Configure models through environment variables, no `ollama create` needed:

- `OLLAMA_MODEL` — primary model, e.g. `gemma3:27b-cloud`
- `OLLAMA_FALLBACK_MODEL` — local fallback, e.g. `gemma2:2b` (optional;
  skipped when unset or identical to the primary)

Pull whichever models you plan to use:

```bash
ollama pull gemma3:27b-cloud
ollama pull gemma2:2b
```

## Service Run

### Environment


```bash
# .env

# Web server port
PORT=9877

# Ollama service endpoint
OLLAMA_BASE=http://<You ip or localhost>:11434

# Primary translation model (any ollama model, local or -cloud)
OLLAMA_MODEL=gemma3:27b-cloud

# Local fallback model, used when the primary fails
# (quota exhausted, auth error, network error, or a protocol "error" answer)
OLLAMA_FALLBACK_MODEL=gemma2:2b
```

### Run

#### Docker

```bash
docker-compose up -d
```

#### Local

```bash
npm install
npm run dev
```

## Service test 

```bash
curl http://localhost:9877/translate\?to\=zh\&text\=this_is_a_introduce
```

> Note: URL-encode non-ASCII `text` values (e.g. use `--data-urlencode` or
> percent-encoding); raw UTF-8 in the URL is rejected by the HTTP layer
> with an empty 400 before it reaches this service.

## Behavior

- Requests must look like `{ to: "zh" | "en" | "zh-CN" | "en-US", translation_value: string }`.
- The primary model is tried first; on any failure (API error or a protocol
  `error` answer) the fallback model is tried.
- After a primary failure the primary is skipped for 60 seconds (circuit
  breaker): requests go straight to the fallback, and the primary is
  re-probed when the window expires.
- If every configured model fails, the service responds with HTTP 400.

## Tests

```bash
npm test
```
