import { basename } from 'path';

/**
 * Vertical defaults, not vertical catalogs.
 *
 * Every skin serves the same tools; what differs is the `caseType` and
 * `propertyType` a freshly created assistant gets, and the labels a human
 * sees. The skin is chosen by the name the binary was invoked as — the same
 * mechanism the wa-campaigns toolkit uses — so one build serves every alias
 * package without a flag anybody has to remember.
 */

export interface Skin {
  id: 'generic' | 'hotel' | 'event' | 'trip' | 'vacation-rental';
  label: string;
  defaults: { caseType?: string; propertyType?: string };
}

export const SKINS: Record<Skin['id'], Skin> = {
  generic: { id: 'generic', label: 'AI Ambassador', defaults: {} },
  hotel: {
    id: 'hotel',
    label: 'Hotel Ambassador',
    defaults: { caseType: 'CONCIERGE_ASSISTANT', propertyType: 'HOTEL' }
  },
  event: {
    id: 'event',
    label: 'Event Ambassador',
    defaults: { caseType: 'MEETING_EVENT_ASSISTANT' }
  },
  trip: {
    id: 'trip',
    label: 'Trip Ambassador',
    defaults: { caseType: 'CONCIERGE_ASSISTANT', propertyType: 'TRAVEL_AGENCY' }
  },
  'vacation-rental': {
    id: 'vacation-rental',
    label: 'Vacation Rental Ambassador',
    // The schema's enum is VACATION_HOME — there is no VACATION_RENTAL value.
    // The package is named for the industry term; the field gets the real one.
    defaults: { caseType: 'CONCIERGE_ASSISTANT', propertyType: 'VACATION_HOME' }
  }
};

/**
 * Fill a skin's defaults into `create_assistant`'s `assistantData`.
 *
 * Only that tool: `update_assistant` edits something that already has a
 * vertical, and re-stamping it would silently convert an event assistant a
 * hotel operator happens to rename. What the caller sent always wins.
 *
 * The defaults are a pair, not two independent fields. A caller who picks a
 * different caseType on the hotel binary has chosen a different kind of
 * assistant, and bolting HOTEL onto it would produce a combination nobody
 * asked for, so propertyType is filled only when caseType matches the skin's.
 *
 * A non-object `assistantData` (a CLI flag arrives as a string) is left alone
 * for the gateway to reject by name, rather than overwritten here.
 */
export function applySkinDefaults(
  toolName: string,
  input: Record<string, unknown>,
  skin: Skin
): Record<string, unknown> {
  const { caseType, propertyType } = skin.defaults;
  if (toolName !== 'create_assistant' || !caseType) return input;

  const given = input.assistantData;
  const isObject =
    typeof given === 'object' && given !== null && !Array.isArray(given);
  if (given !== undefined && !isObject) return input;

  const data = { ...((given as Record<string, unknown> | undefined) ?? {}) };
  if (data.caseType === undefined) data.caseType = caseType;
  if (
    propertyType &&
    data.propertyType === undefined &&
    data.caseType === caseType
  ) {
    data.propertyType = propertyType;
  }
  return { ...input, assistantData: data };
}

/**
 * `hotel-ambassador` and `hotel-ambassador-mcp` both select the hotel skin.
 * An unrecognised name falls back to generic rather than failing: a wrapper
 * script or a renamed binary should still work.
 */
export function detectSkin(argv1: string = process.argv[1] ?? ''): Skin {
  const name = basename(argv1).replace(/\.(js|mjs|cjs|ts)$/, '');

  // Both forms, because the packages do not share one naming shape:
  // `hotel-ambassador` / `hotel-ambassador-mcp` carry the suffix, while the
  // trip package's binaries are plain `trip` and `trip-mcp`. Matching the bare
  // name as well as the prefix keeps one build serving all of them.
  const matches = (prefix: string) =>
    name === prefix || name.startsWith(`${prefix}-`);

  if (matches('hotel')) return SKINS.hotel;
  if (matches('event')) return SKINS.event;
  if (matches('trip')) return SKINS.trip;
  // Before `vacation`, so `vacation-rental-ambassador` is not shadowed by a
  // future bare `vacation` skin.
  if (matches('vacation-rental')) return SKINS['vacation-rental'];
  return SKINS.generic;
}
