import { Type } from "@google/genai";
import { INTERIOR_FIXTURE_COUNTER_SUBTYPES, INTERIOR_FURNITURE_SUBTYPES, INTERIOR_INVENTORY_STATS } from "../constants";

export const SHARED_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        buildingType: { type: Type.STRING },
        totalArea: { type: Type.NUMBER },
        layoutType: { type: Type.STRING }
      }
    },
    // STRUCTURE
    walls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER, description: "0 for Ground, 1 for First Floor, etc." },
          p1: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          p2: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          curveType: { type: Type.STRING, enum: ['line', 'arc', 'circle', 'ellipse'], description: "Use 'arc', 'circle', or 'ellipse' for any visibly curved wall; otherwise use 'line'." },
          center: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Curve center [x, y] for arc/circle/ellipse when visible." },
          radius: { type: Type.NUMBER, description: "Circle or circular arc radius in meters." },
          startAngle: { type: Type.NUMBER, description: "Curve start angle in radians, measured in standard Cartesian coordinates." },
          endAngle: { type: Type.NUMBER, description: "Curve end angle in radians, measured in standard Cartesian coordinates." },
          counterclockwise: { type: Type.BOOLEAN, description: "Whether the arc follows counterclockwise direction from startAngle to endAngle." },
          radiusX: { type: Type.NUMBER, description: "Ellipse X radius in meters." },
          radiusY: { type: Type.NUMBER, description: "Ellipse Y radius in meters." },
          rotation: { type: Type.NUMBER, description: "Ellipse rotation in radians." },
          controlPoint: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Optional quadratic control point [x, y] if center/radius cannot be estimated." },
          type: { type: Type.STRING, enum: ['exterior', 'interior', 'partition', 'glass'] }
        },
        required: ["p1", "p2", "type"]
      }
    },
    columns: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          width: { type: Type.NUMBER },
          depth: { type: Type.NUMBER },
          shape: { type: Type.STRING, enum: ['rect', 'circle'] }
        },
        required: ["pos", "width", "depth", "shape"]
      }
    },
    slabs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          boundary: { type: Type.ARRAY, items: { type: Type.ARRAY, items: { type: Type.NUMBER } } },
          type: { type: Type.STRING, enum: ['floor', 'ceiling'] }
        },
        required: ["boundary", "type"]
      }
    },
    // OPENINGS
    doors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotation: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ['single', 'double', 'sliding', 'folding', 'glass'] },
          width: { type: Type.NUMBER }
        },
        required: ["pos", "rotation", "type", "width"]
      }
    },
    windows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotation: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ['standard', 'bay', 'full-height'] },
          width: { type: Type.NUMBER }
        },
        required: ["pos", "rotation", "type", "width"]
      }
    },
    openings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotation: { type: Type.NUMBER },
          width: { type: Type.NUMBER }
        },
        required: ["pos", "width"]
      }
    },
    // CIRCULATION
    stairs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          p1: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          p2: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          width: { type: Type.NUMBER },
          shape: { type: Type.STRING, enum: ['linear', 'L', 'U'] }
        },
        required: ["p1", "p2", "width", "shape"]
      }
    },
    railings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          p1: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          p2: { type: Type.ARRAY, items: { type: Type.NUMBER } }
        },
        required: ["p1", "p2"]
      }
    },
    // ROOMS
    rooms: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          label: { type: Type.STRING },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } }
        },
        required: ["label", "pos"]
      }
    },
    // FURNITURE
    furniture: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotation: { type: Type.NUMBER },
          subType: {
            type: Type.STRING,
            enum: INTERIOR_FURNITURE_SUBTYPES,
            description: `Current furniture inventory subtype. ${INTERIOR_INVENTORY_STATS.furniture} furniture items available.`
          },
          width: { type: Type.NUMBER },
          depth: { type: Type.NUMBER }
        },
        required: ["pos", "rotation", "subType", "width", "depth"]
      }
    },
    // FIXTURES & COUNTERS
    fixtures: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotation: { type: Type.NUMBER },
          subType: {
            type: Type.STRING,
            enum: INTERIOR_FIXTURE_COUNTER_SUBTYPES,
            description: `Current fixture/counter inventory subtype. ${INTERIOR_INVENTORY_STATS.fixturesAndCounters} fixture/counter items available.`
          },
          width: { type: Type.NUMBER },
          depth: { type: Type.NUMBER }
        },
        required: ["pos", "rotation", "subType", "width", "depth"]
      }
    }
  },
  required: ["walls", "doors", "rooms"]
};

export const DIGITIZER_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    metadata: {
      type: Type.OBJECT,
      properties: {
        buildingType: { type: Type.STRING },
        totalArea: { type: Type.NUMBER },
        layoutType: { type: Type.STRING }
      }
    },
    walls: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER, description: "0 for Ground, 1 for First Floor, etc." },
          p1: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          p2: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          curveType: { type: Type.STRING, enum: ['line', 'arc', 'circle', 'ellipse'], description: "Use 'arc', 'circle', or 'ellipse' for any visibly curved wall; otherwise use 'line'." },
          center: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Curve center [x, y] for arc/circle/ellipse when visible." },
          radius: { type: Type.NUMBER, description: "Circle or circular arc radius in meters." },
          startAngle: { type: Type.NUMBER, description: "Curve start angle in radians, measured in standard Cartesian coordinates." },
          endAngle: { type: Type.NUMBER, description: "Curve end angle in radians, measured in standard Cartesian coordinates." },
          counterclockwise: { type: Type.BOOLEAN, description: "Whether the arc follows counterclockwise direction from startAngle to endAngle." },
          radiusX: { type: Type.NUMBER, description: "Ellipse X radius in meters." },
          radiusY: { type: Type.NUMBER, description: "Ellipse Y radius in meters." },
          rotation: { type: Type.NUMBER, description: "Ellipse rotation in radians." },
          controlPoint: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Optional quadratic control point [x, y] if center/radius cannot be estimated." },
          type: { type: Type.STRING, enum: ['exterior', 'interior', 'partition', 'glass'] }
        },
        required: ["p1", "p2", "type"]
      }
    },
    doors: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotation: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ['single', 'double', 'sliding', 'folding', 'glass'] },
          width: { type: Type.NUMBER }
        },
        required: ["pos", "rotation", "type", "width"]
      }
    },
    windows: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotation: { type: Type.NUMBER },
          type: { type: Type.STRING, enum: ['standard', 'bay', 'full-height'] },
          width: { type: Type.NUMBER }
        },
        required: ["pos", "rotation", "type", "width"]
      }
    },
    openings: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          levelIndex: { type: Type.INTEGER },
          pos: { type: Type.ARRAY, items: { type: Type.NUMBER } },
          rotation: { type: Type.NUMBER },
          width: { type: Type.NUMBER }
        },
        required: ["pos", "width"]
      }
    }
  },
  required: ["walls", "doors"]
};
