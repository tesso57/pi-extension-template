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
