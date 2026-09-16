export const TEXT4H_IMAGE_MODEL = 'gemini-3.1-flash-lite-image' as const;

export const TEXT4H_AUTOSCAN_REDRAW_PROMPT = `A professional 2D architectural floor plan rendered on a clean, solid white background. High-contrast minimalist style. All structural exterior walls are exactly 9 inches thick and filled with a solid, pure black color. All interior partition walls are exactly 4.5 inches thick and also filled with solid black. No wall shading, no textures, and no patterns. Doors are drawn as clean single-line arcs showing swing direction. Windows are represented by simple parallel lines within the black walls. Crisp, highly legible sans-serif black text labels each room with its name and exact dimensions underneath (e.g., 'Room Name\n00\'-0" x 00\'-0"'). No furniture layout, no flooring textures, and no color fills outside of the black walls. The layout must perfectly adhere to the following specific architectural requirements. Act as an experienced draftsman, take input from the attached floorplan, and give output on the above explained visual graphics format. Do not be creative, only act as draftsman and ditto 100% reproduce on required graphics format, do NOT make any architectural / interior changes.`;

export const TEXT4H_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ['IMAGE'],
  thinkingConfig: {
    thinkingLevel: 'minimal',
    includeThoughts: false,
  },
  imageConfig: {
    aspectRatio: '1:1',
    imageSize: '1K',
  },
} as const;

export const TEXT4H_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION = `The confirmed enclosed area and numeric fixed-property footprint are hard rendering constraints; match the bounding-box ratio within 2%. Preserve architectural logic, adjacency, privacy, circulation, daylight, and useful rooms. Use a full rectangular exterior shell only when the user prompt says RECTANGLE LOCKED. When it says CREATIVE UNLOCKED, preserve the area and fixed-property bounding box but freely choose an architecturally intelligent compact, L/U-shaped, stepped, offset, or other coherent footprint; never force a rectangle by default. Count balconies, terraces, porches, decks, steps, and railings inside the fixed-property box but outside enclosed area. Exclude annotations and every door leaf or swing arc from dimensions and area. Draw all architecture first, reserving clear white label zones. Give every named space exactly one full Design Brief room name in thin black text at 0.33 times normal room-label height; never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels. Place a label only when its complete glyph box fits inside clear white floor space. No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark. Never render prompt instructions, pixel coordinates, bounding-box diagnostics, or wall-thickness notes as image text.`;
