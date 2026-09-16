import { ai } from "./aiClient";
import { SHARED_SCHEMA } from "./schema";
import { Point } from "../types";
import { buildText4RelationshipMatrix } from "./text4SpatialPolicy";

// Reusable local room constraints map
const ROOM_CONSTRAINTS_MAP = {
  living_dining: {
    name: "Open-Plan Living/Dining",
    match: /living.*dining|dining.*living/i,
    constraints: "area 20–30 m², preferred 24–27 m², minimum short side 3.4–3.6 m, maximum aspect ratio 2.0, exterior required"
  },
  living: {
    name: "Living Room",
    match: /living/i,
    constraints: "area 12–24 m², preferred 16–20 m², minimum short side 3.2 m, maximum aspect ratio 2.0, exterior required"
  },
  dining: {
    name: "Dining Area",
    match: /dining/i,
    constraints: "area 6–12 m², preferred 7.5–10 m², minimum short side 2.4 m, maximum aspect ratio 2.2"
  },
  kitchen: {
    name: "Kitchen",
    match: /kitchen/i,
    constraints: "area 6–12 m², preferred 8–10 m², minimum short side 2.1–2.4 m, maximum aspect ratio 2.5, exterior contact: preferred"
  },
  master_bedroom: {
    name: "Master Bedroom",
    match: /master\s*bedroom|bed.*1/i,
    constraints: "area 12–17 m², preferred 13.5–15 m², minimum short side 3.1–3.2 m, maximum aspect ratio 1.8, exterior required"
  },
  secondary_bedroom: {
    name: "Secondary Bedroom",
    match: /secondary\s*bedroom|bedroom\s*2|bed\s*2/i,
    constraints: "area 9–13 m², preferred 10.5–12 m², minimum short side 2.7–2.9 m, maximum aspect ratio 1.8, exterior required"
  },
  guest_bedroom: {
    name: "Guest Bedroom",
    match: /guest\s*bedroom|bedroom\s*3|bed\s*3/i,
    constraints: "area 10–14 m², preferred 11–12.5 m², minimum short side 2.9 m, maximum aspect ratio 1.8, exterior required"
  },
  ensuite: {
    name: "Ensuite Bathroom",
    match: /ensuite|attached\s*bath/i,
    constraints: "area 3.2–5 m², preferred 3.6–4.4 m², minimum clear width 1.35–1.5 m, maximum aspect ratio 3.0"
  },
  common_bathroom: {
    name: "Common Bathroom",
    match: /common\s*bath|bathroom/i,
    constraints: "area 3.6–5.5 m², preferred 4–5 m², minimum clear width 1.45–1.5 m, maximum aspect ratio 3.0"
  },
  powder: {
    name: "Powder Room",
    match: /powder/i,
    constraints: "area 1.8–3 m², minimum clear width 1.0–1.2 m, maximum aspect ratio 3.0"
  },
  foyer: {
    name: "Entry/Foyer",
    match: /entry|foyer/i,
    constraints: "area 2–5 m², preferred 2.5–3.5 m², minimum clear width 1.2 m, maximum aspect ratio 2.5"
  },
  lobby: {
    name: "Bedroom Lobby",
    match: /lobby/i,
    constraints: "area 2.5–5 m², preferred width 0.95–1.10 m, keep short"
  },
  corridor: {
    name: "Corridor",
    match: /corridor|hallway/i,
    constraints: "preferred width 0.95–1.10 m, keep short, avoid unnecessary loops"
  },
  utility: {
    name: "Utility/Laundry",
    match: /utility|laundry/i,
    constraints: "area 1.5–4 m², minimum clear width 1.2–1.5 m, maximum aspect ratio 3.0"
  },
  storage: {
    name: "Storage",
    match: /storage|closet/i,
    constraints: "area 0.8–3 m²"
  },
  balcony: {
    name: "Balcony",
    match: /balcony|terrace/i,
    constraints: "area 4–10 m², preferred area 5.5–8 m², minimum usable depth 1.4–1.5 m, preferred depth 1.6–2.2 m"
  }
};

const extractRequestedRooms = (designSummary: string): string[] => {
  const rooms: string[] = [];
  const roomsSection = designSummary.match(/(?:Rooms Included|Program)[\s\S]*?(?=\n\n|\n[A-Z]|$)/i)?.[0] || "";
  const lines = roomsSection.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('-') || line.trim().startsWith('*') || /^\d+\./.test(line.trim())) {
      rooms.push(line.trim());
    }
  }
  if (rooms.length === 0) {
    designSummary.split('\n').forEach(line => {
      const trimmed = line.trim();
      if ((trimmed.startsWith('-') || trimmed.startsWith('*')) && (trimmed.toLowerCase().includes('bed') || trimmed.toLowerCase().includes('bath') || trimmed.toLowerCase().includes('living') || trimmed.toLowerCase().includes('kitchen'))) {
        rooms.push(trimmed);
      }
    });
  }
  return rooms;
};

const extractRelationships = (designSummary: string): string[] => {
  const rels: string[] = [];
  const adjacencySection = designSummary.match(/(?:Room Adjacency|Adjacency|Relationships)[\s\S]*?(?=\n\n|\n[A-Z]|$)/i)?.[0] || "";
  const lines = adjacencySection.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('-') || line.trim().startsWith('*') || /^\d+\./.test(line.trim())) {
      rels.push(line.trim());
    }
  }
  return rels;
};

const normalizeRelationships = (designSummary: string): string => {
  const rawRels = extractRelationships(designSummary);
  const normalized: string[] = [];
  
  rawRels.forEach(r => {
    const text = r.toLowerCase();
    if (text.includes("kitchen") && (text.includes("dining") || text.includes("dinning"))) {
      normalized.push("- Kitchen <-> Dining: ADJACENT + DIRECT_ACCESS (Open or semi-open connection)");
    } else if (text.includes("master") && (text.includes("bedroom 2") || text.includes("secondary") || text.includes("isolated") || text.includes("privacy"))) {
      normalized.push("- Master Bedroom <-> Secondary Bedroom: BUFFER preferred + AVOID_ADJACENCY (Both require independent access)");
    } else if ((text.includes("common") || text.includes("guest")) && (text.includes("bathroom") || text.includes("bath")) && (text.includes("guest") || text.includes("circulation") || text.includes("accessible"))) {
      normalized.push("- Common Bathroom <-> Guest Access: NEAR + DIRECT_ACCESS from shared lobby/foyer/corridor (Never access through a bedroom)");
    } else if (text.includes("balcony") && (text.includes("living") || text.includes("dining"))) {
      normalized.push("- Balcony <-> Living/Dining: ADJACENT + DIRECT_ACCESS (wide low-sill access window; never a door)");
    } else {
      let normalizedTerm = "";
      if (text.includes("direct") || text.includes("connect") || text.includes("access")) normalizedTerm += " DIRECT_ACCESS";
      if (text.includes("adjacent") || text.includes("next to") || text.includes("share")) normalizedTerm += " ADJACENT";
      if (text.includes("near") || text.includes("close")) normalizedTerm += " NEAR";
      if (text.includes("separate") || text.includes("isolate") || text.includes("buffer") || text.includes("privacy")) normalizedTerm += " BUFFER preferred + AVOID_ADJACENCY";
      if (normalizedTerm) {
        normalized.push(`- ${r.replace(/^[-*\s\d.]+/g, '')}: ${normalizedTerm.trim()}`);
      } else {
        normalized.push(`- ${r}`);
      }
    }
  });

  normalized.push(...buildText4RelationshipMatrix(designSummary));

  return normalized.join('\n');
};

const buildFloorplanGenerationPrompt = ({
  refinedBrief,
  boundaryContext,
  outputSchema
}: {
  refinedBrief: string;
  boundaryContext: string;
  outputSchema: any;
}) => {
  let typology = "GENERIC RESIDENTIAL\n- Maintain a clear public-to-private sequence.\n- Keep bedrooms independently accessible.\n- Keep bathrooms out of circulation routes.\n- Connect Kitchen logically to Dining.\n- Prioritize Living Room and bedroom daylight.\n- Group service spaces where practical.\n- Minimize wasted circulation.";
  const text = refinedBrief.toLowerCase();
  
  if (text.includes("2 bedroom") || text.includes("2 bed") || text.includes("two bedroom")) {
    typology = `TWO-BEDROOM APARTMENT
- Living/Dining is the main public space.
- Kitchen must connect directly to Dining.
- Living should connect to one short bedroom lobby.
- The bedroom lobby should independently serve both bedrooms and the common bathroom.
- Master Bedroom should connect privately to its ensuite.
- Prefer a bathroom, closet, lobby, storage or living-space buffer between the bedrooms.
- Avoid a shared bedroom headboard wall where practical.
- Do not create a long corridor only to separate the bedrooms.
- Balcony should connect to Living/Dining.
- Living and both bedrooms require eligible exterior contact.
- Prefer Kitchen and bathrooms to form a compact service core.`;
  } else if (text.includes("1 bedroom") || text.includes("1 bed") || text.includes("one bedroom")) {
    typology = `ONE-BEDROOM APARTMENT
- Living/Dining is the main public space.
- Kitchen must connect directly to Dining.
- Bedroom access must not pass through the Kitchen or Bathroom.
- Common Bathroom should be accessible from shared circulation.
- If an ensuite is requested, keep it private to the Bedroom.
- Balcony should connect to Living/Dining.
- Living and Bedroom require eligible exterior contact.
- Keep circulation minimal.`;
  } else if (text.includes("studio")) {
    typology = `STUDIO APARTMENT
- Preserve one usable open living and sleeping zone.
- Do not create an unusably small enclosed bedroom.
- Keep Kitchen beside the Dining or Living zone.
- Kitchen must not block the main circulation route.
- Bathroom must have independent access from the Entry or shared zone.
- Use Storage or a service edge as a privacy buffer where useful.
- Balcony should connect to the main living zone.
- Give daylight priority to the main open space.`;
  } else if (text.includes("3 bedroom") || text.includes("3 bed") || text.includes("three bedroom")) {
    typology = `THREE-BEDROOM APARTMENT
- Living/Dining is the main public space.
- Use one compact private branch or two controlled bedroom branches.
- Do not scatter bedroom doors around the Living Room.
- Common Bathroom must have independent shared access.
- Master Ensuite must remain private.
- Prefer acoustic buffers between the Master and secondary bedrooms.
- Living and all bedrooms require eligible exterior contact.
- Cluster the Kitchen and bathrooms where practical.
- Avoid excessive corridor area.`;
  }

  const requestedRooms = extractRequestedRooms(refinedBrief);
  const constraintsList: string[] = [];
  
  constraintsList.push(`- Entry/Foyer: ${ROOM_CONSTRAINTS_MAP.foyer.constraints}`);
  
  Object.keys(ROOM_CONSTRAINTS_MAP).forEach(key => {
    const item = ROOM_CONSTRAINTS_MAP[key as keyof typeof ROOM_CONSTRAINTS_MAP];
    if (key === 'foyer') return;
    
    if (item.match.test(refinedBrief)) {
      constraintsList.push(`- ${item.name}: ${item.constraints}`);
    }
  });

  let floorCount = "1";
  if (text.includes("2-storey") || text.includes("two-story") || text.includes("2 floors") || text.includes("double story")) {
    floorCount = "2";
  } else if (text.includes("3-storey") || text.includes("three-story") || text.includes("3 floors")) {
    floorCount = "3";
  }

  const normalizedRels = normalizeRelationships(refinedBrief);

  const excluded = [
    floorCount === "1" ? "- Stairs" : "",
    !text.includes("furniture") ? "- Furniture" : "",
    !text.includes("fixture") ? "- Fixtures" : "",
    !text.includes("utility") ? "- Unrequested utility room" : "",
    !text.includes("corridor") ? "- Long corridor" : ""
  ].filter(Boolean).join('\n');

  const compactSystemInstruction = `YOU ARE AN ARCHITECTURAL FLOOR-PLAN PLANNING ENGINE.

Generate one coherent, buildable and scale-accurate floor plan as valid JSON matching the supplied schema.
The application has already resolved the project units, dimensions, scale, orientation and boundary geometry.
Use the supplied units, dimensions and coordinates exactly.
Do not convert, resize, question or reinterpret the supplied boundary.

Create one floor plan only.
Do not create alternatives.
Do not compare layouts.
Do not score layouts.
Do not explain your reasoning.
Do not output tests.
Do not output a validation report.
Return JSON only.

USE THESE ARCHITECTURAL PRIORITIES WHILE CREATING THE PLAN
1. Required room program
2. Public-to-private zoning
3. Entry and circulation
4. Room access
5. Room adjacency and separation
6. Wet and service-area grouping
7. Exterior-wall allocation
8. Room sizes and proportions
9. Slabs and walls
10. Doors and windows
11. Balcony and railings
12. JSON schema compliance

PROGRAM
- The explicit required-room list and room counts control the plan.
- Generate every required room.
- Do not add major rooms that were not requested.
- Add optional rooms only when the required rooms have sufficient usable size.
- Every room and circulation zone must have its own floor slab.
- Do not generate furniture or fixtures unless explicitly enabled.

SPATIAL ZONES AND RELATIVE DEPTH
Public: Entry, foyer, living and guest-facing dining.
Semi-private: Dining, open kitchen, family lobby and bedroom lobby.
Private: Bedrooms, dressing rooms and ensuites.
Service: Kitchen service edge, common bathroom, powder room, laundry, utility and storage.
Outdoor: Balcony, terrace, patio and courtyard.

Depth is the number of spatial transitions from the exterior entry. Use relative order rather than forcing unnecessary corridors:
Entry depth 0 -> Living/Public core depth 1 -> controlled transition depth 2 -> Bedrooms depth 2-4 -> associated Ensuite depth 3-5.
Public spaces must be shallow, connected and visually accessible. Private spaces must be deeper, less connected and never used as through-circulation.
Service spaces must not interrupt the entry-to-living route. Never connect the main entrance directly to a kitchen work area.

ROOM ACCESS
- Every enclosed room must have valid door-based access.
- UNIVERSAL BATHROOM ACCESS: A bathroom, ensuite, powder room, WC, or toilet may be accessed only through a door, and must never serve as a passage to Living or any other room. Never use a wall opening or open-plan edge as bathroom access.
- A bathroom, ensuite, powder room, WC, or toilet must never open into a Kitchen or kitchen work area. This prohibition applies to every building program and typology.
- Bedrooms must open from a foyer, living area, shared lobby or corridor.
- Never access a bedroom through a kitchen, bathroom, utility room, storage, closet, or another bedroom.
- A common bathroom must have independent shared access.
- An ensuite must connect only to its associated bedroom or private dressing area.
- A corridor must connect to meaningful spaces and must not be landlocked.
- A balcony must connect to a legitimate habitable room.

CIRCULATION
- Use one clear route from the entry to the main public space.
- Use short secondary routes to private rooms.
- Prefer a short bedroom lobby over a long corridor.
- Avoid corridor loops and duplicated circulation routes.
- Do not route bedroom access through the kitchen work area.
- Do not make the living room function mainly as a corridor.
- Keep corridor width appropriate to the supplied room constraints.

RELATIONSHIPS
DIRECT_ACCESS: A door, opening or open-plan connection is required.
ADJACENT: The spaces should share a meaningful wall or boundary.
NEAR: The spaces should be connected by a short route.
BUFFER: Prefer a bathroom, closet, storage space, lobby, corridor, service wall or public room between the spaces.
AVOID_ADJACENCY: Avoid a shared wall where practical.
FORBIDDEN_ACCESS: One room must never be entered through the other.
EXTERIOR_REQUIRED: The room must touch a valid window-capable exterior wall.

ROOM SIZE AND PROPORTION
- Use the supplied room constraints. Give required rooms usable dimensions.
- The Master Bedroom area must be equal to or greater than every other individual bedroom. Its attached ensuite area must be equal to or greater than every other bathroom or powder room.
- Consider room area, minimum short side and aspect ratio together. A room is not well proportioned merely because its total area is correct.
- Avoid narrow bedrooms, corridor-shaped living rooms, extremely thin kitchens, and unusably narrow bathrooms.
- Avoid thin room tails, residual strips, tiny notches, and meaningless alcoves. Use simple practical room shapes.

APARTMENT LOGIC
- Living or Living/Dining is the main public space.
- Kitchen should connect directly to dining.
- Prioritize locating the Kitchen on or adjacent to the entry/south facade, while preserving the mandatory entry-to-foyer-to-living sequence and never making the Kitchen the first entered room.
- Common bathroom should open from a shared lobby, foyer or corridor (avoid main living-room focal wall).
- Entry Foyer or Entrance Lobby must share an actual boundary with Living or Living/Dining and provide a door or open edge on that boundary. Hallway, Dining-only or any other space must never sit between them.
- STRICT ENTRY SANDWICH: If an Entry Foyer, Entrance Lobby, or Entry Corridor is present, it must sit directly between the outside entry door and Living or Living/Dining. The outside door must open into that entry space, whose internal side must connect directly to Living or Living/Dining through a door, wall opening, or uninterrupted open-plan edge. Both connections are mandatory; no bathroom, kitchen, bedroom, wall, or service room may block this sequence.
- STRICT DIRECT ENTRY FALLBACK: If there is no Entry Foyer, Entrance Lobby, vestibule, or other entry intermediary, the outside entry door must open directly into Living or Living/Dining. It must never open first into a Kitchen, Dining-only space, Bathroom, Powder Room, Bedroom, Bedroom Lobby, corridor, utility, storage, or any other room.
- Living and Dining must connect directly in open plans. Bedroom Lobby is optional; if used, connect it to shared circulation.
- If a common bathroom shares a wall with a bedroom that has no ensuite or other attached bathroom, add a second door on that shared wall so the bathroom serves both the bedroom and common circulation. Retain the common-side bathroom door.
- Prefer kitchen and bathrooms to form a compact wet-area group without damaging bedroom privacy or daylight.
- Connect the balcony mainly to Living or Living/Dining.

DAYLIGHT AND EXTERIOR WALLS
Use only the supplied window-capable edges. Default priority:
1. Living or Living/Dining, 2. Master Bedroom, 3. Secondary Bedrooms, 4. Kitchen, 5. Bathrooms, 6. Utility and Storage.
- Living and required bedrooms must touch eligible exterior walls.
- Prioritize Bedrooms on the balcony/north facade opposite the apartment entry; when frontage is limited, allocate it to the Master Bedroom first, then other bedrooms, then use another permitted exterior facade. Never leave a required bedroom without an eligible window wall.
- Do not place windows on party walls, restricted edges, or internal partitions.

WET AND SERVICE AREAS
- Prefer kitchen, bathrooms, utility and plumbing walls to form a compact service cluster/shared plumbing walls where practical.
- Privacy, access and daylight are more important than plumbing convenience.

DOORS
- Use single or pocket doors for bedrooms and bathrooms. Never use a door, including a sliding door, for balcony access.
- Every door must lie on a real wall segment. A door connecting two rooms must lie on their shared boundary.
- Avoid overlapping doors, blocked circulation, and door-swing conflicts. Do not automatically use a double entry door unless requested.
- **DOOR CORNERS & JUNCTIONS**: A door must NEVER be placed at a corner, intersection, wall end, or T-junction of walls. Every door must be offset from any wall corner or junction by at least 0.4 meters to prevent overlapping wall joints.

WINDOWS
- Place windows only on valid exterior walls. Keep each window inside its wall segment.
- Give the living space the largest appropriate glazing. Give each required bedroom an exterior window.
- For a non-corner apartment, place exterior windows only on the entry facade and the opposite balcony facade; side walls are party walls and must have no windows. If the brief explicitly says corner apartment, one additional side facade may have windows.

BALCONIES
- Generate a dedicated balcony floor slab. Connect it directly to Living or Living/Dining.
- Extend the balcony approximately 0.9144 m (3 ft) beyond the exterior wall.
- Access it through one wide window hosted on the shared Living/Balcony wall, never through a door. Make this window at least 70% of the balcony frontage and use a 0.1524 m (6 in) sill.
- Generate railings on all exposed balcony slab edges, not on the shared building-envelope edge.
- Maintain the supplied minimum usable balcony depth.

APARTMENT ORIENTATION (unless the user/brief explicitly overrides it)
- For a rectangular apartment, use a short boundary edge as the entry facade and the opposite short boundary edge as the balcony facade.
- Orient the plan for presentation with entry on the bottom/south edge and balcony/exterior glazing on the top/north edge.
- Treat left and right side edges as windowless party walls unless this is explicitly a corner apartment.

OPEN KITCHEN CONNECTION
- Where an open kitchen shares a wall with Living or Living/Dining, place one wall opening centered on that shared wall, spanning 60-70% of its usable length.
- The opening must be represented in the openings array and must lie exactly on the real shared wall segment.

STAIRS
- If the project has one floor, generate no stairs. If the project has more than one floor, place stairs in shared circulation.
- Never place stairs inside or exclusively through a bedroom, bathroom, kitchen, utility or storage room.

GEOMETRY
- Keep every element inside its permitted boundary. Use the supplied Cartesian coordinate orientation.
- UNIVERSAL EXTERIOR WALL: Every outer building-envelope wall must be at least 0.2286 m (9 inches) thick, regardless of program or typology. Never output a thinner exterior wall.
- Room slabs must not overlap. Room polygons must be closed. Walls must follow slab boundaries.
- Every wall must reach its intended perpendicular wall or envelope endpoint. Avoid duplicate walls, unexplained gaps, dangling ends, and micro-corners; prefer simple orthogonal buildable geometry.
- **NO UNLABELED OR INACCESSIBLE VOIDS**: Every single square meter of the floor plan must be allocated to a named, accessible room or circulation zone. There must be absolutely NO closed-off, landlocked, unlabeled, or inaccessible voids or pockets. Every room must have at least one door connecting it to the rest of the plan.

OUTPUT
Return valid JSON matching the supplied schema. Do not output reasoning, explanations, markdown, tests, or validation reports.`;

  const finalPrompt = `================================================================================
[SYSTEM INSTRUCTION]
================================================================================

${compactSystemInstruction}

================================================================================
[TYPOLOGY RULES]
================================================================================

${typology}

================================================================================
[ARCHITECTURAL CONTEXT]
================================================================================

Required rooms:
${requestedRooms.map(r => `- ${r}`).join('\n')}

Optional rooms:
- None

Floors:
- ${floorCount}

Layout intent:
- ${text.includes("open") ? "Open concept" : "Traditional/Closed plan"} residential layout

Relationship rules:
${normalizedRels}

Room constraints:
${constraintsList.join('\n')}

Excluded elements:
${excluded}

Detail flags:
- Room Labels: ON
- Walls: ON
- Doors: ON
- Windows: ON
- Floor Slabs: ON
- Balcony Railings: ON
- Furniture: OFF
- Fixtures: OFF

================================================================================
[STRUCTURED PROJECT INPUT]
================================================================================

${refinedBrief}

================================================================================
[BOUNDARY CONTEXT]
================================================================================

${boundaryContext}

================================================================================
[OUTPUT JSON SCHEMA]
================================================================================

${JSON.stringify(outputSchema, null, 2)}

================================================================================
[EXECUTION]
================================================================================

Generate one complete architectural floor-plan JSON using the supplied project input, boundary, architectural relationships, room constraints and schema.

Create one plan only.

Return valid JSON only.`;

  return { finalPrompt, systemInstruction: compactSystemInstruction };
};

export const generateFloorplan4 = async (
  designSummary: string, 
  boundaryPoints?: Point[]
) => {
  let boundaryContext = "Generate an optimal building footprint.";
  if (boundaryPoints && boundaryPoints.length > 2) {
    const coords = boundaryPoints.map(p => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(', ');
    boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
  }

  // Build the dynamic architectural prompt in the requested structure
  const { finalPrompt, systemInstruction } = buildFloorplanGenerationPrompt({
    refinedBrief: designSummary,
    boundaryContext,
    outputSchema: SHARED_SCHEMA
  });

  try {
    const requestStarted = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: [{ text: finalPrompt }] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA as any
      }
    });
    const requestFinished = typeof performance !== 'undefined' ? performance.now() : Date.now();
    console.info(`[Text 4.0] Gemini generation ${(requestFinished - requestStarted).toFixed(0)} ms`);

    if (!response.text) throw new Error("No response from Generative AI");
    
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Generative Floorplan 3 Error:", error);
    throw error;
  }
};
