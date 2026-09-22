import { findTool, type AgentTool } from './tools';

/**
 * A typed client for the msg2ai agent gateway.
 *
 * Zero dependencies on purpose: this package is installed by `npx` into a
 * customer's machine, so every dependency is a supply-chain question somebody
 * else has to answer. Node 18+ has `fetch`.
 */

export interface AmbassadorClientOptions {
  /** `msgk_live_…`. Never logged, never echoed. */
  apiKey: string;
  /** Defaults to DEFAULT_BASE_URL. Point it at a non-production gateway to
   *  test against one. */
  baseUrl?: string;
  /** Defaults to 30s. A broadcast send can be slow. */
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * The published gateway hostname.
 *
 * npm forbids re-publishing a version, so this value is permanent for every
 * release that ships it. It is therefore a name we control and can re-point,
 * never a name belonging to whatever happens to be hosting the gateway today:
 * that would pin infrastructure into an artifact nobody can edit, and would
 * publish the shape of our deployment to everyone who installs the package.
 *
 * Override per environment with MSG2AI_BASE_URL or --base-url.
 */
export const DEFAULT_BASE_URL = 'https://api.msg2ai.xyz';

export class AmbassadorError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string
  ) {
    super(message);
    this.name = 'AmbassadorError';
  }
}

/** Fill `:name` segments from the input and return what is left for the body
 *  or the query string. Path params are consumed so they are not sent twice. */
export function buildPath(
  tool: AgentTool,
  input: Record<string, unknown>
): { path: string; rest: Record<string, unknown> } {
  const rest = { ...input };
  const path = tool.path.replace(/:([A-Za-z0-9_]+)/g, (_match, key: string) => {
    const value = rest[key];
    if (value === undefined || value === null || value === '') {
      throw new AmbassadorError(`${tool.name} requires "${key}"`, 400, 'MISSING_PARAM');
    }
    delete rest[key];
    return encodeURIComponent(String(value));
  });
  return { path, rest };
}

export class AmbassadorClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AmbassadorClientOptions) {
    if (!options.apiKey) {
      throw new AmbassadorError(
        'An agent key is required. Set MSG2AI_AGENT_KEY or pass --key.',
        401,
        'MISSING_KEY'
      );
    }
    this.apiKey = options.apiKey;
    const configured = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '');
    // Parsed here, once, so a malformed base URL is a named error at
    // construction rather than a bare TypeError from whichever line happens to
    // call `new URL` first. Re-parsing it inside the catch below would be
    // worse still: it can throw from inside the handler and discard the error
    // it was written to explain.
    try {
      this.host = new URL(configured).host;
    } catch {
      throw new AmbassadorError(
        `"${configured}" is not a valid base URL.`,
        400,
        'INVALID_BASE_URL'
      );
    }
    this.baseUrl = configured;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch;
  }

  async call(toolName: string, input: Record<string, unknown> = {}) {
    const tool = findTool(toolName);
    if (!tool) {
      throw new AmbassadorError(`Unknown tool "${toolName}"`, 400, 'UNKNOWN_TOOL');
    }

    const { path, rest } = buildPath(tool, input);
    const url = new URL(`${this.baseUrl}/api/agent${path}`);

    let body: string | undefined;
    if (tool.method === 'get' || tool.method === 'delete') {
      for (const [key, value] of Object.entries(rest)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    } else {
      body = JSON.stringify(rest);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url.toString(), {
        method: tool.method.toUpperCase(),
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          ...(body ? { 'Content-Type': 'application/json' } : {})
        },
        body,
        signal: controller.signal
      });

      const text = await response.text();

      // export_survey_responses answers text/csv, not JSON. Narrowed to CSV
      // rather than "any non-JSON type" on purpose: an HTML body must keep
      // falling through to the parse below, because a deployment-protection
      // page is what that branch exists to name, and it can arrive with a 200.
      const contentType = response.headers?.get?.('content-type') ?? '';
      if (response.ok && contentType.includes('csv')) {
        return { contentType, body: text };
      }

      let parsed: unknown;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        // An HTML body here almost always means a deployment-protection page
        // or a proxy error rather than the gateway.
        throw new AmbassadorError(
          `${response.status} from the gateway, and the body was not JSON. Check the base URL.`,
          response.status,
          'NON_JSON_RESPONSE'
        );
      }

      if (!response.ok) {
        const payload = parsed as { error?: string; code?: string };
        throw new AmbassadorError(
          payload.error ?? `Request failed with ${response.status}`,
          response.status,
          payload.code
        );
      }

      return parsed;
    } catch (error) {
      if (error instanceof AmbassadorError) throw error;
      if ((error as Error).name === 'AbortError') {
        throw new AmbassadorError(
          `The gateway did not respond within ${this.timeoutMs}ms`,
          504,
          'TIMEOUT'
        );
      }
      // Node reports an unresolvable host as a bare "fetch failed", with the
      // cause buried. On a first run that is the likeliest failure and the
      // least self-explanatory, so name the host that did not resolve.
      const cause = (error as { cause?: { code?: string } }).cause;
      if (cause?.code === 'ENOTFOUND' || cause?.code === 'EAI_AGAIN') {
        throw new AmbassadorError(
          `Could not resolve ${this.host}. ` +
            'Set MSG2AI_BASE_URL (or --base-url) if you are pointing at another environment.',
          503,
          'GATEWAY_UNREACHABLE'
        );
      }
      throw new AmbassadorError((error as Error).message, 500, 'NETWORK_ERROR');
    } finally {
      clearTimeout(timer);
    }
  }

  /** What this key may do. Also the drift check — see tools.catalogMatches. */
  async capabilities() {
    return (await this.call('capabilities')) as {
      organizationId: string;
      keyPrefix: string;
      scopes: string[];
      sendBudgetDaily: number;
      tools: Array<{ name: string; scope: string | null }>;
    };
  }
}
