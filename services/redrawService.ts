import { ai } from "./aiClient";
import { SHARED_SCHEMA, DIGITIZER_SCHEMA } from "./schema";
import { optimizeImage } from "./imageUtils";
import { ArchElement, Point, Project } from "../types";
import { FIXTURE_PRESETS, FURNITURE_PRESETS, INTERIOR_INVENTORY_STATS, getInteriorInventoryPromptList, normalizeInteriorElement } from "../constants";
import {
  normalizeRadians,
  pointOnCircularArc,
  quadraticControlForCircularArc,
} from "./geometry/curveGeometry";

const arrayPoint = (value: any): Point | null => (
  Array.isArray(value) && typeof value[0] === 'number' && typeof value[1] === 'number'
    ? { x: value[0], y: value[1] }
    : null
);

const maybeRadians = (value: any): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return Math.abs(value) > Math.PI * 2 + 0.0001 ? value * Math.PI / 180 : value;
};

const mapWallGeometry = (w: any, flipY: (y: number) => number): Partial<ArchElement> => {
  const flipPoint = (value: any): Point | null => {
    const point = arrayPoint(value);
    return point ? { x: point.x, y: flipY(point.y) } : null;
  };
  const p1 = flipPoint(w.p1);
  const p2 = flipPoint(w.p2);
  const base: Partial<ArchElement> = {
    p1: p1 || undefined,
    p2: p2 || undefined,
    thickness: w.type === 'exterior' ? 0.3 : 0.15,
  };
  const curveType = String(w.curveType || 'line').toLowerCase();
  const center = flipPoint(w.center);

  if (curveType === 'circle' && center && typeof w.radius === 'number' && w.radius > 0) {
    return {
      ...base,
      p1: center,
      p2: { x: center.x + w.radius, y: center.y },
      wallSource: 'circle',
      isCurved: true,
    };
  }

  if (curveType === 'ellipse' && center && (typeof w.radiusX === 'number' || typeof w.radius === 'number') && (typeof w.radiusY === 'number' || typeof w.radius === 'number')) {
    const radiusX = Math.max(0.001, Number(w.radiusX ?? w.radius));
    const radiusY = Math.max(0.001, Number(w.radiusY ?? w.radius));
    const startAngle = maybeRadians(w.startAngle);
    const endAngle = maybeRadians(w.endAngle);
    return {
      ...base,
      p1: p1 || { x: center.x - radiusX, y: center.y - radiusY },
      p2: p2 || { x: center.x + radiusX, y: center.y + radiusY },
      wallSource: 'ellipse',
      isCurved: true,
      ellipseCenter: center,
      ellipseRadiusX: radiusX,
      ellipseRadiusY: radiusY,
      ellipseRotation: normalizeRadians(-(maybeRadians(w.rotation) || 0)),
      ellipseStartAngle: startAngle !== undefined ? normalizeRadians(-startAngle) : undefined,
      ellipseEndAngle: endAngle !== undefined ? normalizeRadians(-endAngle) : undefined,
      ellipseCounterclockwise: typeof w.counterclockwise === 'boolean' ? w.counterclockwise : undefined,
    };
  }

  if (curveType === 'arc') {
    const radius = typeof w.radius === 'number' ? w.radius : undefined;
    const startAngle = maybeRadians(w.startAngle);
    const endAngle = maybeRadians(w.endAngle);
    if (center && radius && radius > 0 && startAngle !== undefined && endAngle !== undefined) {
      const appStart = normalizeRadians(-startAngle);
      const appEnd = normalizeRadians(-endAngle);
      return {
        ...base,
        p1: pointOnCircularArc(center, radius, appStart),
        p2: pointOnCircularArc(center, radius, appEnd),
        controlPoint: quadraticControlForCircularArc(center, radius, appStart, appEnd, Boolean(w.counterclockwise)),
        wallSource: 'arc',
        isCurved: true,
        arcCenter: center,
        arcRadius: radius,
        arcStartAngle: appStart,
        arcEndAngle: appEnd,
        arcCounterclockwise: Boolean(w.counterclockwise),
      };
    }
    const controlPoint = flipPoint(w.controlPoint);
    if (p1 && p2 && controlPoint) {
      return {
        ...base,
        p1,
        p2,
        controlPoint,
        wallSource: 'arc',
        isCurved: true,
      };
    }
  }

  return base;
};

export const generateFloorplanFromImage = async (base64Image: string) => {
  const systemInstruction = `
  YOU ARE A FAST AND PRECISE ARCHITECTURAL DIGITIZER.
  GOAL: Trace the provided floorplan image into a precise JSON data structure.
  
  CRITICAL RULES:
  1. **ORTHOGONALITY**: FORCE straight walls to be HORIZONTAL or VERTICAL unless clearly diagonal. If the source shows a curved wall, output it as curveType "arc", "circle", or "ellipse" with center/radius/angle fields instead of approximating it with many straight wall pieces.
  2. **SIMPLICITY**: Ignore minor noise. Capture the main wall centerlines.
  3. **CONNECTIVITY**: Ensure walls connect at corners. No gaps.
  4. **OPENING PLACEMENT**: DO NOT place doors, windows, or openings where another wall joins the host wall. Maintain at least 0.3m clearance from any wall junction or corner.
  5. **NO OVERLAPPING OPENINGS**: Ensure no two openings (doors, windows, wall openings) overlap or touch.
  6. **SCALE**: METERS. Assume standard door = 0.9m.
  7. **COMPONENTS**: Identify 'walls', 'doors', 'windows', 'stairs', 'furniture', and 'fixtures'.
  8. **LABELS**: Read room text if possible.
  9. **COORDINATE ORIENTATION (MANDATORY)**: You MUST use a standard Cartesian coordinate system where Y increases UPWARDS (North is +Y, South is -Y). Therefore, elements at the top of the image (North) MUST have LARGER Y coordinates than elements at the bottom of the image (South). Never output Y-increasing-downwards (image-space) coordinates.
  
  ### 3. FURNITURE, FIXTURES, AND COUNTERS PLACEMENT (CRITICAL)
  For any furniture, fixture, or countertop/island appearing in the floorplan image, place them in the 'furniture' or 'fixtures' list.
  You MUST choose the closest matching current catalog subtype from the inventory list below. Do NOT make up new IDs.
  
  **Available Furniture (${INTERIOR_INVENTORY_STATS.furniture} current items; use in 'furniture' list):**
${getInteriorInventoryPromptList(FURNITURE_PRESETS)}

  **Available Fixtures & Counters (${INTERIOR_INVENTORY_STATS.fixturesAndCounters} current items; use in 'fixtures' list):**
${getInteriorInventoryPromptList(FIXTURE_PRESETS)}

  For each detected object, set:
  1. 'subType': The exact string ID from the inventory list above.
  2. 'width' & 'depth': Use specified standard sizes as default, or adapt slightly based on visual proportions in the plan.
  3. 'pos': [x, y] coordinates representing the center of the object.
  4. 'rotation': Rotation angle in degrees (0, 90, 180, 270) to align the object correctly relative to walls/orientation.

  Use 'flash' speed but maintain 'pro' structural logic.
  `;

  // Use optimization to ensure speed.
  const optimizedImage = await optimizeImage(base64Image, 800);
  const mimeTypeMatch = optimizedImage.match(/^data:(image\/[a-zA-Z]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
  const data = optimizedImage.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

  const prompt = `Digitize this floorplan. Enforce straight lines and connected walls. Detect furniture, fixtures, and counters placement and map them precisely using only the IDs in our inventory.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', 
      contents: [{ parts: [
        { text: prompt }, 
        { inlineData: { data, mimeType } }
      ] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA as any
      }
    });

    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Image Redraw Error:", error);
    throw error;
  }
};

export const generateFloorplanRedrawV2 = async (base64Image: string) => {
  const systemInstruction = `
  YOU ARE "REDRAW 2.0" - AN ELITE ARCHITECTURAL RECONSTRUCTION ENGINE.
  GOAL: Produce a 100% ACCURATE, EXACT TRACING of the provided floorplan image into JSON (Shell Only).
  DO NOT REDESIGN OR ALTER THE LAYOUT. Your job is to create a "ditto copy" of the provided image.

  ### 1. DRAFTING INTEGRITY (CRITICAL)
  - **EXACT MATCH**: Trace the walls exactly as they appear in the image. Do not move rooms, change proportions, or alter the layout.
  - **CLOSED LOOPS**: Rooms must be enclosed. No floating or disconnected walls.
  - **HOSTING LOGIC**: Doors and Windows MUST be placed ON TOP of walls exactly where they are in the image.
  - **JUNCTION CLEARANCE**: Even if the source image shows a door at a junction, manually shift it slightly to ensure it is NOT touching or overlapping where another wall meets the host wall. Minimum 0.3m clearance required.
  - **NO OVERLAPPING OPENINGS**: Ensure no two openings (doors, windows, wall openings) overlap or touch. Maintain minimum 0.5m between any two openings.
  - **ORTHOGONALITY**: Straight walls should be 90-degree aligned (Manhattan layout) unless the building is clearly rotated. Preserve any visibly curved wall using curveType "arc", "circle", or "ellipse" with center/radius/angle fields.
  - **SCALE**: CALIBRATE using standard door width = 0.9 meters. Use the dimensions written on the plan if available to ensure accurate relative sizing.
  - **COORDINATE ORIENTATION (MANDATORY)**: You MUST use a standard Cartesian coordinate system where Y increases UPWARDS (North is +Y, South is -Y). Therefore, elements/rooms at the top of the image (North) MUST have LARGER Y coordinates than elements/rooms at the bottom of the image (South). Never output Y-increasing-downwards (image-space) coordinates.

  ### 2. DATA SCHEMA
  - Use 'walls', 'doors', 'windows', 'rooms'.
  - Label rooms exactly as they are labeled in the image.
  - Do NOT generate 'furniture' or 'fixtures'. Keep the plan architectural.
  `;

  // Use optimization to keep payload manageable, but rely on Pro model for logic
  const optimizedImage = await optimizeImage(base64Image, 800);
  const mimeTypeMatch = optimizedImage.match(/^data:(image\/[a-zA-Z]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
  const data = optimizedImage.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

  const prompt = `Trace this floorplan exactly as it is. Create a 100% accurate ditto copy. Do not redesign or alter the layout. Do not include furniture or fixtures.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Switch to flash model for faster generation
      contents: [{ parts: [
        { text: prompt }, 
        { inlineData: { data, mimeType } }
      ] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA as any
      }
    });

    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Redraw 2.0 Error:", error);
    throw error;
  }
};

export const generateFloorplanDigitizer = async (base64Image: string) => {
  const systemInstruction = `
  YOU ARE AN ELITE HIGH-PRECISION CAD DRAFTSMAN AND FORENSIC VECTORIZATION ENGINE focusing exclusively on geometry.
  GOAL: Produce a 100% FAITHFUL, METICULOUSLY ACCURATE RECREATION of the provided floorplan's structural geometry into JSON.

  ### IMPORTANT RULE (FOCUS ONLY ON GEOMETRY):
  - DO NOT digitize, trace, or extract any Labels (Text), room names, dimensions, or text strings. Skip all annotations and text entirely.
  - DO NOT digitize, trace, or place any Furniture, Fixture, Counter, appliance, cabinet, wardrobe, or other furnishing/movable items. Strictly ignore them.
  - Focus your full attention and context window strictly on Walls, Doors, Windows, and Wall Openings to improve geometric precision.

  You act purely as a geometric tracing tool. Do NOT redesign. Do NOT correct "errors" or improve layouts. Do NOT add architectural modifications. If a wall is there, trace it. If there is a door, trace its exact position and style (single, double, sliding).

  ### 1. DRAFTING INTEGRITY & MICROSCOPIC DETAILS (CRITICAL)
  - **ZOOM IN ON GEOMETRY DETAILS**: Carefully examine every nook, partition, and wall line. Do not miss small spaces like closet boundary walls or partition walls.
  - **DOOR SUBTYPES**:
    * Carefully differentiate between swing doors ('single', 'double') and sliding doors ('sliding') commonly used in wardrobes, stores, or balconies.
    * Identify sliding doors by parallel double-track lines or sliding panes, and label them precisely as type: "sliding".
  - **EXACT WALL PLACEMENT**:
    * Outer boundary walls are thick (type: "exterior").
    * Internal dividing walls and partition walls are thinner (type: "interior" or "partition").
    * Make sure every partition wall is modeled with precise start (p1) and end (p2) coordinates.
    * If a wall is curved, use curveType "arc", "circle", or "ellipse" with center/radius/angle fields. Do not break a smooth curve into many short straight walls.
  - **CLOSED LOOPS & CONNECTIONS**: Ensure all walls snap and join properly at corners so rooms are closed. No gaps or disconnected segments.
  - **HOSTING LOGIC**: Host doors and windows directly on the corresponding walls. Maintain 0.3m clearance from junctions or corners.
  - **SCALE**: Map dimensions proportionally. Map coordinates in meters. Assume standard door = 0.9m.
  - **COORDINATE ORIENTATION (MANDATORY)**: You MUST use a standard Cartesian coordinate system where Y increases UPWARDS (North is +Y, South is -Y). Therefore, elements/rooms at the top of the image (North) MUST have LARGER Y coordinates than elements/rooms at the bottom of the image (South). Never output Y-increasing-downwards (image-space) coordinates.
  `;

  // Increase width limit to 1400px to preserve small details like sliding doors, while staying lightning-fast.
  const optimizedImage = await optimizeImage(base64Image, 1400);
  const mimeTypeMatch = optimizedImage.match(/^data:(image\/[a-zA-Z]+);base64,/);
  const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';
  const data = optimizedImage.replace(/^data:image\/[a-zA-Z]+;base64,/, "");

  const prompt = `Perform a forensic trace of this floorplan image. Capture all structural elements: walls, partition lines, sliding doors, swing doors, windows, and wall openings. Strictly skip and ignore all text labels, room names, annotations, furniture, fixtures, and counter/appliances/furnishing items.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview', // Works with gemini, is as quick as Redraw 2.0
      contents: [{ parts: [
        { text: prompt },
        { inlineData: { data, mimeType } }
      ] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: DIGITIZER_SCHEMA as any
      }
    });

    if (!response.text) throw new Error("No response from AI");
    return JSON.parse(response.text);

  } catch (error) {
    console.error("Digitizer Error:", error);
    throw error;
  }
};

export const digitizeFloorplanV2 = async (base64Image: string): Promise<Project> => {
  try {
     const data = await generateFloorplanDigitizer(base64Image);
     
     // Find bounding box to invert Y-axis (mapping Cartesian up-increasing to Canvas down-increasing)
     let minY = Infinity, maxY = -Infinity;
     const collectY = (p: any) => {
       if (p && typeof p[1] === 'number') {
         minY = Math.min(minY, p[1]);
         maxY = Math.max(maxY, p[1]);
       }
     };
     
     data.walls?.forEach((w: any) => { collectY(w.p1); collectY(w.p2); collectY(w.center); collectY(w.controlPoint); });
     data.railings?.forEach((r: any) => { collectY(r.p1); collectY(r.p2); });
     data.doors?.forEach((d: any) => { collectY(d.pos); });
     data.windows?.forEach((w: any) => { collectY(w.pos); });
     data.rooms?.forEach((r: any) => { collectY(r.pos); });
     data.columns?.forEach((c: any) => { collectY(c.pos); });
     data.stairs?.forEach((s: any) => { collectY(s.p1); collectY(s.p2); });
     data.slabs?.forEach((s: any) => { s.boundary?.forEach((p: any) => collectY(p)); });
     data.furniture?.forEach((f: any) => { collectY(f.pos); });
     data.fixtures?.forEach((f: any) => { collectY(f.pos); });
     
     const hasY = minY !== Infinity && maxY !== -Infinity;
     const flipY = (y: number) => hasY ? (maxY + minY - y) : y;

     // Fallback mapping for digitize (Level 0)
     const mapEl = (list: any[], type: any, mapper: any) => (list || []).map((item: any) => ({ ...mapper(item), id: crypto.randomUUID(), type, levelId: 'level-1' }));
     
     return {
        name: "Digitized Plan",
        mode: 'floorplan',
        viewBox: { width: 20, height: 20 },
        levels: [], 
        elements: [
            ...mapEl(data.walls, 'wall', (w:any) => mapWallGeometry(w, flipY)),
            ...mapEl(data.railings, 'railing', (r:any) => ({ p1: {x:r.p1[0],y:flipY(r.p1[1])}, p2: {x:r.p2[0],y:flipY(r.p2[1])} })),
            ...mapEl(data.doors, 'door', (d:any) => ({ pos: {x:d.pos[0],y:flipY(d.pos[1])}, width: d.width, rotation: d.rotation, subType: d.type })),
            ...mapEl(data.windows, 'window', (w:any) => ({ pos: {x:w.pos[0],y:flipY(w.pos[1])}, width: w.width, rotation: w.rotation, subType: w.type })),
            ...mapEl(data.rooms, 'room', (r:any) => ({ pos: {x:r.pos[0],y:flipY(r.pos[1])}, label: r.label })),
            ...mapEl(data.columns, 'column', (c:any) => ({ pos: {x:c.pos[0],y:flipY(c.pos[1])}, width: c.width, depth: c.depth, shape: c.shape })),
            ...mapEl(data.stairs, 'stair', (s:any) => ({ p1: {x:s.p1[0],y:flipY(s.p1[1])}, p2: {x:s.p2[0],y:flipY(s.p2[1])}, width: s.width, subType: s.shape })),
            ...mapEl(data.slabs, 'floor', (s:any) => ({ boundary: s.boundary.map((p:any) => ({x:p[0], y:flipY(p[1])})), type: s.type })),
            ...(data.furniture || []).map((f: any) => normalizeInteriorElement({
              id: crypto.randomUUID(),
              type: 'furniture',
              pos: { x: f.pos[0], y: flipY(f.pos[1]) },
              width: f.width,
              depth: f.depth,
              rotation: f.rotation,
              subType: f.subType,
              isDigitized: true,
              levelId: 'level-1'
            })),
            ...(data.fixtures || []).map((f: any) => {
              const itemType = (f.subType === 'cntr_kitchen' || f.subType === 'cntr_island') ? 'counter' : 'fixture';
              return normalizeInteriorElement({
                id: crypto.randomUUID(),
                type: itemType,
                pos: { x: f.pos[0], y: flipY(f.pos[1]) },
                width: f.width,
                depth: f.depth,
                rotation: f.rotation,
                subType: f.subType,
                isDigitized: true,
                levelId: 'level-1'
              });
            })
        ]
     };
  } catch (e) { throw e; }
};

export const digitizeFloorplan = async (base64Image: string): Promise<Project> => {
  try {
     // Default to standard redraw for simple drag-drop uploads
     const data = await generateFloorplanFromImage(base64Image);
     
     // Find bounding box to invert Y-axis (mapping Cartesian up-increasing to Canvas down-increasing)
     let minY = Infinity, maxY = -Infinity;
     const collectY = (p: any) => {
       if (p && typeof p[1] === 'number') {
         minY = Math.min(minY, p[1]);
         maxY = Math.max(maxY, p[1]);
       }
     };
     
     data.walls?.forEach((w: any) => { collectY(w.p1); collectY(w.p2); collectY(w.center); collectY(w.controlPoint); });
     data.railings?.forEach((r: any) => { collectY(r.p1); collectY(r.p2); });
     data.doors?.forEach((d: any) => { collectY(d.pos); });
     data.windows?.forEach((w: any) => { collectY(w.pos); });
     data.rooms?.forEach((r: any) => { collectY(r.pos); });
     data.columns?.forEach((c: any) => { collectY(c.pos); });
     data.stairs?.forEach((s: any) => { collectY(s.p1); collectY(s.p2); });
     data.slabs?.forEach((s: any) => { s.boundary?.forEach((p: any) => collectY(p)); });
     data.furniture?.forEach((f: any) => { collectY(f.pos); });
     data.fixtures?.forEach((f: any) => { collectY(f.pos); });
     
     const hasY = minY !== Infinity && maxY !== -Infinity;
     const flipY = (y: number) => hasY ? (maxY + minY - y) : y;
 
     // Fallback mapping for digitize (Level 0)
     const mapEl = (list: any[], type: any, mapper: any) => (list || []).map((item: any) => ({ ...mapper(item), id: crypto.randomUUID(), type, levelId: 'level-1' }));
     
     return {
        name: "Digitized Plan",
        mode: 'floorplan',
        viewBox: { width: 20, height: 20 },
        levels: [], 
        elements: [
            ...mapEl(data.walls, 'wall', (w:any) => mapWallGeometry(w, flipY)),
            ...mapEl(data.railings, 'railing', (r:any) => ({ p1: {x:r.p1[0],y:flipY(r.p1[1])}, p2: {x:r.p2[0],y:flipY(r.p2[1])} })),
            ...mapEl(data.doors, 'door', (d:any) => ({ pos: {x:d.pos[0],y:flipY(d.pos[1])}, width: d.width, rotation: d.rotation, subType: d.type })),
            ...mapEl(data.windows, 'window', (w:any) => ({ pos: {x:w.pos[0],y:flipY(w.pos[1])}, width: w.width, rotation: w.rotation, subType: w.type })),
            ...mapEl(data.rooms, 'room', (r:any) => ({ pos: {x:r.pos[0],y:flipY(r.pos[1])}, label: r.label })),
            ...mapEl(data.columns, 'column', (c:any) => ({ pos: {x:c.pos[0],y:flipY(c.pos[1])}, width: c.width, depth: c.depth, shape: c.shape })),
            ...mapEl(data.stairs, 'stair', (s:any) => ({ p1: {x:s.p1[0],y:flipY(s.p1[1])}, p2: {x:s.p2[0],y:flipY(s.p2[1])}, width: s.width, subType: s.shape })),
            ...mapEl(data.slabs, 'floor', (s:any) => ({ boundary: s.boundary.map((p:any) => ({x:p[0], y:flipY(p[1])})), type: s.type })),
            ...(data.furniture || []).map((f: any) => normalizeInteriorElement({
              id: crypto.randomUUID(),
              type: 'furniture',
              pos: { x: f.pos[0], y: flipY(f.pos[1]) },
              width: f.width,
              depth: f.depth,
              rotation: f.rotation,
              subType: f.subType,
              levelId: 'level-1'
            })),
            ...(data.fixtures || []).map((f: any) => {
              const itemType = (f.subType === 'cntr_kitchen' || f.subType === 'cntr_island') ? 'counter' : 'fixture';
               return normalizeInteriorElement({
                 id: crypto.randomUUID(),
                 type: itemType,
                 pos: { x: f.pos[0], y: flipY(f.pos[1]) },
                 width: f.width,
                 depth: f.depth,
                 rotation: f.rotation,
                 subType: f.subType,
                 levelId: 'level-1'
               });
            })
        ]
     };
  } catch (e) { throw e; }
};
