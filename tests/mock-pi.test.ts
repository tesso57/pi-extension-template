import assert from "node:assert/strict";
import test from "node:test";
import { createMockPi } from "./helpers/mock-pi.ts";

test("commands receive arguments and record notifications", async () => {
  const mock = createMockPi();
  mock.pi.registerCommand("greet", { handler: async (args, ctx) => ctx.ui.notify(args, "info") });
  await mock.runCommand("greet", "hello");
  assert.deepEqual(mock.notifications, [{ message: "hello", type: "info" }]);
  await assert.rejects(mock.runCommand("missing"), /Unknown command/);
});

test("event handlers run in registration order and may unsubscribe", async () => {
  const mock = createMockPi();
  const calls: number[] = [];
  const unsubscribe = mock.pi.on("session_start", async () => { calls.push(1); });
  mock.pi.on("session_start", async () => { calls.push(2); });
  await mock.emit("session_start", { type: "session_start" });
  unsubscribe();
  await mock.emit("session_start", { type: "session_start" });
  assert.deepEqual(calls, [1, 2, 2]);
});

test("dialog responses are consumed in order and missing responses fail", async () => {
  const mock = createMockPi({ confirm: [true, false], input: ["value", undefined], select: ["A"] });
  assert.equal(await mock.context.ui.confirm("title", "message"), true);
  assert.equal(await mock.context.ui.confirm("title", "message"), false);
  assert.equal(await mock.context.ui.input("title"), "value");
  assert.equal(await mock.context.ui.input("title"), undefined);
  assert.equal(await mock.context.ui.select("title", ["A", "B"]), "A");
  await assert.rejects(mock.context.ui.confirm("title", "message"), /No mock response/);
});

test("registered tools are accessible by name", () => {
  const mock = createMockPi();
  const tool = { name: "example" };
  mock.pi.registerTool(tool as never);
  assert.equal(mock.tools.get("example"), tool);
});
