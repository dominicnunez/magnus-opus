import type { Plugin } from "@opencode-ai/plugin";
import { tool, type ToolContext } from "@opencode-ai/plugin/tool";

declare const Bun: {
  write(path: string, data: string): Promise<void>;
  file(path: string): { text(): Promise<string> };
};

function unwrapData<T>(response: T | { data?: T }): T {
  if (response && typeof response === "object" && "data" in response) {
    return (response as { data?: T }).data as T;
  }
  return response as T;
}

let lastBackgroundSessionID: string | null = null;
const lastBackgroundSessionFile = "/home/aural/Repos/magnus-opus/.opencode/last-background-session.txt";

const SmokePlugin: Plugin = async (ctx) => {
  const smokeTool = tool({
    description: "Smoke test tool that returns session info.",
    args: {},
    async execute(_args: Record<string, never>, toolCtx: ToolContext) {
      toolCtx.metadata({ title: "smoke", metadata: { agent: toolCtx.agent } });
      return `Smoke tool OK. session=${toolCtx.sessionID} message=${toolCtx.messageID} agent=${toolCtx.agent}`;
    },
  });

  const backgroundTaskTool = tool({
    description: "Launch a background task with default args.",
    args: {
      description: tool.schema.string().default("background smoke test"),
      prompt: tool.schema.string().default("Return a short confirmation that you ran."),
      agent: tool.schema.string().default("build"),
    },
    async execute(args: any, toolCtx: ToolContext) {
      const client = ctx.client as any;
      const sessionResponse = await client.session.create({
        body: { title: args.description, parentID: toolCtx.sessionID },
        query: { directory: ctx.directory },
      });

      const session = unwrapData(sessionResponse);
      const sessionID = session?.id;

      if (!sessionID) {
        return "Background task failed: session ID missing";
      }

      lastBackgroundSessionID = sessionID;
      try {
        await Bun.write(lastBackgroundSessionFile, sessionID);
      } catch {
        // Ignore write failures
      }

      await client.session.prompt({
        path: { id: sessionID },
        body: {
          agent: args.agent,
          parts: [{ type: "text", text: args.prompt }],
        },
        query: { directory: ctx.directory },
      });

      return `Background task launched. session=${sessionID}`;
    },
  });

  const backgroundOutputTool = tool({
    description: "Fetch last background task output.",
    args: {
      session_id: tool.schema.string().optional(),
    },
    async execute(args, _toolCtx: ToolContext) {
      let target = args.session_id ?? lastBackgroundSessionID;
      if (!target && lastBackgroundSessionFile) {
        try {
          target = (await Bun.file(lastBackgroundSessionFile).text()).trim() || null;
        } catch {
          target = null;
        }
      }
      if (!target) {
        return "No background session available.";
      }

      const client = ctx.client as any;
      const messagesResponse = await client.session.messages({ path: { id: target } });
      const messages = unwrapData(messagesResponse) ?? [];
      const lastAssistant = messages
        .filter((msg: any) => msg.info.role === "assistant")
        .pop();
      const text = lastAssistant?.parts?.find((part: any) => part.type === "text")?.text ?? "(no output yet)";

      return `Background output: ${text}`;
    },
  });

  return {
    tool: {
      smoke: smokeTool,
      background_task: backgroundTaskTool,
      background_output: backgroundOutputTool,
    },
    "chat.message": async (_input, output) => {
      const text = (output.parts ?? [])
        .filter((part) => part.type === "text")
        .map((part) => (part as any).text || "")
        .join("\n");

      // Note: UserMessage doesn't have variant property in current OpenCode version
      // This was likely from a different version or example
      if (text.toLowerCase().includes("variant-test")) {
        console.log("Variant test detected in message");
      }
    },
  };
};

export default SmokePlugin;
