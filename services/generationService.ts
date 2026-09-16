import { ai } from "./aiClient";
import { SHARED_SCHEMA } from "./schema";
import { Point } from "../types";

export const generateFloorplan = async (
  designSummary: string, 
  boundaryPoints?: Point[]
) => {
  const systemInstruction = `
YOU ARE A LICENSED ARCHITECTURAL DESIGN ENGINE.

YOUR TASK: Design a professional, scale-accurate floorplan with correct logic.

=============================
1. SCALE, UNITS, & COORDINATES
=============================
- **Output Coordinates in METERS**.
- **COORDINATE ORIENTATION (MANDATORY)**: You MUST use a standard Cartesian coordinate system where Y increases UPWARDS (North is +Y, South is -Y). Therefore, elements/rooms at the top of the plan (North) MUST have LARGER Y coordinates than elements/rooms at the bottom of the plan (South). Never output Y-increasing-downwards (image-space) coordinates.
- Standard Dimensions:
  * Door Width: 0.9m (Single), 1.6m (Double/Sliding).
  * Ext. Wall: 0.23m | Int. Wall: 0.15m.
  * Bedroom: ~3.5m x 4m.
- **DO NOT** create giant stadiums. A house is ~10-20m wide.

=============================
2. ARCHITECTURAL LOGIC
=============================
- **STAIRS**: 
  * **IF 1 FLOOR**: DO NOT GENERATE STAIRS.
  * **IF >1 FLOOR**: Place stairs in circulation zones (Hall/Foyer). NEVER inside a private room (Bed/Bath).
  * Use 'stairs' tool object.
- **DOORS**: 
  * Use VARIETY. Do not just use 'single'.
  * 'double' for Main Entry.
  * 'sliding' for Balconies/Closets.
  * 'single' for Bedrooms/Baths.
- **WINDOWS**: Place on exterior walls. Use 'bay' or 'full-height' for living areas.
- **BALCONIES (STRICT & MANDATORY)**: If a balcony is requested, you MUST generate a dedicated 'floor' slab for it extending outward from the main building envelope. You MUST explicitly populate the 'railings' array with linear segments (using p1 and p2 coordinates in meters) that trace the outer exposed perimeter edges of the balcony floor slab. Access to the balcony must be via a large window (minimum 1.8m / 6ft wide) or sliding doors on the shared wall.
- **BEDROOM ACCESS RULES (STRICT & MANDATORY)**: ALL types of rooms with beds (e.g. Master Bedroom, Bedroom 2, guest bedroom) must be directly accessible ONLY from public circulation spaces (e.g. Living Room, Corridor, Foyer, Patio, or Entry area). Bedrooms may or may not open into private ensuite bathrooms/powder rooms, but their main entry door must NEVER open into a Kitchen, and their primary access route must NEVER pass through a bathroom, powder room, kitchen, laundry room, or utility room.
- **CORRIDORS (STRICT & MANDATORY)**: EVERY Corridor/Hallway must connect directly to a public space (e.g., Living Area, Foyer, or another Corridor) so that it is never landlocked.
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS (MUST GENERATE ALL)
=============================
- **Slabs**: Generate a 'floor' slab for EVERY single room/zone (e.g., Bedrooms, Kitchen, Living, Bathrooms, Corridors) and for the Balcony. The boundary coordinates of each slab must match the footprint of its respective room.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, slabs, and railings.

=============================
OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;

  let boundaryContext = "Generate an optimal building footprint.";
  if (boundaryPoints && boundaryPoints.length > 2) {
    const coords = boundaryPoints.map(p => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(', ');
    boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
  }

  const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA as any
      }
    });

    if (!response.text) throw new Error("No response from Generative AI");
    
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Generative Floorplan Error:", error);
    throw error;
  }
};
