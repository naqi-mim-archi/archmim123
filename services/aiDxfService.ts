import { ai } from "./aiClient";
import { ArchElement, Point } from "../types";
import { pairLinesToWalls } from "./dxfImportService";
import { Type } from "@google/genai";
import { INTERIOR_FIXTURE_COUNTER_SUBTYPES, INTERIOR_FURNITURE_SUBTYPES, INTERIOR_INVENTORY_STATS, normalizeInteriorElement } from "../constants";
import {
  normalizeRadians,
  pointOnCircularArc,
  quadraticControlForCircularArc,
} from "./geometry/curveGeometry";

// Schema for the Gemini response
const AI_CONVERSION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    walls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          p1: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Start point [x, y]" },
          p2: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "End point [x, y]" },
          curveType: { type: Type.STRING, enum: ["line", "arc", "circle", "ellipse"], description: "Use arc/circle/ellipse for curved walls instead of approximating them with short straight walls." },
          center: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Curve center [x, y] for arc/circle/ellipse." },
          radius: { type: Type.NUMBER, description: "Circle or circular arc radius in meters." },
          startAngle: { type: Type.NUMBER, description: "Curve start angle in radians in the drawing coordinate system." },
          endAngle: { type: Type.NUMBER, description: "Curve end angle in radians in the drawing coordinate system." },
          counterclockwise: { type: Type.BOOLEAN, description: "Whether the arc follows counterclockwise direction from startAngle to endAngle." },
          radiusX: { type: Type.NUMBER, description: "Ellipse X radius in meters." },
          radiusY: { type: Type.NUMBER, description: "Ellipse Y radius in meters." },
          rotation: { type: Type.NUMBER, description: "Ellipse rotation in radians." },
          controlPoint: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Optional quadratic control point [x, y] if center/radius cannot be estimated." },
          type: { type: Type.STRING, enum: ["exterior", "interior", "partition", "glass"] },
          thickness: { type: Type.NUMBER, description: "Wall thickness in meters" }
        },
        required: ["p1", "p2", "type"]
      }
    },
    doors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Position [x, y]" },
          rotation: { type: Type.NUMBER, description: "Rotation angle in degrees" },
          type: { type: Type.STRING, enum: ["single", "double", "sliding", "folding", "pocket", "glass"] },
          width: { type: Type.NUMBER, description: "Door width in meters (e.g. 0.9)" }
        },
        required: ["pos", "rotation", "type", "width"]
      }
    },
    windows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Position [x, y]" },
          rotation: { type: Type.NUMBER, description: "Rotation angle in degrees" },
          type: { type: Type.STRING, enum: ["standard", "angled-bay", "box-bay", "curved-bay", "full-height"] },
          width: { type: Type.NUMBER, description: "Window width in meters" }
        },
        required: ["pos", "rotation", "type", "width"]
      }
    },
    openings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Position [x, y]" },
          rotation: { type: Type.NUMBER, description: "Rotation angle in degrees" },
          width: { type: Type.NUMBER, description: "Opening width in meters" }
        },
        required: ["pos", "width"]
      }
    },
    columns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Position [x, y]" },
          width: { type: Type.NUMBER, description: "Width in meters" },
          depth: { type: Type.NUMBER, description: "Depth in meters" },
          shape: { type: Type.STRING, enum: ["rect", "circle"] }
        },
        required: ["pos", "width", "depth", "shape"]
      }
    },
    stairs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          p1: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Start point [x, y] of stair centerline run" },
          p2: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "End point [x, y] of stair centerline run" },
          type: { type: Type.STRING, enum: ["linear", "L", "U", "spiral"] },
          width: { type: Type.NUMBER, description: "Stair flight width in meters (default is 1.05)" }
        },
        required: ["p1", "p2", "type"]
      }
    },
    railings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          p1: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Start point [x, y]" },
          p2: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "End point [x, y]" },
          height: { type: Type.NUMBER, description: "Railing height in meters" }
        },
        required: ["p1", "p2"]
      }
    },
    furniture: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Position [x, y]" },
          rotation: { type: Type.NUMBER, description: "Rotation angle in degrees" },
          type: {
            type: Type.STRING,
            enum: INTERIOR_FURNITURE_SUBTYPES,
            description: `Matches closest current furniture preset item. ${INTERIOR_INVENTORY_STATS.furniture} furniture items available.`
          },
          width: { type: Type.NUMBER, description: "Width in meters" },
          depth: { type: Type.NUMBER, description: "Depth in meters" }
        },
        required: ["pos", "type"]
      }
    },
    fixtures: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Position [x, y]" },
          rotation: { type: Type.NUMBER, description: "Rotation angle in degrees" },
          type: {
            type: Type.STRING,
            enum: INTERIOR_FIXTURE_COUNTER_SUBTYPES,
            description: `Matches closest current fixture or counter preset item. ${INTERIOR_INVENTORY_STATS.fixturesAndCounters} fixture/counter items available.`
          },
          width: { type: Type.NUMBER, description: "Width in meters" },
          depth: { type: Type.NUMBER, description: "Depth in meters" }
        },
        required: ["pos", "type"]
      }
    },
    rooms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          label: { type: Type.STRING, description: "Room label e.g. 'LIVING', 'BEDROOM 1', 'KITCHEN'" },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Position [x, y]" }
        },
        required: ["label", "pos"]
      }
    },
    dimensions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          p1: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Start of dimension line [x, y]" },
          p2: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "End of dimension line [x, y]" }
        },
        required: ["p1", "p2"]
      }
    }
  },
  required: ["walls", "doors", "windows", "rooms", "stairs"]
};

const arrayPoint = (value: any): Point | null => (
  Array.isArray(value) && typeof value[0] === "number" && typeof value[1] === "number"
    ? { x: value[0], y: value[1] }
    : null
);

const maybeRadians = (value: any): number | undefined => {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.abs(value) > Math.PI * 2 + 0.0001 ? value * Math.PI / 180 : value;
};

const wallFromAi = (w: any, levelId: string, parentUnderlayId: string): ArchElement | null => {
  const p1 = arrayPoint(w.p1);
  const p2 = arrayPoint(w.p2);
  if (!p1 || !p2) return null;
  const base: ArchElement = {
    id: crypto.randomUUID(),
    type: "wall",
    p1,
    p2,
    thickness: w.thickness || 0.15,
    height: 3.0,
    levelId,
    parentUnderlayId,
    subType: w.type === "exterior" ? "exterior" : "interior",
  };
  const curveType = String(w.curveType || "line").toLowerCase();
  const center = arrayPoint(w.center);
  if (curveType === "circle" && center && typeof w.radius === "number" && w.radius > 0) {
    return {
      ...base,
      p1: center,
      p2: { x: center.x + w.radius, y: center.y },
      wallSource: "circle",
      isCurved: true,
    };
  }
  if (curveType === "ellipse" && center && (typeof w.radiusX === "number" || typeof w.radius === "number") && (typeof w.radiusY === "number" || typeof w.radius === "number")) {
    const radiusX = Math.max(0.001, Number(w.radiusX ?? w.radius));
    const radiusY = Math.max(0.001, Number(w.radiusY ?? w.radius));
    return {
      ...base,
      wallSource: "ellipse",
      isCurved: true,
      ellipseCenter: center,
      ellipseRadiusX: radiusX,
      ellipseRadiusY: radiusY,
      ellipseRotation: normalizeRadians(maybeRadians(w.rotation) || 0),
      ellipseStartAngle: maybeRadians(w.startAngle),
      ellipseEndAngle: maybeRadians(w.endAngle),
      ellipseCounterclockwise: typeof w.counterclockwise === "boolean" ? w.counterclockwise : undefined,
    };
  }
  if (curveType === "arc") {
    const radius = typeof w.radius === "number" ? w.radius : undefined;
    const startAngle = maybeRadians(w.startAngle);
    const endAngle = maybeRadians(w.endAngle);
    if (center && radius && radius > 0 && startAngle !== undefined && endAngle !== undefined) {
      return {
        ...base,
        p1: pointOnCircularArc(center, radius, startAngle),
        p2: pointOnCircularArc(center, radius, endAngle),
        controlPoint: quadraticControlForCircularArc(center, radius, startAngle, endAngle, Boolean(w.counterclockwise)),
        wallSource: "arc",
        isCurved: true,
        arcCenter: center,
        arcRadius: radius,
        arcStartAngle: normalizeRadians(startAngle),
        arcEndAngle: normalizeRadians(endAngle),
        arcCounterclockwise: Boolean(w.counterclockwise),
      };
    }
    const controlPoint = arrayPoint(w.controlPoint);
    if (controlPoint) {
      return {
        ...base,
        controlPoint,
        wallSource: "arc",
        isCurved: true,
      };
    }
  }
  return base;
};

export const convertDxfWithAI = async (
  underlayId: string,
  levelId: string,
  elementsToConvert: ArchElement[]
): Promise<ArchElement[]> => {
  if (!elementsToConvert || elementsToConvert.length === 0) {
    return [];
  }

  const parentUnderlayId = underlayId;

  // 1. Separate layers to make a compact layer index representation
  const layersSet = new Set<string>();
  elementsToConvert.forEach((el) => {
    if (el.layer) layersSet.add(el.layer);
  });
  const layersList = Array.from(layersSet);

  // Helper to get layer index
  const getLayerIdx = (layer?: string) => {
    if (!layer) return -1;
    return layersList.indexOf(layer);
  };

  // 2. Classify and compress elements for the Gemini prompt
  const compactLines: any[] = [];
  const compactArcs: any[] = [];
  const compactCircles: any[] = [];
  const compactLabels: any[] = [];

  const rawLinesForPairing: any[] = [];

  elementsToConvert.forEach((el) => {
    const layerIdx = getLayerIdx(el.layer);
    if (el.type === "line" && el.p1 && el.p2) {
      const len = Math.hypot(el.p2.x - el.p1.x, el.p2.y - el.p1.y);
      // Collect for mathematical pairing
      rawLinesForPairing.push({ p1: el.p1, p2: el.p2, layer: el.layer || "0" });
      
      // Compact line representation to save tokens: [x1, y1, x2, y2, layerIdx]
      if (len > 0.05) { // Skip microscopic segments in prompt
        compactLines.push([
          Number(el.p1.x.toFixed(3)),
          Number(el.p1.y.toFixed(3)),
          Number(el.p2.x.toFixed(3)),
          Number(el.p2.y.toFixed(3)),
          layerIdx
        ]);
      }
    } else if (el.type === "arc" && el.p1 && el.p2) {
      compactArcs.push({
        p1: [Number(el.p1.x.toFixed(3)), Number(el.p1.y.toFixed(3))],
        p2: [Number(el.p2.x.toFixed(3)), Number(el.p2.y.toFixed(3))],
        center: el.arcCenter ? [Number(el.arcCenter.x.toFixed(3)), Number(el.arcCenter.y.toFixed(3))] : undefined,
        radius: el.arcRadius !== undefined ? Number(el.arcRadius.toFixed(3)) : undefined,
        startAngle: el.arcStartAngle !== undefined ? Number(el.arcStartAngle.toFixed(6)) : undefined,
        endAngle: el.arcEndAngle !== undefined ? Number(el.arcEndAngle.toFixed(6)) : undefined,
        counterclockwise: el.arcCounterclockwise,
        layer: layerIdx,
      });
    } else if (el.type === "circle" && el.p1 && el.p2) {
      const cx = el.p1.x;
      const cy = el.p1.y;
      const radius = Math.hypot(el.p2.x - el.p1.x, el.p2.y - el.p1.y);
      compactCircles.push([
        Number(cx.toFixed(3)),
        Number(cy.toFixed(3)),
        Number(radius.toFixed(3)),
        layerIdx
      ]);
    } else if (el.type === "label" && el.pos && el.label) {
      compactLabels.push([
        Number(el.pos.x.toFixed(3)),
        Number(el.pos.y.toFixed(3)),
        el.label,
        layerIdx
      ]);
    }
  });

  // 3. Pre-process using mathematical pairing to give Gemini a strong structural baseline
  const { walls: pairedWalls } = pairLinesToWalls(rawLinesForPairing);
  const compactPairedWalls = pairedWalls.map((w) => ({
    p1: [Number(w.p1!.x.toFixed(3)), Number(w.p1!.y.toFixed(3))],
    p2: [Number(w.p2!.x.toFixed(3)), Number(w.p2!.y.toFixed(3))],
    type: w.subType === "exterior" ? "exterior" : "interior",
    thickness: w.thickness || 0.15
  }));

  // Downsample compact lines if they are extremely numerous to keep API fast and correct
  const maxLinesInPrompt = 600;
  let finalCompactLines = compactLines;
  if (compactLines.length > maxLinesInPrompt) {
    finalCompactLines = [...compactLines]
      .map((line) => {
        const len = Math.hypot(line[2] - line[0], line[3] - line[1]);
        return { line, len };
      })
      .sort((a, b) => b.len - a.len)
      .slice(0, maxLinesInPrompt)
      .map((item) => item.line);
  }

  // 4. Construct the prompt
  const drawingData = {
    layers: layersList,
    paired_walls_baseline: compactPairedWalls,
    raw_elements: {
      lines: finalCompactLines,
      arcs: compactArcs,
      circles: compactCircles,
      labels: compactLabels
    }
  };

  const systemInstruction = `
YOU ARE AN ELITE ARCHITECTURAL CAD VECTOR INTERPRETER AND RECONSTRUCTION ENGINE.

YOUR TASK:
Read a summarized set of CAD vector features (lines, arcs, circles, labels) left by the user on the canvas, along with a mathematically generated "paired_walls_baseline". Use them to construct a highly accurate, fully connected, premium architectural layout consisting of Walls, Doors, Windows, Wall Openings, Columns, Stairs, Railings, Furniture Items, Fixtures, Counters, and Room Labels.

CRITICAL INSTRUCTIONS:
1. **Walls**: 
   - Start with the "paired_walls_baseline" as your high-quality wall segments. You can output them, adjust them, merge close parallel/perpendicular segments to make them perfectly continuous, and ADD any missing walls indicated by the raw lines.
   - If a wall is genuinely curved in raw arcs/circles, output one wall with curveType "arc", "circle", or "ellipse" plus center/radius/startAngle/endAngle fields. Do not approximate smooth walls with many tiny straight wall records.
   - Use standard thicknesses:
     - "exterior": 0.23m - 0.30m (for outer main walls)
     - "interior": 0.115m - 0.15m (for general interior structural/partition walls)
     - "partition": 0.075m (for lightweight screens or bathroom dividers)
     - "glass": 0.012m (for office/meeting room glass dividers)
2. **Doors & Windows**:
   - Locate door arcs (swings) and lines on "DOOR", "DR" layers. Convert them into Doors. Set correct subtypes: "single", "double", "sliding", "folding", "pocket", "glass".
   - Locate windows. Set correct subtypes: "standard", "angled-bay", "box-bay", "curved-bay", "full-height".
   - Ensure you output correct rotation angles (in degrees) so doors and windows align parallel to the walls they belong to.
3. **Stairs**:
   - Detect stairs, which are typically a group of parallel lines or a rectangular boundary containing steps. Specify their centerline run using "p1" (start) and "p2" (end), with correct subtype: "linear", "L", "U", "spiral". Set width.
4. **Railings**:
   - Place railings ("p1" to "p2") along open edges, balconies, or stair runs where needed.
5. **Furniture & Fixtures / Counters**:
   - Act as a smart interior designer and floorplan architect. Locate chairs, beds, sofas, tables, desks, wash basins, showers, toilets (WCs), stoves, refrigerators, and counters from circles/rectangles/symbols and layers, and output them at their precise locations and rotations. Match them to the closest standard preset subtypes.
6. **Rooms & Labels**:
   - Map room tags (like 'LIVING', 'BEDROOM 1', 'KITCHEN') to their exact physical locations.
7. **Dimensions**:
   - Place dimension lines ("p1" to "p2") to document room bounds or main wall lengths.

OUTPUT FORMAT:
Return a valid, strict JSON object matching the requested schema. No markdown other than json.
`;

  const prompt = `
Analyze the following CAD floorplan drawing data and reconstruct a complete, fully furnished architectural floorplan layout. Ensure all walls, doors, windows, openings, columns, stairs, railings, furniture, fixtures, counters, and rooms are fully mapped and correct.

Drawing Data:
${JSON.stringify(drawingData, null, 2)}
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: AI_CONVERSION_SCHEMA as any
      }
    });

    if (!response.text) throw new Error("No response from AI Conversion Engine");

    const parsedData = JSON.parse(response.text);
    const convertedElements: ArchElement[] = [];

    // Helper to snap pos to nearest wall and get wall angle
    const snapToWall = (pos: Point) => {
      let minD = Infinity;
      let angle = 0;
      
      const wallsToUse = parsedData.walls || compactPairedWalls;

      for (const w of wallsToUse) {
        if (!w.p1 || !w.p2) continue;
        const wp1 = { x: w.p1[0], y: w.p1[1] };
        const wp2 = { x: w.p2[0], y: w.p2[1] };
        const dx = wp2.x - wp1.x;
        const dy = wp2.y - wp1.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq < 0.001) continue;

        let t = ((pos.x - wp1.x) * dx + (pos.y - wp1.y) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        const px = wp1.x + t * dx;
        const py = wp1.y + t * dy;
        const d = Math.hypot(pos.x - px, pos.y - py);

        if (d < minD) {
          minD = d;
          angle = Math.atan2(dy, dx) * (180 / Math.PI);
        }
      }
      return { dist: minD, angle };
    };

    // --- 5. MAP RECONSTRUCTED AI ELEMENTS TO ArchElement TYPES ---
    
    // 5a. Walls
    if (parsedData.walls && parsedData.walls.length > 0) {
      parsedData.walls.forEach((w: any) => {
        const wall = wallFromAi(w, levelId, parentUnderlayId);
        if (wall) convertedElements.push(wall);
      });
    } else {
      // Fallback
      pairedWalls.forEach((w) => {
        convertedElements.push({
          ...w,
          id: crypto.randomUUID(),
          levelId,
          parentUnderlayId
        });
      });
    }

    // 5b. Doors
    if (parsedData.doors) {
      parsedData.doors.forEach((d: any) => {
        if (d.pos) {
          const pos = { x: d.pos[0], y: d.pos[1] };
          const { angle } = snapToWall(pos);
          convertedElements.push({
            id: crypto.randomUUID(),
            type: "door",
            pos,
            width: d.width || 0.838,
            rotation: d.rotation !== undefined ? d.rotation : angle,
            subType: d.type || "single",
            levelId,
            parentUnderlayId
          });
        }
      });
    }

    // 5c. Windows
    if (parsedData.windows) {
      parsedData.windows.forEach((w: any) => {
        if (w.pos) {
          const pos = { x: w.pos[0], y: w.pos[1] };
          const { angle } = snapToWall(pos);
          convertedElements.push({
            id: crypto.randomUUID(),
            type: "window",
            pos,
            width: w.width || 1.219,
            rotation: w.rotation !== undefined ? w.rotation : angle,
            subType: w.type || "standard",
            levelId,
            parentUnderlayId
          });
        }
      });
    }

    // 5d. Openings
    if (parsedData.openings) {
      parsedData.openings.forEach((o: any) => {
        if (o.pos) {
          const pos = { x: o.pos[0], y: o.pos[1] };
          const { angle } = snapToWall(pos);
          convertedElements.push({
            id: crypto.randomUUID(),
            type: "wall-opening",
            pos,
            width: o.width || 1.0,
            rotation: o.rotation !== undefined ? o.rotation : angle,
            levelId,
            parentUnderlayId
          });
        }
      });
    }

    // 5e. Columns
    if (parsedData.columns) {
      parsedData.columns.forEach((c: any) => {
        if (c.pos) {
          convertedElements.push({
            id: crypto.randomUUID(),
            type: "column",
            pos: { x: c.pos[0], y: c.pos[1] },
            width: c.width || 0.3,
            depth: c.depth || 0.3,
            shape: c.shape || "rect",
            levelId,
            parentUnderlayId
          });
        }
      });
    }

    // 5f. Stairs
    if (parsedData.stairs) {
      parsedData.stairs.forEach((st: any) => {
        if (st.p1 && st.p2) {
          convertedElements.push({
            id: crypto.randomUUID(),
            type: "stair",
            p1: { x: st.p1[0], y: st.p1[1] },
            p2: { x: st.p2[0], y: st.p2[1] },
            width: st.width || 1.05,
            subType: st.type || "linear",
            levelId,
            parentUnderlayId
          });
        }
      });
    }

    // 5g. Railings
    if (parsedData.railings) {
      parsedData.railings.forEach((rl: any) => {
        if (rl.p1 && rl.p2) {
          convertedElements.push({
            id: crypto.randomUUID(),
            type: "railing",
            p1: { x: rl.p1[0], y: rl.p1[1] },
            p2: { x: rl.p2[0], y: rl.p2[1] },
            height: rl.height || 1.0,
            levelId,
            parentUnderlayId
          });
        }
      });
    }

    // 5h. Furniture
    if (parsedData.furniture) {
      parsedData.furniture.forEach((f: any) => {
        if (f.pos) {
          convertedElements.push(normalizeInteriorElement({
            id: crypto.randomUUID(),
            type: "furniture",
            pos: { x: f.pos[0], y: f.pos[1] },
            rotation: f.rotation || 0,
            subType: f.type,
            width: f.width || 1.0,
            depth: f.depth || 1.0,
            levelId,
            parentUnderlayId
          }));
        }
      });
    }

    // 5i. Fixtures & Counters
    if (parsedData.fixtures) {
      parsedData.fixtures.forEach((fx: any) => {
        if (fx.pos) {
          const isCounter = fx.type.startsWith("cntr_");
          convertedElements.push(normalizeInteriorElement({
            id: crypto.randomUUID(),
            type: isCounter ? "counter" : "fixture",
            pos: { x: fx.pos[0], y: fx.pos[1] },
            rotation: fx.rotation || 0,
            subType: fx.type,
            width: fx.width || 1.0,
            depth: fx.depth || 1.0,
            levelId,
            parentUnderlayId
          }));
        }
      });
    }

    // 5j. Rooms
    if (parsedData.rooms) {
      parsedData.rooms.forEach((r: any) => {
        if (r.pos) {
          convertedElements.push({
            id: crypto.randomUUID(),
            type: "room",
            pos: { x: r.pos[0], y: r.pos[1] },
            label: r.label,
            levelId,
            parentUnderlayId
          });
        }
      });
    }

    // 5k. Dimensions
    if (parsedData.dimensions) {
      parsedData.dimensions.forEach((dm: any) => {
        if (dm.p1 && dm.p2) {
          convertedElements.push({
            id: crypto.randomUUID(),
            type: "dimension",
            p1: { x: dm.p1[0], y: dm.p1[1] },
            p2: { x: dm.p2[0], y: dm.p2[1] },
            levelId,
            parentUnderlayId
          });
        }
      });
    }

    // Copy over other non-line raw CAD visual vectors (like original circles or arcs) so they remain in the scene
    elementsToConvert.forEach((el) => {
      if (el.type === "circle" || el.type === "arc") {
        convertedElements.push({
          ...el,
          id: crypto.randomUUID(),
          levelId,
          parentUnderlayId
        });
      }
    });

    return convertedElements;

  } catch (error) {
    console.error("AI CAD Conversion failed:", error);
    // Fallback
    const fallbackElements: ArchElement[] = [];
    pairedWalls.forEach((w) => {
      fallbackElements.push({
        ...w,
        id: crypto.randomUUID(),
        levelId,
        parentUnderlayId
      });
    });

    elementsToConvert.forEach((el) => {
      if (el.type === "label") {
        fallbackElements.push({
          ...el,
          id: crypto.randomUUID(),
          levelId,
          parentUnderlayId
        });
      }
    });

    return fallbackElements;
  }
};
