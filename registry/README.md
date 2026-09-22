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

### 1. Generate the key

The private key is the credential for the whole namespace, so keep it out of
shell history and out of this repo:

```bash
umask 077
openssl genpkey -algorithm Ed25519 -out mcp-namespace-key.pem

# The value to paste into GoDaddy (public — safe to share):
echo "v=MCPv1; k=ed25519; p=$(openssl pkey -in mcp-namespace-key.pem -pubout -outform DER | tail -c 32 | base64)"

# The private key, as the 64 hex characters mcp-publisher wants (SECRET):
openssl pkey -in mcp-namespace-key.pem -text -noout | grep -A3 'priv:' | tail -n +2 | tr -d ' :\n'; echo
```

Store the private key in GCP Secret Manager or a password manager. Nothing in
this repo or in CI needs it — registry submission is a deliberate manual step.

### 2. Add it at GoDaddy

DNS for `msg2ai.com` is managed at GoDaddy (`ns55`/`ns56.domaincontrol.com`).

**Domains → msg2ai.com → DNS → Add New Record**

| Field | Value |
| --- | --- |
| Type | `TXT` |
| Name | `@` |
| Value | `v=MCPv1; k=ed25519; p=<base64>` |
| TTL | Custom → 600 seconds |

Four things that silently produce a record which never verifies:

1. **Name must be `@`**, not blank and not `msg2ai.com`. GoDaddy appends the
   domain to whatever you type, so `msg2ai.com` becomes
   `msg2ai.com.msg2ai.com`.
2. **Do not paste the surrounding quotes.** GoDaddy adds them itself; a pasted
   `"` ends up inside the value.
3. **Check you are in the `.com` zone.** `msg2ai.xyz` is a separate domain in
   the same GoDaddy account, and a record there proves nothing for
   `com.msg2ai`.
4. **Add, do not edit.** `msg2ai.com` already carries a Zoho SPF record and a
   Zoho verification TXT. TXT records coexist on the same name — replacing
   either one breaks mail.

A 600-second TTL rather than GoDaddy's 1-hour default makes a mistake cheap to
correct.

### 3. Check it before using it

```bash
npm run verify:dns
```

It derives the domain from the namespace in `registry/*.json`, so it cannot be
pointed at the wrong zone, and it catches the pasted-quote and wrong-key-length
mistakes that otherwise surface as an opaque `mcp-publisher` failure:

```
namespace com.msg2ai/*
domain    msg2ai.com

✓ v=MCPv1; k=ed25519; p=<base64>

  Next: mcp-publisher login dns --domain=msg2ai.com --private-key=<64-hex>
```

Propagation is usually a minute or two at a 600s TTL, but a negative answer can
be cached — if it still reports nothing after a few minutes, that is normal
rather than a sign the record is wrong.

### 4. Log in and submit

```bash
mcp-publisher login dns --domain=msg2ai.com --private-key=<64-hex>
mcp-publisher publish registry/server.ai-ambassador-toolkit.json
# ...and the other four
```

⚠️ The private key is the credential for the whole namespace. Anyone holding it
can publish under `com.msg2ai/*`.
