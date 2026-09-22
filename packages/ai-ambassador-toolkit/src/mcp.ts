#!/usr/bin/env node
import { createInterface } from 'readline';
import { AmbassadorClient, AmbassadorError } from './client';
import { TOOLS, toolsForScopes } from './tools';
import { detectSkin } from './skin';

/**
 * The stdio MCP skin.
 *
 * Hand-rolled JSON-RPC rather than the MCP SDK, for the same reason the client
 * has no dependencies: this is installed by `npx` onto a customer's machine,
 * and the protocol surface we need — initialize, tools/list, tools/call — is
 * small enough that a dependency costs more than it saves.
 *
 * Two things it does that a naive wrapper would not:
 *
 *  - It advertises only the tools the KEY may call, read from /capabilities at
 *    startup. Listing tools that will 403 teaches a model to retry things it
 *    can never do.
 *  - It reports tool errors as `isError` results rather than JSON-RPC protocol
 *    errors. A 403 is an answer to the model, not a transport failure, and a
 *    protocol error would abort the conversation instead of letting the model
 *    adjust.
 */

const PROTOCOL_VERSION = '2024-11-05';

interface RpcRequest {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}

function reply(id: RpcRequest['id'], result: unknown) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
}

function replyError(id: RpcRequest['id'], code: number, message: string) {
  process.stdout.write(
    JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }) + '\n'
  );
}

export async function handle(
  request: RpcRequest,
  ctx: { client: AmbassadorClient; allowed: () => Promise<string[]>; label: string }
): Promise<void> {
  switch (request.method) {
    case 'initialize':
      return reply(request.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: ctx.label, version: process.env.npm_package_version ?? '0.1.0' }
      });

    case 'notifications/initialized':
      return; // a notification: no id, no reply

    case 'tools/list': {
      const scopes = await ctx.allowed();
      return reply(request.id, {
        tools: toolsForScopes(scopes).map((tool) => ({
          name: tool.name,
          description: tool.summary,
          inputSchema: tool.input
        }))
      });
    }

    case 'tools/call': {
      const name = (request.params?.name as string) ?? '';
      const args = (request.params?.arguments as Record<string, unknown>) ?? {};
      try {
        const result = await ctx.client.call(name, args);
        return reply(request.id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        });
      } catch (error) {
        const message =
          error instanceof AmbassadorError
            ? `${error.message}${error.code ? ` (${error.code})` : ''}`
            : (error as Error).message;
        // isError, not a protocol error — the model should see this and adapt.
        return reply(request.id, {
          content: [{ type: 'text', text: message }],
          isError: true
        });
      }
    }

    default:
      return replyError(request.id, -32601, `Method not found: ${request.method}`);
  }
}

/**
 * Start the stdio server. Exported rather than only run on `require.main`,
 * because the alias packages (`hotel-ambassador`, `trip`, …) invoke this from
 * their own bin file — and when they do, `require.main` is THEIR module, so a
 * module-guarded entry point would load and then silently do nothing.
 */
/* c8 ignore start */
export async function serve() {
  const skin = detectSkin();
  const apiKey = process.env.MSG2AI_AGENT_KEY ?? '';

  let client: AmbassadorClient;
  try {
    client = new AmbassadorClient({
      apiKey,
      baseUrl: process.env.MSG2AI_BASE_URL
    });
  } catch (error) {
    // stderr, never stdout: stdout is the JSON-RPC channel and anything else
    // written there corrupts the stream.
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }

  let cachedScopes: string[] | undefined;
  const allowed = async () => {
    if (!cachedScopes) {
      const caps = await client.capabilities();
      cachedScopes = caps.scopes;
    }
    return cachedScopes;
  };

  const rl = createInterface({ input: process.stdin });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let request: RpcRequest;
    try {
      request = JSON.parse(line);
    } catch {
      replyError(null, -32700, 'Parse error');
      continue;
    }
    try {
      await handle(request, { client, allowed, label: `${skin.label} MCP` });
    } catch (error) {
      replyError(request.id ?? null, -32603, (error as Error).message);
    }
  }
}

if (require.main === module) {
  void serve();
}
/* c8 ignore stop */

export { TOOLS };
