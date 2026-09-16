import {
  type ConfirmedText4cBrief,
  TEXT4C_RENDERING_PROFILE_ID,
} from './text4cBrief';

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();
const formatNumber = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const formatFeet = (value: number): string => {
  const feet = Math.floor(Math.max(0, value));
  const inches = Math.round((Math.max(0, value) - feet) * 12);
  if (inches === 12) return `${feet + 1}'-0"`;
  return `${feet}'-${inches}"`;
};

const roomText = (brief: ConfirmedText4cBrief): string => brief.rooms
  .map(room => `${room.count} x ${clean(room.name)}${room.details ? ` (${clean(room.details)})` : ''}`)
  .join('; ');

const relevantPlanningRules = (brief: ConfirmedText4cBrief): string[] => {
  const allRooms = brief.rooms.map(room => `${room.name} ${room.details || ''}`).join(' ').toLowerCase();
  const rules: string[] = [
    'connected orthogonal shell, aligned walls, useful rooms, short circulation, no voids',
    'public by entry, bedrooms private, wet rooms clustered; no through-access via bedroom/bath/kitchen',
    'occupied rooms get exterior windows; no collisions',
  ];
  if (/ensuite|en-suite|attached bath|master bath/.test(allRooms)) {
    rules.push('ensuite entered from its bedroom only');
  }
  if (/common bath|guest bath|powder|shared bath/.test(allRooms)) {
    rules.push('common/guest bath from shared circulation, not kitchen/dining');
  }
  if (/kitchen/.test(allRooms) && /living|dining/.test(allRooms) && /open/i.test(brief.planningStyle)) {
    rules.push('open kitchen shares a broad edge with living/dining');
  }
  if (/balcony|terrace|patio|deck/.test(allRooms)) {
    rules.push('balcony/terrace uses a hinged or sliding glazed access door, never a window');
  }
  if (/laundry|utility/.test(allRooms)) {
    rules.push('laundry/utility beside wet core, not a passage');
  }
  if (/bedroom|master/.test(allRooms)) {
    rules.push('bedrooms have useful clear walls and exterior daylight');
  }
  if (brief.project.floors > 1) {
    rules.push('one stair in common circulation, not bedroom/bathroom');
  } else {
    rules.push('single story: no stair');
  }
  return rules;
};

export const buildText4cImagePrompt = (brief: ConfirmedText4cBrief): string => {
  const imperial = brief.dimensions.envelope.unit === 'ft';
  const width = imperial ? formatFeet(brief.dimensions.envelope.width) : `${formatNumber(brief.dimensions.envelope.width)} m`;
  const depth = imperial ? formatFeet(brief.dimensions.envelope.depth) : `${formatNumber(brief.dimensions.envelope.depth)} m`;
  const area = `${formatNumber(brief.dimensions.area.value)} ${brief.dimensions.area.unit === 'sq_ft' ? 'sq ft' : 'm²'}`;
  const orientation = brief.dimensions.envelope.width >= brief.dimensions.envelope.depth ? 'landscape' : 'portrait';
  const longestSide = Math.max(0.01, brief.dimensions.envelope.width, brief.dimensions.envelope.depth);
  const frameWidth = 72 * brief.dimensions.envelope.width / longestSide;
  const frameDepth = 72 * brief.dimensions.envelope.depth / longestSide;
  const frameLeft = (100 - frameWidth) / 2;
  const frameTop = (100 - frameDepth) / 2;
  const frameScope = brief.project.floors > 1 ? 'each equal nonoverlapping floor panel' : 'canvas';
  const adjacency = brief.adjacency.length
    ? brief.adjacency.map(rule => clean(rule.description)).join('; ')
    : 'apply the planning logic below';
  const rules = relevantPlanningRules(brief).join('; ');
  const wallProfile = imperial
    ? 'Walls: exterior 9-inch, partitions 4.5-inch, solid pure-black.'
    : 'Walls: exterior 230 mm, partitions 115 mm, solid pure-black.';
  return `RENDER RESOLVED FLOOR PLAN.
SPEC: ${clean(brief.project.type || brief.project.purpose)}${brief.project.variant ? `, ${clean(brief.project.variant)}` : ''}; ${brief.project.floors} floor; ${clean(brief.planningStyle)}; ${area}; ${brief.dimensions.envelope.scope === 'building_footprint' ? 'footprint' : 'envelope'}; ${orientation} ${imperial ? 'imperial' : 'metric'}.
SQUARE 1:1 LOCK: exterior-wall box in ${frameScope} x=${formatNumber(frameLeft)}-${formatNumber(frameLeft + frameWidth)}%, y=${formatNumber(frameTop)}-${formatNumber(frameTop + frameDepth)}%; centered uniform-scale; white margins; never stretch/crop.
ROOMS EXACT: ${roomText(brief)}.
ADJACENCY: ${adjacency}.
PLAN: ${rules}; door to each room.
STYLE ${TEXT4C_RENDERING_PROFILE_ID}: orthographic, white, crisp pure-black; no color/gray/texture/shadow/perspective/furniture/flooring/landscaping/title/legend/north-arrow/border/watermark. ${wallProfile} Thin swing arcs, sliding panels, parallel windows. Fixed kitchen/bath fixtures only. Horizontal sans-serif room labels/dimensions; no overlap.
DIMENSIONS: exactly two external strings, no internal chains: width ${width} above; depth ${depth} left. IMAGE ONLY.`;
};
