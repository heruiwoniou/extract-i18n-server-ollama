version: "3"
services:
  translate:
    image: node:18-alpine
    ports:
      - 9878:9878
    working_dir: /home/translateService
    volumes:
      - ./:/home/translateService
    command: /home/translateService/start.sh
    restart: always
