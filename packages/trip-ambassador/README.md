# @msg2ai/trip-ambassador

Trip Ambassador — a preset of [`@msg2ai/ai-ambassador-toolkit`](../ai-ambassador-toolkit).

Identical tools; the difference is the defaults a newly created assistant gets.

```bash
export MSG2AI_AGENT_KEY=msgk_live_…
npx -p @msg2ai/trip-ambassador trip-ambassador tools
```

MCP:

```jsonc
{
  "mcpServers": {
    "trip-ambassador": {
      "command": "npx",
      "args": ["-p", "@msg2ai/trip-ambassador", "trip-ambassador-mcp"],
      "env": { "MSG2AI_AGENT_KEY": "msgk_live_…" }
    }
  }
}
```
