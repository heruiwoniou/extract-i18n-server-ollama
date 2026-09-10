import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  translate,
  modelChain,
  SYSTEM_PROMPT,
  repairMojibake,
  createTranslator,
} from "../src/translate.mjs";

const BODY = `{ to: "zh", translation_value: "hello world" }`;

// Fake Ollama client. Handlers map model name -> response content (string)
// or an Error to throw (mirrors the real client behavior of rejecting on
// HTTP errors such as exhausted cloud quota).
function fakeOllama(handlers) {
  const calls = [];
  return {
    calls,
    chat: async ({ model, messages }) => {
      calls.push({ model, messages });
      const handler = handlers[model];
      if (handler instanceof Error) throw handler;
      if (typeof handler === "string") {
        return {
          model,
          message: { role: "assistant", content: handler },
          done: true,
        };
      }
      throw new Error(`unexpected model call: ${model}`);
    },
  };
}

describe("translate()", () => {
  test("sends the protocol system prompt plus the user request to the primary model", async () => {
    const client = fakeOllama({ "gemma2:2b": "你好世界" });

    const result = await translate(client, ["gemma2:2b"], BODY);

    assert.equal(result.content, "你好世界");
    assert.equal(result.model, "gemma2:2b");
    assert.equal(client.calls.length, 1);
    assert.equal(client.calls[0].model, "gemma2:2b");
    assert.equal(client.calls[0].messages.length, 2);
    assert.equal(client.calls[0].messages[0].role, "system");
    // Hand-derived protocol keywords from the spec: the prompt must teach
    // the JSON request format and the literal "error" answer.
    assert.ok(client.calls[0].messages[0].content.includes("translation_value"));
    assert.ok(client.calls[0].messages[0].content.includes("error"));
    assert.equal(client.calls[0].messages[1].role, "user");
    assert.equal(client.calls[0].messages[1].content, BODY);
  });

  test("returns the trimmed content from the model response", async () => {
    const client = fakeOllama({ "gemma2:2b": "\n  你好世界  \n" });

    const result = await translate(client, ["gemma2:2b"], BODY);

    assert.equal(result.content, "你好世界");
  });

  test("reports the model that produced the translation", async () => {
    // The break this catches: success logging/monitoring attributing the
    // answer to the wrong model (e.g. after reordering the model chain).
    const client = fakeOllama({
      "gemma3:27b-cloud": new Error("quota exhausted"),
      "gemma2:2b": "本地兜底结果",
    });

    const result = await translate(
      client,
      ["gemma3:27b-cloud", "gemma2:2b"],
      BODY
    );

    assert.equal(result.model, "gemma2:2b");
    assert.equal(result.content, "本地兜底结果");
  });

  test("falls back to the next model when the primary call fails", async () => {
    const client = fakeOllama({
      "gemma3:27b-cloud": new Error("quota exhausted"),
      "gemma2:2b": "本地兜底结果",
    });

    const result = await translate(
      client,
      ["gemma3:27b-cloud", "gemma2:2b"],
      BODY
    );

    assert.equal(result.content, "本地兜底结果");
    assert.deepEqual(
      client.calls.map((c) => c.model),
      ["gemma3:27b-cloud", "gemma2:2b"]
    );
  });

  test("falls back to the next model when the primary answers protocol error", async () => {
    const client = fakeOllama({
      "gemma3:27b-cloud": "error",
      "gemma2:2b": "误判被兜底救回",
    });

    const result = await translate(
      client,
      ["gemma3:27b-cloud", "gemma2:2b"],
      BODY
    );

    assert.equal(result.content, "误判被兜底救回");
    assert.equal(result.model, "gemma2:2b");
    assert.equal(client.calls.length, 2);
  });

  test("strips symmetric quotes wrapped around the answer", async () => {
    const client = fakeOllama({
      "gemma2:2b": "\"I'm sorry, I cannot fulfill your request.\"",
    });

    const result = await translate(client, ["gemma2:2b"], BODY);

    assert.equal(result.content, "I'm sorry, I cannot fulfill your request.");
  });

  test("keeps quotes that are not a symmetric wrapper", async () => {
    const client = fakeOllama({ "gemma2:2b": "He said \"hi\" to me" });

    const result = await translate(client, ["gemma2:2b"], BODY);

    assert.equal(result.content, "He said \"hi\" to me");
  });

  test("strips symmetric curly quotes wrapped around the answer", async () => {
    const client = fakeOllama({ "gemma2:2b": "“你好”" });

    const result = await translate(client, ["gemma2:2b"], BODY);

    assert.equal(result.content, "你好");
  });

  test("throws the last error when every model fails", async () => {
    const client = fakeOllama({
      "gemma3:27b-cloud": new Error("quota exhausted"),
      "gemma2:2b": new Error("connection refused"),
    });

    await assert.rejects(
      translate(client, ["gemma3:27b-cloud", "gemma2:2b"], BODY),
      { message: "connection refused" }
    );
    assert.equal(client.calls.length, 2);
  });

  test("throws when the only model answers protocol error", async () => {
    const client = fakeOllama({ "gemma2:2b": "error" });

    await assert.rejects(
      translate(client, ["gemma2:2b"], BODY),
      /protocol error/
    );
    assert.equal(client.calls.length, 1);
  });
});

describe("modelChain()", () => {
  test("skips a fallback that is empty or identical to the primary", () => {
    assert.deepEqual(modelChain("gemma2:2b", "gemma2:2b"), ["gemma2:2b"]);
    assert.deepEqual(modelChain("gemma3:27b-cloud", ""), ["gemma3:27b-cloud"]);
  });

  test("keeps a distinct fallback model", () => {
    assert.deepEqual(modelChain("gemma3:27b-cloud", "gemma2:2b"), [
      "gemma3:27b-cloud",
      "gemma2:2b",
    ]);
  });
});

describe("repairMojibake()", () => {
  test("repairs UTF-8 bytes that were decoded as Latin-1", () => {
    // Mirrors exactly how the corruption happens in the wild: a client puts
    // raw UTF-8 bytes in the URL and they get decoded as Latin-1.
    const mojibake = Buffer.from("修复图片无法加载的问题", "utf8").toString("latin1");

    assert.equal(repairMojibake(mojibake), "修复图片无法加载的问题");
  });

  test("leaves correctly encoded non-ASCII text unchanged", () => {
    assert.equal(repairMojibake("修复图片无法加载的问题"), "修复图片无法加载的问题");
  });

  test("leaves pure ASCII unchanged", () => {
    assert.equal(repairMojibake("this_is_a_introduce"), "this_is_a_introduce");
  });

  test("leaves Latin-1 text that is not valid UTF-8 unchanged", () => {
    assert.equal(repairMojibake("café"), "café");
  });
});

describe("createTranslator()", () => {
  const MODELS = ["primary-model", "fallback-model"];

  test("skips the primary while it is within the cooldown window", async () => {
    // The break this catches: hammering an unavailable (e.g. quota-exhausted)
    // primary model on every request before falling back.
    let nowMs = 1000;
    const translator = createTranslator(MODELS, {
      cooldownMs: 60_000,
      now: () => nowMs,
    });

    await translator(
      fakeOllama({
        "primary-model": new Error("Unauthorized"),
        "fallback-model": "第一次兜底",
      }),
      BODY
    );

    nowMs = 30_000; // still within the 60s window
    const client = fakeOllama({ "fallback-model": "第二次兜底" });
    const result = await translator(client, BODY);

    assert.equal(result.content, "第二次兜底");
    assert.equal(result.model, "fallback-model");
    assert.deepEqual(
      client.calls.map((c) => c.model),
      ["fallback-model"]
    );
  });

  test("retries the primary after the cooldown expires", async () => {
    let nowMs = 1000;
    const translator = createTranslator(MODELS, {
      cooldownMs: 60_000,
      now: () => nowMs,
    });

    await translator(
      fakeOllama({
        "primary-model": new Error("Unauthorized"),
        "fallback-model": "兜底",
      }),
      BODY
    );

    nowMs = 61_500; // window expired
    const client = fakeOllama({ "primary-model": "主模型恢复了" });
    const result = await translator(client, BODY);

    assert.deepEqual(
      client.calls.map((c) => c.model),
      ["primary-model"]
    );
    assert.equal(result.model, "primary-model");
  });

  test("keeps using the primary after a success", async () => {
    let nowMs = 1000;
    const translator = createTranslator(MODELS, {
      cooldownMs: 60_000,
      now: () => nowMs,
    });

    await translator(fakeOllama({ "primary-model": "第一次" }), BODY);

    nowMs = 999_999;
    const client = fakeOllama({ "primary-model": "第二次" });
    const result = await translator(client, BODY);

    assert.deepEqual(
      client.calls.map((c) => c.model),
      ["primary-model"]
    );
    assert.equal(result.model, "primary-model");
  });

  test("never skips a single-model chain", async () => {
    let nowMs = 1000;
    const translator = createTranslator(["only-model"], {
      cooldownMs: 60_000,
      now: () => nowMs,
    });

    await assert.rejects(
      translator(fakeOllama({ "only-model": new Error("down") }), BODY)
    );

    const client = fakeOllama({ "only-model": "恢复了" });
    const result = await translator(client, BODY);

    assert.deepEqual(
      client.calls.map((c) => c.model),
      ["only-model"]
    );
    assert.equal(result.content, "恢复了");
  });
});

test("SYSTEM_PROMPT is exported and non-empty", () => {
  assert.equal(typeof SYSTEM_PROMPT, "string");
  assert.ok(SYSTEM_PROMPT.length > 0);
});
