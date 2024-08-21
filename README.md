# Translation server with ollama

This is an http interface service for translation
The translation service uses the LLM grand model of Gemma2:2b

The model is only 1.6G in size, lightweight and efficient.

## Ollama Run

### Install

see the [Ollama Website](https://ollama.com/)


### Insert/Create Model

#### Insert preset model

```bash
ollama pull icky/translate:latest
```

#### Create your model

create a file named `Modelfile`

Here is the text
```bash
FROM gemma2:2b
SYSTEM """
You are a translation model, you will be given requests strictly in this serializable JSON format:
{ to: "zh" | "en" | "zh-CN" | "en-US", translation_value: string }

In case the provided request didn't match the exact JSON format provided earlier, the following response should be returned:
error

If the request format is correct, then the response you provide should be a translated text from the translation_value field, and its target language is the language of the word in the to field. Do not provide any additional text in the response
"""

```

create model

```bash
ollama create -f Modelfile icky/translate

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
curl http://localhost:9877/translate\?to\=zh\&text\=this_is_a_introduce
```

