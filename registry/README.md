# MCP Registry manifests

One `server.json` per published package. **Not yet submitted.**

Validate before touching anything:

```bash
npm run validate:registry
```

It checks the schema constraints that are only otherwise enforced at
submission — the 100-character `description` limit, the name pattern, version
ranges — and cross-checks each manifest against the `package.json` it names.
It also refuses a mixed namespace, and prints the domain the namespace implies,
which is the one fact most easily got wrong here.

Publishing to the MCP Registry needs two things that are deliberately not
automated here, because both are irreversible and neither belongs to CI:

1. **A DNS TXT record** on the namespace apex proving ownership:
   `v=MCPv1; ...` on `msg2ai.com`, the domain behind `com.msg2ai`. Until it
   exists the namespace cannot be claimed, and once a namespace is claimed by
   someone else it is not recoverable.
2. **The packages published to npm first.** The registry validates that the
   named npm package exists at the stated version, so submission must follow a
   successful `npm publish`, not precede it.

Order: publish npm → verify the DNS TXT → submit each `server.json` → confirm
each entry reports `isLatest`.

## The namespace

These manifests claim `com.msg2ai/*` — the reverse-DNS of **`msg2ai.com`**.

⚠️ **Not `msg2ai.xyz`.** The registry derives the domain from the namespace
literally, so `com.msg2ai` can be proved only from `msg2ai.com`. A TXT record
on the `.xyz` proves nothing for this namespace, even though both domains are
ours and the product runs on the `.xyz`. Whoever adds the record needs to be
looking at the right zone.

Alternatives, had we wanted them:

| Namespace | Proof | Record goes on |
| --- | --- | --- |
| **`com.msg2ai/*`** | DNS TXT | **`msg2ai.com`** (apex) — chosen |
| `xyz.msg2ai/*` | DNS TXT | `msg2ai.xyz` (apex) |
| `io.github.msg2ai/*` | GitHub OAuth | nothing — no DNS |

Renaming after publication means re-submitting under a new name and leaving the
old one pointing at nothing, so this is settled before the first submission.

## The record

On the **apex**, not `_mcp.`:

```
msg2ai.com.  IN TXT  "v=MCPv1; k=ed25519; p=<base64 public key>"
```

Generate the key and read off the record:

```bash
openssl genpkey -algorithm Ed25519 -out key.pem
PUBLIC_KEY="$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
echo "msg2ai.com. IN TXT \"v=MCPv1; k=ed25519; p=${PUBLIC_KEY}\""
```

Then, with the private key as 64 hex characters:

```bash
mcp-publisher login dns --domain=msg2ai.com --private-key=<64-hex>
```

`msg2ai.com` already carries a Zoho SPF record and a Zoho verification TXT.
TXT records coexist on the same name, so this is an ADDITIONAL record — add
one, do not edit or replace the existing entries. DNS is managed at GoDaddy
(`ns55/ns56.domaincontrol.com`).

⚠️ The private key is the credential for the whole namespace. It belongs in a
password manager or GCP Secret Manager, not in this repo and not in CI: nothing
here needs it, because publishing to the registry is a deliberate manual step.
