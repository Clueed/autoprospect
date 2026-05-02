import { App } from "@slack/bolt";
import Anthropic from "@anthropic-ai/sdk";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const slack = new App({
  token: process.env.SLACK_BOT_TOKEN ?? "",
  signingSecret: process.env.SLACK_SIGNING_SECRET ?? "",
  port: Number(process.env.PORT ?? 3000),
});

const anthropic = new Anthropic();

// Only respond to messages in this channel. Set SLACK_PROSPECT_CHANNEL_ID to restrict.
const CHANNEL_ID = process.env.SLACK_PROSPECT_CHANNEL_ID ?? "";

const SYSTEM_PROMPT = readFileSync(join(import.meta.dir, "prospecting-agent.md"), "utf-8");

const TOOLS: Anthropic.Tool[] = [
  {
    name: "people_search",
    description: `Search for people at a company by role. 
Always call with use_default=true first — this runs one search per role group.
For targeted follow-up, omit use_default and pass keywords (AND logic: all must match).`,
    input_schema: {
      type: "object" as const,
      properties: {
        company: { type: "string", description: "Company name (partial match)" },
        keywords: {
          type: "array",
          items: { type: "string" },
          description: "Keywords to filter by (AND). Omit when use_default is true.",
        },
        use_default: {
          type: "boolean",
          description: "Run the default scan covering all four role groups. Start here.",
        },
      },
      required: ["company"],
    },
  },
  {
    name: "profile_lookup",
    description: "Live-fetch a single LinkedIn profile given its URL or slug.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "LinkedIn URL or bare slug" },
      },
      required: ["url"],
    },
  },
];

function runTool(name: string, input: Record<string, unknown>): string {
  try {
    if (name === "people_search") {
      const { company, keywords, use_default } = input as {
        company: string;
        keywords?: string[];
        use_default?: boolean;
      };
      const args = ["-c", company];
      if (use_default || !keywords?.length) {
        args.push("--default");
      } else {
        for (const kw of keywords) args.push("-k", kw);
      }
      const proc = Bun.spawnSync(["bun", "people-search.ts", ...args], {
        cwd: import.meta.dir,
        stdout: "pipe",
        stderr: "pipe",
      });
      return proc.stdout.toString() || proc.stderr.toString() || "No results.";
    }

    if (name === "profile_lookup") {
      const { url } = input as { url: string };
      const proc = Bun.spawnSync(["bun", "profile-lookup.ts", url], {
        cwd: import.meta.dir,
        stdout: "pipe",
        stderr: "pipe",
      });
      return proc.stdout.toString() || proc.stderr.toString() || "No results.";
    }

    return `Unknown tool: ${name}`;
  } catch (err) {
    return `Tool error: ${String(err)}`;
  }
}

async function runProspectingAgent(
  company: string,
  onProgress: (msg: string) => Promise<unknown>
): Promise<string> {
  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: `Find prospects at: ${company}` },
  ];

  while (true) {
    const response = await anthropic.messages.create({
      model: "claude-opus-4-7",
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") {
      return response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
    }

    const toolCalls = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    if (toolCalls.length === 0) break;

    for (const tool of toolCalls) {
      const label =
        tool.name === "people_search"
          ? `default scan for *${(tool.input as { company: string }).company}*`
          : `profile lookup: ${(tool.input as { url: string }).url}`;
      await onProgress(`_Running ${label}…_`);
    }

    messages.push({
      role: "user",
      content: toolCalls.map((tool) => ({
        type: "tool_result" as const,
        tool_use_id: tool.id,
        content: runTool(tool.name, tool.input as Record<string, unknown>),
      })),
    });
  }

  return "No results found.";
}

slack.event("message", async ({ event, say, logger }) => {
  // event is a union of many subtypes; cast to the common shape we need
  const msg = event as { type: string; channel?: string; subtype?: string; text?: string };
  if (CHANNEL_ID && msg.channel !== CHANNEL_ID) return;
  // Ignore edits, deletions, bot messages, etc.
  if (msg.subtype) return;
  if (!msg.text?.trim()) return;

  const company = msg.text.trim();
  logger.info(`Prospecting: ${company}`);

  await say(`🔍 Prospecting *${company}*…`);

  try {
    const result = await runProspectingAgent(company, say);
    await say(result);
  } catch (err) {
    logger.error("Agent error:", err);
    await say(`❌ Error: ${String(err)}`);
  }
});

await slack.start();

console.log(`Slack app listening on port ${process.env.PORT ?? 3000}`);
console.log(`  POST /slack/events  — receive Slack events`);
console.log(`  GET  /slack/health  — health check`);
console.log(`  Channel filter: ${CHANNEL_ID || "(all channels — set SLACK_PROSPECT_CHANNEL_ID to restrict)"}`);
