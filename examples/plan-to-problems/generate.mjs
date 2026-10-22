/**
 * Draft an EARS spec from a product plan.
 * Node 18 or later. No packages. Copy this file next to the inputs and run it there.
 *
 * The key is read only from process.env.XAI_API_KEY and is never printed.
 * XAI_MODEL overrides the default model.
 *
 * node generate.mjs <skill.md> <plan.md> <out.ears.md> [repair-error.txt previous.ears.md]
 */

import { readFileSync, writeFileSync } from "node:fs";

const ENDPOINT = "https://api.x.ai/v1/chat/completions";
const DEFAULT_MODEL = "grok-4.7";

const key = readKey();

main().then(
  () => {},
  (err) => {
    const message = err instanceof Error ? err.message : "request failed";
    console.error("error: " + scrub(message));
    process.exit(1);
  },
);

function readKey() {
  const value = process.env.XAI_API_KEY;
  if (value === undefined || value.length === 0) return "";
  return value;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 3 && args.length !== 5) usage();
  if (key.length === 0) {
    console.error("error: XAI_API_KEY is not set");
    process.exit(2);
  }
  const skill = readText(args[0]);
  const plan = readText(args[1]);
  const outPath = args[2];
  let user = taskText(plan);
  if (args.length === 5) {
    const failure = readText(args[3]);
    const previous = readText(args[4]);
    user = repairText(plan, failure, previous);
  }
  const spec = await complete(skill, user);
  writeFileSync(outPath, spec, "utf8");
  console.error("wrote " + outPath);
}

function taskText(plan) {
  return (
    "You have no tools and cannot run the CLI. Do not describe what you will do. " +
    "Translate the plan below into ONE complete spec-verify spec file (schema declarations plus EARS requirements) exactly as the skill describes. " +
    "Translate every rule in the plan faithfully, even rules that contradict each other or look wrong; do not fix, drop, merge or resolve anything, because the verifier must find the problems. " +
    "Reply with only the spec file inside a single fenced code block.\n\nPlan:\n" +
    plan
  );
}

function usage() {
  console.error(
    "usage: node generate.mjs <skill.md> <plan.md> <out.ears.md> [repair-error.txt previous.ears.md]",
  );
  process.exit(2);
}

function readText(path) {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : "read failed";
    console.error("error: cannot read " + path);
    console.error(scrub(message));
    process.exit(2);
  }
}

function repairText(plan, failure, previous) {
  return (
    taskText(plan) +
    "\n\nThe previous spec failed to parse. Return only a corrected spec.\n\nParser error:\n" +
    failure +
    "\n\nPrevious spec:\n" +
    previous
  );
}

function modelName() {
  const chosen = process.env.XAI_MODEL;
  if (chosen === undefined || chosen.length === 0) return DEFAULT_MODEL;
  return chosen;
}

async function complete(skill, user) {
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + key,
    },
    body: JSON.stringify({
      model: modelName(),
      // A single buffered reply was dropped before it finished. Read the stream instead.
      stream: true,
      messages: [
        { role: "system", content: skill },
        { role: "user", content: user },
      ],
    }),
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok) {
    const raw = await response.text();
    console.error("error: model request failed with status " + String(response.status));
    console.error(scrub(raw));
    process.exit(1);
  }
  const text = await readStream(response);
  if (text.length === 0) {
    console.error("error: the model returned no spec text");
    process.exit(1);
  }
  return extractSpec(text);
}

async function readStream(response) {
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for await (const chunk of response.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        const delta = event.choices && event.choices[0] && event.choices[0].delta;
        if (delta && typeof delta.content === "string") text += delta.content;
      } catch {}
    }
  }
  return text;
}

function extractSpec(text) {
  const fenced = firstFence(text);
  const body = fenced.length > 0 ? fenced : text;
  return trimOuter(body) + "\n";
}

function firstFence(text) {
  const open = text.indexOf("```");
  if (open < 0) return "";
  const lineEnd = text.indexOf("\n", open);
  if (lineEnd < 0) return "";
  const close = text.indexOf("```", lineEnd + 1);
  if (close < 0) return "";
  return text.slice(lineEnd + 1, close);
}

function trimOuter(text) {
  let start = 0;
  let end = text.length;
  if (start < end && text.charCodeAt(start) === 0xfeff) start++;
  while (start < end && isOuterSpace(text.charCodeAt(start))) start++;
  while (end > start && isOuterSpace(text.charCodeAt(end - 1))) end--;
  return text.slice(start, end);
}

function isOuterSpace(code) {
  return code === 32 || code === 9 || code === 10 || code === 13;
}

function scrub(text) {
  if (typeof text !== "string" || key.length === 0) return typeof text === "string" ? text : "";
  return text.split(key).join("[redacted]");
}
