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
