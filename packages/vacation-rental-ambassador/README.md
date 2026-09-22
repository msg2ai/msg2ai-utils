# @msg2ai/vacation-rental-ambassador

Vacation Rental Ambassador — a preset of
[`@msg2ai/ai-ambassador-toolkit`](../ai-ambassador-toolkit).

Identical tools; the difference is the defaults a newly created assistant gets:
`CONCIERGE_ASSISTANT` with `propertyType: VACATION_HOME`.

> The server's `PropertyType` enum has no `VACATION_RENTAL` value. The package
> is named for the industry term; the field is set to the value that exists.

```bash
export MSG2AI_AGENT_KEY=msgk_live_…
npx -p @msg2ai/vacation-rental-ambassador vacation-rental-ambassador tools
```

MCP:

```jsonc
{
  "mcpServers": {
    "vacation-rental-ambassador": {
      "command": "npx",
      "args": [
        "-p",
        "@msg2ai/vacation-rental-ambassador",
        "vacation-rental-ambassador-mcp"
      ],
      "env": { "MSG2AI_AGENT_KEY": "msgk_live_…" }
    }
  }
}
```
