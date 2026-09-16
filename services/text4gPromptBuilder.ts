import {
  type ConfirmedText4gBrief,
  getText4gRectangularBoundaryEligibility,
  TEXT4G_RENDERING_PROFILE_ID,
} from './text4gBrief';

const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();
const formatNumber = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
const formatRatio = (value: number): string => value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');

const TEXT4G_IMAGE_CANVAS_PIXELS = 1024;
const TEXT4G_FOOTPRINT_MAX_SPAN_PERCENT = 72;

const formatFeet = (value: number): string => {
  const feet = Math.floor(Math.max(0, value));
  const inches = Math.round((Math.max(0, value) - feet) * 12);
  if (inches === 12) return `${feet + 1}'-0"`;
  return `${feet}'-${inches}"`;
};

const roomText = (brief: ConfirmedText4gBrief): string => brief.rooms
  .map(room => `${room.count} x ${clean(room.name)}${room.details ? ` (${clean(room.details)})` : ''}`)
  .join('; ');

const curvilinearRequested = (brief: ConfirmedText4gBrief): boolean => {
  const text = [
    brief.project.purpose,
    brief.project.type,
    brief.project.variant || '',
    brief.planningStyle,
    ...brief.adjacency.map(rule => rule.description),
  ].join(' ');
  return /\b(?:circular|circle|round|radial|curved|curvilinear|arc|elliptic|elliptical|ellipse|organic|semi[-\s]?circular)\b/i.test(text);
};

const relevantPlanningRules = (brief: ConfirmedText4gBrief): string[] => {
  const allRooms = brief.rooms.map(room => `${room.name} ${room.details || ''}`).join(' ').toLowerCase();
  const curved = curvilinearRequested(brief);
  const rules: string[] = [
    curved
      ? 'connected curvilinear/radial shell with true arcs where requested; use orthogonal partitions only where architecturally logical'
      : 'connected orthogonal shell, aligned walls, useful rooms, short circulation, no voids',
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

export const buildText4gImagePrompt = (brief: ConfirmedText4gBrief): string => {
  const imperial = brief.dimensions.envelope.unit === 'ft';
  const width = imperial ? formatFeet(brief.dimensions.envelope.width) : `${formatNumber(brief.dimensions.envelope.width)} m`;
  const depth = imperial ? formatFeet(brief.dimensions.envelope.depth) : `${formatNumber(brief.dimensions.envelope.depth)} m`;
  const area = `${formatNumber(brief.dimensions.area.value)} ${brief.dimensions.area.unit === 'sq_ft' ? 'sq ft' : 'm²'}`;
  const floorCount = Math.max(1, brief.project.floors);
  const perFloorArea = `${formatNumber(brief.dimensions.area.value / floorCount)} ${brief.dimensions.area.unit === 'sq_ft' ? 'sq ft' : 'm²'}`;
  const areaAllocation = floorCount === 1 ? area : `total ${area}, ${perFloorArea}/floor`;
  const rectangularEligibility = getText4gRectangularBoundaryEligibility(brief);
  const rectangularBoundaryLocked = rectangularEligibility.eligible && !!brief.dimensions.rectangularBoundary?.locked;
  const curved = curvilinearRequested(brief);
  const boundaryShapeRule = rectangularBoundaryLocked
    ? `BOUNDARY SHAPE: RECTANGLE LOCKED; ${areaAllocation} approximately fills the dimensional rectangle; full exterior-wall rectangle, no L/U/notches/courtyard`
    : curved
      ? `BOUNDARY SHAPE: CREATIVE UNLOCKED CURVILINEAR; enclosed area ${areaAllocation}=${formatNumber(rectangularEligibility.coverageRatio * 100)}% of bbox; honor requested circular/radial/arc geometry with continuous curved exterior; open projections excluded`
      : `BOUNDARY SHAPE: CREATIVE UNLOCKED; enclosed area ${areaAllocation}=${formatNumber(rectangularEligibility.coverageRatio * 100)}% of bbox; choose an intelligent compact, L/U, stepped, or offset form when it improves zoning; open projections excluded from area`;
  const orientation = brief.dimensions.envelope.width >= brief.dimensions.envelope.depth ? 'landscape' : 'portrait';
  const longestSide = Math.max(0.01, brief.dimensions.envelope.width, brief.dimensions.envelope.depth);
  const frameWidth = TEXT4G_FOOTPRINT_MAX_SPAN_PERCENT * brief.dimensions.envelope.width / longestSide;
  const frameDepth = TEXT4G_FOOTPRINT_MAX_SPAN_PERCENT * brief.dimensions.envelope.depth / longestSide;
  const frameWidthPixels = Math.round(TEXT4G_IMAGE_CANVAS_PIXELS * frameWidth / 100);
  const frameDepthPixels = Math.round(TEXT4G_IMAGE_CANVAS_PIXELS * frameDepth / 100);
  const footprintRatio = brief.dimensions.envelope.width / Math.max(0.01, brief.dimensions.envelope.depth);
  const frameGeometry = brief.project.floors > 1
    ? `fixed-property footprint spans ${formatNumber(frameWidth)}% panel width x ${formatNumber(frameDepth)}% panel height in each equal nonoverlapping floor panel`
    : `fixed-property bbox centered, about ${frameWidthPixels}x${frameDepthPixels}px`;
  const adjacency = brief.adjacency.length
    ? brief.adjacency.map(rule => clean(rule.description)).join('; ')
    : 'apply the planning logic below';
  const rules = relevantPlanningRules(brief).join('; ');
  const wallProfile = imperial
    ? 'Walls: exterior 9-inch, partitions 4.5-inch, solid pure-black.'
    : 'Walls: exterior 230 mm, partitions 115 mm, solid pure-black.';
  return `RENDER RESOLVED FLOOR PLAN.
SQUARE 1:1 LOCK: ${TEXT4G_IMAGE_CANVAS_PIXELS}px canvas; ${frameGeometry}; target width:depth ${formatNumber(brief.dimensions.envelope.width)}:${formatNumber(brief.dimensions.envelope.depth)}=${formatRatio(footprintRatio)}:1; 2% tolerance. Include walls, balconies/terraces/porches/decks/steps/railings. Dimension strings span this bbox. Exclude annotations and all door leaves/swings, inward/outward; no stretch/crop.
SPEC: ${clean(brief.project.type || brief.project.purpose)}${brief.project.variant ? `, ${clean(brief.project.variant)}` : ''}; ${brief.project.floors} floor; ${clean(brief.planningStyle)}; ${area}; ${brief.dimensions.envelope.scope === 'building_footprint' ? 'footprint' : 'envelope'}; ${orientation} ${imperial ? 'imperial' : 'metric'}.
${boundaryShapeRule}.
ROOMS EXACT: ${roomText(brief)}.
ADJACENCY: ${adjacency}.
PLAN: ${rules}; door to each room.
ROOM LABELS MANDATORY: one full Design Brief name per space; no abbreviations, room dimensions/areas, backgrounds, legends, duplicates. Thin black text at 0.33x normal label height; clear white floor area only; never touch, cross, cover, or replace architecture.
STYLE ${TEXT4G_RENDERING_PROFILE_ID}: orthographic, white, crisp pure-black; no color/gray/texture/shadow/perspective/furniture/flooring/landscaping/title/legend/north-arrow/border/watermark. ${wallProfile} Thin swing arcs, sliding panels, parallel windows. Fixed kitchen/bath fixtures only. Never print prompt instructions, pixel coordinates, bounding-box notes, or wall-thickness notes.
DIMENSIONS: exactly two external strings, no internal chains: width ${width} above; depth ${depth} left. IMAGE ONLY.`;
};
