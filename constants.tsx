
import React from 'react';
import { 
  Square, DoorOpen, Layout, MousePointer2, Maximize2, RotateCcw, Trash2, Undo, Redo, Download, Upload as UploadIcon, Layers, Hand, Settings, Grid3X3, Crosshair, Pencil, RectangleHorizontal, Scissors, Circle as CircleIcon, Orbit as ArcIcon, CircleDashed as EllipseIcon, 
  Armchair, Bath, Columns, Utensils
} from 'lucide-react';
import { EditorTool } from './types';

export const GRID_SIZE = 0.1;
export const SNAP_THRESHOLD = 0.5;
export const WALL_THICKNESS_DEFAULT = 0.23; // 9 in / 230 mm
export const DOOR_WIDTH_DEFAULT = 0.838; // 2'-9" / 838 mm
export const WINDOW_WIDTH_DEFAULT = 0.914; // 3'-0" / 914 mm

// ===== 3D Defaults (stored in meters) =====
export const FT_TO_M = 0.3048;

export const WALL_HEIGHT_DEFAULT = 10 * FT_TO_M;
export const DOOR_HEIGHT_DEFAULT = 7 * FT_TO_M;
export const WINDOW_SILL_HEIGHT_DEFAULT = 3 * FT_TO_M;
export const WINDOW_TOP_HEIGHT_DEFAULT = 7 * FT_TO_M;
export const WALL_OPENING_HEIGHT_DEFAULT = 7 * FT_TO_M;

export const DEFAULT_PROJECT_SETTINGS_3D = {
  level1Z: 0,
  level2Z: 11 * FT_TO_M,
  slabThickness: 1 * FT_TO_M,
  defaultLevelHeight: WALL_HEIGHT_DEFAULT,

  wallHeight: WALL_HEIGHT_DEFAULT,
  doorHeight: DOOR_HEIGHT_DEFAULT,
  windowSillHeight: WINDOW_SILL_HEIGHT_DEFAULT,
  windowTopHeight: WINDOW_TOP_HEIGHT_DEFAULT,
  wallOpeningHeight: WALL_OPENING_HEIGHT_DEFAULT,
  inchesDecimalPlaces: 0,
};

// ===== SPECIFICATION PRESETS =====

export const WALL_PRESETS = [
  { id: 'wall_ext_res', label: 'Residential Exterior (9")', thickness: 0.230 },
  { id: 'wall_ext_comm', label: 'Commercial Exterior (12")', thickness: 0.300 },
  { id: 'wall_ext_light', label: 'Lightweight Exterior (6")', thickness: 0.150 },
  { id: 'wall_int_struct', label: 'Structural Interior (6")', thickness: 0.150 },
  { id: 'wall_int_res', label: 'Res/Comm Interior (4.5")', thickness: 0.115 },
  { id: 'wall_part', label: 'Partition Wall (3")', thickness: 0.075 },
  { id: 'wall_glass', label: 'Glass Partition', thickness: 0.012 },
];

export const DOOR_PRESETS = [
  { id: 'door_single_sm', label: 'Single 2\'3" (Bath)', width: 0.686, subType: 'single' },
  { id: 'door_single_md', label: 'Single 2\'9" (Bed)', width: 0.838, subType: 'single' },
  { id: 'door_single_lg', label: 'Single 3\'0" (Office)', width: 0.914, subType: 'single' },
  { id: 'door_main', label: 'Main Entrance 4\'0"', width: 1.219, subType: 'single' },
  { id: 'door_double_int', label: 'Double 5\'0"', width: 1.524, subType: 'double' },
  { id: 'door_double_main', label: 'Double Main 6\'0"', width: 1.829, subType: 'double' },
  { id: 'door_sliding', label: 'Sliding Door', width: 1.5, subType: 'sliding' },
  { id: 'door_folding', label: 'Folding Door', width: 1.5, subType: 'folding' },
  { id: 'door_glass', label: 'Glass Door', width: 0.914, subType: 'glass' },
];

export const WINDOW_PRESETS = [
  { id: 'win_reg_sm', label: 'Regular 3\'x4\'', width: 0.914, height: 1.219 },
  { id: 'win_reg_md', label: 'Regular 4\'x4\'', width: 1.219, height: 1.219 },
  { id: 'win_reg_lg', label: 'Regular 5\'x4\'', width: 1.524, height: 1.219 },
  { id: 'win_liv', label: 'Living 6\'x4\'', width: 1.829, height: 1.219 },
  { id: 'win_angled_bay', label: 'Angled Bay Window', width: 2.5, subType: 'angled-bay' },
  { id: 'win_box_bay', label: 'Box Bay Window', width: 2.0, subType: 'box-bay' },
  { id: 'win_curved_bay', label: 'Curved Bay Window', width: 2.5, subType: 'curved-bay' },
];

export const COLUMN_PRESETS = [
  { id: 'col_lg_sq', label: 'Large 18"x18"', width: 0.45, depth: 0.45, shape: 'rect' },
  { id: 'col_sm_sq', label: 'Small 9"x9"', width: 0.23, depth: 0.23, shape: 'rect' },
  { id: 'col_md_sq', label: 'Medium 12"x12"', width: 0.30, depth: 0.30, shape: 'rect' },
  { id: 'col_hv_sq', label: 'Heavy 24"x24"', width: 0.60, depth: 0.60, shape: 'rect' },
  { id: 'col_md_cir', label: 'Round 12"', width: 0.30, depth: 0.30, shape: 'circle' },
];

export const STAIR_PRESETS = [
  { id: 'stair_lin', label: 'Linear', subType: 'linear', width: 1.05 },
  { id: 'stair_l', label: 'L-Shape', subType: 'L', width: 1.05 },
  { id: 'stair_u', label: 'U-Shape', subType: 'U', width: 1.05 },
  { id: 'stair_spiral', label: 'Spiral', subType: 'spiral', width: 1.5 },
];

function interiorPreset<T extends Record<string, any>>(preset: T) {
  const inferredType = !('type' in preset) && preset.mainCategory === '1. Furniture'
    ? { type: 'furniture' }
    : {};
  return {
    catalogGroup: 'Interior Elements',
    snapMode: 'default',
    ...inferredType,
    ...preset,
  };
}

export const INTERIOR_ELEMENT_CATEGORIES = [
  {
    id: 'furniture',
    label: '1. Furniture',
    subcategories: ['Beds & Sleeping', 'Seating', 'Sofas & Lounge', 'Dining', 'Tables', 'Storage & Display', 'Imported Revit'],
  },
  {
    id: 'kitchen',
    label: '2. Kitchen',
    subcategories: ['Counters & Cabinetry', 'Fixtures', 'Appliances', 'Imported Revit'],
  },
  {
    id: 'bathroom',
    label: '3. Bathroom',
    subcategories: ['Toilets', 'Basins', 'Showers', 'Bathtubs', 'Bathroom Furniture', 'Imported Revit'],
  },
  {
    id: 'counters',
    label: '4. Counters',
    subcategories: ['Service Counters', 'Office Furniture', 'Display Elements', 'Imported Revit'],
  },
  {
    id: 'lighting',
    label: '5. Lighting',
    subcategories: ['Imported Revit'],
  },
  {
    id: 'decor',
    label: '6. Decor',
    subcategories: ['Imported Revit'],
  },
  {
    id: 'doors',
    label: '7. Doors',
    subcategories: ['Imported Revit'],
  },
  {
    id: 'windows',
    label: '8. Windows',
    subcategories: ['Imported Revit'],
  },
  {
    id: 'custom',
    label: '9. Custom',
    subcategories: ['Imported Revit'],
  },
];

export const inferInteriorSeatCount = (presetOrElement: { width?: number; depth?: number; subType?: string; seatsCount?: number }): number => {
  if (presetOrElement.seatsCount) return presetOrElement.seatsCount;
  const sub = (presetOrElement.subType || '').toLowerCase();
  const w = presetOrElement.width || 1;
  const d = presetOrElement.depth || 1;
  if (sub.includes('table_8') || sub.includes('dining_8')) return 8;
  if (sub.includes('table_6') || sub.includes('dining_6')) return 6;
  if (sub.includes('table_4') || sub.includes('dining_4') || sub.includes('cafe')) return 4;
  if (sub.includes('conference')) return Math.max(6, Math.round(w / 0.55) * 2);
  if (sub.includes('dining') || sub.includes('table')) return Math.max(2, Math.min(12, Math.round(Math.max(w, d) / 0.45) * 2));
  if (sub.includes('sofa_l_sectional_extendable')) {
    const seatModule = 0.75;
    const legDepth = Math.min(0.85, Math.max(0.45, w - 0.35), Math.max(0.45, d - 0.35));
    const horizontalSeats = Math.max(2, Math.min(8, Math.round(w / seatModule)));
    const verticalExtensionSeats = Math.max(1, Math.min(6, Math.round(Math.max(seatModule, d - legDepth) / seatModule)));
    return horizontalSeats + verticalExtensionSeats;
  }
  if (sub.includes('sofa')) return Math.max(1, Math.min(6, Math.round(w / 0.7)));
  return 1;
};

export const FURNITURE_PRESETS = [
  interiorPreset({ id: 'bed_single', label: 'Single Bed', width: 0.9, depth: 2.0, height: 0.65, subType: 'bed_single', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'bed_queen', label: 'Queen Bed', width: 1.5, depth: 2.0, height: 0.75, subType: 'bed_queen', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'bed_king', label: 'King Bed', width: 1.9, depth: 2.0, height: 0.75, subType: 'bed_king', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'bed_twin_pair', label: 'Twin Beds', width: 1.95, depth: 2.0, height: 0.65, subType: 'bed_twin_pair', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'bed_bunk', label: 'Bunk Bed', width: 1.05, depth: 2.05, height: 1.85, subType: 'bed_bunk', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'bed_loft', label: 'Loft Bed', width: 1.15, depth: 2.05, height: 1.95, subType: 'bed_loft', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'bed_sofa', label: 'Sofa Bed', width: 1.95, depth: 0.95, height: 0.78, subType: 'sofa_bed', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'sofa', snapMode: 'back-only' }),
  interiorPreset({ id: 'bed_side_tables', label: 'Bed w/ Side Tables', width: 2.35, depth: 2.05, height: 0.75, subType: 'bed_side_tables', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'bed_storage', label: 'Bed w/ Storage', width: 1.65, depth: 2.12, height: 0.78, subType: 'bed_storage', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'day_bed', label: 'Day Bed', width: 0.9, depth: 1.95, height: 0.7, subType: 'day_bed', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),
  interiorPreset({ id: 'hospital_bed', label: 'Hospital Bed', width: 1.0, depth: 2.1, height: 0.9, subType: 'hospital_bed', category: 'bed', mainCategory: '1. Furniture', subCategory: 'Beds & Sleeping', iconType: 'bed', snapMode: 'back-only' }),

  interiorPreset({ id: 'office_chair', label: 'Office Chair', width: 0.6, depth: 0.6, height: 0.9, subType: 'office_chair', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'chair', snapMode: 'default' }),
  interiorPreset({ id: 'chair_accent', label: 'Accent Chair', width: 0.82, depth: 0.74, height: 0.85, subType: 'chair_accent', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'chair', snapMode: 'default' }),
  interiorPreset({ id: 'chair_modern', label: 'Modern Chair', width: 0.62, depth: 0.58, height: 0.82, subType: 'chair_modern', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'chair', snapMode: 'default' }),
  interiorPreset({ id: 'chair_platner', label: 'Platner Chair', width: 0.68, depth: 0.62, height: 0.82, subType: 'chair_platner', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'chair', snapMode: 'default' }),
  interiorPreset({ id: 'chair_z', label: 'Z Chair', width: 0.7, depth: 0.82, height: 0.82, subType: 'chair_z', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'chair', snapMode: 'default' }),
  interiorPreset({ id: 'stool_bar', label: 'Bar Stool', width: 0.45, depth: 0.45, height: 0.95, subType: 'stool_bar', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'chair', snapMode: 'default' }),
  interiorPreset({ id: 'ottoman_square', label: 'Square Ottoman', width: 0.65, depth: 0.65, height: 0.42, subType: 'ottoman_square', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'ottoman', snapMode: 'default' }),
  interiorPreset({ id: 'ottoman_tufted', label: 'Tufted Ottoman', width: 1.15, depth: 0.75, height: 0.42, subType: 'ottoman_tufted', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'ottoman', snapMode: 'default' }),
  interiorPreset({ id: 'ottoman_puff', label: 'Puff Ottoman', width: 0.7, depth: 0.7, height: 0.42, subType: 'ottoman_puff', category: 'chair', mainCategory: '1. Furniture', subCategory: 'Seating', iconType: 'ottoman', snapMode: 'default' }),

  interiorPreset({ id: 'sofa_1', label: 'Sofa 1-Seater', width: 0.9, depth: 0.9, height: 0.78, subType: 'sofa', category: 'sofa', mainCategory: '1. Furniture', subCategory: 'Sofas & Lounge', iconType: 'sofa', snapMode: 'default' }),
  interiorPreset({ id: 'sofa_2', label: 'Sofa 2-Seater', width: 1.5, depth: 0.9, height: 0.78, subType: 'sofa', category: 'sofa', mainCategory: '1. Furniture', subCategory: 'Sofas & Lounge', iconType: 'sofa', snapMode: 'default' }),
  interiorPreset({ id: 'sofa_3', label: 'Sofa 3-Seater', width: 2.1, depth: 0.9, height: 0.78, subType: 'sofa', category: 'sofa', mainCategory: '1. Furniture', subCategory: 'Sofas & Lounge', iconType: 'sofa', snapMode: 'default' }),
  interiorPreset({ id: 'sofa_round_edge', label: 'Round Edge Sofa', width: 1.55, depth: 1.25, height: 0.78, subType: 'sofa_round_edge', category: 'sofa', mainCategory: '1. Furniture', subCategory: 'Sofas & Lounge', iconType: 'sofa-round', snapMode: 'default' }),
  interiorPreset({ id: 'sofa_kidney', label: 'Kidney Sofa', width: 2.15, depth: 1.05, height: 0.78, subType: 'sofa_kidney', category: 'sofa', mainCategory: '1. Furniture', subCategory: 'Sofas & Lounge', iconType: 'sofa-round', snapMode: 'default' }),
  interiorPreset({ id: 'sofa_curved_lounge', label: 'Curved Lounge Sofa', width: 2.4, depth: 1.1, height: 0.78, subType: 'sofa_curved_lounge', category: 'sofa', mainCategory: '1. Furniture', subCategory: 'Sofas & Lounge', iconType: 'sofa-round', snapMode: 'default' }),
  interiorPreset({ id: 'sofa_l_sectional_extendable', label: 'L-Shape Sofa', width: 1.5, depth: 1.6, height: 0.78, subType: 'sofa_l_sectional_extendable', shape: 'L', category: 'sofa', mainCategory: '1. Furniture', subCategory: 'Sofas & Lounge', iconType: 'sofa-l', snapMode: 'default' }),

  interiorPreset({ id: 'table_dining_4', label: 'Dining Table (4)', width: 1.2, depth: 1.2, height: 0.75, subType: 'table_4', category: 'table', mainCategory: '1. Furniture', subCategory: 'Dining', iconType: 'dining' }),
  interiorPreset({ id: 'table_dining_6', label: 'Dining Table (6)', width: 1.8, depth: 1.0, height: 0.75, subType: 'table_6', category: 'table', mainCategory: '1. Furniture', subCategory: 'Dining', iconType: 'dining' }),
  interiorPreset({ id: 'table_dining_8', label: 'Dining Table (8)', width: 2.4, depth: 1.1, height: 0.75, subType: 'table_8', category: 'table', mainCategory: '1. Furniture', subCategory: 'Dining', iconType: 'dining' }),
  interiorPreset({ id: 'table_round_dining', label: 'Round Dining Table', width: 1.3, depth: 1.3, height: 0.75, subType: 'table_round_dining', shape: 'circle', category: 'table', mainCategory: '1. Furniture', subCategory: 'Dining', iconType: 'round-table' }),
  interiorPreset({ id: 'table_cafe', label: 'Cafe Table', width: 0.7, depth: 0.7, height: 0.75, subType: 'table_cafe', shape: 'circle', category: 'table', mainCategory: '1. Furniture', subCategory: 'Dining', iconType: 'round-table' }),

  interiorPreset({ id: 'coffee_table', label: 'Coffee Table', width: 0.9, depth: 0.6, height: 0.42, subType: 'coffee', category: 'table', mainCategory: '1. Furniture', subCategory: 'Tables', iconType: 'table' }),
  interiorPreset({ id: 'table_oval_coffee', label: 'Oval Coffee Table', width: 1.35, depth: 0.7, height: 0.42, subType: 'table_oval_coffee', category: 'table', mainCategory: '1. Furniture', subCategory: 'Tables', iconType: 'round-table' }),
  interiorPreset({ id: 'table_round_side', label: 'Round Side Table', width: 0.6, depth: 0.6, height: 0.55, subType: 'table_round_side', shape: 'circle', category: 'table', mainCategory: '1. Furniture', subCategory: 'Tables', iconType: 'round-table' }),
  interiorPreset({ id: 'table_bar', label: 'Bar Table', width: 0.75, depth: 0.65, height: 1.05, subType: 'table_bar', category: 'table', mainCategory: '1. Furniture', subCategory: 'Tables', iconType: 'round-table' }),
  interiorPreset({ id: 'desk', label: 'Study Desk', width: 1.2, depth: 0.6, height: 0.75, subType: 'desk', category: 'desk', mainCategory: '1. Furniture', subCategory: 'Tables', iconType: 'desk', snapMode: 'preferred-wall' }),

  interiorPreset({ id: 'wardrobe', label: 'Wardrobe', width: 1.5, depth: 0.6, height: 2.1, subType: 'wardrobe', category: 'storage', mainCategory: '1. Furniture', subCategory: 'Storage & Display', iconType: 'storage', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'bedside_table', label: 'Bedside Table', width: 0.5, depth: 0.45, height: 0.55, subType: 'bedside', category: 'storage', mainCategory: '1. Furniture', subCategory: 'Storage & Display', iconType: 'storage', snapMode: 'default' }),
  interiorPreset({ id: 'tv_console', label: 'TV Unit', width: 1.6, depth: 0.4, height: 0.55, subType: 'tv_console', category: 'storage', mainCategory: '1. Furniture', subCategory: 'Storage & Display', iconType: 'storage', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'display_shelf', label: 'Display Shelf', width: 1.2, depth: 0.45, height: 1.8, subType: 'shelf', category: 'storage', mainCategory: '1. Furniture', subCategory: 'Storage & Display', iconType: 'storage', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'cabinet_file', label: 'Filing Cabinet', width: 0.8, depth: 0.5, height: 1.25, subType: 'filing', category: 'storage', mainCategory: '1. Furniture', subCategory: 'Storage & Display', iconType: 'storage', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'buffet_cabinet', label: 'Buffet Cabinet', width: 2.5, depth: 0.45, height: 0.9, subType: 'buffet_cabinet', category: 'storage', mainCategory: '1. Furniture', subCategory: 'Storage & Display', iconType: 'storage', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'credenza', label: 'Credenza', width: 2.0, depth: 0.5, height: 0.82, subType: 'credenza', category: 'storage', mainCategory: '1. Furniture', subCategory: 'Storage & Display', iconType: 'storage', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'whiteboard', label: 'Whiteboard', width: 1.8, depth: 0.1, height: 1.2, subType: 'whiteboard', category: 'display', mainCategory: '1. Furniture', subCategory: 'Storage & Display', iconType: 'display', snapMode: 'hard-wall' }),

  interiorPreset({ id: 'table_conference', label: 'Conference Table', width: 2.8, depth: 1.2, height: 0.75, subType: 'conference', category: 'office', mainCategory: '4. Counters', subCategory: 'Office Furniture', iconType: 'dining' }),
  interiorPreset({ id: 'reception_desk', label: 'Reception Desk', width: 1.8, depth: 0.7, height: 1.1, subType: 'reception', category: 'office', mainCategory: '4. Counters', subCategory: 'Office Furniture', iconType: 'counter', snapMode: 'preferred-wall' }),
];

// Unified Fixtures & Counters
export const FIXTURE_PRESETS = [
  interiorPreset({ id: 'cntr_kitchen', label: 'Kitchen Counter', depth: 0.6, width: 2.0, height: 0.9, subType: 'standard', type: 'counter', category: 'counter', mainCategory: '2. Kitchen', subCategory: 'Counters & Cabinetry', iconType: 'counter', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'cntr_island', label: 'Kitchen Island', depth: 0.9, width: 2.0, height: 0.9, subType: 'island', type: 'counter', category: 'counter', mainCategory: '2. Kitchen', subCategory: 'Counters & Cabinetry', iconType: 'counter' }),
  interiorPreset({ id: 'cntr_l_kitchen', label: 'L Kitchen Counter', depth: 1.6, width: 2.4, height: 0.9, subType: 'counter_l_kitchen', shape: 'L', type: 'counter', category: 'counter', mainCategory: '2. Kitchen', subCategory: 'Counters & Cabinetry', iconType: 'counter-l', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'cntr_base_cabinet', label: 'Base Cabinet', depth: 0.6, width: 1.2, height: 0.9, subType: 'base_cabinet', type: 'counter', category: 'counter', mainCategory: '2. Kitchen', subCategory: 'Counters & Cabinetry', iconType: 'counter', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'fix_sink', label: 'Kitchen Sink', width: 0.8, depth: 0.5, height: 0.25, subType: 'sink', type: 'fixture', category: 'sanitary', mainCategory: '2. Kitchen', subCategory: 'Fixtures', iconType: 'sink', snapMode: 'counter-only' }),
  interiorPreset({ id: 'fix_double_sink', label: 'Double Kitchen Sink', width: 1.1, depth: 0.55, height: 0.25, subType: 'double_sink', type: 'fixture', category: 'sanitary', mainCategory: '2. Kitchen', subCategory: 'Fixtures', iconType: 'sink', snapMode: 'counter-only' }),
  interiorPreset({ id: 'fix_stove', label: 'Kitchen Stove', width: 0.75, depth: 0.6, height: 0.15, subType: 'stove', type: 'fixture', category: 'appliance', mainCategory: '2. Kitchen', subCategory: 'Appliances', iconType: 'stove', snapMode: 'counter-only' }),
  interiorPreset({ id: 'appliance_hob_2', label: 'Two Burner Hob', width: 0.45, depth: 0.52, height: 0.12, subType: 'hob_2', type: 'fixture', category: 'appliance', mainCategory: '2. Kitchen', subCategory: 'Appliances', iconType: 'stove', snapMode: 'counter-only' }),
  interiorPreset({ id: 'appliance_hob_4', label: 'Four Burner Hob', width: 0.6, depth: 0.52, height: 0.12, subType: 'hob_4', type: 'fixture', category: 'appliance', mainCategory: '2. Kitchen', subCategory: 'Appliances', iconType: 'stove', snapMode: 'counter-only' }),
  interiorPreset({ id: 'appliance_fridge', label: 'Refrigerator', width: 0.8, depth: 0.75, height: 1.9, subType: 'fridge', type: 'fixture', category: 'appliance', mainCategory: '2. Kitchen', subCategory: 'Appliances', iconType: 'appliance' }),
  interiorPreset({ id: 'appliance_washer', label: 'Washing Machine', width: 0.65, depth: 0.65, height: 0.9, subType: 'washer', type: 'fixture', category: 'appliance', mainCategory: '2. Kitchen', subCategory: 'Appliances', iconType: 'appliance' }),

  interiorPreset({ id: 'fix_wc', label: 'Toilet (WC)', width: 0.5, depth: 0.7, height: 0.78, subType: 'wc', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Toilets', iconType: 'toilet', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'fix_wc_wall_hung', label: 'Wall Hung Toilet', width: 0.52, depth: 0.62, height: 0.78, subType: 'wc_wall_hung', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Toilets', iconType: 'toilet', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'fix_basin', label: 'Wash Basin', width: 0.6, depth: 0.5, height: 0.85, subType: 'basin', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Basins', iconType: 'basin', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'fix_vanity_basin', label: 'Vanity Basin', width: 0.9, depth: 0.5, height: 0.85, subType: 'vanity_basin', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Basins', iconType: 'basin', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'fix_corner_basin', label: 'Corner Basin', width: 0.55, depth: 0.55, height: 0.85, subType: 'corner_basin', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Basins', iconType: 'basin', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'fix_shower', label: 'Shower Cubicle', width: 0.9, depth: 0.9, height: 2.1, subType: 'shower', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Showers', iconType: 'shower' }),
  interiorPreset({ id: 'fix_shower_rect', label: 'Rectangular Shower', width: 1.2, depth: 0.9, height: 2.1, subType: 'shower_rect', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Showers', iconType: 'shower' }),
  interiorPreset({ id: 'fix_bath', label: 'Bath Tub', width: 1.7, depth: 0.8, height: 0.6, subType: 'bath', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Bathtubs', iconType: 'bathtub', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'fix_corner_bath', label: 'Corner Bathtub', width: 1.4, depth: 1.4, height: 0.6, subType: 'bath_corner', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Bathtubs', iconType: 'bathtub', snapMode: 'hard-wall' }),
  interiorPreset({ id: 'bath_vanity_unit', label: 'Bathroom Vanity Unit', width: 1.0, depth: 0.5, height: 0.85, subType: 'bath_vanity_unit', type: 'fixture', category: 'sanitary', mainCategory: '3. Bathroom', subCategory: 'Bathroom Furniture', iconType: 'storage', snapMode: 'hard-wall' }),

  interiorPreset({ id: 'counter_service', label: 'Service Counter', depth: 0.7, width: 2.0, height: 1.05, subType: 'service_counter', type: 'counter', category: 'counter', mainCategory: '4. Counters', subCategory: 'Service Counters', iconType: 'counter', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'cashier_desk', label: 'Checkout Counter', width: 1.4, depth: 0.6, height: 1.05, subType: 'cashier', type: 'counter', category: 'counter', mainCategory: '4. Counters', subCategory: 'Service Counters', iconType: 'counter', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'counter_reception_arc', label: 'Curved Reception Counter', width: 2.2, depth: 0.85, height: 1.1, subType: 'reception_curved', type: 'counter', category: 'counter', mainCategory: '4. Counters', subCategory: 'Service Counters', iconType: 'counter-round', snapMode: 'preferred-wall' }),
  interiorPreset({ id: 'counter_display_case', label: 'Display Counter', width: 1.8, depth: 0.55, height: 1.0, subType: 'display_counter', type: 'counter', category: 'counter', mainCategory: '4. Counters', subCategory: 'Display Elements', iconType: 'display', snapMode: 'preferred-wall' }),
];

export const COUNTER_PRESETS = FIXTURE_PRESETS.filter(f => f.type === 'counter'); // Legacy fallback

export let INTERIOR_ELEMENT_PRESETS = [...FURNITURE_PRESETS, ...FIXTURE_PRESETS];

export const registerCustomInteriorPresets = (presets: any[]) => {
  const existingIds = new Set(INTERIOR_ELEMENT_PRESETS.map(p => p.id));
  const newPresets = presets.filter(p => !existingIds.has(p.id));
  if (newPresets.length > 0) {
    INTERIOR_ELEMENT_PRESETS = [...INTERIOR_ELEMENT_PRESETS, ...newPresets];
  }
};

const uniqueCatalogValues = (values: Array<string | undefined>): string[] => (
  Array.from(new Set(values.filter((value): value is string => !!value)))
);

export const INTERIOR_FURNITURE_SUBTYPES = uniqueCatalogValues(FURNITURE_PRESETS.map(preset => preset.subType));
export const INTERIOR_FIXTURE_COUNTER_SUBTYPES = uniqueCatalogValues(FIXTURE_PRESETS.map(preset => preset.subType));

export const INTERIOR_INVENTORY_STATS = {
  total: INTERIOR_ELEMENT_PRESETS.length,
  furniture: FURNITURE_PRESETS.length,
  fixturesAndCounters: FIXTURE_PRESETS.length,
  byMainCategory: INTERIOR_ELEMENT_PRESETS.reduce((acc, preset) => {
    const key = preset.mainCategory || 'Uncategorized';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>)
};

export const getInteriorInventoryPromptList = (presets = INTERIOR_ELEMENT_PRESETS): string => (
  presets
    .map(preset => `  - '${preset.subType}': ${preset.label}, size: width=${preset.width}, depth=${preset.depth}`)
    .join('\n')
);

const INTERIOR_PRESET_ALIASES: Record<string, string> = {
  table_dining_4: 'table_dining_4',
  dining_table_4: 'table_dining_4',
  table_4: 'table_dining_4',
  table_dining_6: 'table_dining_6',
  dining_table_6: 'table_dining_6',
  table_6: 'table_dining_6',
  table_dining_8: 'table_dining_8',
  dining_table_8: 'table_dining_8',
  table_8: 'table_dining_8',
  coffee_table: 'coffee_table',
  coffee: 'coffee_table',
  bedside_table: 'bedside_table',
  side_table: 'bedside_table',
  nightstand: 'bedside_table',
  table_conference: 'table_conference',
  conference_table: 'table_conference',
  reception_desk: 'reception_desk',
  cabinet_file: 'cabinet_file',
  display_shelf: 'display_shelf',
  cashier_desk: 'cashier_desk',
  cntr_kitchen: 'cntr_kitchen',
  cntr_island: 'cntr_island',
  cntr_l_kitchen: 'cntr_l_kitchen',
  cntr_base_cabinet: 'cntr_base_cabinet',
  fix_sink: 'fix_sink',
  fix_double_sink: 'fix_double_sink',
  fix_stove: 'fix_stove',
  appliance_hob_2: 'appliance_hob_2',
  appliance_hob_4: 'appliance_hob_4',
  appliance_fridge: 'appliance_fridge',
  appliance_washer: 'appliance_washer',
  fix_wc: 'fix_wc',
  fix_wc_wall_hung: 'fix_wc_wall_hung',
  fix_basin: 'fix_basin',
  fix_vanity_basin: 'fix_vanity_basin',
  fix_corner_basin: 'fix_corner_basin',
  fix_shower: 'fix_shower',
  fix_shower_rect: 'fix_shower_rect',
  fix_bath: 'fix_bath',
  fix_corner_bath: 'fix_corner_bath',
};

const normalizeInteriorLookupKey = (value?: string): string => (value || '').toLowerCase().trim().replace(/[\s-]+/g, '_');

export const getCanonicalInteriorPreset = (value?: string) => {
  const key = normalizeInteriorLookupKey(value);
  if (!key) return undefined;
  const aliasedId = INTERIOR_PRESET_ALIASES[key] || key;
  return INTERIOR_ELEMENT_PRESETS.find((preset) => {
    const id = normalizeInteriorLookupKey(preset.id);
    const subType = normalizeInteriorLookupKey(preset.subType);
    return id === aliasedId || subType === key || id === key;
  });
};

export const normalizeInteriorSubType = (subType?: string, label?: string, shape?: string): string => {
  const key = normalizeInteriorLookupKey(subType);
  const labelKey = normalizeInteriorLookupKey(label);
  const preset = getCanonicalInteriorPreset(subType) || getCanonicalInteriorPreset(label);
  return preset?.subType || subType || '';
};

export const normalizeInteriorElement = <T extends { type?: string; subType?: string; label?: string; width?: number; depth?: number; height?: number; shape?: string; category?: string; iconType?: string; seatsCount?: number }>(element: T): T => {
  if (!['furniture', 'fixture', 'counter'].includes(element.type || '')) return element;

  const labelKey = normalizeInteriorLookupKey(element.label);
  const subtypeKey = normalizeInteriorLookupKey(element.subType);
  const labelIsCoffee = labelKey.includes('coffee');
  const labelIsBedside = labelKey.includes('bedside') || labelKey.includes('nightstand');
  const labelIsDining = labelKey.includes('dining');
  const preset = labelIsCoffee
    ? getCanonicalInteriorPreset('coffee_table')
    : labelIsBedside
      ? getCanonicalInteriorPreset('bedside_table')
      : labelIsDining && subtypeKey.includes('table')
        ? getCanonicalInteriorPreset(element.subType)
        : getCanonicalInteriorPreset(element.subType) || getCanonicalInteriorPreset(element.label);
  if (!preset) {
    const normalizedSubType = normalizeInteriorSubType(element.subType, element.label, element.shape);
    return normalizedSubType && normalizedSubType !== element.subType ? { ...element, subType: normalizedSubType } : element;
  }

  const keepCustomSize = typeof element.width === 'number' && typeof element.depth === 'number'
    && Math.abs(element.width - preset.width) > 0.02
    && Math.abs(element.depth - preset.depth) > 0.02;

  const presetShape = 'shape' in preset ? preset.shape : undefined;
  const next: T = {
    ...element,
    type: (preset.type || element.type || 'furniture') as T['type'],
    subType: preset.subType,
    label: element.label || preset.label,
    height: element.height ?? preset.height,
    shape: presetShape as T['shape'] || element.shape,
    category: preset.category as T['category'] || element.category,
    iconType: preset.iconType as T['iconType'] || element.iconType,
  };

  if (!keepCustomSize) {
    next.width = element.width ?? preset.width;
    next.depth = element.depth ?? preset.depth;
  }

  if (preset.id === 'coffee_table' || preset.id === 'bedside_table') {
    delete next.seatsCount;
  }

  return next;
};

export const RAILING_PRESETS = [
  { id: 'rail_balcony', label: 'Balcony Railing', height: 1.05 },
  { id: 'rail_stair', label: 'Stair Railing', height: 0.9 },
];


export interface ToolDef {
  id: EditorTool;
  label: string;
  icon: React.ReactNode;
  category: 'draw' | 'edit' | 'view';
}

// Re-export Icons (unchanged imports mostly, added new ones)
export const WallIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M5 5H19V9H9V19H5V5Z" />
  </svg>
);

export const DoorIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="16" width="4" height="4" fill="currentColor" stroke="none" />
    <rect x="17" y="16" width="4" height="4" fill="currentColor" stroke="none" />
    <line x1="17" y1="16" x2="17" y2="4" />
    <path d="M17,4 C10,4 7,8 7,16" />
  </svg>
);

export const WindowIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
    <rect x="3" y="10" width="4" height="4" fill="currentColor" stroke="none" />
    <rect x="17" y="10" width="4" height="4" fill="currentColor" stroke="none" />
    <line x1="7" y1="10" x2="17" y2="10" />
    <line x1="7" y1="12" x2="17" y2="12" />
    <line x1="7" y1="14" x2="17" y2="14" />
  </svg>
);

export const WallOpeningIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="8" y="2" width="8" height="6" strokeDasharray="2 1" />
    <rect x="8" y="16" width="8" height="6" strokeDasharray="2 1" />
    <path d="M4 12h16" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" />
    <path d="M7 9l-3 3 3 3" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M17 9l3 3-3 3" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const ColumnIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="6" y="6" width="12" height="12" />
  </svg>
);

export const StairIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 20h16V4h-4v4h-4v4H8v4H4v4z" />
  </svg>
);

export const LabelIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 20L12 4L18 20" />
    <path d="M8 14H16" />
  </svg>
);

export const SelectIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z" />
    <path d="M13 13l6 6" />
  </svg>
);

export const MoveIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M12 2v20M2 12h20M12 2l-3 3M12 2l3 3M12 22l-3-3M12 22l3-3M2 12l3-3M2 12l3 3M22 12l-3-3M22 12l3 3" />
  </svg>
);

export const CopyIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="4" width="10" height="12" rx="1" />
    <rect x="9" y="8" width="10" height="12" rx="1" />
  </svg>
);

export const RotateIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M21 12a9 9 0 11-9-9c2.52 0 4.85.83 6.72 2.25" />
    <path d="M21 3v4h-4" />
    <path d="M3 12a9 9 0 0015.28 6.25" />
    <path d="M3 21v-4h4" />
  </svg>
);

export const MirrorIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="6" width="8" height="12" />
    <rect x="13" y="6" width="8" height="12" fill="currentColor" stroke="none" />
    <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" />
  </svg>
);

export const DimensionIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 16v-2h16v2M4 14l2-2m-2 2l-2-2M20 14l-2-2m2 2l2-2" />
    <text x="12" y="10" fontSize="6" textAnchor="middle" fill="currentColor" stroke="none">12'-4"</text>
    <path d="M12 12h.01" />
  </svg>
);

export const FitToViewIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4" />
    <rect x="8" y="8" width="8" height="8" fill="currentColor" stroke="none" />
  </svg>
);

export const OrthoIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M7 6v12h12" />
    <path d="M7 13h5v5" strokeWidth="1.5" />
  </svg>
);

export const LineIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 21l18-18" />
    <circle cx="3" cy="21" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="21" cy="3" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

export const RectIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="4" y="5" width="16" height="14" rx="1" />
  </svg>
);

export const SplitIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 15a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    <path d="M6 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
    <path d="M20 5 8.5 10.5" />
    <path d="m8.5 13.5 11.5 5.5" />
    <path d="M11 12 8.5 12" />
    <path d="M20 7.5c.3 0 .5.2.5.5s-.2.5-.5.5" />
    <path d="M20 15.5c.3 0 .5.2.5.5s-.2.5-.5.5" />
  </svg>
);

export const RailingIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
     <path d="M4 18h16" />
     <path d="M4 6h16" />
     <path d="M6 6v12" />
     <path d="M10 6v12" />
     <path d="M14 6v12" />
     <path d="M18 6v12" />
  </svg>
);

export const CounterIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M3 8h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8z" />
    <path d="M3 6h18v2H3z" />
  </svg>
);

export const PROCEDURAL_STYLES = ['Standard', 'Open Plan', 'Cellular', 'Linear'];
export const PROCEDURAL_GEOMETRIES = ['Rectilinear', 'Angular', 'Organic', 'Circular'];

export const PROCEDURAL_TYPOLOGIES = [
  { 
    id: 'residential', 
    label: 'Residential', 
    programId: 'domestic-standard', 
    subtypes: [
      'studio', '1br', '2br', '3br', '4br', 
      'duplex', 'penthouse', 
      'house', 'villa', 'row-house', 'farmhouse',
      'coliving'
    ] 
  },
  { id: 'office', label: 'Office', programId: 'office-corporate', subtypes: ['open office', 'corporate', 'co-working'] },
  { id: 'retail', label: 'Retail', programId: 'retail-shop', subtypes: ['shop', 'showroom', 'grocery'] },
  { id: 'food', label: 'Food & Beverage', programId: 'food-restaurant', subtypes: ['cafe', 'restaurant', 'QSR'] },
  { id: 'healthcare', label: 'Healthcare', programId: 'healthcare-clinic', subtypes: ['clinic', 'ward'] },
  { id: 'education', label: 'Education', programId: 'educational-center', subtypes: ['classrooms', 'training center'] },
  { id: 'industrial', label: 'Industrial / Warehouse', programId: 'industrial-warehouse', subtypes: ['warehouse', 'factory', 'storage'] },
];

export const APP_COLORS = {
  primary: '#2563eb', // blue-600
  secondary: '#64748b', // slate-50
  background: '#f8fafc', // slate-50
  grid: '#e2e8f0', // slate-200
  wall: '#1e293b', // slate-800
  door: '#92400e', // amber-800
  window: '#0369a1', // sky-700
  column: '#334155', // slate-700
  railing: '#475569',
  furniture: '#64748b', // slate-500 (lighter)
  furnitureFill: 'rgba(100, 116, 139, 0.05)',
  fixture: '#059669', // emerald-600
  highlight: '#3b82f6', // blue-500
  selectionOverlay: 'rgba(59, 130, 246, 0.2)', // translucent blue
  crossingOverlay: 'rgba(34, 197, 94, 0.2)', // translucent green
  
  // Urban Layers
  massing: '#334155', // slate-700
  road: '#94a3b8', // slate-400
  landscape: '#22c55e', // green-500
  water: '#0ea5e9', // sky-500
  infrastructure: '#f59e0b', // amber-500
};

export const URBAN_ROAD_WIDTHS = [
  { id: 'road_primary', label: 'Primary Road (24m)', width: 24 },
  { id: 'road_secondary', label: 'Secondary Road (12m)', width: 12 },
  { id: 'road_local', label: 'Local Street (8m)', width: 8 },
  { id: 'road_pedestrian', label: 'Pedestrian Way (4m)', width: 4 },
];

export const URBAN_USAGE_TYPES = [
  { id: 'res_high', label: 'High-Density Residential', color: '#1e293b', usage: 'residential' },
  { id: 'res_mid', label: 'Mid-Density Residential', color: '#334155', usage: 'residential' },
  { id: 'res_low', label: 'Low-Density Residential', color: '#475569', usage: 'residential' },
  { id: 'office', label: 'Office / Corporate', color: '#2563eb', usage: 'commercial' },
  { id: 'retail', label: 'Retail / Commercial', color: '#db2777', usage: 'mixed-use' },
  { id: 'cultural', label: 'Cultural / Landmark', color: '#7c3aed', usage: 'institutional' },
  { id: 'infrastructure', label: 'Utility / Service', color: '#f59e0b', usage: 'infrastructure' },
];
