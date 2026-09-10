// Protocol system prompt shared by every model. Keeping it here (instead of
// baked into a Modelfile) lets any model — local or cloud — answer in the
// same format.
export const SYSTEM_PROMPT = `You are a translation model, you will be given requests strictly in this serializable JSON format:
{ to: "zh" | "en" | "zh-CN" | "en-US", translation_value: string }

In case the provided request didn't match the exact JSON format provided earlier, the following response should be returned:
error

If the request format is correct, then the response you provide should be a translated text from the translation_value field, and its target language is the language of the word in the to field. Do not provide any additional text in the response`;

const trim = (value) => value.replace(/(^\s*)|(\s*$)/g, "");

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
// every model fails.
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
      const translated = trim(response.message.content);
      if (translated === "error") {
        throw new Error(`Model ${model} returned protocol error`);
      }
      return translated;
    } catch (e) {
      lastError = e;
      console.warn(`Model ${model} failed: ${e.message}`);
    }
  }
  throw lastError;
}
