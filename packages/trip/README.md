# @msg2ai/trip

Trip Ambassador — a preset of [`@msg2ai/ai-ambassador-toolkit`](../ai-ambassador-toolkit).

Identical tools; the difference is the defaults a newly created assistant gets.

```bash
export MSG2AI_AGENT_KEY=msgk_live_…
npx -p @msg2ai/trip trip tools
```

MCP:

```jsonc
{
  "mcpServers": {
    "trip": {
      "command": "npx",
      "args": ["-p", "@msg2ai/trip", "trip-mcp"],
      "env": { "MSG2AI_AGENT_KEY": "msgk_live_…" }
    }
  }
}
```
