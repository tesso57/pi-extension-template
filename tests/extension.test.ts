import assert from "node:assert/strict";
import test from "node:test";
import extension from "../extensions/index.ts";
import { createMockPi } from "./helpers/mock-pi.ts";

test("the example command displays a greeting", async () => {
  const mock = createMockPi();
  extension(mock.pi);
  await mock.runCommand("hello");
  assert.deepEqual(mock.notifications, [{ message: "Hello from your Pi extension!", type: "info" }]);
});
