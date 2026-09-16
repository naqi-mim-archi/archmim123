import type { Point } from '../types';

export const TEXT4D_RENDERING_PROFILE_ID = 'text4d-digitizable-floorplan-v1' as const;

export type Text4dAreaUnit = 'sq_ft' | 'sq_m';
export type Text4dLengthUnit = 'ft' | 'm';
export type Text4dValueSource = 'user_confirmed' | 'model_inferred' | 'calculated' | 'application_default';
export type Text4dEnvelopeScope = 'building_footprint' | 'enclosed_plan_envelope';
export type Text4dBriefSection = 'project' | 'dimensions' | 'rooms' | 'adjacency' | 'planning' | 'floors';
export type Text4dRectangularBoundarySource = 'automatic_area_match' | 'explicit_user_request' | 'user_confirmed' | 'ineligible';

export interface ConfirmedText4dBrief {
  version: '1';
  project: {
    category: string;
    type: string;
    variant?: string;
    purpose: string;
    floors: number;
  };
  dimensions: {
    area: { value: number; unit: Text4dAreaUnit; source: Text4dValueSource };
    envelope: {
      width: number;
      depth: number;
      unit: Text4dLengthUnit;
      scope: Text4dEnvelopeScope;
      source: Text4dValueSource;
    };
    rectangularBoundary: {
      locked: boolean;
      source: Text4dRectangularBoundarySource;
    };
  };
  rooms: Array<{ id: string; name: string; count: number; details?: string; source: Text4dValueSource }>;
  adjacency: Array<{
    id: string;
    description: string;
    priority: 'required' | 'preferred';
    source: Text4dValueSource;
  }>;
  planningStyle: string;
  renderingProfileId: typeof TEXT4D_RENDERING_PROFILE_ID;
  provenance: {
    draftSource: 'design_copilot' | 'legacy_summary';
    confirmed: boolean;
    lastEditedSection?: Text4dBriefSection;
  };
}

export interface Text4dBriefValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface Text4dRectangularBoundaryEligibility {
  eligible: boolean;
  coverageRatio: number;
  mismatchRatio: number;
}

export const getText4dRectangularBoundaryEligibility = (
  brief: Pick<ConfirmedText4dBrief, 'project' | 'dimensions'>,
): Text4dRectangularBoundaryEligibility => {
  const floorCount = Math.max(1, brief.project.floors || 1);
  const totalAreaSquareMeters = brief.dimensions.area.value * (brief.dimensions.area.unit === 'sq_ft' ? 0.09290304 : 1);
  const footprintAreaSquareMeters = brief.dimensions.envelope.width * brief.dimensions.envelope.depth
    * (brief.dimensions.envelope.unit === 'ft' ? 0.09290304 : 1)
    * floorCount;
  const coverageRatio = footprintAreaSquareMeters > 0 ? totalAreaSquareMeters / footprintAreaSquareMeters : 0;
  const mismatchRatio = Math.abs(coverageRatio - 1);
  return {
    eligible: Number.isFinite(coverageRatio) && coverageRatio >= 0.95 && coverageRatio <= 1.05,
    coverageRatio,
    mismatchRatio,
  };
};

export const text4dHasExplicitRectangularRequest = (text: string): boolean => {
  const normalized = (text || '').replace(/\s+/g, ' ').trim();
  if (!/\b(?:rectangle|rectangular|rectangular boundary|full rectangular boundary)\b/i.test(normalized)) return false;
  return !/(?:\b(?:not|without|avoid)\s+(?:a\s+)?(?:rectangle|rectangular|rectangular boundary)\b|\bnon[-\s]?rectangular\b)/i.test(normalized);
};

export const applyText4dRectangularBoundaryPolicy = (
  brief: ConfirmedText4dBrief,
  explicitRequestText = '',
): ConfirmedText4dBrief => {
  const eligibility = getText4dRectangularBoundaryEligibility(brief);
  const current = brief.dimensions.rectangularBoundary;
  const rectangularBoundary: ConfirmedText4dBrief['dimensions']['rectangularBoundary'] = !eligibility.eligible
    ? { locked: false, source: 'ineligible' }
    : text4dHasExplicitRectangularRequest(explicitRequestText)
      ? { locked: true, source: 'explicit_user_request' }
      : current?.source === 'user_confirmed'
        ? current
        : current?.source === 'explicit_user_request' && current.locked
          ? current
          : { locked: true, source: 'automatic_area_match' };
  return {
    ...brief,
    dimensions: { ...brief.dimensions, rectangularBoundary },
  };
};

export const setText4dRectangularBoundaryLock = (
  brief: ConfirmedText4dBrief,
  locked: boolean,
): ConfirmedText4dBrief => {
  const eligibility = getText4dRectangularBoundaryEligibility(brief);
  return {
    ...brief,
    dimensions: {
      ...brief.dimensions,
      rectangularBoundary: eligibility.eligible
        ? { locked, source: 'user_confirmed' }
        : { locked: false, source: 'ineligible' },
    },
    provenance: { ...brief.provenance, confirmed: false, lastEditedSection: 'dimensions' },
  };
};

const section = (text: string, names: string[], nextNames: string[]): string | null => {
  const start = names.map(escapeRegExp).join('|');
  const end = nextNames.map(escapeRegExp).join('|');
  const re = new RegExp(`(?:${start}):\\s*([\\s\\S]*?)(?=${end ? `(?:${end}):` : '$'})`, 'i');
  const match = (text || '').match(re);
  return match ? match[1].trim() : null;
};

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const numberValue = (value: string | undefined): number => {
  const parsed = Number.parseFloat((value || '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseLength = (value: string): number => {
  const clean = (value || '').trim().toLowerCase();
  const feetInches = clean.match(/(-?\d+(?:\.\d+)?)\s*(?:'|ft|feet)(?:\s*-?\s*(\d+(?:\.\d+)?)\s*(?:"|in|inch(?:es)?)?)?/i);
  if (feetInches) return numberValue(feetInches[1]) + numberValue(feetInches[2]) / 12;
  return numberValue(clean.match(/-?\d+(?:\.\d+)?/)?.[0]);
};

const parseRooms = (value: string | null, source: Text4dValueSource): ConfirmedText4dBrief['rooms'] => {
  if (value === null) return [];
  return value
    .split(/[\n\r]+|\s+[•*]\s+/)
    .map(line => line.trim().replace(/^[-*•\s]+/, '').trim())
    .filter(Boolean)
    .map((line, index) => {
      const countMatch = line.match(/^(\d+)\s*(?:x\s*)?/i);
      const count = countMatch ? Math.max(1, Number.parseInt(countMatch[1], 10)) : 1;
      const detailsMatch = line.match(/\((.*?)\)/);
      const name = line
        .replace(/^\d+\s*(?:x\s*)?/i, '')
        .replace(/\(.*?\)/g, '')
        .trim();
      return {
        id: `room-${index + 1}`,
        name,
        count,
        details: detailsMatch?.[1]?.trim() || undefined,
        source,
      };
    })
    .filter(room => room.name.length > 0);
};

const parseAdjacency = (value: string | null, source: Text4dValueSource): ConfirmedText4dBrief['adjacency'] => {
  if (value === null) return [];
  return value
    .split(/[\n\r]+|\s+[•*]\s+/)
    .map(line => line.trim().replace(/^[-*•\s]+/, '').trim())
    .filter(Boolean)
    .map((description, index) => ({
      id: `adjacency-${index + 1}`,
      description,
      priority: 'required' as const,
      source,
    }));
};

const parseProject = (purposeText: string | null, previous?: ConfirmedText4dBrief) => {
  const raw = (purposeText || '').replace(/^Program:\s*/i, '').trim();
  const group = raw.match(/(?:Program|Group):\s*([^,\n]+)/i)?.[1]?.trim();
  const explicitCategory = raw.match(/Category:\s*([^,\n]+)/i)?.[1]?.trim();
  const category = group
    || explicitCategory
    || previous?.project.category
    || (/house|apartment|villa|residen|bedroom/i.test(raw) ? 'Residential' : '');
  const explicitType = raw.match(/Type:\s*([^,\n]+)/i)?.[1]?.trim();
  const genericType = /apartment/i.test(raw) ? 'Apartment' : (/villa/i.test(raw) ? 'Villa' : (/house/i.test(raw) ? 'House' : raw.split(',')[0]?.trim()));
  const type = explicitType || previous?.project.type || genericType || '';
  const variant = raw.match(/Variant:\s*([^,\n]+)/i)?.[1]?.trim() || previous?.project.variant;
  return {
    category,
    type,
    variant,
    purpose: raw || previous?.project.purpose || '',
    uiCategory: explicitCategory,
  };
};

export const createEmptyText4dBrief = (): ConfirmedText4dBrief => ({
  version: '1',
  project: { category: '', type: '', purpose: '', floors: 1 },
  dimensions: {
    area: { value: 0, unit: 'sq_ft', source: 'application_default' },
    envelope: {
      width: 0,
      depth: 0,
      unit: 'ft',
      scope: 'enclosed_plan_envelope',
      source: 'application_default',
    },
    rectangularBoundary: { locked: false, source: 'ineligible' },
  },
  rooms: [],
  adjacency: [],
  planningStyle: 'Open Concept',
  renderingProfileId: TEXT4D_RENDERING_PROFILE_ID,
  provenance: { draftSource: 'design_copilot', confirmed: false },
});

export const legacySummaryToText4dBrief = (
  summary: string,
  previous?: ConfirmedText4dBrief,
  source: Text4dValueSource = 'model_inferred',
): ConfirmedText4dBrief => {
  const purposeText = section(summary, ['Purpose', 'Program'], ['Total Area', 'Size', 'Rooms Included', 'Rooms']);
  const sizeText = section(summary, ['Total Area', 'Size'], ['Rooms Included', 'Rooms']);
  const roomsText = section(summary, ['Rooms Included', 'Rooms'], ['Room Adjacency', 'Adjacency Flow', 'Adjacency']);
  const adjacencyText = section(summary, ['Room Adjacency', 'Adjacency Flow', 'Adjacency'], ['Layout Type', 'Planning Style']);
  const styleText = section(summary, ['Layout Type', 'Planning Style'], ['Detail Level', 'Labels', 'Floors']);
  const floorsText = section(summary, ['Floors'], []);

  const parsedProject = parseProject(purposeText, previous);
  const { uiCategory, ...project } = parsedProject;
  const floorMatch = (floorsText || '').match(/(\d+)/);
  const floors = floorMatch
    ? Math.max(1, Number.parseInt(floorMatch[1], 10))
    : (/single|one[-\s]?story/i.test(floorsText || '') ? 1 : previous?.project.floors || 1);

  const rawSize = sizeText || '';
  const metric = /(?:sq\s*m|sqm|m²|square\s*met|\d\s*m(?:\s|x|×|\)))/i.test(rawSize)
    && !/(?:sq\s*ft|sqft|ft²|feet|foot|')/i.test(rawSize);
  const areaMatch = rawSize.match(/([\d,.]+)\s*(sq\s*ft|sqft|ft²|square\s*feet|sq\s*m|sqm|m²|square\s*met(?:er|re)s?)/i);
  const dimensionsMatch = rawSize.match(/([\d.'"\s-]+(?:ft|feet|m|')?)\s*(?:x|×|by|\*)\s*([\d.'"\s-]+(?:ft|feet|m|')?)/i);
  const areaUnit: Text4dAreaUnit = metric ? 'sq_m' : 'sq_ft';
  const lengthUnit: Text4dLengthUnit = areaUnit === 'sq_m' ? 'm' : 'ft';
  const previousArea = previous?.dimensions.area;
  const previousEnvelope = previous?.dimensions.envelope;

  const parsedRooms = roomsText !== null ? parseRooms(roomsText, source) : previous?.rooms || [];
  if (!/Type:/i.test(purposeText || '') && /apartment/i.test(parsedProject.type)) {
    const bedroomCount = parsedRooms
      .filter(room => /bedroom|master bedroom/i.test(room.name))
      .reduce((sum, room) => sum + room.count, 0);
    if (bedroomCount > 0) project.type = `${bedroomCount} Bedroom`;
  }
  if (uiCategory && !/^(Residential|Commercial)/i.test(project.category)) {
    project.category = /apartment/i.test(uiCategory)
      ? 'Residential'
      : (/house|villa/i.test(uiCategory) ? 'Residential' : project.category);
  }

  const nextBrief: ConfirmedText4dBrief = {
    version: '1',
    project: { ...project, floors },
    dimensions: {
      area: {
        value: areaMatch ? numberValue(areaMatch[1]) : previousArea?.value || 0,
        unit: areaMatch ? areaUnit : previousArea?.unit || areaUnit,
        source: areaMatch ? source : previousArea?.source || source,
      },
      envelope: {
        width: dimensionsMatch ? parseLength(dimensionsMatch[1]) : previousEnvelope?.width || 0,
        depth: dimensionsMatch ? parseLength(dimensionsMatch[2]) : previousEnvelope?.depth || 0,
        unit: dimensionsMatch ? lengthUnit : previousEnvelope?.unit || lengthUnit,
        scope: previousEnvelope?.scope || 'enclosed_plan_envelope',
        source: dimensionsMatch ? source : previousEnvelope?.source || source,
      },
      rectangularBoundary: previous?.dimensions.rectangularBoundary || { locked: false, source: 'ineligible' },
    },
    rooms: parsedRooms,
    adjacency: adjacencyText !== null ? parseAdjacency(adjacencyText, source) : previous?.adjacency || [],
    planningStyle: styleText?.split(/[—\n]/)[0]?.trim() || previous?.planningStyle || 'Open Concept',
    renderingProfileId: TEXT4D_RENDERING_PROFILE_ID,
    provenance: {
      draftSource: previous?.provenance.draftSource || 'design_copilot',
      confirmed: false,
      lastEditedSection: previous?.provenance.lastEditedSection,
    },
  };
  return applyText4dRectangularBoundaryPolicy(nextBrief, summary);
};

export const updateText4dBriefFromSummary = (
  summary: string,
  previous: ConfirmedText4dBrief,
  editedSection: Text4dBriefSection,
): ConfirmedText4dBrief => {
  const next = legacySummaryToText4dBrief(summary, previous, 'model_inferred');
  if (editedSection === 'dimensions') {
    next.dimensions.area.source = 'user_confirmed';
    next.dimensions.envelope.source = 'user_confirmed';
  } else if (editedSection === 'rooms') {
    next.rooms = next.rooms.map(room => ({ ...room, source: 'user_confirmed' }));
  } else if (editedSection === 'adjacency') {
    next.adjacency = next.adjacency.map(rule => ({ ...rule, source: 'user_confirmed' }));
  }
  if (editedSection === 'dimensions' || editedSection === 'floors') {
    next.dimensions.rectangularBoundary = { locked: false, source: 'ineligible' };
  }
  next.provenance = { ...next.provenance, confirmed: false, lastEditedSection: editedSection };
  return applyText4dRectangularBoundaryPolicy(next);
};

const formatNumber = (value: number): string => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

const formatFeet = (value: number): string => {
  const feet = Math.floor(Math.max(0, value));
  const inches = Math.round((Math.max(0, value) - feet) * 12);
  if (inches === 12) return `${feet + 1}'-0"`;
  return `${feet}'-${inches}"`;
};

export const text4dBriefToDesignSummary = (brief: ConfirmedText4dBrief): string => {
  const normalizedType = brief.project.type.toLowerCase();
  const uiCategory = /^residential/i.test(brief.project.category)
    ? (/house|villa|mansion|farmhouse|row house/.test(normalizedType) ? 'Houses / Villas' : 'Apartments')
    : (/office|co-working/.test(normalizedType) ? 'Office'
      : (/shop|retail|showroom|grocery/.test(normalizedType) ? 'Retail'
        : (/cafe|restaurant|qsr/.test(normalizedType) ? 'Food & Beverage'
          : (/clinic|ward/.test(normalizedType) ? 'Healthcare'
            : (/classroom|training/.test(normalizedType) ? 'Education'
              : (/warehouse|factory|storage/.test(normalizedType) ? 'Industrial / Warehouse' : 'Other'))))));
  const programParts = [
    brief.project.category && `Program: ${brief.project.category}`,
    brief.project.category && `Category: ${uiCategory}`,
    brief.project.type && `Type: ${brief.project.type}`,
    brief.project.variant && `Variant: ${brief.project.variant}`,
  ].filter(Boolean).join(', ');
  const dimensions = brief.dimensions.envelope.unit === 'ft'
    ? `${formatFeet(brief.dimensions.envelope.width)} x ${formatFeet(brief.dimensions.envelope.depth)}`
    : `${formatNumber(brief.dimensions.envelope.width)}m x ${formatNumber(brief.dimensions.envelope.depth)}m`;
  const area = `${formatNumber(brief.dimensions.area.value)} ${brief.dimensions.area.unit === 'sq_ft' ? 'sq ft' : 'sqm'}`;
  const rooms = brief.rooms.map(room => `- ${room.count} ${room.name}${room.details ? ` (${room.details})` : ''}`).join('\n');
  const adjacency = brief.adjacency.map(rule => `- ${rule.description}`).join('\n');
  return `Parameters:\n\nPurpose: ${programParts || brief.project.purpose}\n\nTotal Area: ${area} (${dimensions})\n\nRooms Included:\n${rooms}\n\nRoom Adjacency:\n${adjacency}\n\nLayout Type: ${brief.planningStyle}\n\nDetail Level:\n✅ Room Labels (ON)\n✅ Full Architectural Elements (walls, windows, doors)\n\nFloors: ${brief.project.floors === 1 ? 'Single-story' : `${brief.project.floors}-story`}`;
};

export const validateText4dBrief = (brief: ConfirmedText4dBrief): Text4dBriefValidation => {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!brief.project.type.trim() && !brief.project.purpose.trim()) errors.push('Select or enter a project type.');
  if (!(brief.dimensions.area.value > 0)) errors.push('Enter a total area greater than zero.');
  if (!(brief.dimensions.envelope.width > 0) || !(brief.dimensions.envelope.depth > 0)) {
    errors.push('Enter both envelope width and depth.');
  }
  if (brief.rooms.length === 0) errors.push('Add at least one room.');
  if (brief.rooms.some(room => !room.name.trim() || room.count < 1)) errors.push('Every room needs a name and count.');
  const envelopeArea = brief.dimensions.envelope.width * brief.dimensions.envelope.depth;
  if (brief.project.floors === 1 && envelopeArea > 0 && brief.dimensions.area.value > envelopeArea * 1.15) {
    warnings.push('The stated single-floor area is larger than the selected envelope.');
  }
  return { valid: errors.length === 0, errors, warnings };
};

export const text4dBriefBoundaryMeters = (brief: ConfirmedText4dBrief): Point[] | undefined => {
  const scale = brief.dimensions.envelope.unit === 'ft' ? 0.3048 : 1;
  const width = brief.dimensions.envelope.width * scale;
  const depth = brief.dimensions.envelope.depth * scale;
  if (!(width > 0) || !(depth > 0)) return undefined;
  return [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: depth }, { x: 0, y: depth }];
};
