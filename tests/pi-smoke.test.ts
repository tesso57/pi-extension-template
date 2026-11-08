import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import { DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

test("Pi loads the extension and registers its command", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pi-extension-smoke-"));
  try {
    const loader = new DefaultResourceLoader({
      cwd: dir,
      agentDir: join(dir, "agent"),
      additionalExtensionPaths: [resolve("extensions/index.ts")],
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
    });
    await loader.reload();
    const result = loader.getExtensions();
    assert.deepEqual(result.errors, []);
    const extension = result.extensions.find((item) => item.resolvedPath === resolve("extensions/index.ts"));
    assert.ok(extension, "Pi did not load the extension");
    assert.ok(extension.commands.has("hello"), "Pi did not register /hello");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
