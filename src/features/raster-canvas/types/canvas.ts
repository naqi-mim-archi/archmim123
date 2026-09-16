export type ToolType = 
  | 'select' 
  | 'draw' 
  | 'crop'
  | 'outpaint'
  | 'ai_edit'
  | 'adjust'
  | 'place'
  | 'rotate'
  | 'transform' 
  | 'text' 
  | 'layers';

export type SelectSubTool = 
  | 'rect' 
  | 'lasso' 
  | 'brush' 
  | 'magic';

export type SelectionMode = 'new' | 'add' | 'subtract';

export type DrawSubTool = 'pen' | 'marker' | 'highlighter' | 'eraser';

export type GeometryMode = 'crop' | 'rotate' | 'perspective';
export type PerspectiveMode = 'auto' | 'vertical' | 'horizontal' | 'guided';
export type PerspectiveEdgeMode = 'auto-crop' | 'transparent' | 'white';

export interface PerspectiveGuide {
  id: string;
  orientation: 'vertical' | 'horizontal';
  start: Point;
  end: Point;
}

export interface PerspectiveSettings {
  mode: PerspectiveMode;
  vertical: number;
  horizontal: number;
  aspect: number;
  scale: number;
  offsetX: number;
  offsetY: number;
  edgeMode: PerspectiveEdgeMode;
  guides: PerspectiveGuide[];
  guideOrientation: 'vertical' | 'horizontal';
}

export type TransformMode = 'affine' | 'perspective';

export type LayerType = 
  | 'image' 
  | 'draw' 
  | 'text' 
  | 'shape' 
  | 'adjustment' 
  | 'group'
  | 'ai_preview';

export type BlendMode = 
  | 'source-over' 
  | 'multiply' 
  | 'screen' 
  | 'overlay' 
  | 'darken' 
  | 'lighten' 
  | 'color-dodge' 
  | 'color-burn';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageAdjustments {
  exposure: number;     // -100 to 100
  brightness: number;   // -100 to 100
  contrast: number;     // -100 to 100
  highlights: number;   // -100 to 100
  shadows: number;      // -100 to 100
  whites: number;       // -100 to 100
  blacks: number;       // -100 to 100
  saturation: number;   // -100 to 100
  vibrance: number;     // -100 to 100
  temperature: number;  // -100 (cool/blue) to 100 (warm/amber)
  tint: number;         // -100 (green) to 100 (magenta)
  sharpness: number;    // 0 to 100
  noiseReduction: number; // 0 to 100
  texture: number;      // -100 to 100
  clarity: number;      // -100 to 100
  dehaze: number;       // -100 to 100
  vignette: number;     // -100 to 100
  toneCurve: ToneCurvePoint[];
  hsl: Record<ColorMixerChannel, HslAdjustment>;
  pointColor: PointColorAdjustment;
  blur: number;         // 0 to 100
  blackAndWhite: boolean;
}

export type ColorMixerChannel = 'red' | 'orange' | 'yellow' | 'green' | 'aqua' | 'blue' | 'purple' | 'magenta';

export interface HslAdjustment {
  hue: number;
  saturation: number;
  luminance: number;
}

export interface ToneCurvePoint {
  x: number;
  y: number;
}

export interface PointColorAdjustment extends HslAdjustment {
  enabled: boolean;
  targetHue: number;
  range: number;
}

export const COLOR_MIXER_CHANNELS: ColorMixerChannel[] = ['red', 'orange', 'yellow', 'green', 'aqua', 'blue', 'purple', 'magenta'];

export const createDefaultHsl = (): Record<ColorMixerChannel, HslAdjustment> => ({
  red: { hue: 0, saturation: 0, luminance: 0 },
  orange: { hue: 0, saturation: 0, luminance: 0 },
  yellow: { hue: 0, saturation: 0, luminance: 0 },
  green: { hue: 0, saturation: 0, luminance: 0 },
  aqua: { hue: 0, saturation: 0, luminance: 0 },
  blue: { hue: 0, saturation: 0, luminance: 0 },
  purple: { hue: 0, saturation: 0, luminance: 0 },
  magenta: { hue: 0, saturation: 0, luminance: 0 },
});

export const DEFAULT_ADJUSTMENTS: ImageAdjustments = {
  exposure: 0,
  brightness: 0,
  contrast: 0,
  highlights: 0,
  shadows: 0,
  whites: 0,
  blacks: 0,
  saturation: 0,
  vibrance: 0,
  temperature: 0,
  tint: 0,
  sharpness: 0,
  noiseReduction: 0,
  texture: 0,
  clarity: 0,
  dehaze: 0,
  vignette: 0,
  toneCurve: [{ x: 0, y: 0 }, { x: 64, y: 64 }, { x: 128, y: 128 }, { x: 192, y: 192 }, { x: 255, y: 255 }],
  hsl: createDefaultHsl(),
  pointColor: { enabled: false, targetHue: 0, range: 20, hue: 0, saturation: 0, luminance: 0 },
  blur: 0,
  blackAndWhite: false,
};

export interface TextProperties {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number | string;
  fontStyle?: 'normal' | 'italic';
  textDecoration?: 'none' | 'underline';
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  opacity?: number;
  color: string;
  align: 'left' | 'center' | 'right' | 'justify';
  letterSpacing: number;
  lineHeight: number;
}

export interface TextBoxState extends Rect {
  rotation: number;
  skewX: number;
  skewY: number;
}

export interface PlacedItemState extends Rect {
  rotation: number;
  skewX: number;
  skewY: number;
  flipX: boolean;
  flipY: boolean;
}

export interface ShapeProperties {
  shapeType: 'line' | 'arrow' | 'rectangle' | 'circle';
  strokeColor: string;
  strokeWidth: number;
  fillColor?: string;
  points?: Point[];
}

export interface TransformState {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;     // In degrees
  flipH: boolean;
  flipV: boolean;
  skewX: number;
  skewY: number;
  corners?: [Point, Point, Point, Point]; // TL, TR, BR, BL for perspective pin
}

export interface CanvasLayer {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  locked: boolean;
  opacity: number;      // 0 to 1
  blendMode: BlendMode;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  transform: TransformState;
  adjustments?: ImageAdjustments;
  adjustmentMask?: HTMLCanvasElement;
  textProps?: TextProperties;
  textBox?: TextBoxState;
  placedItem?: PlacedItemState;
  placedItemSource?: string;
  placedItemSourceCanvas?: HTMLCanvasElement;
  shapeProps?: ShapeProperties;
  isAiResult?: boolean;
  groupId?: string;
  expanded?: boolean;
}

export interface SelectionState {
  active: boolean;
  maskCanvas: HTMLCanvasElement | null;
  bounds: Rect | null;
  feather: number;
  mode: SelectionMode;
  pathPoints: Point[];
}

export interface CropExtendState {
  active: boolean;
  cropRect: Rect;
  aspectRatio: string | null; // e.g. '16:9', '1:1', 'custom', null
  rotation: number;
  straightenAngle: number;
  isExtending: boolean;
  originalDimensions: { width: number; height: number };
}

export interface HistoryEntry {
  id: string;
  timestamp: number;
  description: string;
  layersSnapshot: {
    id: string;
    name: string;
    type: LayerType;
    visible: boolean;
    opacity: number;
    blendMode: BlendMode;
    imageData: string; // Base64 or dataURL
    transform: TransformState;
    adjustments?: ImageAdjustments;
    adjustmentMaskData?: string | null;
    textProps?: TextProperties;
    textBox?: TextBoxState;
    placedItem?: PlacedItemState;
    placedItemSource?: string;
    locked?: boolean;
    isAiResult?: boolean;
    groupId?: string;
    expanded?: boolean;
  }[];
  selectionSnapshot?: {
    active: boolean;
    maskData?: string | null;
    bounds?: Rect | null;
  };
  adjustmentsSnapshot?: ImageAdjustments;
  width: number;
  height: number;
}
