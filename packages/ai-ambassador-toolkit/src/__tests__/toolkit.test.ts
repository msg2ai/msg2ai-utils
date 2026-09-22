import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import { AmbassadorClient, AmbassadorError, DEFAULT_BASE_URL, buildPath } from '../client';
import { TOOLS, catalogMatches, findTool, toolsForScopes } from '../tools';
import { detectSkin, SKINS } from '../skin';
import { buildOpenApi } from '../openapi';
import { collectInput, parseArgs } from '../cli';
import { handle } from '../mcp';

const KEY = 'msgk_live_test';

describe('catalog', () => {
  it('every tool has a unique name and a non-trivial summary', () => {
    const names = TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const tool of TOOLS) expect(tool.summary.length).toBeGreaterThan(10);
  });

  it('every path parameter is a required input', () => {
    for (const tool of TOOLS) {
      for (const [, param] of tool.path.matchAll(/:([A-Za-z0-9_]+)/g)) {
        expect(tool.input.required ?? [], tool.name).toContain(param);
      }
    }
  });

  it('only capabilities is unscoped', () => {
    const unscoped = TOOLS.filter((t) => t.scope === null).map((t) => t.name);
    expect(unscoped).toEqual(['capabilities']);
  });

  it('toolsForScopes hides what the key cannot call, but keeps capabilities', () => {
    const visible = toolsForScopes(['assistants:read']).map((t) => t.name);
    expect(visible).toContain('capabilities');
    expect(visible).toContain('list_assistants');
    expect(visible).not.toContain('send_broadcast');
  });

  it('a wildcard key sees everything', () => {
    expect(toolsForScopes(['*'])).toHaveLength(TOOLS.length);
  });

  it('reports drift in both directions', () => {
    const drift = catalogMatches(['capabilities', 'brand_new_tool']);
    expect(drift.matches).toBe(false);
    expect(drift.missingLocally).toContain('brand_new_tool');
    expect(drift.missingOnServer).toContain('list_assistants');
  });
});

describe('buildPath', () => {
  it('fills path params and removes them from the rest', () => {
    const tool = findTool('get_assistant')!;
    const { path, rest } = buildPath(tool, { serviceId: 'svc_1', extra: 1 });
    expect(path).toBe('/assistants/svc_1');
    expect(rest).toEqual({ extra: 1 });
  });

  it('url-encodes a value rather than breaking the path', () => {
    const tool = findTool('get_assistant')!;
    expect(buildPath(tool, { serviceId: 'a/b' }).path).toBe('/assistants/a%2Fb');
  });

  it('refuses a missing path param instead of building /assistants/undefined', () => {
    const tool = findTool('get_assistant')!;
    expect(() => buildPath(tool, {})).toThrow(AmbassadorError);
  });
});

describe('AmbassadorClient', () => {
  const clientWith = (impl: typeof fetch) =>
    new AmbassadorClient({ apiKey: KEY, baseUrl: 'https://gw.test', fetchImpl: impl });

  it('refuses to construct without a key', () => {
    expect(() => new AmbassadorClient({ apiKey: '' })).toThrow(/agent key is required/i);
  });

  it('sends the key as a bearer and never in the URL', async () => {
    const fetchImpl = vi.fn(async (url: string | URL, init?: RequestInit) => {
      expect(String(url)).not.toContain(KEY);
      expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as unknown as typeof fetch;

    await clientWith(fetchImpl).call('list_assistants');
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('puts leftover fields in the query string for a GET', async () => {
    const fetchImpl = vi.fn(async (url: string | URL) => {
      expect(String(url)).toContain('serviceId=svc_9');
      return new Response('{}', { status: 200 });
    }) as unknown as typeof fetch;
    await clientWith(fetchImpl).call('list_templates', { serviceId: 'svc_9' });
  });

  it('puts them in a JSON body for a POST', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL, init?: RequestInit) => {
      // serviceId stays in the body: upload_knowledge has no :param in its
      // path, so nothing consumes it.
      expect(JSON.parse(init!.body as string)).toEqual({
        serviceId: 's',
        text: 'hi'
      });
      return new Response('{}', { status: 201 });
    }) as unknown as typeof fetch;
    await clientWith(fetchImpl).call('upload_knowledge', { serviceId: 's', text: 'hi' });
  });

  it('surfaces the gateway error message and code', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: 'nope', code: 'INSUFFICIENT_SCOPE' }), {
        status: 403
      })) as unknown as typeof fetch;

    await expect(clientWith(fetchImpl).call('send_broadcast', { campaignId: 'c' }))
      .rejects.toMatchObject({ status: 403, code: 'INSUFFICIENT_SCOPE' });
  });

  it('explains an HTML body rather than failing on JSON.parse', async () => {
    const fetchImpl = (async () =>
      new Response('<html>Authentication Required</html>', { status: 401 })) as unknown as typeof fetch;

    await expect(clientWith(fetchImpl).call('list_assistants'))
      .rejects.toMatchObject({ code: 'NON_JSON_RESPONSE' });
  });

  it('returns a CSV export as text instead of failing on JSON.parse', async () => {
    // export_survey_responses is the one tool that does not answer JSON.
    const fetchImpl = (async () =>
      new Response('name,answer\nAda,yes\n', {
        status: 200,
        headers: { 'content-type': 'text/csv; charset=utf-8' }
      })) as unknown as typeof fetch;

    const out = (await clientWith(fetchImpl).call('export_survey_responses', {
      surveyId: 'srv_1'
    })) as { contentType: string; body: string };

    expect(out.body).toContain('Ada,yes');
    expect(out.contentType).toContain('csv');
  });

  it('SECURITY: still names an HTML body even with a 200, rather than returning it', async () => {
    // A deployment-protection page can answer 200. The CSV branch above must
    // not become a way for one to be handed back as if it were data.
    const fetchImpl = (async () =>
      new Response('<html>Authentication Required</html>', {
        status: 200,
        headers: { 'content-type': 'text/html' }
      })) as unknown as typeof fetch;

    await expect(clientWith(fetchImpl).call('list_assistants'))
      .rejects.toMatchObject({ code: 'NON_JSON_RESPONSE' });
  });

  it('rejects an unknown tool before making a request', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    await expect(clientWith(fetchImpl).call('nope')).rejects.toThrow(/Unknown tool/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('skins', () => {
  it.each([
    ['/usr/local/bin/hotel-ambassador', 'hotel'],
    ['/usr/local/bin/hotel-ambassador-mcp', 'hotel'],
    ['/usr/local/bin/event-ambassador', 'event'],
    ['/usr/local/bin/trip-ambassador-mcp', 'trip'],
    // The trip package's binaries are plain `trip` / `trip-mcp`, with no
    // vertical suffix, so the bare name has to match too.
    ['/usr/local/bin/trip', 'trip'],
    ['/usr/local/bin/trip-mcp', 'trip'],
    ['/usr/local/bin/vacation-rental-ambassador', 'vacation-rental'],
    ['/usr/local/bin/vacation-rental-ambassador-mcp', 'vacation-rental'],
    ['/usr/local/bin/ambassador', 'generic']
  ])('%s selects the %s skin', (argv1, expected) => {
    expect(detectSkin(argv1).id).toBe(expected);
  });

  it('falls back to generic for an unrecognised name rather than failing', () => {
    expect(detectSkin('/tmp/my-wrapper').id).toBe('generic');
  });

  it('every propertyType default is a value the server schema actually has', () => {
    // PropertyType: HOTEL | VACATION_HOME | RESORT | TRAVEL_AGENCY.
    // VACATION_RENTAL does not exist, however the package is named.
    const valid = ['HOTEL', 'VACATION_HOME', 'RESORT', 'TRAVEL_AGENCY'];
    for (const skin of Object.values(SKINS)) {
      if (!skin.defaults.propertyType) continue;
      expect(valid, skin.id).toContain(skin.defaults.propertyType);
    }
  });

  it('each vertical skin carries a caseType default', () => {
    for (const id of ['hotel', 'event', 'trip', 'vacation-rental'] as const) {
      expect(SKINS[id].defaults.caseType).toBeTruthy();
    }
  });
});

describe('cli argument parsing', () => {
  it('reads a command, flags with values, and boolean flags', () => {
    const parsed = parseArgs(['get_assistant', '--serviceId', 'svc_1', '--json']);
    expect(parsed.command).toBe('get_assistant');
    expect(parsed.flags).toEqual({ serviceId: 'svc_1', json: true });
  });

  it('collects field flags but not reserved ones', () => {
    const parsed = parseArgs(['x', '--key', 'secret', '--base-url', 'u', '--name', 'n']);
    expect(collectInput(parsed)).toEqual({ name: 'n' });
  });

  it('merges --input json with individual flags', () => {
    const parsed = parseArgs(['x', '--input', '{"a":1}', '--b', '2']);
    expect(collectInput(parsed)).toEqual({ a: 1, b: '2' });
  });
});

describe('mcp protocol', () => {
  const out: string[] = [];
  const captureStdout = () => {
    out.length = 0;
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => {
      out.push(s);
      return true;
    }) as never);
  };

  it('advertises only the tools the key may call', async () => {
    captureStdout();
    await handle(
      { jsonrpc: '2.0', id: 1, method: 'tools/list' },
      {
        client: {} as AmbassadorClient,
        allowed: async () => ['assistants:read'],
        label: 'test'
      }
    );
    const names = JSON.parse(out[0]).result.tools.map((t: { name: string }) => t.name);
    expect(names).toContain('list_assistants');
    expect(names).not.toContain('send_broadcast');
    vi.restoreAllMocks();
  });

  it('returns a tool failure as isError, not a protocol error', async () => {
    captureStdout();
    await handle(
      { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'get_usage' } },
      {
        client: {
          call: async () => {
            throw new AmbassadorError('forbidden', 403, 'INSUFFICIENT_SCOPE');
          }
        } as unknown as AmbassadorClient,
        allowed: async () => [],
        label: 'test'
      }
    );
    const parsed = JSON.parse(out[0]);
    // A 403 is an answer the model should see and adapt to, not a transport
    // failure that aborts the conversation.
    expect(parsed.error).toBeUndefined();
    expect(parsed.result.isError).toBe(true);
    expect(parsed.result.content[0].text).toContain('INSUFFICIENT_SCOPE');
    vi.restoreAllMocks();
  });

  it('answers an unknown method with -32601', async () => {
    captureStdout();
    await handle(
      { jsonrpc: '2.0', id: 3, method: 'nope' },
      { client: {} as AmbassadorClient, allowed: async () => [], label: 't' }
    );
    expect(JSON.parse(out[0]).error.code).toBe(-32601);
    vi.restoreAllMocks();
  });
});

describe('openapi', () => {
  it('emits one operation per tool, with braces not colons', () => {
    const doc = buildOpenApi('https://gw.test');
    const ops = Object.values(doc.paths).flatMap((p) => Object.keys(p as object));
    expect(ops).toHaveLength(TOOLS.length);
    expect(JSON.stringify(doc.paths)).toContain('{serviceId}');
    expect(JSON.stringify(doc.paths)).not.toContain(':serviceId');
  });

  it('records the required scope on each operation', () => {
    const doc = buildOpenApi();
    const op = (doc.paths['/api/agent/usage'] as Record<string, Record<string, unknown>>).get;
    expect(op['x-required-scope']).toBe('usage:read');
  });
});

describe('DEFAULT_BASE_URL', () => {
  it('is a hostname we control, not the App Engine URL underneath', () => {
    // npm forbids re-publishing a version, so this value is permanent for
    // every release that ships it. An appspot host would pin the GCP project,
    // its region and its service naming into an artifact we cannot edit.
    expect(DEFAULT_BASE_URL).toBe('https://api.msg2ai.xyz');
    expect(DEFAULT_BASE_URL).not.toMatch(/appspot|googleusercontent|run\.app/);
  });

  it('has no trailing slash, so path joining cannot double up', () => {
    expect(DEFAULT_BASE_URL.endsWith('/')).toBe(false);
  });

  it('LEAK: the build strips comments, because comments ship too', () => {
    // This assertion is the only thing standing between a well-meaning
    // explanatory comment and a permanent publication. The first version of
    // DEFAULT_BASE_URL's own comment explained why not to publish the App
    // Engine hostname BY QUOTING IT, into dist/client.js and dist/client.d.ts.
    // A test that reads the constant cannot see that; removeComments can.
    // scripts/release.mjs re-checks the built artifact before publishing.
    // vitest runs with cwd at the package root.
    const cfg = JSON.parse(readFileSync('tsconfig.build.json', 'utf8'));
    expect(cfg.compilerOptions?.removeComments).toBe(true);
  });

  it('rejects a malformed base URL at construction, with a code', () => {
    // Not from inside the catch: re-parsing there can throw out of the handler
    // and discard the error it was written to explain.
    expect(() => new AmbassadorClient({ apiKey: KEY, baseUrl: 'https://' })).toThrow(
      expect.objectContaining({ code: 'INVALID_BASE_URL' })
    );
    expect(() => new AmbassadorClient({ apiKey: KEY, baseUrl: 'not a url' })).toThrow(
      expect.objectContaining({ code: 'INVALID_BASE_URL' })
    );
  });

  it('names the unresolvable host rather than reporting "fetch failed"', async () => {
    const enotfound = Object.assign(new Error('fetch failed'), {
      cause: { code: 'ENOTFOUND' }
    });
    const client = new AmbassadorClient({
      apiKey: KEY,
      fetchImpl: (() => Promise.reject(enotfound)) as unknown as typeof fetch
    });
    await expect(client.call('capabilities')).rejects.toMatchObject({
      code: 'GATEWAY_UNREACHABLE',
      message: expect.stringContaining('api.msg2ai.xyz')
    });
  });
});
