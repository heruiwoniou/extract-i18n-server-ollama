version: "3"
services:
  translate:
    image: node:18-alpine
    ports:
      - 9877:9877
    working_dir: /home/translateService
    volumes:
      - ./:/home/translateService
    command: /home/translateService/start.sh
    restart: always
