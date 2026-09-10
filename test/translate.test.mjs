import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { translate, modelChain, SYSTEM_PROMPT } from "../src/translate.mjs";

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

    assert.equal(result, "你好世界");
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

  test("returns the trimmed translation content", async () => {
    const client = fakeOllama({ "gemma2:2b": "\n  你好世界  \n" });

    const result = await translate(client, ["gemma2:2b"], BODY);

    assert.equal(result, "你好世界");
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

    assert.equal(result, "本地兜底结果");
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

    assert.equal(result, "误判被兜底救回");
    assert.equal(client.calls.length, 2);
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

test("SYSTEM_PROMPT is exported and non-empty", () => {
  assert.equal(typeof SYSTEM_PROMPT, "string");
  assert.ok(SYSTEM_PROMPT.length > 0);
});
