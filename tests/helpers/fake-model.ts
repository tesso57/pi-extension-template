import { createAssistantMessageEventStream } from "@earendil-works/pi-ai";
import type { AssistantMessage, Model, StreamFunction, TranscriptContext } from "@earendil-works/pi-ai";

type Reply = { content: AssistantMessage["content"]; stopReason?: "stop" | "toolUse"; waitFor?: Promise<void> };

/** Scripted responses for real Pi sessions; it never contacts a provider. */
export function createFakeModel(script: Reply[]) {
  const replies = script.map(reply => ({ ...reply, content: structuredClone(reply.content) }));
  const requests: TranscriptContext[] = [];
  const model: Model<"openai-completions"> = {
    id: "fake", name: "Fake model", api: "openai-completions", provider: "fake",
    baseUrl: "http://example.invalid", reasoning: false, input: ["text"],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 10000, maxTokens: 1000,
  };
  const stream: StreamFunction = (requestedModel, context, options) => {
    const reply = replies.shift();
    if (!reply) throw new Error("Fake model script exhausted");
    requests.push(structuredClone(context));
    const stopReason = reply.stopReason ?? (reply.content.some((item) => item.type === "toolCall") ? "toolUse" : "stop");
    const message: AssistantMessage = {
      role: "assistant", content: structuredClone(reply.content), api: requestedModel.api, provider: requestedModel.provider,
      model: requestedModel.id, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      stopReason, timestamp: Date.now(),
    };
    const result = createAssistantMessageEventStream();
    queueMicrotask(() => {
      result.push({ type: "start", partial: message });
      const signal = options?.signal;
      let finished = false;
      const finish = (error?: string, aborted = false) => {
        if (finished) return;
        finished = true;
        signal?.removeEventListener("abort", onAbort);
        if (error !== undefined || aborted) {
          message.stopReason = aborted ? "aborted" : "error";
          message.errorMessage = error ?? "Aborted";
          result.push({ type: "error", reason: message.stopReason, error: message });
        } else {
          result.push({ type: "done", reason: stopReason, message });
        }
        result.end();
      };
      const onAbort = () => finish(undefined, true);
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      if (reply.waitFor) {
        reply.waitFor.then(() => finish(), error => finish(String(error)));
      } else finish();
    });
    return result;
  };
  return { model, stream, requests };
}
