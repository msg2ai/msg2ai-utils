# MCP Registry manifests

One `server.json` per published package. **Not yet submitted.**

Publishing to the MCP Registry needs two things that are deliberately not
automated here, because both are irreversible and neither belongs to CI:

1. **A DNS TXT record** on the namespace apex proving ownership:
   `v=MCPv1; ...` on the domain behind `com.businessmsg`. Until it exists the
   namespace cannot be claimed, and once a namespace is claimed by someone else
   it is not recoverable.
2. **The packages published to npm first.** The registry validates that the
   named npm package exists at the stated version, so submission must follow a
   successful `npm publish`, not precede it.

Order: publish npm → verify the DNS TXT → submit each `server.json` → confirm
each entry reports `isLatest`.

## The namespace is a decision, not a default

These manifests claim `com.businessmsg/*`, the reverse-DNS of
`businessmsg.com`. That matches neither the npm scope (`@msg2ai`) nor the
domain the product uses (`msg2ai.xyz`). Two alternatives, and the second needs
no DNS at all:

| Namespace | Proof | Record goes on |
| --- | --- | --- |
| `com.businessmsg/*` | DNS TXT | `businessmsg.com` (apex) |
| `xyz.msg2ai/*` | DNS TXT | `msg2ai.xyz` (apex) |
| `io.github.msg2ai/*` | GitHub OAuth | nothing — no DNS |

Renaming after publication means re-submitting under a new name and leaving the
old one pointing at nothing, so pick before the first submission.

The record is on the **apex**, not `_mcp.`:

```
<domain>.  IN TXT  "v=MCPv1; k=ed25519; p=<base64 public key>"
```

TXT records coexist, so adding it does not disturb existing SPF or
site-verification records on the same name.
