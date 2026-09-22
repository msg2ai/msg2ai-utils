import { TOOLS } from './tools';
import { DEFAULT_BASE_URL } from './client';

/**
 * Emit an OpenAPI document from the same catalog the CLI and MCP skins use, so
 * a customer who wants neither can still generate a client. Generated rather
 * than maintained: a hand-written spec is a third copy of the catalog and the
 * one nobody updates.
 */
export function buildOpenApi(baseUrl: string = DEFAULT_BASE_URL) {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const tool of TOOLS) {
    // OpenAPI wants {braces}; the catalog uses :colons.
    const path = `/api/agent${tool.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}')}`;
    const params = [...tool.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => ({
      name: m[1],
      in: 'path',
      required: true,
      schema: { type: 'string' }
    }));

    paths[path] = paths[path] ?? {};
    paths[path][tool.method] = {
      operationId: tool.name,
      summary: tool.summary,
      security: [{ agentKey: [] }],
      ...(tool.scope ? { 'x-required-scope': tool.scope } : {}),
      ...(params.length ? { parameters: params } : {}),
      ...(tool.method === 'get' || tool.method === 'delete'
        ? {}
        : {
            requestBody: {
              content: { 'application/json': { schema: tool.input } }
            }
          }),
      responses: {
        '200': { description: 'OK' },
        '401': { description: 'Missing or invalid agent key' },
        '403': { description: 'The key does not hold the required scope' },
        '429': { description: 'Send budget or rate limit exceeded' }
      }
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'msg2ai Agent Gateway',
      version: '0.1.0',
      description:
        'Customer-facing tools for AI Ambassador assistants. Authenticated by a per-user agent key scoped to one organization.'
    },
    servers: [{ url: baseUrl }],
    components: {
      securitySchemes: {
        agentKey: { type: 'http', scheme: 'bearer', bearerFormat: 'msgk_live_' }
      }
    },
    paths
  };
}
