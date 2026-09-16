import {
  AutoPlanAdjacencyRule,
  AutoPlanBoundary,
  AutoPlanBrief,
  AutoPlanBriefInput,
  AutoPlanBriefRoom,
  AutoPlanResidentialCategory,
  AutoPlanResidentialType,
} from './autoPlanTypes';

type SupportedRoomMapping = {
  internalType: string;
  modelType: string;
  modelTypeId: number;
  displayLabel: string;
  publicZone?: boolean;
  privateZone?: boolean;
  serviceZone?: boolean;
};

const MODEL_ROOM_MAP: Record<string, SupportedRoomMapping> = {
  living_room: { internalType: 'living_room', modelType: 'living_room', modelTypeId: 1, displayLabel: 'Living Room', publicZone: true },
  kitchen: { internalType: 'kitchen', modelType: 'kitchen', modelTypeId: 2, displayLabel: 'Kitchen', serviceZone: true },
  dining: { internalType: 'dining', modelType: 'dining', modelTypeId: 7, displayLabel: 'Dining', publicZone: true },
  bedroom: { internalType: 'bedroom', modelType: 'bedroom', modelTypeId: 3, displayLabel: 'Bedroom', privateZone: true },
  master_bedroom: { internalType: 'master_bedroom', modelType: 'bedroom', modelTypeId: 3, displayLabel: 'Master Bedroom', privateZone: true },
  child_room: { internalType: 'child_room', modelType: 'bedroom', modelTypeId: 3, displayLabel: 'Child Room', privateZone: true },
  guest_room: { internalType: 'guest_room', modelType: 'bedroom', modelTypeId: 3, displayLabel: 'Guest Room', privateZone: true },
  bathroom: { internalType: 'bathroom', modelType: 'bathroom', modelTypeId: 4, displayLabel: 'Bathroom', serviceZone: true },
  powder_room: { internalType: 'powder_room', modelType: 'bathroom', modelTypeId: 4, displayLabel: 'Powder Room / WC', serviceZone: true },
  balcony: { internalType: 'balcony', modelType: 'balcony', modelTypeId: 5, displayLabel: 'Balcony', publicZone: true },
  terrace: { internalType: 'terrace', modelType: 'balcony', modelTypeId: 5, displayLabel: 'Terrace', publicZone: true },
  study_room: { internalType: 'study_room', modelType: 'study_room', modelTypeId: 8, displayLabel: 'Study Room', privateZone: true },
  storage: { internalType: 'storage', modelType: 'storage', modelTypeId: 9, displayLabel: 'Storage', serviceZone: true },
  entrance: { internalType: 'entrance', modelType: 'entrance', modelTypeId: 6, displayLabel: 'Entrance / Foyer', publicZone: true },
  foyer: { internalType: 'foyer', modelType: 'entrance', modelTypeId: 6, displayLabel: 'Foyer', publicZone: true },
  corridor: { internalType: 'corridor', modelType: 'entrance', modelTypeId: 6, displayLabel: 'Corridor / Circulation', publicZone: true },
  utility: { internalType: 'utility', modelType: 'storage', modelTypeId: 9, displayLabel: 'Utility / Laundry', serviceZone: true },
  laundry: { internalType: 'laundry', modelType: 'storage', modelTypeId: 9, displayLabel: 'Laundry', serviceZone: true },
};

const ROOM_PATTERNS: Array<{ type: string; patterns: RegExp[]; optional?: boolean }> = [
  { type: 'master_bedroom', patterns: [/master\s+bed(room)?/i] },
  { type: 'child_room', patterns: [/child(?:ren)?'?s?\s+room/i, /kids?\s+room/i] },
  { type: 'guest_room', patterns: [/guest\s+room/i, /guest\s+bed(room)?/i] },
  { type: 'bedroom', patterns: [/bed(room)?s?/i] },
  { type: 'bathroom', patterns: [/bath(room)?s?/i, /\bbaths?\b/i] },
  { type: 'powder_room', patterns: [/powder\s+room/i, /\bwc\b/i, /toilet/i] },
  { type: 'kitchen', patterns: [/kitchens?/i] },
  { type: 'dining', patterns: [/dining/i] },
  { type: 'balcony', patterns: [/balcon(?:y|ies)/i], optional: true },
  { type: 'terrace', patterns: [/terraces?/i], optional: true },
  { type: 'study_room', patterns: [/stud(?:y|ies)/i, /home\s+office/i] },
  { type: 'storage', patterns: [/stor(?:e|age)/i, /closets?/i] },
  { type: 'entrance', patterns: [/entrance/i, /entry/i, /foyer/i] },
  { type: 'corridor', patterns: [/corridor/i, /circulation/i] },
  { type: 'utility', patterns: [/utility/i, /laundry/i] },
  { type: 'stair', patterns: [/stairs?/i, /staircase/i] },
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

const normalizeText = (value?: string) => (value || '').trim();

const splitList = (value?: string): string[] =>
  normalizeText(value)
    .split(/[,;\n]+/)
    .map(item => item.trim())
    .filter(Boolean);

const bedroomCountFromType = (type: AutoPlanResidentialType): number | null => {
  const match = type.match(/^(\d)\s+Bedroom$/i);
  if (match) return Number(match[1]);
  if (type === 'Studio') return 0;
  if (type === 'Duplex' || type === 'Penthouse' || type === 'House' || type === 'Row House' || type === 'Farmhouse') return 3;
  if (type === 'Villa') return 4;
  if (type === 'Mansion') return 5;
  if (type === 'Co-living') return 6;
  if (type === 'Student Housing') return 8;
  if (type === 'Senior Living') return 1;
  return null;
};

const extractCountNear = (text: string, type: string): number | null => {
  const labels = {
    bedroom: 'bed(?:room)?s?',
    master_bedroom: 'master\\s+bed(?:room)?',
    child_room: '(?:child(?:ren)?|kid)s?\\s+room',
    guest_room: 'guest\\s+(?:room|bed(?:room)?)',
    bathroom: '(?:bath(?:room)?s?|baths?)',
    powder_room: '(?:powder\\s+room|wc|toilet)',
    kitchen: 'kitchens?',
    balcony: 'balcon(?:y|ies)',
    study_room: '(?:stud(?:y|ies)|home\\s+office)',
    storage: '(?:stor(?:e|age)|closets?)',
    dining: 'dining',
    entrance: '(?:entrance|entry|foyer)',
    corridor: '(?:corridor|circulation)',
    utility: '(?:utility|laundry)',
    terrace: 'terraces?',
    stair: 'stairs?',
  } as Record<string, string>;
  const label = labels[type];
  if (!label) return null;

  const numericBefore = new RegExp(`(\\d+)\\s+${label}`, 'i').exec(text);
  if (numericBefore) return Number(numericBefore[1]);

  const wordBefore = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join('|')})\\s+${label}`, 'i').exec(text);
  if (wordBefore) return NUMBER_WORDS[wordBefore[1].toLowerCase()];

  const numericAfter = new RegExp(`${label}\\s*(?:x|:)?\\s*(\\d+)`, 'i').exec(text);
  if (numericAfter) return Number(numericAfter[1]);

  return null;
};

const addOrUpdateRoom = (
  rooms: Map<string, AutoPlanBriefRoom>,
  unsupported: AutoPlanBrief['unsupportedRequests'],
  type: string,
  count: number,
  required: boolean,
  metadata: Record<string, any> = {},
) => {
  if (count <= 0) return;
  const mapping = MODEL_ROOM_MAP[type];
  if (!mapping) {
    unsupported.push({
      requestedType: type,
      reason: 'No native HouseDiffusion/RPLAN label mapping is configured; preserving as metadata only.',
    });
    rooms.set(type, {
      type,
      count,
      required,
      unsupportedByModel: true,
      metadata,
    });
    return;
  }

  const existing = rooms.get(type);
  rooms.set(type, {
    type,
    count: Math.max(existing?.count || 0, count),
    required: existing?.required || required,
    publicZone: mapping.publicZone,
    privateZone: mapping.privateZone,
    serviceZone: mapping.serviceZone,
    modelType: mapping.modelType,
    modelTypeId: mapping.modelTypeId,
    displayLabel: mapping.displayLabel,
    unsupportedByModel: mapping.internalType !== mapping.modelType,
    metadata: {
      ...(existing?.metadata || {}),
      ...metadata,
      mappedFrom: mapping.internalType !== mapping.modelType ? mapping.internalType : undefined,
    },
  });

  if (mapping.internalType !== mapping.modelType) {
    unsupported.push({
      requestedType: type,
      mappedTo: mapping.modelType,
      reason: `Mapped to the closest supported HouseDiffusion room label: ${mapping.displayLabel}.`,
    });
  }
};

const inferCategoryFromType = (residentialType: AutoPlanResidentialType): AutoPlanResidentialCategory => {
  if (['Studio', '1 Bedroom', '2 Bedroom', '3 Bedroom', '4 Bedroom', 'Duplex', 'Penthouse', 'Serviced Apartment'].includes(residentialType)) return 'Apartments';
  if (['House', 'Villa', 'Row House', 'Farmhouse', 'Mansion'].includes(residentialType)) return 'Houses / Villas';
  if (['Co-living', 'Student Housing', 'Senior Living'].includes(residentialType)) return 'Shared / Special Residential';
  return 'Other Category';
};

const inferResidentialTypeFromPrompt = (prompt: string, fallback: AutoPlanResidentialType): AutoPlanResidentialType => {
  const p = prompt.toLowerCase();
  if (/\bstudio\b/.test(p)) return 'Studio';
  const br = /(\d+)\s*(?:bed|br|bedroom)/i.exec(prompt);
  if (br) {
    const count = Math.max(1, Math.min(4, Number(br[1])));
    return `${count} Bedroom` as AutoPlanResidentialType;
  }
  if (/\bduplex\b/.test(p)) return 'Duplex';
  if (/\bpenthouse\b/.test(p)) return 'Penthouse';
  if (/\bserviced apartment\b/.test(p)) return 'Serviced Apartment';
  if (/\bvilla\b/.test(p)) return 'Villa';
  if (/\brow house\b/.test(p)) return 'Row House';
  if (/\bfarmhouse\b/.test(p)) return 'Farmhouse';
  if (/\bmansion\b/.test(p)) return 'Mansion';
  if (/\bco-?living\b/.test(p)) return 'Co-living';
  if (/\bstudent housing\b/.test(p)) return 'Student Housing';
  if (/\bsenior living\b/.test(p)) return 'Senior Living';
  if (/\bhouse\b/.test(p)) return 'House';
  return fallback;
};

const extractAdjacencyRules = (prompt: string, adjacencyNotes: string): AutoPlanAdjacencyRule[] => {
  const source = `${prompt}\n${adjacencyNotes}`.toLowerCase();
  const rules: AutoPlanAdjacencyRule[] = [];
  const add = (spaceA: string, spaceB: string, relationship: AutoPlanAdjacencyRule['relationship']) => {
    if (!rules.some(rule => rule.spaceA === spaceA && rule.spaceB === spaceB && rule.relationship === relationship)) {
      rules.push({ spaceA, spaceB, relationship });
    }
  };

  if (/living.*kitchen|kitchen.*living|open kitchen/.test(source)) add('living_room', 'kitchen', 'near_or_connected');
  if (/living.*balcon|balcon.*living|connected to balcony/.test(source)) add('living_room', 'balcony', 'connected');
  if (/bedrooms?.*(near|private|cluster)|private zone/.test(source)) add('bedroom', 'bathroom', 'near');
  if (/bath.*kitchen|wet core|wet areas/.test(source)) add('bathroom', 'kitchen', 'near');
  if (/avoid|must not|away from/.test(source) && /bed.*living|living.*bed/.test(source)) add('bedroom', 'living_room', 'avoid');

  splitList(adjacencyNotes).forEach(note => {
    const lower = note.toLowerCase();
    if (lower.includes('near') || lower.includes('connect')) {
      const tokens = Object.keys(MODEL_ROOM_MAP).filter(type => lower.includes(type.replace(/_/g, ' ')));
      if (tokens.length >= 2) add(tokens[0], tokens[1], lower.includes('connect') ? 'connected' : 'near');
    }
  });

  return rules;
};

export const parseAutoPlanBrief = (input: AutoPlanBriefInput, boundary: AutoPlanBoundary): AutoPlanBrief => {
  const prompt = normalizeText(input.prompt);
  const residentialType = inferResidentialTypeFromPrompt(prompt, input.residentialType || '2 Bedroom');
  const category = input.category || inferCategoryFromType(residentialType);
  const rooms = new Map<string, AutoPlanBriefRoom>();
  const unsupportedRequests: AutoPlanBrief['unsupportedRequests'] = [];
  const promptLower = prompt.toLowerCase();

  addOrUpdateRoom(rooms, unsupportedRequests, 'living_room', 1, true, { anchor: true });
  addOrUpdateRoom(rooms, unsupportedRequests, 'kitchen', Math.max(1, input.kitchens || 1), true, {
    kitchenType: input.openKitchen || /open kitchen/i.test(prompt) ? 'open' : 'closed',
  });

  const typeBedrooms = bedroomCountFromType(residentialType);
  const promptBedrooms = extractCountNear(promptLower, 'bedroom');
  const bedrooms = Math.max(0, input.bedrooms ?? promptBedrooms ?? typeBedrooms ?? 2);
  if (bedrooms > 0) addOrUpdateRoom(rooms, unsupportedRequests, 'bedroom', bedrooms, true);

  const promptBaths = extractCountNear(promptLower, 'bathroom');
  const baths = Math.max(1, input.bathrooms ?? promptBaths ?? (bedrooms <= 1 ? 1 : bedrooms <= 3 ? 2 : 3));
  addOrUpdateRoom(rooms, unsupportedRequests, 'bathroom', baths, true);

  const promptBalconies = extractCountNear(promptLower, 'balcony');
  const balconies = Math.max(0, input.balconies ?? promptBalconies ?? (/balcon/i.test(promptLower) ? 1 : 0));
  if (balconies > 0) addOrUpdateRoom(rooms, unsupportedRequests, 'balcony', balconies, false);

  ROOM_PATTERNS.forEach(({ type, patterns, optional }) => {
    if (type === 'bedroom' || type === 'bathroom' || type === 'kitchen' || type === 'balcony') return;
    const requested = patterns.some(pattern => pattern.test(prompt));
    const count = extractCountNear(promptLower, type) || (requested ? 1 : 0);
    if (count > 0) addOrUpdateRoom(rooms, unsupportedRequests, type, count, !optional);
  });

  input.requiredSpaces.forEach(space => addOrUpdateRoom(rooms, unsupportedRequests, space, 1, true));
  input.optionalSpaces.forEach(space => addOrUpdateRoom(rooms, unsupportedRequests, space, 1, false));

  const kitchen = rooms.get('kitchen');
  if (kitchen) {
    kitchen.kitchenType = input.openKitchen || /open kitchen/i.test(prompt) ? 'open' : 'closed';
  }

  return {
    projectType: 'residential',
    category,
    residentialType,
    boundary,
    rooms: Array.from(rooms.values()),
    adjacencyRules: extractAdjacencyRules(prompt, input.adjacencyNotes),
    negativeRules: [],
    mustHave: splitList(input.mustHave),
    mustNotHave: splitList(input.mustNotHave),
    exclusions: splitList(input.exclusions),
    notes: normalizeText(input.notes),
    originalPrompt: prompt,
    unsupportedRequests,
  };
};

export const defaultAutoPlanBriefInput = (): AutoPlanBriefInput => ({
  prompt: 'Generate a 3 bedroom apartment with open kitchen, living room connected to balcony, 2 bathrooms, one master bedroom, and bedrooms near the private zone.',
  category: 'Apartments',
  residentialType: '3 Bedroom',
  bedrooms: 3,
  bathrooms: 2,
  kitchens: 1,
  balconies: 1,
  openKitchen: true,
  requiredSpaces: [],
  optionalSpaces: [],
  adjacencyNotes: 'Living room connected to kitchen and balcony. Bedrooms near private zone.',
  mustHave: '',
  mustNotHave: '',
  exclusions: '',
  notes: '',
});
