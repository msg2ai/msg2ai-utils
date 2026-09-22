#!/usr/bin/env node
import { AmbassadorClient, AmbassadorError, DEFAULT_BASE_URL } from './client';
import { TOOLS, catalogMatches, findTool, toolsForScopes } from './tools';
import { detectSkin } from './skin';
import { buildOpenApi } from './openapi';

/**
 * The CLI skin. One build serves every alias package; the vertical is chosen
 * by the name the binary was invoked as (see skin.ts).
 */

interface Parsed {
  command: string | undefined;
  flags: Record<string, string | boolean>;
  positional: string[];
}

export function parseArgs(argv: string[]): Parsed {
  const flags: Record<string, string | boolean> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
    } else {
      flags[key] = next;
      i++;
    }
  }

  return { command: positional[0], flags, positional: positional.slice(1) };
}

/**
 * `--input '{"a":1}'` for the whole body, or `--a 1` for one field. The second
 * form is what people actually type; the first is what scripts generate.
 */
export function collectInput(parsed: Parsed): Record<string, unknown> {
  const reserved = new Set(['key', 'base-url', 'input', 'json', 'help']);
  const input: Record<string, unknown> = {};

  if (typeof parsed.flags.input === 'string') {
    Object.assign(input, JSON.parse(parsed.flags.input));
  }
  for (const [key, value] of Object.entries(parsed.flags)) {
    if (reserved.has(key)) continue;
    input[key] = value;
  }
  return input;
}

function usage(skinLabel: string, bin: string): string {
  const lines = [
    `${skinLabel} — command line for the msg2ai agent gateway`,
    '',
    `Usage: ${bin} <tool> [--field value ...] [--input '<json>']`,
    '',
    'Setup:',
    '  MSG2AI_AGENT_KEY   your msgk_live_… key (or pass --key)',
    `  MSG2AI_BASE_URL    gateway base URL (default: ${DEFAULT_BASE_URL})`,
    '',
    'Tools:'
  ];
  for (const tool of TOOLS) {
    lines.push(`  ${tool.name.padEnd(26)} ${tool.summary}`);
  }
  lines.push('', 'Other commands:');
  lines.push('  tools              list tools this key may call');
  lines.push('  openapi            print the OpenAPI document');
  return lines.join('\n');
}

export async function run(argv: string[] = process.argv.slice(2)): Promise<number> {
  const skin = detectSkin();
  const bin = (process.argv[1] ?? 'ambassador').split('/').pop() ?? 'ambassador';
  const parsed = parseArgs(argv);

  if (!parsed.command || parsed.flags.help) {
    console.log(usage(skin.label, bin));
    return parsed.command ? 0 : 1;
  }

  if (parsed.command === 'openapi') {
    console.log(JSON.stringify(buildOpenApi(
      (parsed.flags['base-url'] as string) ?? process.env.MSG2AI_BASE_URL ?? DEFAULT_BASE_URL
    ), null, 2));
    return 0;
  }

  const apiKey =
    (parsed.flags.key as string) ?? process.env.MSG2AI_AGENT_KEY ?? '';

  let client: AmbassadorClient;
  try {
    client = new AmbassadorClient({
      apiKey,
      baseUrl:
        (parsed.flags['base-url'] as string) ?? process.env.MSG2AI_BASE_URL
    });
  } catch (error) {
    console.error(`✗ ${(error as Error).message}`);
    return 1;
  }

  try {
    if (parsed.command === 'tools') {
      const caps = await client.capabilities();
      const drift = catalogMatches(caps.tools.map((t) => t.name));
      for (const tool of toolsForScopes(caps.scopes)) {
        console.log(`${tool.name.padEnd(26)} ${tool.summary}`);
      }
      if (!drift.matches) {
        // Worth saying out loud: a customer keeps a pinned version while the
        // gateway moves on, so this is the normal case, not a failure.
        console.error('');
        if (drift.missingLocally.length) {
          console.error(
            `note: the gateway offers ${drift.missingLocally.length} tool(s) this version does not know: ${drift.missingLocally.join(', ')}. Upgrade the package to use them.`
          );
        }
        if (drift.missingOnServer.length) {
          console.error(
            `note: this version lists ${drift.missingOnServer.length} tool(s) the gateway no longer offers: ${drift.missingOnServer.join(', ')}.`
          );
        }
      }
      return 0;
    }

    if (!findTool(parsed.command)) {
      console.error(`✗ Unknown tool "${parsed.command}". Try: ${bin} --help`);
      return 1;
    }

    const result = await client.call(parsed.command, collectInput(parsed));
    console.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    if (error instanceof AmbassadorError) {
      console.error(`✗ ${error.message}${error.code ? ` (${error.code})` : ''}`);
      return error.status >= 500 ? 2 : 1;
    }
    console.error(`✗ ${(error as Error).message}`);
    return 2;
  }
}

/* c8 ignore start */
if (require.main === module) {
  run().then((code) => process.exit(code));
}
/* c8 ignore stop */
