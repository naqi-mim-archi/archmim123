export type DigitizationProvenance = 'observed' | 'brief-derived' | 'code-default' | 'repair-generated';

export interface DigitizationEvidence {
  source: 'raster' | 'ocr' | 'design-brief' | 'catalog-default' | 'geometry-repair';
  /** Normalized 0..1 confidence for this element, not the complete plan. */
  confidence: number;
  /** Source-image coordinates, retained when a detector can provide them. */
  pixelBounds?: { x0: number; y0: number; x1: number; y1: number };
  notes?: string[];
}

export interface DigitizedElementMetadata {
  presetId?: string;
  provenance?: DigitizationProvenance;
  evidence?: DigitizationEvidence;
  /** Original measured value before any catalog resolution. */
  measuredWidth?: number;
  measuredHeight?: number;
  measuredThickness?: number;
  assumedProperties?: string[];
}

export interface GeneratedData {
  boundary?: number[][];
  walls?: ({
    levelIndex?: number;
    p1: number[];
    p2: number[];
    type: string;
    wallSource?: 'line' | 'arc' | 'ellipse';
    isCurved?: boolean;
    controlPoint?: number[];
    arcCenter?: number[];
    arcRadius?: number;
    arcStartAngle?: number;
    arcEndAngle?: number;
    arcCounterclockwise?: boolean;
    ellipseCenter?: number[];
    ellipseRadiusX?: number;
    ellipseRadiusY?: number;
    ellipseRotation?: number;
    ellipseStartAngle?: number;
    ellipseEndAngle?: number;
    ellipseCounterclockwise?: boolean;
  } & DigitizedElementMetadata)[];
  railings?: ({ levelIndex?: number, p1: number[], p2: number[] } & DigitizedElementMetadata)[];
  doors?: ({
    levelIndex?: number, pos: number[], rotation: number, type: string, width: number,
    mandatoryExteriorEntry?: boolean, isFlipped?: boolean, facingFlipped?: boolean,
  } & DigitizedElementMetadata)[];
  windows?: ({ levelIndex?: number, pos: number[], rotation: number, type: string, width: number } & DigitizedElementMetadata)[];
  columns?: ({ levelIndex?: number, pos: number[], width: number, depth: number, shape: string } & DigitizedElementMetadata)[];
  rooms?: ({
    levelIndex?: number;
    label: string;
    pos: number[];
    /** OCR dimensions, when the image explicitly supplies them. */
    sourceWidth?: number;
    sourceDepth?: number;
  } & DigitizedElementMetadata)[];
  sourceImageBase64?: string; // Source image used by the image-first Text 4.x modes
  extractionDiagnostics?: {
    confidence: 'high' | 'medium' | 'low';
    canImport: boolean;
    /** True only for the early raster preview while OCR/final classification is running. */
    processing?: boolean;
    scaleSource: 'image-text' | 'requested-boundary' | 'default';
    warnings: string[];
    detectedRoomLabels: number;
    requestedRoomLabels: number;
    /** Additive audit details used to qualify professional imports. */
    metrics?: {
      wallCount: number;
      enclosedSpaceCount: number;
      detectedDoorCount: number;
      detectedWindowCount: number;
      detectedOpeningCount: number;
      unresolvedRoomLabels: number;
      envelopeAspectConflict: number;
    };
    ocr?: {
      status: 'processing' | 'disabled' | 'completed' | 'unavailable' | 'provided' | 'timed-out';
      observationCount: number;
      durationMs?: number;
    };
    topologyRepairMode?: 'none' | 'junctions' | 'shell';
    /** J-only audit of Structured3D wall candidates reconciled over the Local baseline. */
    structuredReconciliation?: {
      provider: 'Structured3D';
      baselineWalls: number;
      structuredFaces: number;
      pairedCenterlines: number;
      acceptedRepairs: number;
      rejectedUnpaired: number;
      rejectedUnsupported: number;
      rejectedModeConflict: number;
      rejectedExistingWall: number;
      rejectedConnectivity: number;
      rejectedOverlap: number;
      rejectedLengthBudget: number;
      finalWalls: number;
      unavailable: boolean;
    };
  };

  // New Types
  stairs?: ({ levelIndex?: number, p1: number[], p2: number[], width: number, shape: string, stepCount?: number } & DigitizedElementMetadata)[];
  furniture?: ({ levelIndex?: number, pos: number[], rotation: number, type: string, subType?: string, width: number, depth: number } & DigitizedElementMetadata)[];
  fixtures?: ({ levelIndex?: number, pos: number[], rotation: number, type: string, subType?: string, width: number, depth: number } & DigitizedElementMetadata)[];
  slabs?: { levelIndex?: number, boundary: number[][], type: string }[];
  openings?: ({ levelIndex?: number, pos: number[], width: number, rotation: number } & DigitizedElementMetadata)[];
}

export type GenerativeWizardMode = 'chat' | 'chat-v2' | 'chat-v3' | 'chat-v4' | 'chat-v4a' | 'chat-v4b' | 'chat-v4c' | 'chat-v4d' | 'chat-v4e' | 'chat-v4f' | 'chat-v4g' | 'chat-v4h' | 'chat-v4j' | 'text2plan' | 'smart-text2plan' | 'image' | 'redraw-v2' | 'digitizer' | 'fusion' | 'tracer' | 'auto-plan' | 'smart-procedural' | 'ai-rendering';
