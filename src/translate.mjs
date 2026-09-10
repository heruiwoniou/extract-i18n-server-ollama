// Protocol system prompt shared by every model. Keeping it here (instead of
// baked into a Modelfile) lets any model — local or cloud — answer in the
// same format.
export const SYSTEM_PROMPT = `You are a translation model, you will be given requests strictly in this serializable JSON format:
{ to: "zh" | "en" | "zh-CN" | "en-US", translation_value: string }

In case the provided request didn't match the exact JSON format provided earlier, the following response should be returned:
error

If the request format is correct, then the response you provide should be a translated text from the translation_value field, and its target language is the language of the word in the to field. Do not provide any additional text in the response`;

const trim = (value) => value.replace(/(^\s*)|(\s*$)/g, "");

// Models sometimes wrap their answer in quotes. Strip them only when they
// form a symmetric pair around the whole answer, so inner quotes survive.
const stripWrappedQuotes = (value) => {
  const t = trim(value);
  const closing = { '"': '"', "“": "”", "„": "“", "«": "»" };
  const first = t[0];
  return first && closing[first] === t[t.length - 1]
    ? trim(t.slice(1, -1))
    : t;
};

// Repairs text whose UTF-8 bytes were decoded as Latin-1 — clients that put
// raw UTF-8 in the URL instead of percent-encoding produce such mojibake.
// Only applied when every character fits the Latin-1 range and the repaired
// text is valid UTF-8, so correctly encoded input can never be damaged.
export function repairMojibake(text) {
  if (!/[^\u0000-\u007F]/.test(text)) return text;
  if ([...text].some((c) => c.codePointAt(0) > 0xff)) return text;
  const repaired = Buffer.from(text, "latin1").toString("utf8");
  return repaired.includes("\uFFFD") ? text : repaired;
}

// Builds the ordered list of models to try. A fallback that is unset or
// identical to the primary is pointless and gets skipped.
export function modelChain(primary, fallback) {
  const models = [];
  if (primary) models.push(primary);
  if (fallback && fallback !== primary) models.push(fallback);
  return models;
}

// Tries each model in order until one answers with a translation. Any
// failure — API error (quota exhausted, auth, network) or a protocol
// "error" answer — moves on to the next model. Throws the last error when
// every model fails. Resolves to { content, model } where model names the
// model that produced the answer.
export async function translate(client, models, requestBody) {
  let lastError;
  for (const model of models) {
    try {
      const response = await client.chat({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: requestBody },
        ],
      });
      const translated = stripWrappedQuotes(response.message.content);
      if (translated === "error") {
        throw new Error(`Model ${model} returned protocol error`);
      }
      return { content: translated, model };
    } catch (e) {
      lastError = e;
      console.warn(`Model ${model} failed: ${e.message}`);
    }
  }
  throw lastError;
}

// Wraps translate() with a simple circuit breaker for the primary model:
// once the primary fails, subsequent requests skip it for cooldownMs and
// start from the fallback directly, avoiding one wasted failing call per
// request. After the window expires the primary is probed again (and a
// success clears the state). A single-model chain is never skipped.
export function createTranslator(models, { cooldownMs = 60_000, now = Date.now } = {}) {
  let primaryBlockedUntil = 0;
  const [primary, ...rest] = models;

  return async function translateWithFallback(client, requestBody) {
    const skipPrimary = models.length > 1 && now() < primaryBlockedUntil;
    const order = skipPrimary ? rest : models;

    const result = await translate(client, order, requestBody);

    if (result.model === primary) {
      primaryBlockedUntil = 0;
    } else if (order[0] === primary) {
      // Only the request that actually attempted the primary opens the
      // window, so the primary is re-probed when it expires.
      primaryBlockedUntil = now() + cooldownMs;
    }
    return result;
  };
}
