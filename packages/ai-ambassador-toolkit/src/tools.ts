/**
 * The tool catalog.
 *
 * This mirrors `src/services/agentCatalog.ts` in msg2ai-server, which is the
 * source of truth. The server's own bijection test guarantees that every tool
 * listed there is mounted at the path and scope it advertises; this file is
 * the client-side copy of that list, and `catalogMatches()` below is how a
 * skin checks it has not drifted from the server it is talking to.
 *
 * Drift is expected, not exceptional: a customer installs a version of this
 * package and keeps it while the gateway moves on. So the client asks
 * `/capabilities` at startup and reports the difference rather than assuming.
 */

export type AgentScope =
  | 'assistants:read'
  | 'assistants:write'
  | 'templates:read'
  | 'templates:write'
  | 'templates:submit'
  | 'knowledge:write'
  | 'audiences:read'
  | 'audiences:write'
  | 'conversations:read'
  | 'conversations:write'
  | 'broadcasts:send'
  | 'surveys:read'
  | 'surveys:write'
  | 'results:read'
  | 'usage:read';

export interface AgentTool {
  name: string;
  method: 'get' | 'post' | 'put' | 'delete';
  /** Path on /api/agent. `:name` segments are filled from the call's input. */
  path: string;
  scope: AgentScope | null;
  summary: string;
  /** JSON Schema for the tool's input, used by the MCP skin. */
  input: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

const NO_INPUT = { type: 'object' as const, properties: {} };

export const TOOLS: AgentTool[] = [
  {
    name: 'capabilities',
    method: 'get',
    path: '/capabilities',
    scope: null,
    summary: 'The tools this key may call, and the scopes it holds.',
    input: NO_INPUT
  },
  {
    name: 'list_assistants',
    method: 'get',
    path: '/assistants',
    scope: 'assistants:read',
    summary: "List the organization's assistants.",
    input: NO_INPUT
  },
  {
    name: 'get_assistant',
    method: 'get',
    path: '/assistants/:serviceId',
    scope: 'assistants:read',
    summary: 'One assistant, by serviceId.',
    input: {
      type: 'object',
      properties: { serviceId: { type: 'string' } },
      required: ['serviceId']
    }
  },
  {
    name: 'create_assistant',
    method: 'post',
    path: '/assistants',
    scope: 'assistants:write',
    summary:
      'Create an assistant. No phone number is attached — that is an operator step.',
    input: {
      type: 'object',
      properties: {
        assistantName: { type: 'string' },
        assistantData: {
          type: 'object',
          description:
            'Presentation and configuration only. Instructions, guardrails, privacy settings and provider credentials are refused.'
        },
        audienceType: { type: 'string' }
      },
      required: ['assistantName', 'assistantData']
    }
  },
  {
    name: 'update_assistant',
    method: 'put',
    path: '/assistants/:serviceId',
    scope: 'assistants:write',
    summary:
      'Update an assistant. Instructions, guardrails and privacy settings are not editable here.',
    input: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        assistantName: { type: 'string' },
        assistantData: { type: 'object' }
      },
      required: ['serviceId']
    }
  },
  {
    name: 'list_templates',
    method: 'get',
    path: '/content-templates',
    scope: 'templates:read',
    summary: "List an assistant's content templates.",
    input: {
      type: 'object',
      properties: { serviceId: { type: 'string' } }
    }
  },
  {
    name: 'save_templates',
    method: 'post',
    path: '/content-templates/batch-save',
    scope: 'templates:write',
    summary:
      'Create or update content templates in one write. Does NOT submit them for approval.',
    input: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        templates: { type: 'array', items: { type: 'object' } }
      },
      required: ['serviceId', 'templates']
    }
  },
  {
    name: 'upload_knowledge',
    method: 'post',
    path: '/knowledge',
    scope: 'knowledge:write',
    summary: 'Add a text knowledge document to an assistant.',
    input: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        text: { type: 'string' },
        name: { type: 'string' }
      },
      required: ['serviceId', 'text']
    }
  },
  {
    name: 'upload_knowledge_website',
    method: 'post',
    path: '/knowledge/website',
    scope: 'knowledge:write',
    summary:
      'Add a web page or a bounded crawl as a knowledge document. The crawl budget is clamped server-side.',
    input: {
      type: 'object',
      properties: {
        serviceId: { type: 'string' },
        url: { type: 'string' },
        mode: { type: 'string', enum: ['single', 'crawl'] },
        limit: { type: 'number' },
        maxDepth: { type: 'number' },
        name: { type: 'string' }
      },
      required: ['serviceId', 'url']
    }
  },
  {
    name: 'delete_knowledge',
    method: 'delete',
    path: '/knowledge/:documentUuid',
    scope: 'knowledge:write',
    summary: 'Remove a knowledge document.',
    input: {
      type: 'object',
      properties: { documentUuid: { type: 'string' } },
      required: ['documentUuid']
    }
  },
  {
    name: 'list_broadcasts',
    method: 'get',
    path: '/broadcasts',
    scope: 'broadcasts:send',
    summary: "List the organization's broadcast campaigns.",
    input: NO_INPUT
  },
  {
    name: 'get_broadcast',
    method: 'get',
    path: '/broadcasts/:campaignId',
    scope: 'broadcasts:send',
    summary: 'One broadcast campaign, with its delivery counts.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId']
    }
  },
  {
    name: 'send_broadcast',
    method: 'post',
    path: '/broadcasts/:campaignId/send',
    scope: 'broadcasts:send',
    summary:
      'Send a broadcast now. SPENDS MONEY. Recipients are counted and charged against the key’s daily budget before anything is queued; a send over the per-call ceiling or the daily budget is refused outright.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId']
    }
  },
  {
    name: 'pause_broadcast',
    method: 'post',
    path: '/broadcasts/:campaignId/pause',
    scope: 'broadcasts:send',
    summary: 'Halt a sending broadcast. Queued recipients stop.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId']
    }
  },
  {
    name: 'cancel_broadcast',
    method: 'post',
    path: '/broadcasts/:campaignId/cancel',
    scope: 'broadcasts:send',
    summary: 'Cancel a broadcast.',
    input: {
      type: 'object',
      properties: { campaignId: { type: 'string' } },
      required: ['campaignId']
    }
  },
  {
    name: 'get_usage',
    method: 'get',
    path: '/usage',
    scope: 'usage:read',
    summary: 'Message counts for the organization.',
    input: NO_INPUT
  }
];

export function findTool(name: string): AgentTool | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

/** Tools this key may actually call, given the scopes it holds. */
export function toolsForScopes(granted: string[]): AgentTool[] {
  const all = granted.includes('*');
  return TOOLS.filter(
    (tool) => tool.scope === null || all || granted.includes(tool.scope)
  );
}

/**
 * Compare this package's catalog with what the server advertises. Returns the
 * names each side has and the other does not, so a skin can say "your toolkit
 * is older than the gateway" instead of failing on an unknown tool later.
 */
export function catalogMatches(serverToolNames: string[]): {
  matches: boolean;
  missingLocally: string[];
  missingOnServer: string[];
} {
  const local = new Set(TOOLS.map((t) => t.name));
  const remote = new Set(serverToolNames);
  const missingLocally = [...remote].filter((n) => !local.has(n));
  const missingOnServer = [...local].filter((n) => !remote.has(n));
  return {
    matches: missingLocally.length === 0 && missingOnServer.length === 0,
    missingLocally,
    missingOnServer
  };
}
