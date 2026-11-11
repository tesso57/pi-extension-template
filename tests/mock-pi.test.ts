import { deferred } from "./helpers/deferred.ts";
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

test("captures dialogs and UI status and widget changes", async () => {
  const mock = createMockPi({ select: ["Allow"], input: ["reason"], confirm: [true] });
  await mock.context.ui.select("Decision", ["Allow", "Deny"]);
  await mock.context.ui.input("Why?", "optional");
  await mock.context.ui.confirm("Sure?", "Proceed?");
  assert.deepEqual(mock.dialogs.map((dialog) => dialog.kind), ["select", "input", "confirm"]);
  assert.deepEqual(mock.dialogs[0], { kind: "select", title: "Decision", options: ["Allow", "Deny"] });
  mock.context.ui.setStatus("guard", "enabled");
  mock.context.ui.setWidget("questions", ["pending"]);
  assert.equal(mock.statuses.get("guard"), "enabled");
  assert.deepEqual(mock.widgets.get("questions"), ["pending"]);
  mock.context.ui.setStatus("guard", undefined);
  mock.context.ui.setWidget("questions", undefined);
  assert.equal(mock.statuses.has("guard"), false);
  assert.equal(mock.widgets.has("questions"), false);
});

test("appended custom entries appear in the in-memory session branch", () => {
  const mock = createMockPi();
  mock.pi.appendEntry("question", { id: 1 });
  const entry = mock.context.sessionManager.getBranch().at(-1);
  assert.ok(entry && entry.type === "custom");
  assert.equal(entry.customType, "question");
  assert.deepEqual(entry.data, { id: 1 });
});

test("records user and custom messages without starting agent turns", () => {
  const mock = createMockPi();
  mock.pi.sendUserMessage("answer", { deliverAs: "steer" });
  mock.pi.sendMessage({ customType: "result", content: "done", display: true }, { triggerTurn: true });
  assert.deepEqual(mock.userMessages, [{ content: "answer", options: { deliverAs: "steer" } }]);
  assert.deepEqual(mock.messages, [{ message: { customType: "result", content: "done", display: true }, options: { triggerTurn: true } }]);
});

test("dialog replies can wait, and abort dismisses a pending dialog", async () => {
  const pendingSelection = deferred<string | undefined>();
  const mock = createMockPi({ select: [pendingSelection.promise] });
  const controller = new AbortController();
  const answer = mock.context.ui.select("Select", ["A"], { signal: controller.signal });
  controller.abort();
  assert.equal(await answer, undefined);
  pendingSelection.resolve("A");
  const pendingInput = deferred<string | undefined>();
  mock.responses.input.push(pendingInput.promise);
  const input = mock.context.ui.input("input");
  pendingInput.resolve("answer");
  assert.equal(await input, "answer");
});

test("event context can be overridden and in-memory sessions support branches", async () => {
  const mock = createMockPi();
  const sessionManager = mock.sessionManager;
  mock.pi.appendEntry("state", 1);
  const base = sessionManager.getBranch().at(-1)!;
  mock.pi.appendEntry("state", 2);
  sessionManager.branch(base.id);
  mock.pi.appendEntry("state", 3);
  const values = sessionManager.getBranch().filter(e => e.type === "custom").map(e => e.data);
  assert.deepEqual(values, [1, 3]);
  let cwd = "";
  mock.pi.on("session_start", (_event, ctx) => { cwd = ctx.cwd; });
  await mock.emit("session_start", { type: "session_start" }, { ...mock.context, cwd: "/other" });
  assert.equal(cwd, "/other");
});

test("records tool renderers and supports event bus and configurable activity", () => {
  const mock = createMockPi();
  mock.setIdle(false);
  mock.setPending(true);
  assert.equal(mock.context.isIdle(), false);
  assert.equal(mock.context.hasPendingMessages(), true);
  const received: unknown[] = [];
  mock.pi.events.on("changed", value => received.push(value));
  mock.pi.events.emit("changed", { id: 1 });
  assert.deepEqual(received, [{ id: 1 }]);
  assert.deepEqual(mock.emittedEvents, [{ name: "changed", data: { id: 1 } }]);
  const renderer: Parameters<typeof mock.pi.registerToolRenderer>[0] = () => undefined;
  mock.pi.registerToolRenderer(renderer);
  assert.deepEqual(mock.toolRenderers, [renderer]);
});

test("already-aborted dialogs return cancellation without consuming queued responses", async () => {
  const mock = createMockPi({ confirm: [true], input: ["answer"], select: ["A"] });
  const controller = new AbortController();
  controller.abort();
  assert.equal(await mock.context.ui.confirm("title", "message", { signal: controller.signal }), false);
  assert.equal(await mock.context.ui.input("title", undefined, { signal: controller.signal }), undefined);
  assert.equal(await mock.context.ui.select("title", ["A"], { signal: controller.signal }), undefined);
  assert.equal(await mock.context.ui.confirm("title", "message"), true);
  assert.equal(await mock.context.ui.input("title"), "answer");
  assert.equal(await mock.context.ui.select("title", ["A"]), "A");
});
