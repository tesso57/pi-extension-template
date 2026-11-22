# Pi extension template

A TypeScript extension template for the [Pi coding agent](https://github.com/badlogic/pi-mono). The sample `/hello` command displays a notification.

## Getting started

1. Create a repository from the template. Update `name`, `description`, and `version` in `package.json`. Adjust the license and copyright notice if needed.
2. Install Node.js 26.13.0 (LTS) and Pi, then run `npm ci`. With nvm, use `nvm install` and `nvm use` to select the version in `.nvmrc`.
3. Start Pi with the following command and run `/hello`.

   ```sh
   pi -e ./extensions/index.ts
   ```

4. Replace the sample command in `extensions/index.ts`. If you change the entry point, update `pi.extensions` in `package.json`.

### After copying the template

- [ ] Update the name, description, and version in `package.json`.
- [ ] Check the license and copyright notice in `LICENSE`.
- [ ] Adapt the sample command and tests to your implementation.
- [ ] Document supported and tested Pi versions and usage in the README.
- [ ] Verify repository URLs and publishing settings. Include required files in `package.json` under `files` and register entry points in `pi.extensions`.
- [ ] Run `npm install` to update the lockfile after changing dependencies.

## Development

Development and CI use Node.js 26.13.0 from `.nvmrc`. The `engines` field follows Pi 1.5.0's minimum of Node.js 22.19.0. The template runs its automated tests on 26.13.0.

```sh
npm run typecheck
npm test
npm run check:package
```

Tests use Node's built-in runner. `tests/pi-smoke.test.ts` loads the extension with Pi's resource loader and verifies registration of `/hello`. It uses a temporary directory without a live LLM or the user's Pi settings. Run `npm run test:startup` to check startup from the packaged distribution. In `npm run check:package` and CI, a temporary Pi configuration loads the generated tarball and starts the Pi CLI in offline RPC mode. Package warnings, load failures, and missing command registrations fail the check. When replacing the sample, update the expected command in the loader test and in `test:startup` in `package.json`. See the [official extension documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) for Pi APIs and events.

### Test helpers

`createMockPi()` in `tests/helpers/mock-pi.ts` provides a partial Pi mock for unit tests without an external test library.

```ts
const mock = createMockPi({ confirm: [true], input: ["answer"], select: ["A"] });
extension(mock.pi);
await mock.runCommand("hello", "arguments");
assert.deepEqual(mock.notifications, [{ message: "Hello from your Pi extension!", type: "info" }]);
```

Inspect registrations via `mock.commands` and `mock.tools`. `mock.dialogs` records dialogs, and `mock.statuses` and `mock.widgets` hold current values. Queue more responses after setup with `mock.responses.select.push("A")`. `mock.userMessages` and `mock.messages` record send requests without starting a turn. `pi.appendEntry` writes to the in-memory Pi `sessionManager`. `mock.emit("session_start", { type: "session_start" })` runs handlers in registration order and returns their results. Use `mock.context` to call handlers and tools directly, or pass a per-event context to `mock.emit(name, event, context)`. Dialogs consume responses in order by type and fail when a response is missing. Use `mock.sessionManager` for branching, `mock.setIdle()` and `mock.setPending()` to configure state, and `mock.emittedEvents` and `mock.toolRenderers` to inspect registration and behavior. Create a fresh mock per test.

Dialog responses can be promises. If an `AbortSignal` fires while waiting, select and input resolve to `undefined` and confirm resolves to `false`. The mock does not simulate timeouts or render the UI.

The helper covers part of the Pi API. Widgets support string arrays. Component rendering, tool schema validation, and agent behavior after message delivery require separate checks. Extend the helper for APIs your tests need and check loading in Pi itself.

### Fake model responses

Use `createFakeModel()` from `tests/helpers/fake-model.ts` with real Pi test sessions. It returns text and tool calls in order without provider network requests. Running out of responses raises an error. It clones scripts and requests so subsequent mutations cannot change the record.

```ts
const fake = createFakeModel([
  { content: [{ type: "text", text: "Hello" }] },
]);
session.modelRuntime.hasConfiguredAuth = () => true;
session.agent.streamFunction = fake.stream;
await session.prompt("Say hello");
assert.equal(fake.requests.length, 1);
```

See `tests/fake-model.test.ts` for session setup, cleanup, and tool-call examples. Add `waitFor: promise` to delay a response until the promise resolves. The fake also handles `AbortSignal` while waiting. It does not emulate incremental streaming, provider transport, or authentication.

## Installation

After publishing on GitHub, users can install the extension as follows.

```sh
pi install git:github.com/<owner>/<repository>
```

Before publishing to npm, check package naming and publication settings. See the [Pi package documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/packages.md).

## License

See [LICENSE](LICENSE) for the MIT License.
