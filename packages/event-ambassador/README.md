# @msg2ai/event-ambassador

Event Ambassador — a preset of [`@msg2ai/ai-ambassador-toolkit`](../ai-ambassador-toolkit).

Identical tools; the difference is the defaults a newly created assistant gets.

```bash
export MSG2AI_AGENT_KEY=msgk_live_…
npx -p @msg2ai/event-ambassador event-ambassador tools
```

MCP:

```jsonc
{
  "mcpServers": {
    "event-ambassador": {
      "command": "npx",
      "args": ["-p", "@msg2ai/event-ambassador", "event-ambassador-mcp"],
      "env": { "MSG2AI_AGENT_KEY": "msgk_live_…" }
    }
  }
}
```
