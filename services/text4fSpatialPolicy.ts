export type Text4RoomKind =
  | 'entry'
  | 'living'
  | 'dining'
  | 'kitchen'
  | 'bedroomLobby'
  | 'masterBedroom'
  | 'bedroom'
  | 'ensuite'
  | 'commonBathroom'
  | 'utility'
  | 'storage'
  | 'balcony'
  | 'other';

export type Text4PrivacyZone = 'public' | 'semiPrivate' | 'private' | 'service' | 'outdoor';

export interface Text4RoomPolicy {
  zone: Text4PrivacyZone;
  preferredDepth: readonly [number, number];
  integration: 'high' | 'medium' | 'low' | 'private';
}

export const TEXT4_ROOM_POLICY: Record<Text4RoomKind, Text4RoomPolicy> = {
  entry: { zone: 'public', preferredDepth: [0, 0], integration: 'high' },
  living: { zone: 'public', preferredDepth: [1, 1], integration: 'high' },
  dining: { zone: 'public', preferredDepth: [1, 2], integration: 'high' },
  kitchen: { zone: 'semiPrivate', preferredDepth: [1, 2], integration: 'medium' },
  bedroomLobby: { zone: 'semiPrivate', preferredDepth: [2, 3], integration: 'medium' },
  masterBedroom: { zone: 'private', preferredDepth: [2, 4], integration: 'low' },
  bedroom: { zone: 'private', preferredDepth: [2, 4], integration: 'low' },
  ensuite: { zone: 'private', preferredDepth: [3, 5], integration: 'private' },
  commonBathroom: { zone: 'service', preferredDepth: [2, 3], integration: 'low' },
  utility: { zone: 'service', preferredDepth: [1, 3], integration: 'low' },
  storage: { zone: 'service', preferredDepth: [1, 4], integration: 'low' },
  balcony: { zone: 'outdoor', preferredDepth: [2, 3], integration: 'low' },
  other: { zone: 'semiPrivate', preferredDepth: [1, 3], integration: 'medium' },
};

export const classifyText4Room = (label: string): Text4RoomKind => {
  const text = (label || '').toLowerCase();
  if (/ensuite|attached\s*bath/.test(text)) return 'ensuite';
  if (/common.*bath|shared.*bath|powder|\bwc\b|toilet|bathroom/.test(text)) return 'commonBathroom';
  if (/master.*bed|master.*suite/.test(text)) return 'masterBedroom';
  if (/bedroom.*lobby|private.*lobby/.test(text)) return 'bedroomLobby';
  if (/bedroom|\bbed\b/.test(text)) return 'bedroom';
  if (/foyer|entrance|\bentry\b|vestibule|reception/.test(text)) return 'entry';
  if (/living|lounge|family\s*room/.test(text)) return 'living';
  if (/dining/.test(text)) return 'dining';
  if (/kitchen/.test(text)) return 'kitchen';
  if (/utility|laundry/.test(text)) return 'utility';
  if (/storage|closet|pantry/.test(text)) return 'storage';
  if (/balcony|terrace|patio/.test(text)) return 'balcony';
  if (/lobby|hall|corridor/.test(text)) return 'bedroomLobby';
  return 'other';
};

const summaryHas = (summary: string, pattern: RegExp) => pattern.test(summary.toLowerCase());

/** Compact, program-relevant matrix. It replaces scattered generic relationship lines. */
export const buildText4RelationshipMatrix = (summary: string): string[] => {
  const lines: string[] = [];
  const hasFoyer = summaryHas(summary, /foyer|entrance\s*lobby|vestibule/);
  const hasDining = summaryHas(summary, /dining/);
  const hasKitchen = summaryHas(summary, /kitchen/);
  const hasOpenKitchen = summaryHas(summary, /open[\s-]*kitchen/);
  const hasBedroom = summaryHas(summary, /bedroom|\bbed\b/);
  const hasEnsuite = summaryHas(summary, /ensuite|attached\s*bath/);
  const hasCommonBath = summaryHas(summary, /common.*bath|shared.*bath|powder|bathroom/);
  const hasBalcony = summaryHas(summary, /balcony|terrace|patio/);

  lines.push(hasFoyer
    ? '- HARD Exterior > Entry/Foyer > Living: REQUIRED_ACCESS; no intervening room'
    : '- HARD Exterior > Living: REQUIRED_DIRECT_ENTRY');
  lines.push('- HARD Entry Foyer, if present, must connect directly to Living/Dining');
  lines.push('- HARD Bedroom Lobby is OPTIONAL; if present, it must connect to Living/Dining or shared circulation');
  if (hasDining) lines.push('- HARD Living <-> Dining: REQUIRED_OPEN_ACCESS');
  if (hasDining && hasKitchen) lines.push(hasOpenKitchen
    ? '- HARD Open Kitchen <-> Dining/Living: REQUIRED_SHARED_EDGE + OPEN_ACCESS'
    : '- HARD Dining <-> Kitchen: REQUIRED_DIRECT_ACCESS');
  if (hasBedroom) {
    lines.push('- HARD Living/Public > controlled transition > Bedrooms; Kitchen/Bathroom passage FORBIDDEN');
    lines.push('- HARD Bedroom <-> Living/Dining: DOOR_ONLY; WALL_OPENING FORBIDDEN');
  }
  if (hasEnsuite) lines.push('- HARD Master Bedroom > Ensuite: PRIVATE_DOOR_ONLY');
  if (hasCommonBath) lines.push('- HARD Common Bathroom: DOOR_ONLY from shared circulation; Kitchen access FORBIDDEN');
  if (hasBalcony) lines.push('- HARD Living <-> Balcony: REQUIRED_LOW_SILL_WINDOW_ACCESS');
  if (hasBedroom) lines.push('- PREFERRED Bedrooms deeper than Living; bedroom-bedroom adjacency AVOID, buffer preferred');
  return lines;
};

export interface Text4GraphRoom {
  id: string;
  label: string;
}

export interface Text4GraphEdge {
  a: string;
  b: string;
  access: 'door' | 'opening' | 'window';
}

export interface Text4GraphIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

/** Read-only audit. It never changes geometry or triggers another model call. */
export const auditText4AccessGraph = (
  rooms: Text4GraphRoom[],
  edges: Text4GraphEdge[],
  entryRoomId?: string,
): Text4GraphIssue[] => {
  const issues: Text4GraphIssue[] = [];
  const byId = new Map(rooms.map(room => [room.id, room]));
  const adjacency = new Map<string, Text4GraphEdge[]>();
  rooms.forEach(room => adjacency.set(room.id, []));
  edges.forEach(edge => {
    adjacency.get(edge.a)?.push(edge);
    adjacency.get(edge.b)?.push(edge);
    const aKind = classifyText4Room(byId.get(edge.a)?.label || '');
    const bKind = classifyText4Room(byId.get(edge.b)?.label || '');
    const kinds = new Set([aKind, bKind]);
    if (kinds.has('commonBathroom') || kinds.has('ensuite')) {
      if (edge.access !== 'door') issues.push({ code: 'bathroom-non-door-access', severity: 'error', message: 'Bathroom access must use a door.' });
      if (kinds.has('kitchen')) issues.push({ code: 'bathroom-kitchen-access', severity: 'error', message: 'Bathroom must not connect to Kitchen.' });
    }
    if (kinds.has('ensuite') && !kinds.has('masterBedroom')) {
      issues.push({ code: 'ensuite-non-private-access', severity: 'error', message: 'Ensuite must connect only to its associated private suite.' });
    }
  });

  if (!entryRoomId || !byId.has(entryRoomId)) {
    issues.push({ code: 'missing-entry-node', severity: 'error', message: 'No valid entry destination was identified.' });
    return issues;
  }

  const depths = new Map<string, number>([[entryRoomId, 0]]);
  const queue = [entryRoomId];
  while (queue.length) {
    const current = queue.shift()!;
    const depth = depths.get(current)!;
    (adjacency.get(current) || []).forEach(edge => {
      const next = edge.a === current ? edge.b : edge.a;
      if (!depths.has(next)) {
        depths.set(next, depth + 1);
        queue.push(next);
      }
    });
  }

  rooms.forEach(room => {
    if (!depths.has(room.id) && classifyText4Room(room.label) !== 'balcony') {
      issues.push({ code: 'unreachable-room', severity: 'error', message: `${room.label} is unreachable from the entry.` });
    }
  });

  // Living must remain reachable without using a bathroom as circulation.
  const publicDepths = new Set<string>([entryRoomId]);
  const publicQueue = [entryRoomId];
  while (publicQueue.length) {
    const current = publicQueue.shift()!;
    (adjacency.get(current) || []).forEach(edge => {
      const next = edge.a === current ? edge.b : edge.a;
      const nextKind = classifyText4Room(byId.get(next)?.label || '');
      if (nextKind === 'commonBathroom' || nextKind === 'ensuite' || publicDepths.has(next)) return;
      publicDepths.add(next);
      publicQueue.push(next);
    });
  }
  rooms.filter(room => classifyText4Room(room.label) === 'living').forEach(room => {
    if (!publicDepths.has(room.id)) {
      issues.push({ code: 'living-route-through-bathroom', severity: 'error', message: 'Living is not reachable from entry without crossing a bathroom.' });
    }
  });

  const livingDepths = rooms.filter(r => classifyText4Room(r.label) === 'living').map(r => depths.get(r.id)).filter((d): d is number => d !== undefined);
  const bedroomDepths = rooms.filter(r => ['bedroom', 'masterBedroom'].includes(classifyText4Room(r.label))).map(r => depths.get(r.id)).filter((d): d is number => d !== undefined);
  if (livingDepths.length && bedroomDepths.some(depth => depth < Math.min(...livingDepths))) {
    issues.push({ code: 'privacy-depth-order', severity: 'warning', message: 'A bedroom is shallower than the Living space.' });
  }
  return issues;
};
