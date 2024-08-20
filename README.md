## Ollama install

see the [Ollama Website](https://ollama.com/)

### install translate model

```bash
ollama pull icky/translate:latest
```

## Service run

modify the env ollama api environment
OLLAMA_BASE=http://<You ip or localhost>:11433

docker-compose up -d

### test 

```bash
curl http://localhost:9877/translate\?to\=cn\&text\=this_is_a_introduce
```

