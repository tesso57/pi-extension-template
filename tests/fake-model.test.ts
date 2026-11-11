import { deferred } from "./helpers/deferred.ts";
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeContext } from "@earendil-works/pi-ai";
import { createFakeModel } from "./helpers/fake-model.ts";
import { createAgentSession, SessionManager } from "@earendil-works/pi-coding-agent";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

test("scripted fake model responds in a real Pi session without an API call", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-fake-model-"));
  const fake = createFakeModel([{ content: [{ type: "text", text: "hello from fake" }] }]);
  try {
    const { session } = await createAgentSession({ cwd: dir, agentDir: join(dir, "agent"), model: fake.model, sessionManager: SessionManager.inMemory(dir), noTools: "all" });
    try {
      session.modelRuntime.hasConfiguredAuth = () => true;
      session.agent.streamFunction = fake.stream;
      await session.prompt("say hello");
      assert.equal(fake.requests.length, 1);
      assert.ok(session.messages.some((m) => m.role === "assistant" && m.content.some((c) => c.type === "text" && c.text === "hello from fake")));
    } finally { session.dispose(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fake model fails loudly when its script runs out", async () => {
  const fake = createFakeModel([]);
  assert.throws(() => fake.stream(fake.model, normalizeContext({ messages: [] })), /script exhausted/);
});

test("scripted tool calls execute in Pi before the next fake reply", async () => {
  const { writeFile } = await import("node:fs/promises");
  const dir = await mkdtemp(join(tmpdir(), "pi-fake-tool-"));
  const fake = createFakeModel([
    { content: [{ type: "toolCall", id: "call-1", name: "read", arguments: { path: "example.txt" } }] },
    { content: [{ type: "text", text: "done" }] },
  ]);
  try {
    await writeFile(join(dir, "example.txt"), "file sentinel");
    const { session } = await createAgentSession({ cwd: dir, agentDir: join(dir, "agent"), model: fake.model, sessionManager: SessionManager.inMemory(dir), tools: ["read"] });
    try {
      session.modelRuntime.hasConfiguredAuth = () => true;
      session.agent.streamFunction = fake.stream;
      await session.prompt("read the file");
      assert.equal(fake.requests.length, 2);
      const result = session.messages.find((m) => m.role === "toolResult");
      assert.ok(result && result.role === "toolResult");
      assert.equal(result.isError, false);
      assert.ok(result.content.some((item) => item.type === "text" && item.text.includes("file sentinel")));
    } finally { session.dispose(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("fake model snapshots scripts and requests rather than retaining mutable references", async () => {
  const reply = { content: [{ type: "text" as const, text: "original" }] };
  const fake = createFakeModel([reply, reply]);
  reply.content[0].text = "changed";
  const user = { role: "user" as const, content: [{ type: "text" as const, text: "before" }], timestamp: 0 };
  const context = normalizeContext({ messages: [user] });
  const first = await fake.stream(fake.model, context).result();
  user.content[0].text = "after";
  assert.deepEqual(fake.requests[0].messages[0], { role: "user", content: [{ type: "text", text: "before" }], timestamp: 0 });
  assert.equal(first.content[0].type === "text" && first.content[0].text, "original");
  if (first.content[0].type === "text") first.content[0].text = "mutated";
  const second = await fake.stream(fake.model, context).result();
  assert.equal(second.content[0].type === "text" && second.content[0].text, "original");
});

test("fake model supports pausing and aborting a response", async () => {
  const gate = deferred<void>();
  const fake = createFakeModel([{ content: [{ type: "text", text: "done" }], waitFor: gate.promise }]);
  const controller = new AbortController();
  const stream = fake.stream(fake.model, normalizeContext({ messages: [] }), { signal: controller.signal });
  const events = (async () => { const types = []; for await (const event of stream) types.push(event.type); return types; })();
  controller.abort();
  assert.equal((await stream.result()).stopReason, "aborted");
  gate.resolve();
  assert.deepEqual(await events, ["start", "error"]);
});

test("fake model waits until released before completing a response", async () => {
  const gate = deferred<void>();
  const fake = createFakeModel([{ content: [{ type: "text", text: "done" }], waitFor: gate.promise }]);
  const stream = fake.stream(fake.model, normalizeContext({ messages: [] }));
  let settled = false;
  const result = stream.result().then(value => { settled = true; return value; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(settled, false);
  gate.resolve();
  assert.equal((await result).stopReason, "stop");
});

test("an actual Pi session can abort while a fake response is held", { timeout: 5000 }, async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-fake-abort-"));
  const gate = deferred<void>();
  const fake = createFakeModel([{ content: [{ type: "text", text: "not delivered" }], waitFor: gate.promise }]);
  try {
    const { session } = await createAgentSession({ cwd: dir, agentDir: join(dir, "agent"), model: fake.model, sessionManager: SessionManager.inMemory(dir), noTools: "all" });
    try {
      session.modelRuntime.hasConfiguredAuth = () => true;
      session.agent.streamFunction = fake.stream;
      const prompt = session.prompt("wait");
      while (fake.requests.length === 0) await new Promise(resolve => setImmediate(resolve));
      await session.abort();
      await prompt;
      assert.ok(session.messages.some(m => m.role === "assistant" && m.stopReason === "aborted"));
    } finally { gate.resolve(); session.dispose(); }
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("a rejected response gate terminates the stream with an error", async () => {
  const gate = deferred<void>();
  const fake = createFakeModel([{ content: [], waitFor: gate.promise }]);
  const resultPromise = fake.stream(fake.model, normalizeContext({ messages: [] })).result();
  await new Promise(resolve => setImmediate(resolve));
  gate.reject(new Error("gate failed"));
  const result = await resultPromise;
  assert.equal(result.stopReason, "error");
  assert.match(result.errorMessage!, /gate failed/);
});
