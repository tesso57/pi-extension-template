import { createEventBus, SessionManager } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

type Command = Parameters<ExtensionAPI["registerCommand"]>[1];
type Tool = Parameters<ExtensionAPI["registerTool"]>[0];
type EventHandler = (event: never, context: ExtensionContext) => unknown;
type Responses = {
  confirm?: (boolean | Promise<boolean>)[];
  input?: (string | undefined | Promise<string | undefined>)[];
  select?: (string | undefined | Promise<string | undefined>)[];
};

export function createMockPi(responses: Responses = {}) {
  const commands = new Map<string, Command>();
  const tools = new Map<string, Tool>();
  const events = new Map<string, EventHandler[]>();
  const sessionManager = SessionManager.inMemory(process.cwd());
  const dialogs: ({ kind: "select"; title: string; options: string[] } | { kind: "input"; title: string; placeholder?: string } | { kind: "confirm"; title: string; message: string })[] = [];
  const statuses = new Map<string, string>();
  const widgets = new Map<string, string[]>();
  const userMessages: { content: Parameters<ExtensionAPI["sendUserMessage"]>[0]; options: Parameters<ExtensionAPI["sendUserMessage"]>[1] }[] = [];
  const messages: { message: Parameters<ExtensionAPI["sendMessage"]>[0]; options: Parameters<ExtensionAPI["sendMessage"]>[1] }[] = [];
  const eventBus = createEventBus();
  const emittedEvents: { name: string; data: unknown }[] = [];
  const toolRenderers: Parameters<ExtensionAPI["registerToolRenderer"]>[0][] = [];
  let idle = true;
  let pending = false;
  const notifications: { message: string; type: string }[] = [];
  const queues = {
    confirm: [...(responses.confirm ?? [])],
    input: [...(responses.input ?? [])],
    select: [...(responses.select ?? [])],
  };
  function take<K extends keyof typeof queues>(kind: K): (typeof queues)[K][number] {
    const queue = queues[kind];
    if (queue.length === 0) throw new Error(`No mock response for ${kind}`);
    return queue.shift() as (typeof queues)[K][number];
  }
  async function dialog<T>(value: T | Promise<T>, signal: AbortSignal | undefined, cancelled: T): Promise<T> {
    if (!signal) return await value;
    if (signal.aborted) return cancelled;
    return await new Promise<T>((resolve, reject) => {
      const abort = () => { cleanup(); resolve(cancelled); };
      const cleanup = () => signal.removeEventListener("abort", abort);
      signal.addEventListener("abort", abort, { once: true });
      Promise.resolve(value).then(result => { cleanup(); resolve(result); }, error => { cleanup(); reject(error); });
    });
  }
  const context = {
    cwd: process.cwd(),
    sessionManager,
    hasUI: true,
    mode: "tui",
    isIdle: () => idle,
    hasPendingMessages: () => pending,
    ui: {
      notify(message: string, type = "info") { notifications.push({ message, type }); },
      async confirm(title: string, message: string, opts?: { signal?: AbortSignal }) { dialogs.push({ kind: "confirm", title, message }); if (opts?.signal?.aborted) return false; return dialog(take("confirm"), opts?.signal, false); },
      async input(title: string, placeholder?: string, opts?: { signal?: AbortSignal }) { dialogs.push({ kind: "input", title, placeholder }); if (opts?.signal?.aborted) return undefined; return dialog(take("input"), opts?.signal, undefined); },
      async select(title: string, options: string[], opts?: { signal?: AbortSignal }) { dialogs.push({ kind: "select", title, options: [...options] }); if (opts?.signal?.aborted) return undefined; return dialog(take("select"), opts?.signal, undefined); },
      setStatus(key: string, text: string | undefined) { if (text === undefined) statuses.delete(key); else statuses.set(key, text); },
      setWidget(key: string, content: string[] | undefined) {
        if (content === undefined) widgets.delete(key);
        else if (Array.isArray(content)) widgets.set(key, [...content]);
        else throw new Error("Component widgets are not supported by the mock");
      },
    },
  } as unknown as ExtensionCommandContext;
  const pi = {
    events: { on: eventBus.on, emit(name: string, data: unknown) { emittedEvents.push({ name, data }); eventBus.emit(name, data); } },
    registerToolRenderer(renderer: Parameters<ExtensionAPI["registerToolRenderer"]>[0]) { toolRenderers.push(renderer); },
    appendEntry(customType: string, data?: unknown) { sessionManager.appendCustomEntry(customType, data); },
    sendUserMessage(content: Parameters<ExtensionAPI["sendUserMessage"]>[0], options?: Parameters<ExtensionAPI["sendUserMessage"]>[1]) { userMessages.push({ content, options }); },
    sendMessage(message: Parameters<ExtensionAPI["sendMessage"]>[0], options?: Parameters<ExtensionAPI["sendMessage"]>[1]) { messages.push({ message, options }); },
    registerCommand(name: string, command: Command) { commands.set(name, command); },
    registerTool(tool: Tool) { tools.set(tool.name, tool); },
    on(name: string, handler: EventHandler) {
      const handlers = events.get(name) ?? [];
      handlers.push(handler);
      events.set(name, handlers);
      return () => {
        const index = handlers.indexOf(handler);
        if (index !== -1) handlers.splice(index, 1);
      };
    },
  } as unknown as ExtensionAPI;
  return {
    pi, context, sessionManager, commands, tools, notifications, dialogs, statuses, widgets, userMessages, messages, emittedEvents, toolRenderers, responses: queues,
    setIdle(value: boolean) { idle = value; },
    setPending(value: boolean) { pending = value; },
    async runCommand(name: string, args = "") {
      const command = commands.get(name);
      if (!command) throw new Error(`Unknown command: ${name}`);
      await command.handler(args, context);
    },
    async emit(name: string, event: unknown, eventContext: ExtensionContext = context) {
      const results: unknown[] = [];
      for (const handler of [...(events.get(name) ?? [])]) {
        results.push(await handler(event as never, eventContext));
      }
      return results;
    },
  };
}
