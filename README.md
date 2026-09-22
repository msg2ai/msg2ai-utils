# msg2ai-utils

Public tooling for the msg2ai platform.

| Package | Binaries | Vertical defaults |
| --- | --- | --- |
| [`@msg2ai/ai-ambassador-toolkit`](packages/ai-ambassador-toolkit) | `ambassador`, `ambassador-mcp` | none |
| [`@msg2ai/hotel-ambassador`](packages/hotel-ambassador) | `hotel-ambassador`, `hotel-ambassador-mcp` | `CONCIERGE_ASSISTANT` / `HOTEL` |
| [`@msg2ai/event-ambassador`](packages/event-ambassador) | `event-ambassador`, `event-ambassador-mcp` | `MEETING_EVENT_ASSISTANT` |
| [`@msg2ai/trip-ambassador`](packages/trip-ambassador) | `trip-ambassador`, `trip-ambassador-mcp` | `CONCIERGE_ASSISTANT` / `TRAVEL_AGENCY` |

The toolkit is the only package with code. The other three are thin bins that
call into it; the vertical is selected by the **name the binary was invoked
as**, so one build serves all four.

```bash
export MSG2AI_AGENT_KEY=msgk_live_…
npx -p @msg2ai/ai-ambassador-toolkit ambassador tools
```

## Status

Nothing here is published yet. `.github/workflows/publish.yml` is
manual-dispatch only and uses npm OIDC trusted publishing; `registry/` holds
the MCP Registry manifests, which cannot be submitted until the packages exist
on npm and the namespace DNS record is in place. See `registry/README.md`.

⚠️ `@msg2ai/trip-ambassador` is buildable but its vertical is not fully supported
server-side yet: `assistantData.travelPlan` is not a field on the server's
schema, so an itinerary cannot be persisted. The `TRAVEL_AGENCY` property type
works; the itinerary does not.

## Development

```bash
npm install     # workspace root
npm test
npm run build
```
