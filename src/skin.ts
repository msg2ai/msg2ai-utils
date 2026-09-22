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
  id: 'generic' | 'hotel' | 'event' | 'trip';
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
  }
};

/**
 * `hotel-ambassador` and `hotel-ambassador-mcp` both select the hotel skin.
 * An unrecognised name falls back to generic rather than failing: a wrapper
 * script or a renamed binary should still work.
 */
export function detectSkin(argv1: string = process.argv[1] ?? ''): Skin {
  const name = basename(argv1).replace(/\.(js|mjs|cjs|ts)$/, '');
  if (name.startsWith('hotel-')) return SKINS.hotel;
  if (name.startsWith('event-')) return SKINS.event;
  if (name.startsWith('trip-')) return SKINS.trip;
  return SKINS.generic;
}
