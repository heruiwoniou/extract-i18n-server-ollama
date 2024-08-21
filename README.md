# Translation server with ollama

This is an http interface service for translation
The translation service uses the LLM grand model of Gemma2:2b

The model is only 1.6G in size, lightweight and efficient.

## Ollama Run

### Install

see the [Ollama Website](https://ollama.com/)

### Insert model

```bash
ollama pull icky/translate:latest
```

## Service Run

### Environment


```bash
# .env

# Web server port
PORT=9877

# Ollama service endpoint
OLLAMA_BASE=http://<You ip or localhost>:11433 
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
curl http://localhost:9877/translate\?to\=cn\&text\=this_is_a_introduce
```

