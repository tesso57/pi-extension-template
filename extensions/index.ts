import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerCommand("hello", {
    description: "Show a greeting from the example extension",
    handler: async (_args, ctx) => {
      ctx.ui.notify("Hello from your Pi extension!", "info");
    },
  });
}
