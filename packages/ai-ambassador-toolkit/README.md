# @msg2ai/ai-ambassador-toolkit

CLI and MCP server for the msg2ai **AI Ambassador** agent gateway. Manage
assistants, knowledge, content templates and broadcasts with a scoped agent key.

Zero runtime dependencies. Node 18+.

## Install

```bash
npx -p @msg2ai/ai-ambassador-toolkit ambassador --help
```

## Authenticate

An agent key is minted by an **Admin of your organization** in the msg2ai
dashboard. It is shown once and cannot be recovered.

```bash
export MSG2AI_AGENT_KEY=msgk_live_…
```

A key acts as **one organization** and carries a fixed set of scopes chosen at
mint. It cannot reach another tenant, and it is not a platform credential.

## Use

```bash
ambassador tools                        # what this key may call
ambassador list_assistants
ambassador get_assistant --serviceId svc_123
ambassador upload_knowledge --serviceId svc_123 --text "Checkout is 11am"
ambassador openapi > openapi.json
```

Fields can be given individually or as one JSON object:

```bash
ambassador create_assistant --input '{"assistantName":"Summit Bot","assistantData":{"caseType":"MEETING_EVENT_ASSISTANT"}}'
```

## MCP

```jsonc
{
  "mcpServers": {
    "ai-ambassador": {
      "command": "npx",
      "args": ["-p", "@msg2ai/ai-ambassador-toolkit", "ambassador-mcp"],
      "env": { "MSG2AI_AGENT_KEY": "msgk_live_…" }
    }
  }
}
```

The server advertises **only the tools your key may call**, read from
`/capabilities` at startup — listing tools that would 403 teaches a model to
retry things it can never do. A tool failure comes back as an `isError` result
rather than a protocol error, so the model can adapt instead of the
conversation aborting.

## Vertical skins

The same build serves every vertical; the binary's name selects the defaults a
newly created assistant gets.

| Package | Binaries | Defaults |
| --- | --- | --- |
| `@msg2ai/ai-ambassador-toolkit` | `ambassador`, `ambassador-mcp` | none |
| `@msg2ai/hotel-ambassador` | `hotel-ambassador`, `hotel-ambassador-mcp` | `CONCIERGE_ASSISTANT` / `HOTEL` |
| `@msg2ai/event-ambassador` | `event-ambassador`, `event-ambassador-mcp` | `MEETING_EVENT_ASSISTANT` |
| `@msg2ai/trip` | `trip`, `trip-mcp` | `CONCIERGE_ASSISTANT` / `TRAVEL_AGENCY` |

## Things worth knowing before you automate

**`send_broadcast` spends money.** Recipients are counted and charged against
the key's daily budget *before* anything is queued. A send above the per-call
ceiling, or one that would exceed the daily budget, is refused outright rather
than partially delivered.

**Creating an assistant does not attach a phone number.** That is deliberate —
the number pool is shared inventory and attachment is an operator step. Until a
number is attached, template submission will refuse with
`AGENT_NUMBER_REQUIRED`.

**Some fields are refused, not ignored.** Instructions, guardrails, privacy
settings, provider credentials, billing flags and the provider block are
rejected with an explanation rather than silently dropped. Edit instructions in
the dashboard.

**Version drift is normal.** `ambassador tools` reports when your installed
catalog differs from what the gateway offers, in either direction.

## Environment

| Variable | Meaning |
| --- | --- |
| `MSG2AI_AGENT_KEY` | your `msgk_live_…` key (required) |
| `MSG2AI_BASE_URL` | gateway base URL; defaults to production |
