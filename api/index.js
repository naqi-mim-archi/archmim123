// GENERATED from services/vercelApiHandler.ts by scripts/buildApiFunction.mjs. Do not edit.
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res, err) => function __init() {
  if (err) throw err[0];
  try {
    return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
  } catch (e) {
    throw err = [e], e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// constants.tsx
import { jsx, jsxs } from "react/jsx-runtime";
function interiorPreset(preset) {
  const inferredType = !("type" in preset) && preset.mainCategory === "1. Furniture" ? { type: "furniture" } : {};
  return {
    catalogGroup: "Interior Elements",
    snapMode: "default",
    ...inferredType,
    ...preset
  };
}
var WALL_THICKNESS_DEFAULT, FT_TO_M, WALL_HEIGHT_DEFAULT, DOOR_HEIGHT_DEFAULT, WINDOW_SILL_HEIGHT_DEFAULT, WINDOW_TOP_HEIGHT_DEFAULT, WALL_OPENING_HEIGHT_DEFAULT, DEFAULT_PROJECT_SETTINGS_3D, WALL_PRESETS, DOOR_PRESETS, WINDOW_PRESETS, COLUMN_PRESETS, STAIR_PRESETS, FURNITURE_PRESETS, FIXTURE_PRESETS, COUNTER_PRESETS, INTERIOR_ELEMENT_PRESETS, uniqueCatalogValues, INTERIOR_FURNITURE_SUBTYPES, INTERIOR_FIXTURE_COUNTER_SUBTYPES, INTERIOR_INVENTORY_STATS, INTERIOR_PRESET_ALIASES, normalizeInteriorLookupKey, getCanonicalInteriorPreset, normalizeInteriorSubType, normalizeInteriorElement;
var init_constants = __esm({
  "constants.tsx"() {
    WALL_THICKNESS_DEFAULT = 0.23;
    FT_TO_M = 0.3048;
    WALL_HEIGHT_DEFAULT = 10 * FT_TO_M;
    DOOR_HEIGHT_DEFAULT = 7 * FT_TO_M;
    WINDOW_SILL_HEIGHT_DEFAULT = 3 * FT_TO_M;
    WINDOW_TOP_HEIGHT_DEFAULT = 7 * FT_TO_M;
    WALL_OPENING_HEIGHT_DEFAULT = 7 * FT_TO_M;
    DEFAULT_PROJECT_SETTINGS_3D = {
      level1Z: 0,
      level2Z: 11 * FT_TO_M,
      slabThickness: 1 * FT_TO_M,
      defaultLevelHeight: WALL_HEIGHT_DEFAULT,
      wallHeight: WALL_HEIGHT_DEFAULT,
      doorHeight: DOOR_HEIGHT_DEFAULT,
      windowSillHeight: WINDOW_SILL_HEIGHT_DEFAULT,
      windowTopHeight: WINDOW_TOP_HEIGHT_DEFAULT,
      wallOpeningHeight: WALL_OPENING_HEIGHT_DEFAULT,
      inchesDecimalPlaces: 0
    };
    WALL_PRESETS = [
      { id: "wall_ext_res", label: 'Residential Exterior (9")', thickness: 0.23 },
      { id: "wall_ext_comm", label: 'Commercial Exterior (12")', thickness: 0.3 },
      { id: "wall_ext_light", label: 'Lightweight Exterior (6")', thickness: 0.15 },
      { id: "wall_int_struct", label: 'Structural Interior (6")', thickness: 0.15 },
      { id: "wall_int_res", label: 'Res/Comm Interior (4.5")', thickness: 0.115 },
      { id: "wall_part", label: 'Partition Wall (3")', thickness: 0.075 },
      { id: "wall_glass", label: "Glass Partition", thickness: 0.012 }
    ];
    DOOR_PRESETS = [
      { id: "door_single_sm", label: `Single 2'3" (Bath)`, width: 0.686, subType: "single" },
      { id: "door_single_md", label: `Single 2'9" (Bed)`, width: 0.838, subType: "single" },
      { id: "door_single_lg", label: `Single 3'0" (Office)`, width: 0.914, subType: "single" },
      { id: "door_main", label: `Main Entrance 4'0"`, width: 1.219, subType: "single" },
      { id: "door_double_int", label: `Double 5'0"`, width: 1.524, subType: "double" },
      { id: "door_double_main", label: `Double Main 6'0"`, width: 1.829, subType: "double" },
      { id: "door_sliding", label: "Sliding Door", width: 1.5, subType: "sliding" },
      { id: "door_folding", label: "Folding Door", width: 1.5, subType: "folding" },
      { id: "door_glass", label: "Glass Door", width: 0.914, subType: "glass" }
    ];
    WINDOW_PRESETS = [
      { id: "win_reg_sm", label: "Regular 3'x4'", width: 0.914, height: 1.219 },
      { id: "win_reg_md", label: "Regular 4'x4'", width: 1.219, height: 1.219 },
      { id: "win_reg_lg", label: "Regular 5'x4'", width: 1.524, height: 1.219 },
      { id: "win_liv", label: "Living 6'x4'", width: 1.829, height: 1.219 },
      { id: "win_angled_bay", label: "Angled Bay Window", width: 2.5, subType: "angled-bay" },
      { id: "win_box_bay", label: "Box Bay Window", width: 2, subType: "box-bay" },
      { id: "win_curved_bay", label: "Curved Bay Window", width: 2.5, subType: "curved-bay" }
    ];
    COLUMN_PRESETS = [
      { id: "col_lg_sq", label: 'Large 18"x18"', width: 0.45, depth: 0.45, shape: "rect" },
      { id: "col_sm_sq", label: 'Small 9"x9"', width: 0.23, depth: 0.23, shape: "rect" },
      { id: "col_md_sq", label: 'Medium 12"x12"', width: 0.3, depth: 0.3, shape: "rect" },
      { id: "col_hv_sq", label: 'Heavy 24"x24"', width: 0.6, depth: 0.6, shape: "rect" },
      { id: "col_md_cir", label: 'Round 12"', width: 0.3, depth: 0.3, shape: "circle" }
    ];
    STAIR_PRESETS = [
      { id: "stair_lin", label: "Linear", subType: "linear", width: 1.05 },
      { id: "stair_l", label: "L-Shape", subType: "L", width: 1.05 },
      { id: "stair_u", label: "U-Shape", subType: "U", width: 1.05 },
      { id: "stair_spiral", label: "Spiral", subType: "spiral", width: 1.5 }
    ];
    FURNITURE_PRESETS = [
      interiorPreset({ id: "bed_single", label: "Single Bed", width: 0.9, depth: 2, height: 0.65, subType: "bed_single", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "bed_queen", label: "Queen Bed", width: 1.5, depth: 2, height: 0.75, subType: "bed_queen", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "bed_king", label: "King Bed", width: 1.9, depth: 2, height: 0.75, subType: "bed_king", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "bed_twin_pair", label: "Twin Beds", width: 1.95, depth: 2, height: 0.65, subType: "bed_twin_pair", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "bed_bunk", label: "Bunk Bed", width: 1.05, depth: 2.05, height: 1.85, subType: "bed_bunk", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "bed_loft", label: "Loft Bed", width: 1.15, depth: 2.05, height: 1.95, subType: "bed_loft", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "bed_sofa", label: "Sofa Bed", width: 1.95, depth: 0.95, height: 0.78, subType: "sofa_bed", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "sofa", snapMode: "back-only" }),
      interiorPreset({ id: "bed_side_tables", label: "Bed w/ Side Tables", width: 2.35, depth: 2.05, height: 0.75, subType: "bed_side_tables", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "bed_storage", label: "Bed w/ Storage", width: 1.65, depth: 2.12, height: 0.78, subType: "bed_storage", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "day_bed", label: "Day Bed", width: 0.9, depth: 1.95, height: 0.7, subType: "day_bed", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "hospital_bed", label: "Hospital Bed", width: 1, depth: 2.1, height: 0.9, subType: "hospital_bed", category: "bed", mainCategory: "1. Furniture", subCategory: "Beds & Sleeping", iconType: "bed", snapMode: "back-only" }),
      interiorPreset({ id: "office_chair", label: "Office Chair", width: 0.6, depth: 0.6, height: 0.9, subType: "office_chair", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "chair", snapMode: "default" }),
      interiorPreset({ id: "chair_accent", label: "Accent Chair", width: 0.82, depth: 0.74, height: 0.85, subType: "chair_accent", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "chair", snapMode: "default" }),
      interiorPreset({ id: "chair_modern", label: "Modern Chair", width: 0.62, depth: 0.58, height: 0.82, subType: "chair_modern", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "chair", snapMode: "default" }),
      interiorPreset({ id: "chair_platner", label: "Platner Chair", width: 0.68, depth: 0.62, height: 0.82, subType: "chair_platner", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "chair", snapMode: "default" }),
      interiorPreset({ id: "chair_z", label: "Z Chair", width: 0.7, depth: 0.82, height: 0.82, subType: "chair_z", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "chair", snapMode: "default" }),
      interiorPreset({ id: "stool_bar", label: "Bar Stool", width: 0.45, depth: 0.45, height: 0.95, subType: "stool_bar", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "chair", snapMode: "default" }),
      interiorPreset({ id: "ottoman_square", label: "Square Ottoman", width: 0.65, depth: 0.65, height: 0.42, subType: "ottoman_square", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "ottoman", snapMode: "default" }),
      interiorPreset({ id: "ottoman_tufted", label: "Tufted Ottoman", width: 1.15, depth: 0.75, height: 0.42, subType: "ottoman_tufted", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "ottoman", snapMode: "default" }),
      interiorPreset({ id: "ottoman_puff", label: "Puff Ottoman", width: 0.7, depth: 0.7, height: 0.42, subType: "ottoman_puff", category: "chair", mainCategory: "1. Furniture", subCategory: "Seating", iconType: "ottoman", snapMode: "default" }),
      interiorPreset({ id: "sofa_1", label: "Sofa 1-Seater", width: 0.9, depth: 0.9, height: 0.78, subType: "sofa", category: "sofa", mainCategory: "1. Furniture", subCategory: "Sofas & Lounge", iconType: "sofa", snapMode: "default" }),
      interiorPreset({ id: "sofa_2", label: "Sofa 2-Seater", width: 1.5, depth: 0.9, height: 0.78, subType: "sofa", category: "sofa", mainCategory: "1. Furniture", subCategory: "Sofas & Lounge", iconType: "sofa", snapMode: "default" }),
      interiorPreset({ id: "sofa_3", label: "Sofa 3-Seater", width: 2.1, depth: 0.9, height: 0.78, subType: "sofa", category: "sofa", mainCategory: "1. Furniture", subCategory: "Sofas & Lounge", iconType: "sofa", snapMode: "default" }),
      interiorPreset({ id: "sofa_round_edge", label: "Round Edge Sofa", width: 1.55, depth: 1.25, height: 0.78, subType: "sofa_round_edge", category: "sofa", mainCategory: "1. Furniture", subCategory: "Sofas & Lounge", iconType: "sofa-round", snapMode: "default" }),
      interiorPreset({ id: "sofa_kidney", label: "Kidney Sofa", width: 2.15, depth: 1.05, height: 0.78, subType: "sofa_kidney", category: "sofa", mainCategory: "1. Furniture", subCategory: "Sofas & Lounge", iconType: "sofa-round", snapMode: "default" }),
      interiorPreset({ id: "sofa_curved_lounge", label: "Curved Lounge Sofa", width: 2.4, depth: 1.1, height: 0.78, subType: "sofa_curved_lounge", category: "sofa", mainCategory: "1. Furniture", subCategory: "Sofas & Lounge", iconType: "sofa-round", snapMode: "default" }),
      interiorPreset({ id: "sofa_l_sectional_extendable", label: "L-Shape Sofa", width: 1.5, depth: 1.6, height: 0.78, subType: "sofa_l_sectional_extendable", shape: "L", category: "sofa", mainCategory: "1. Furniture", subCategory: "Sofas & Lounge", iconType: "sofa-l", snapMode: "default" }),
      interiorPreset({ id: "table_dining_4", label: "Dining Table (4)", width: 1.2, depth: 1.2, height: 0.75, subType: "table_4", category: "table", mainCategory: "1. Furniture", subCategory: "Dining", iconType: "dining" }),
      interiorPreset({ id: "table_dining_6", label: "Dining Table (6)", width: 1.8, depth: 1, height: 0.75, subType: "table_6", category: "table", mainCategory: "1. Furniture", subCategory: "Dining", iconType: "dining" }),
      interiorPreset({ id: "table_dining_8", label: "Dining Table (8)", width: 2.4, depth: 1.1, height: 0.75, subType: "table_8", category: "table", mainCategory: "1. Furniture", subCategory: "Dining", iconType: "dining" }),
      interiorPreset({ id: "table_round_dining", label: "Round Dining Table", width: 1.3, depth: 1.3, height: 0.75, subType: "table_round_dining", shape: "circle", category: "table", mainCategory: "1. Furniture", subCategory: "Dining", iconType: "round-table" }),
      interiorPreset({ id: "table_cafe", label: "Cafe Table", width: 0.7, depth: 0.7, height: 0.75, subType: "table_cafe", shape: "circle", category: "table", mainCategory: "1. Furniture", subCategory: "Dining", iconType: "round-table" }),
      interiorPreset({ id: "coffee_table", label: "Coffee Table", width: 0.9, depth: 0.6, height: 0.42, subType: "coffee", category: "table", mainCategory: "1. Furniture", subCategory: "Tables", iconType: "table" }),
      interiorPreset({ id: "table_oval_coffee", label: "Oval Coffee Table", width: 1.35, depth: 0.7, height: 0.42, subType: "table_oval_coffee", category: "table", mainCategory: "1. Furniture", subCategory: "Tables", iconType: "round-table" }),
      interiorPreset({ id: "table_round_side", label: "Round Side Table", width: 0.6, depth: 0.6, height: 0.55, subType: "table_round_side", shape: "circle", category: "table", mainCategory: "1. Furniture", subCategory: "Tables", iconType: "round-table" }),
      interiorPreset({ id: "table_bar", label: "Bar Table", width: 0.75, depth: 0.65, height: 1.05, subType: "table_bar", category: "table", mainCategory: "1. Furniture", subCategory: "Tables", iconType: "round-table" }),
      interiorPreset({ id: "desk", label: "Study Desk", width: 1.2, depth: 0.6, height: 0.75, subType: "desk", category: "desk", mainCategory: "1. Furniture", subCategory: "Tables", iconType: "desk", snapMode: "preferred-wall" }),
      interiorPreset({ id: "wardrobe", label: "Wardrobe", width: 1.5, depth: 0.6, height: 2.1, subType: "wardrobe", category: "storage", mainCategory: "1. Furniture", subCategory: "Storage & Display", iconType: "storage", snapMode: "preferred-wall" }),
      interiorPreset({ id: "bedside_table", label: "Bedside Table", width: 0.5, depth: 0.45, height: 0.55, subType: "bedside", category: "storage", mainCategory: "1. Furniture", subCategory: "Storage & Display", iconType: "storage", snapMode: "default" }),
      interiorPreset({ id: "tv_console", label: "TV Unit", width: 1.6, depth: 0.4, height: 0.55, subType: "tv_console", category: "storage", mainCategory: "1. Furniture", subCategory: "Storage & Display", iconType: "storage", snapMode: "preferred-wall" }),
      interiorPreset({ id: "display_shelf", label: "Display Shelf", width: 1.2, depth: 0.45, height: 1.8, subType: "shelf", category: "storage", mainCategory: "1. Furniture", subCategory: "Storage & Display", iconType: "storage", snapMode: "preferred-wall" }),
      interiorPreset({ id: "cabinet_file", label: "Filing Cabinet", width: 0.8, depth: 0.5, height: 1.25, subType: "filing", category: "storage", mainCategory: "1. Furniture", subCategory: "Storage & Display", iconType: "storage", snapMode: "preferred-wall" }),
      interiorPreset({ id: "buffet_cabinet", label: "Buffet Cabinet", width: 2.5, depth: 0.45, height: 0.9, subType: "buffet_cabinet", category: "storage", mainCategory: "1. Furniture", subCategory: "Storage & Display", iconType: "storage", snapMode: "preferred-wall" }),
      interiorPreset({ id: "credenza", label: "Credenza", width: 2, depth: 0.5, height: 0.82, subType: "credenza", category: "storage", mainCategory: "1. Furniture", subCategory: "Storage & Display", iconType: "storage", snapMode: "preferred-wall" }),
      interiorPreset({ id: "whiteboard", label: "Whiteboard", width: 1.8, depth: 0.1, height: 1.2, subType: "whiteboard", category: "display", mainCategory: "1. Furniture", subCategory: "Storage & Display", iconType: "display", snapMode: "hard-wall" }),
      interiorPreset({ id: "table_conference", label: "Conference Table", width: 2.8, depth: 1.2, height: 0.75, subType: "conference", category: "office", mainCategory: "4. Counters", subCategory: "Office Furniture", iconType: "dining" }),
      interiorPreset({ id: "reception_desk", label: "Reception Desk", width: 1.8, depth: 0.7, height: 1.1, subType: "reception", category: "office", mainCategory: "4. Counters", subCategory: "Office Furniture", iconType: "counter", snapMode: "preferred-wall" })
    ];
    FIXTURE_PRESETS = [
      interiorPreset({ id: "cntr_kitchen", label: "Kitchen Counter", depth: 0.6, width: 2, height: 0.9, subType: "standard", type: "counter", category: "counter", mainCategory: "2. Kitchen", subCategory: "Counters & Cabinetry", iconType: "counter", snapMode: "hard-wall" }),
      interiorPreset({ id: "cntr_island", label: "Kitchen Island", depth: 0.9, width: 2, height: 0.9, subType: "island", type: "counter", category: "counter", mainCategory: "2. Kitchen", subCategory: "Counters & Cabinetry", iconType: "counter" }),
      interiorPreset({ id: "cntr_l_kitchen", label: "L Kitchen Counter", depth: 1.6, width: 2.4, height: 0.9, subType: "counter_l_kitchen", shape: "L", type: "counter", category: "counter", mainCategory: "2. Kitchen", subCategory: "Counters & Cabinetry", iconType: "counter-l", snapMode: "hard-wall" }),
      interiorPreset({ id: "cntr_base_cabinet", label: "Base Cabinet", depth: 0.6, width: 1.2, height: 0.9, subType: "base_cabinet", type: "counter", category: "counter", mainCategory: "2. Kitchen", subCategory: "Counters & Cabinetry", iconType: "counter", snapMode: "hard-wall" }),
      interiorPreset({ id: "fix_sink", label: "Kitchen Sink", width: 0.8, depth: 0.5, height: 0.25, subType: "sink", type: "fixture", category: "sanitary", mainCategory: "2. Kitchen", subCategory: "Fixtures", iconType: "sink", snapMode: "counter-only" }),
      interiorPreset({ id: "fix_double_sink", label: "Double Kitchen Sink", width: 1.1, depth: 0.55, height: 0.25, subType: "double_sink", type: "fixture", category: "sanitary", mainCategory: "2. Kitchen", subCategory: "Fixtures", iconType: "sink", snapMode: "counter-only" }),
      interiorPreset({ id: "fix_stove", label: "Kitchen Stove", width: 0.75, depth: 0.6, height: 0.15, subType: "stove", type: "fixture", category: "appliance", mainCategory: "2. Kitchen", subCategory: "Appliances", iconType: "stove", snapMode: "counter-only" }),
      interiorPreset({ id: "appliance_hob_2", label: "Two Burner Hob", width: 0.45, depth: 0.52, height: 0.12, subType: "hob_2", type: "fixture", category: "appliance", mainCategory: "2. Kitchen", subCategory: "Appliances", iconType: "stove", snapMode: "counter-only" }),
      interiorPreset({ id: "appliance_hob_4", label: "Four Burner Hob", width: 0.6, depth: 0.52, height: 0.12, subType: "hob_4", type: "fixture", category: "appliance", mainCategory: "2. Kitchen", subCategory: "Appliances", iconType: "stove", snapMode: "counter-only" }),
      interiorPreset({ id: "appliance_fridge", label: "Refrigerator", width: 0.8, depth: 0.75, height: 1.9, subType: "fridge", type: "fixture", category: "appliance", mainCategory: "2. Kitchen", subCategory: "Appliances", iconType: "appliance" }),
      interiorPreset({ id: "appliance_washer", label: "Washing Machine", width: 0.65, depth: 0.65, height: 0.9, subType: "washer", type: "fixture", category: "appliance", mainCategory: "2. Kitchen", subCategory: "Appliances", iconType: "appliance" }),
      interiorPreset({ id: "fix_wc", label: "Toilet (WC)", width: 0.5, depth: 0.7, height: 0.78, subType: "wc", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Toilets", iconType: "toilet", snapMode: "hard-wall" }),
      interiorPreset({ id: "fix_wc_wall_hung", label: "Wall Hung Toilet", width: 0.52, depth: 0.62, height: 0.78, subType: "wc_wall_hung", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Toilets", iconType: "toilet", snapMode: "hard-wall" }),
      interiorPreset({ id: "fix_basin", label: "Wash Basin", width: 0.6, depth: 0.5, height: 0.85, subType: "basin", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Basins", iconType: "basin", snapMode: "hard-wall" }),
      interiorPreset({ id: "fix_vanity_basin", label: "Vanity Basin", width: 0.9, depth: 0.5, height: 0.85, subType: "vanity_basin", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Basins", iconType: "basin", snapMode: "hard-wall" }),
      interiorPreset({ id: "fix_corner_basin", label: "Corner Basin", width: 0.55, depth: 0.55, height: 0.85, subType: "corner_basin", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Basins", iconType: "basin", snapMode: "hard-wall" }),
      interiorPreset({ id: "fix_shower", label: "Shower Cubicle", width: 0.9, depth: 0.9, height: 2.1, subType: "shower", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Showers", iconType: "shower" }),
      interiorPreset({ id: "fix_shower_rect", label: "Rectangular Shower", width: 1.2, depth: 0.9, height: 2.1, subType: "shower_rect", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Showers", iconType: "shower" }),
      interiorPreset({ id: "fix_bath", label: "Bath Tub", width: 1.7, depth: 0.8, height: 0.6, subType: "bath", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Bathtubs", iconType: "bathtub", snapMode: "hard-wall" }),
      interiorPreset({ id: "fix_corner_bath", label: "Corner Bathtub", width: 1.4, depth: 1.4, height: 0.6, subType: "bath_corner", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Bathtubs", iconType: "bathtub", snapMode: "hard-wall" }),
      interiorPreset({ id: "bath_vanity_unit", label: "Bathroom Vanity Unit", width: 1, depth: 0.5, height: 0.85, subType: "bath_vanity_unit", type: "fixture", category: "sanitary", mainCategory: "3. Bathroom", subCategory: "Bathroom Furniture", iconType: "storage", snapMode: "hard-wall" }),
      interiorPreset({ id: "counter_service", label: "Service Counter", depth: 0.7, width: 2, height: 1.05, subType: "service_counter", type: "counter", category: "counter", mainCategory: "4. Counters", subCategory: "Service Counters", iconType: "counter", snapMode: "preferred-wall" }),
      interiorPreset({ id: "cashier_desk", label: "Checkout Counter", width: 1.4, depth: 0.6, height: 1.05, subType: "cashier", type: "counter", category: "counter", mainCategory: "4. Counters", subCategory: "Service Counters", iconType: "counter", snapMode: "preferred-wall" }),
      interiorPreset({ id: "counter_reception_arc", label: "Curved Reception Counter", width: 2.2, depth: 0.85, height: 1.1, subType: "reception_curved", type: "counter", category: "counter", mainCategory: "4. Counters", subCategory: "Service Counters", iconType: "counter-round", snapMode: "preferred-wall" }),
      interiorPreset({ id: "counter_display_case", label: "Display Counter", width: 1.8, depth: 0.55, height: 1, subType: "display_counter", type: "counter", category: "counter", mainCategory: "4. Counters", subCategory: "Display Elements", iconType: "display", snapMode: "preferred-wall" })
    ];
    COUNTER_PRESETS = FIXTURE_PRESETS.filter((f) => f.type === "counter");
    INTERIOR_ELEMENT_PRESETS = [...FURNITURE_PRESETS, ...FIXTURE_PRESETS];
    uniqueCatalogValues = (values) => Array.from(new Set(values.filter((value) => !!value)));
    INTERIOR_FURNITURE_SUBTYPES = uniqueCatalogValues(FURNITURE_PRESETS.map((preset) => preset.subType));
    INTERIOR_FIXTURE_COUNTER_SUBTYPES = uniqueCatalogValues(FIXTURE_PRESETS.map((preset) => preset.subType));
    INTERIOR_INVENTORY_STATS = {
      total: INTERIOR_ELEMENT_PRESETS.length,
      furniture: FURNITURE_PRESETS.length,
      fixturesAndCounters: FIXTURE_PRESETS.length,
      byMainCategory: INTERIOR_ELEMENT_PRESETS.reduce((acc, preset) => {
        const key = preset.mainCategory || "Uncategorized";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {})
    };
    INTERIOR_PRESET_ALIASES = {
      table_dining_4: "table_dining_4",
      dining_table_4: "table_dining_4",
      table_4: "table_dining_4",
      table_dining_6: "table_dining_6",
      dining_table_6: "table_dining_6",
      table_6: "table_dining_6",
      table_dining_8: "table_dining_8",
      dining_table_8: "table_dining_8",
      table_8: "table_dining_8",
      coffee_table: "coffee_table",
      coffee: "coffee_table",
      bedside_table: "bedside_table",
      side_table: "bedside_table",
      nightstand: "bedside_table",
      table_conference: "table_conference",
      conference_table: "table_conference",
      reception_desk: "reception_desk",
      cabinet_file: "cabinet_file",
      display_shelf: "display_shelf",
      cashier_desk: "cashier_desk",
      cntr_kitchen: "cntr_kitchen",
      cntr_island: "cntr_island",
      cntr_l_kitchen: "cntr_l_kitchen",
      cntr_base_cabinet: "cntr_base_cabinet",
      fix_sink: "fix_sink",
      fix_double_sink: "fix_double_sink",
      fix_stove: "fix_stove",
      appliance_hob_2: "appliance_hob_2",
      appliance_hob_4: "appliance_hob_4",
      appliance_fridge: "appliance_fridge",
      appliance_washer: "appliance_washer",
      fix_wc: "fix_wc",
      fix_wc_wall_hung: "fix_wc_wall_hung",
      fix_basin: "fix_basin",
      fix_vanity_basin: "fix_vanity_basin",
      fix_corner_basin: "fix_corner_basin",
      fix_shower: "fix_shower",
      fix_shower_rect: "fix_shower_rect",
      fix_bath: "fix_bath",
      fix_corner_bath: "fix_corner_bath"
    };
    normalizeInteriorLookupKey = (value) => (value || "").toLowerCase().trim().replace(/[\s-]+/g, "_");
    getCanonicalInteriorPreset = (value) => {
      const key = normalizeInteriorLookupKey(value);
      if (!key) return void 0;
      const aliasedId = INTERIOR_PRESET_ALIASES[key] || key;
      return INTERIOR_ELEMENT_PRESETS.find((preset) => {
        const id = normalizeInteriorLookupKey(preset.id);
        const subType = normalizeInteriorLookupKey(preset.subType);
        return id === aliasedId || subType === key || id === key;
      });
    };
    normalizeInteriorSubType = (subType, label, shape) => {
      const key = normalizeInteriorLookupKey(subType);
      const labelKey = normalizeInteriorLookupKey(label);
      const preset = getCanonicalInteriorPreset(subType) || getCanonicalInteriorPreset(label);
      return preset?.subType || subType || "";
    };
    normalizeInteriorElement = (element) => {
      if (!["furniture", "fixture", "counter"].includes(element.type || "")) return element;
      const labelKey = normalizeInteriorLookupKey(element.label);
      const subtypeKey = normalizeInteriorLookupKey(element.subType);
      const labelIsCoffee = labelKey.includes("coffee");
      const labelIsBedside = labelKey.includes("bedside") || labelKey.includes("nightstand");
      const labelIsDining = labelKey.includes("dining");
      const preset = labelIsCoffee ? getCanonicalInteriorPreset("coffee_table") : labelIsBedside ? getCanonicalInteriorPreset("bedside_table") : labelIsDining && subtypeKey.includes("table") ? getCanonicalInteriorPreset(element.subType) : getCanonicalInteriorPreset(element.subType) || getCanonicalInteriorPreset(element.label);
      if (!preset) {
        const normalizedSubType = normalizeInteriorSubType(element.subType, element.label, element.shape);
        return normalizedSubType && normalizedSubType !== element.subType ? { ...element, subType: normalizedSubType } : element;
      }
      const keepCustomSize = typeof element.width === "number" && typeof element.depth === "number" && Math.abs(element.width - preset.width) > 0.02 && Math.abs(element.depth - preset.depth) > 0.02;
      const presetShape = "shape" in preset ? preset.shape : void 0;
      const next = {
        ...element,
        type: preset.type || element.type || "furniture",
        subType: preset.subType,
        label: element.label || preset.label,
        height: element.height ?? preset.height,
        shape: presetShape || element.shape,
        category: preset.category || element.category,
        iconType: preset.iconType || element.iconType
      };
      if (!keepCustomSize) {
        next.width = element.width ?? preset.width;
        next.depth = element.depth ?? preset.depth;
      }
      if (preset.id === "coffee_table" || preset.id === "bedside_table") {
        delete next.seatsCount;
      }
      return next;
    };
  }
});

// services/schema.ts
var schema_exports = {};
__export(schema_exports, {
  DIGITIZER_SCHEMA: () => DIGITIZER_SCHEMA,
  SHARED_SCHEMA: () => SHARED_SCHEMA
});
import { Type } from "@google/genai";
var SHARED_SCHEMA, DIGITIZER_SCHEMA;
var init_schema = __esm({
  "services/schema.ts"() {
    init_constants();
    SHARED_SCHEMA = {
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
              curveType: { type: Type.STRING, enum: ["line", "arc", "circle", "ellipse"], description: "Use 'arc', 'circle', or 'ellipse' for any visibly curved wall; otherwise use 'line'." },
              center: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Curve center [x, y] for arc/circle/ellipse when visible." },
              radius: { type: Type.NUMBER, description: "Circle or circular arc radius in meters." },
              startAngle: { type: Type.NUMBER, description: "Curve start angle in radians, measured in standard Cartesian coordinates." },
              endAngle: { type: Type.NUMBER, description: "Curve end angle in radians, measured in standard Cartesian coordinates." },
              counterclockwise: { type: Type.BOOLEAN, description: "Whether the arc follows counterclockwise direction from startAngle to endAngle." },
              radiusX: { type: Type.NUMBER, description: "Ellipse X radius in meters." },
              radiusY: { type: Type.NUMBER, description: "Ellipse Y radius in meters." },
              rotation: { type: Type.NUMBER, description: "Ellipse rotation in radians." },
              controlPoint: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Optional quadratic control point [x, y] if center/radius cannot be estimated." },
              type: { type: Type.STRING, enum: ["exterior", "interior", "partition", "glass"] }
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
              shape: { type: Type.STRING, enum: ["rect", "circle"] }
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
              type: { type: Type.STRING, enum: ["floor", "ceiling"] }
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
              type: { type: Type.STRING, enum: ["single", "double", "sliding", "folding", "glass"] },
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
              type: { type: Type.STRING, enum: ["standard", "bay", "full-height"] },
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
              shape: { type: Type.STRING, enum: ["linear", "L", "U"] }
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
    DIGITIZER_SCHEMA = {
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
              curveType: { type: Type.STRING, enum: ["line", "arc", "circle", "ellipse"], description: "Use 'arc', 'circle', or 'ellipse' for any visibly curved wall; otherwise use 'line'." },
              center: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Curve center [x, y] for arc/circle/ellipse when visible." },
              radius: { type: Type.NUMBER, description: "Circle or circular arc radius in meters." },
              startAngle: { type: Type.NUMBER, description: "Curve start angle in radians, measured in standard Cartesian coordinates." },
              endAngle: { type: Type.NUMBER, description: "Curve end angle in radians, measured in standard Cartesian coordinates." },
              counterclockwise: { type: Type.BOOLEAN, description: "Whether the arc follows counterclockwise direction from startAngle to endAngle." },
              radiusX: { type: Type.NUMBER, description: "Ellipse X radius in meters." },
              radiusY: { type: Type.NUMBER, description: "Ellipse Y radius in meters." },
              rotation: { type: Type.NUMBER, description: "Ellipse rotation in radians." },
              controlPoint: { type: Type.ARRAY, items: { type: Type.NUMBER }, description: "Optional quadratic control point [x, y] if center/radius cannot be estimated." },
              type: { type: Type.STRING, enum: ["exterior", "interior", "partition", "glass"] }
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
              type: { type: Type.STRING, enum: ["single", "double", "sliding", "folding", "glass"] },
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
              type: { type: Type.STRING, enum: ["standard", "bay", "full-height"] },
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
  }
});

// services/firebase/adminApp.ts
import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { getDatabaseWithUrl } from "firebase-admin/database";
var APP_NAME = "archai-admin";
var cached = null;
var getFirebaseProjectId = () => process.env.FIREBASE_PROJECT_ID || process.env.VITE_FIREBASE_PROJECT_ID || "";
var parseServiceAccount = () => {
  let raw = (process.env.FIREBASE_ADMIN_SA_KEY_JSON || "").trim();
  if (!raw) return { serviceAccount: null, error: null };
  if (raw.startsWith("'") && raw.endsWith("'") || raw.startsWith('"') && raw.endsWith('"') && !raw.startsWith("{")) {
    raw = raw.slice(1, -1);
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed.client_email || !parsed.private_key) {
      return { serviceAccount: null, error: "FIREBASE_ADMIN_SA_KEY_JSON is missing client_email or private_key." };
    }
    parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    return { serviceAccount: parsed, error: null };
  } catch {
    return { serviceAccount: null, error: "FIREBASE_ADMIN_SA_KEY_JSON is not valid JSON." };
  }
};
var getAdmin = () => {
  if (cached) return cached;
  const { serviceAccount, error } = parseServiceAccount();
  if (!serviceAccount) {
    cached = { app: null, serviceAccount: null, error };
    return cached;
  }
  try {
    const projectId = getFirebaseProjectId() || serviceAccount.project_id;
    const existing = getApps().find((app2) => app2.name === APP_NAME);
    const app = existing || initializeApp({
      credential: cert({
        projectId: serviceAccount.project_id,
        clientEmail: serviceAccount.client_email,
        privateKey: serviceAccount.private_key
      }),
      projectId,
      storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || (projectId ? `${projectId}.firebasestorage.app` : void 0)
    }, APP_NAME);
    cached = { app, serviceAccount, error: null };
  } catch (err) {
    cached = { app: null, serviceAccount, error: `firebase-admin failed to initialise: ${err?.message || err}` };
  }
  return cached;
};
var hasAdminCredentials = () => !!getAdmin().app;
var getAdminFirestore = () => {
  const { app, error } = getAdmin();
  if (!app) throw new Error(error || "FIREBASE_ADMIN_SA_KEY_JSON is not configured.");
  return getFirestore(app);
};
var getRealtimeDbUrl = () => process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL || "";
var getAdminDatabase = () => {
  const { app, error } = getAdmin();
  if (!app) throw new Error(error || "FIREBASE_ADMIN_SA_KEY_JSON is not configured.");
  const url = getRealtimeDbUrl();
  if (!url) throw new Error("VITE_FIREBASE_DATABASE_URL is not configured.");
  return getDatabaseWithUrl(url, app);
};
var getAdminStorageBucket = () => {
  const { app, error } = getAdmin();
  if (!app) throw new Error(error || "FIREBASE_ADMIN_SA_KEY_JSON is not configured.");
  return getStorage(app).bucket();
};
var getAdminConfigStatus = () => {
  const { app, serviceAccount, error } = getAdmin();
  return {
    projectId: getFirebaseProjectId() || null,
    hasServiceAccount: !!app,
    serviceAccountEmail: serviceAccount?.client_email || null,
    serviceAccountProjectId: serviceAccount?.project_id || null,
    error
  };
};

// services/firebase/verifyIdToken.ts
import crypto2 from "node:crypto";
var GOOGLE_SECURETOKEN_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var CLOCK_LEEWAY_SECONDS = 60;
var IdTokenError = class extends Error {
  constructor(message) {
    super(message);
    this.name = "IdTokenError";
  }
};
var defaultCertFetcher = async () => {
  const res = await fetch(GOOGLE_SECURETOKEN_CERTS_URL);
  if (!res.ok) throw new Error(`Could not fetch Google signing certificates (HTTP ${res.status}).`);
  const maxAge = /max-age=(\d+)/.exec(res.headers.get("cache-control") || "");
  return { certs: await res.json(), maxAgeSeconds: maxAge ? Number(maxAge[1]) : 3600 };
};
var certFetcher = defaultCertFetcher;
var certCache = null;
var getCerts = async (forceRefresh) => {
  if (!forceRefresh && certCache && certCache.expiresAt > Date.now()) return certCache.certs;
  const { certs, maxAgeSeconds } = await certFetcher();
  certCache = { certs, expiresAt: Date.now() + maxAgeSeconds * 1e3 };
  return certs;
};
var decodeSegment = (segment) => {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
  } catch {
    throw new IdTokenError("Malformed token.");
  }
};
var verifyFirebaseIdToken = async (token, projectId) => {
  if (!projectId) throw new IdTokenError("Firebase project id is not configured.");
  const parts = String(token || "").split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw new IdTokenError("Malformed token.");
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const header = decodeSegment(headerSegment);
  if (header?.alg !== "RS256") throw new IdTokenError("Unsupported token algorithm.");
  if (typeof header.kid !== "string" || !header.kid) throw new IdTokenError("Token has no key id.");
  let certs = await getCerts(false);
  if (!certs[header.kid]) certs = await getCerts(true);
  const cert2 = certs[header.kid];
  if (!cert2) throw new IdTokenError("Token was signed with an unknown key.");
  const verifier = crypto2.createVerify("RSA-SHA256");
  verifier.update(`${headerSegment}.${payloadSegment}`);
  const publicKey = new crypto2.X509Certificate(cert2).publicKey;
  if (!verifier.verify(publicKey, Buffer.from(signatureSegment, "base64url"))) {
    throw new IdTokenError("Invalid token signature.");
  }
  const payload = decodeSegment(payloadSegment);
  const now = Math.floor(Date.now() / 1e3);
  if (payload.aud !== projectId) throw new IdTokenError("Token audience does not match this project.");
  if (payload.iss !== `https://securetoken.google.com/${projectId}`) throw new IdTokenError("Token issuer does not match this project.");
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_LEEWAY_SECONDS < now) throw new IdTokenError("Token has expired.");
  if (typeof payload.iat !== "number" || payload.iat - CLOCK_LEEWAY_SECONDS > now) throw new IdTokenError("Token issued in the future.");
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new IdTokenError("Token has no subject.");
  return {
    uid: payload.sub,
    email: typeof payload.email === "string" ? payload.email : null,
    emailVerified: payload.email_verified === true
  };
};

// services/firebase/adminAuth.ts
var readBearerToken = (headers) => {
  const raw = headers?.authorization ?? headers?.Authorization;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const match = /^Bearer\s+(.+)$/i.exec(String(value || "").trim());
  return match ? match[1].trim() : null;
};
var verifyApiRequest = async (req) => {
  const token = readBearerToken(req.headers);
  if (!token) return { user: null, failure: "no-token" };
  const projectId = getFirebaseProjectId();
  if (!projectId) {
    return { user: null, failure: "server-unconfigured", message: "FIREBASE_PROJECT_ID is not set on the server." };
  }
  try {
    return { user: await verifyFirebaseIdToken(token, projectId), failure: null };
  } catch (err) {
    if (err instanceof IdTokenError) return { user: null, failure: "invalid-token", message: err.message };
    return { user: null, failure: "server-unconfigured", message: err?.message || String(err) };
  }
};

// services/billing/pricing.ts
var ACTION_PRICES = {
  generateAndConvert: 50,
  convertOnly: 25,
  render: 50,
  revitJob: 25
};
var STEP_COSTS = {
  floorplanGeneration: 25,
  floorplanConversion: 25,
  aiRender: 50,
  revitJob: 25
};
var SIGNUP_GRANT_TOKENS = 100;
var TOKEN_PACKS = [
  { id: "pack-100", tokens: 100, priceUsd: 9.99, priceCents: 999 },
  { id: "pack-500", tokens: 500, priceUsd: 25.99, priceCents: 2599 },
  { id: "pack-1000", tokens: 1e3, priceUsd: 49.99, priceCents: 4999 }
];
var FREE_STORAGE_BYTES = 5 * 1024 * 1024 * 1024;
var INSUFFICIENT_TOKENS_STATUS = 402;
var findTokenPack = (packId) => TOKEN_PACKS.find((pack) => pack.id === packId);
var formatTokens = (n) => Number.isFinite(n) ? Math.round(n).toLocaleString("en-US") : "\u2014";
var formatBytes = (n) => {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const value = n / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1).replace(/\.0$/, "")} ${units[exponent]}`;
};

// services/billing/tokenLedger.ts
var dbOverride = null;
var getDb = () => dbOverride || getAdminFirestore();
var SIGNUP_GRANT_ID = "signup-grant";
var entitlementRef = (db, uid) => db.collection("entitlements").doc(uid);
var ledgerRef = (db, uid, entryId) => entitlementRef(db, uid).collection("ledger").doc(entryId);
var assertUid = (uid) => {
  if (!uid || typeof uid !== "string") throw new Error("A user id is required for billing.");
};
var newEntitlement = (now) => ({
  tokenBalance: SIGNUP_GRANT_TOKENS,
  tokensGrantedLifetime: SIGNUP_GRANT_TOKENS,
  tokensSpentLifetime: 0,
  storageBytesUsed: 0,
  storageQuotaBytes: FREE_STORAGE_BYTES,
  signupGrantedAt: now,
  createdAt: now,
  updatedAt: now
});
var readOrInitEntitlement = async (tx, db, uid, now) => {
  const snap = await tx.get(entitlementRef(db, uid));
  if (snap.exists) return { entitlement: snap.data(), isNew: false };
  return { entitlement: newEntitlement(now), isNew: true };
};
var writeSignupGrant = (tx, db, uid, now) => {
  tx.set(ledgerRef(db, uid, SIGNUP_GRANT_ID), {
    type: "grant",
    amount: SIGNUP_GRANT_TOKENS,
    reason: "signup",
    detail: `Welcome grant: ${SIGNUP_GRANT_TOKENS} tokens`,
    balanceAfter: SIGNUP_GRANT_TOKENS,
    createdAt: now
  });
};
var ensureEntitlement = async (uid) => {
  assertUid(uid);
  const db = getDb();
  return db.runTransaction(async (tx) => {
    const now = /* @__PURE__ */ new Date();
    const { entitlement, isNew } = await readOrInitEntitlement(tx, db, uid, now);
    if (isNew) {
      tx.set(entitlementRef(db, uid), entitlement);
      writeSignupGrant(tx, db, uid, now);
    }
    return entitlement;
  });
};
var spendTokens = async (uid, input) => {
  assertUid(uid);
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new Error("Spend amount must be a positive integer.");
  const db = getDb();
  return db.runTransaction(async (tx) => {
    const now = /* @__PURE__ */ new Date();
    const { entitlement, isNew } = await readOrInitEntitlement(tx, db, uid, now);
    const entrySnap = await tx.get(ledgerRef(db, uid, input.requestId));
    if (entrySnap.exists) {
      const existing = entrySnap.data();
      if (isNew) {
        tx.set(entitlementRef(db, uid), entitlement);
        writeSignupGrant(tx, db, uid, now);
      }
      return { ok: true, balance: entitlement.tokenBalance, charged: Math.abs(existing.amount || 0), replayed: true };
    }
    if (entitlement.tokenBalance < input.amount) {
      if (isNew) {
        tx.set(entitlementRef(db, uid), entitlement);
        writeSignupGrant(tx, db, uid, now);
      }
      return { ok: false, balance: entitlement.tokenBalance, required: input.amount };
    }
    const balanceAfter = entitlement.tokenBalance - input.amount;
    tx.set(entitlementRef(db, uid), {
      ...entitlement,
      tokenBalance: balanceAfter,
      tokensSpentLifetime: (entitlement.tokensSpentLifetime || 0) + input.amount,
      updatedAt: now
    });
    if (isNew) writeSignupGrant(tx, db, uid, now);
    tx.set(ledgerRef(db, uid, input.requestId), {
      type: "spend",
      amount: -input.amount,
      reason: input.reason,
      detail: input.detail || input.reason,
      balanceAfter,
      createdAt: now
    });
    return { ok: true, balance: balanceAfter, charged: input.amount, replayed: false };
  });
};
var refundTokens = async (uid, requestId, detail) => {
  assertUid(uid);
  const db = getDb();
  return db.runTransaction(async (tx) => {
    const now = /* @__PURE__ */ new Date();
    const entSnap = await tx.get(entitlementRef(db, uid));
    const spendSnap = await tx.get(ledgerRef(db, uid, requestId));
    const refundSnap = await tx.get(ledgerRef(db, uid, `${requestId}:refund`));
    if (!entSnap.exists || !spendSnap.exists || refundSnap.exists) {
      return { refunded: 0, balance: entSnap.exists ? entSnap.data().tokenBalance : null };
    }
    const spend = spendSnap.data();
    if (spend.type !== "spend" || !(spend.amount < 0)) {
      return { refunded: 0, balance: entSnap.data().tokenBalance };
    }
    const entitlement = entSnap.data();
    const amount = Math.abs(spend.amount);
    const balanceAfter = entitlement.tokenBalance + amount;
    tx.set(entitlementRef(db, uid), {
      ...entitlement,
      tokenBalance: balanceAfter,
      tokensSpentLifetime: Math.max(0, (entitlement.tokensSpentLifetime || 0) - amount),
      updatedAt: now
    });
    tx.set(ledgerRef(db, uid, `${requestId}:refund`), {
      type: "refund",
      amount,
      reason: spend.reason || "refund",
      detail: detail || `Refund: ${spend.detail || spend.reason || "failed request"}`,
      balanceAfter,
      createdAt: now
    });
    return { refunded: amount, balance: balanceAfter };
  });
};
var recordStorageUsage = async (uid, bytes) => {
  assertUid(uid);
  const db = getDb();
  await entitlementRef(db, uid).set({ storageBytesUsed: Math.max(0, Math.round(bytes)), updatedAt: /* @__PURE__ */ new Date() }, { merge: true });
};

// services/billing/storageUsage.ts
var computeStorageUsage = async (uid) => {
  const [files] = await getAdminStorageBucket().getFiles({ prefix: `users/${uid}/` });
  return files.reduce((total, file) => total + Number(file.metadata?.size || 0), 0);
};
var getStorageUsage = async (uid) => {
  if (!hasAdminCredentials()) return { usedBytes: 0, quotaBytes: FREE_STORAGE_BYTES, metered: false };
  try {
    const usedBytes = await computeStorageUsage(uid);
    const entitlement = await ensureEntitlement(uid);
    await recordStorageUsage(uid, usedBytes).catch(() => void 0);
    return { usedBytes, quotaBytes: entitlement.storageQuotaBytes || FREE_STORAGE_BYTES, metered: true };
  } catch (err) {
    console.warn("[Billing] Storage usage could not be computed:", err);
    return { usedBytes: 0, quotaBytes: FREE_STORAGE_BYTES, metered: false };
  }
};
var checkStorageAllowance = async (uid, additionalBytes) => {
  const extra = Math.max(0, Number(additionalBytes) || 0);
  const usage = await getStorageUsage(uid);
  if (!usage.metered) return { allowed: true, ...usage };
  if (usage.usedBytes + extra > usage.quotaBytes) {
    return {
      allowed: false,
      ...usage,
      message: `This save would take you past your storage limit (${formatBytes(usage.usedBytes)} of ${formatBytes(usage.quotaBytes)} used). Delete some saved projects to free up space.`
    };
  }
  return { allowed: true, ...usage };
};

// services/billing/stripeClient.ts
import Stripe from "stripe";
var cachedStripe = null;
var isStripeConfigured = () => !!process.env.STRIPE_SECRET_KEY;
var getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY || "";
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  if (!cachedStripe || cachedStripe.key !== key) cachedStripe = { key, client: new Stripe(key) };
  return cachedStripe.client;
};
var getAppBaseUrl = () => {
  const configured = (process.env.APP_BASE_URL || "").trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  throw new Error("APP_BASE_URL is not configured.");
};
var createTokenCheckoutSession = async (input) => {
  const pack = findTokenPack(input.packId);
  if (!pack) throw Object.assign(new Error("Unknown token pack."), { statusCode: 400 });
  const baseUrl = getAppBaseUrl();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "usd",
        unit_amount: pack.priceCents,
        product_data: { name: `${formatTokens(pack.tokens)} ArchAI tokens` }
      }
    }],
    client_reference_id: input.uid,
    customer_email: input.email || void 0,
    metadata: { uid: input.uid, packId: pack.id, tokens: String(pack.tokens) },
    success_url: `${baseUrl}/?checkout=success&pack=${encodeURIComponent(pack.id)}`,
    cancel_url: `${baseUrl}/?checkout=cancelled`
  });
  return { url: session.url, sessionId: session.id };
};

// services/billing/billingRoutes.ts
var BILLING_UNCONFIGURED_MESSAGE = "Billing is not configured on the server (FIREBASE_ADMIN_SA_KEY_JSON is missing), so token balances cannot be read right now.";
var pathOf = (url) => String(url || "").split(/[?#]/)[0];
var routeBillingApiRequest = async (request, response) => {
  const path3 = pathOf(request.url);
  if (!path3.startsWith("/api/billing/")) return false;
  const method = String(request.method || "GET").toUpperCase();
  if (method === "GET" && path3 === "/api/billing/pricing") {
    const admin = getAdminConfigStatus();
    response.status(200).json({
      packs: TOKEN_PACKS,
      actionPrices: ACTION_PRICES,
      signupGrant: SIGNUP_GRANT_TOKENS,
      paymentsEnabled: isStripeConfigured(),
      server: {
        projectId: getFirebaseProjectId() || null,
        canVerifySignIn: !!getFirebaseProjectId(),
        canMeterTokens: admin.hasServiceAccount,
        serviceAccount: admin.serviceAccountEmail,
        serviceAccountProjectId: admin.serviceAccountProjectId,
        configError: admin.error,
        nodeVersion: process.version
      }
    });
    return true;
  }
  const isUserRoute = method === "GET" && path3 === "/api/billing/account" || method === "POST" && path3 === "/api/billing/storage/check" || method === "POST" && path3 === "/api/billing/checkout";
  if (!isUserRoute) {
    response.status(404).json({ error: "Not Found" });
    return true;
  }
  const user = request.user;
  if (!user) {
    response.status(401).json({ error: "Sign in to continue.", reason: "no-token" });
    return true;
  }
  if (path3 === "/api/billing/storage/check") {
    response.status(200).json(await checkStorageAllowance(user.uid, request.body?.additionalBytes));
    return true;
  }
  if (!hasAdminCredentials()) {
    response.status(503).json({ error: BILLING_UNCONFIGURED_MESSAGE });
    return true;
  }
  if (path3 === "/api/billing/account") {
    const [entitlement, storage] = await Promise.all([ensureEntitlement(user.uid), getStorageUsage(user.uid)]);
    response.status(200).json({
      tokenBalance: entitlement.tokenBalance,
      tokensGrantedLifetime: entitlement.tokensGrantedLifetime,
      tokensSpentLifetime: entitlement.tokensSpentLifetime,
      storage,
      packs: TOKEN_PACKS,
      actionPrices: ACTION_PRICES,
      paymentsEnabled: isStripeConfigured()
    });
    return true;
  }
  if (!isStripeConfigured()) {
    response.status(503).json({ error: "Card payments aren't switched on for this deployment yet." });
    return true;
  }
  try {
    await ensureEntitlement(user.uid);
    const session = await createTokenCheckoutSession({
      uid: user.uid,
      packId: request.body?.packId,
      email: user.email || request.body?.email || null
    });
    response.status(200).json(session);
  } catch (err) {
    response.status(err?.statusCode === 400 ? 400 : 502).json({ error: err?.message || "Checkout could not be started." });
  }
  return true;
};

// services/firebase/shareAccess.ts
var resolveRole = (data, uid) => {
  if (!data) return null;
  if (uid && data.ownerId === uid) return "owner";
  const memberRole = uid ? data.members?.[uid] : void 0;
  if (memberRole === "editor" || memberRole === "viewer") return memberRole;
  if (data.linkAccess === "view") return "viewer";
  return null;
};

// services/share/shareApiRoutes.ts
var MAIL_COLLECTION = process.env.INVITE_MAIL_COLLECTION || "mail";
var DEFAULT_FROM = process.env.INVITE_FROM_EMAIL || "ArchAI <no-reply@auto.archi>";
var sendWithResend = async (to, message) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: "no-api-key" };
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: DEFAULT_FROM, to: [to], subject: message.subject, html: message.html, text: message.text })
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Resend rejected the invitation (HTTP ${res.status}): ${detail.slice(0, 300)}`);
  }
  const body = await res.json().catch(() => ({}));
  return { sent: true, id: body?.id || null };
};
var COLLECTIONS = { project: "projects", session: "renderSessions" };
var escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
var buildInviteEmail = (input) => {
  const action = input.role === "editor" ? "edit" : "view";
  const subject = `${input.inviterName} shared the ${input.kindLabel} "${input.itemName}" with you`;
  const lines = [
    `${input.inviterName} has invited you to ${action} the ${input.kindLabel} "${input.itemName}" in ArchAI.`,
    "",
    `Open it here: ${input.url}`,
    "",
    `Sign in with this email address (${input.recipientEmail}) and your access is applied automatically.`
  ];
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;color:#0f172a;line-height:1.6">
      <p>${escapeHtml(input.inviterName)} has invited you to <strong>${action}</strong> the ${escapeHtml(input.kindLabel)}
        &ldquo;${escapeHtml(input.itemName)}&rdquo; in ArchAI.</p>
      <p><a href="${escapeHtml(input.url)}"
            style="display:inline-block;background:#0f172a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;font-weight:700">
        Open in ArchAI</a></p>
      <p style="color:#475569;font-size:13px">Sign in with this email address (${escapeHtml(input.recipientEmail)})
        and your access is applied automatically.</p>
    </div>`;
  return { subject, text: lines.join("\n"), html };
};
var grantLiveAccess = async (request, response) => {
  const user = request.user;
  if (!user) {
    response.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (!hasAdminCredentials() || !getRealtimeDbUrl()) {
    response.status(503).json({ error: "Live editing is not configured on the server." });
    return;
  }
  const targetId = String(request.body?.targetId || request.body?.projectId || "");
  const collection = COLLECTIONS[request.body?.kind === "session" ? "session" : "project"];
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(targetId)) {
    response.status(400).json({ error: "targetId is required." });
    return;
  }
  try {
    const snap = await getAdminFirestore().collection(collection).doc(targetId).get();
    const role = snap.exists ? resolveRole(snap.data(), user.uid) : null;
    const accessRef = getAdminDatabase().ref(`liveAccess/${targetId}/${user.uid}`);
    if (!role) {
      await accessRef.remove();
      response.status(404).json({ error: "Not Found" });
      return;
    }
    await accessRef.set(role);
    response.status(200).json({ role });
  } catch (error) {
    console.error("[Share] Live access could not be granted:", error);
    response.status(502).json({ error: error?.message || "Live access could not be granted." });
  }
};
var routeShareApiRequest = async (request, response) => {
  const path3 = String(request.url || "").split(/[?#]/)[0];
  if (!path3.startsWith("/api/share/")) return false;
  if (path3 === "/api/share/live-access" && String(request.method || "GET").toUpperCase() === "POST") {
    await grantLiveAccess(request, response);
    return true;
  }
  if (path3 !== "/api/share/invite" || String(request.method || "GET").toUpperCase() !== "POST") {
    response.status(404).json({ error: "Not Found" });
    return true;
  }
  const user = request.user;
  if (!user) {
    response.status(401).json({ error: "Sign in to continue." });
    return true;
  }
  if (!hasAdminCredentials()) {
    response.status(503).json({ error: "Invitation email is not configured on the server." });
    return true;
  }
  const { kind, targetId, email, role, url, itemName } = request.body || {};
  const collection = COLLECTIONS[kind === "session" ? "session" : "project"];
  const recipient = String(email || "").trim().toLowerCase();
  if (!recipient || !targetId || !url) {
    response.status(400).json({ error: "kind, targetId, email and url are required." });
    return true;
  }
  try {
    const db = getAdminFirestore();
    const target = await db.collection(collection).doc(String(targetId)).get();
    if (!target.exists || target.data()?.ownerId !== user.uid) {
      response.status(404).json({ error: "Not Found" });
      return true;
    }
    const message = buildInviteEmail({
      inviterName: user.email || "A collaborator",
      itemName: String(itemName || target.data()?.name || "a project"),
      kindLabel: kind === "session" ? "render session" : "plan",
      role: role === "viewer" ? "viewer" : "editor",
      url: String(url),
      recipientEmail: recipient
    });
    const viaApi = await sendWithResend(recipient, message);
    if (viaApi.sent) {
      response.status(200).json({ sent: true, via: "resend", id: viaApi.id });
      return true;
    }
    await db.collection(MAIL_COLLECTION).add({
      to: [recipient],
      message,
      archai: { kind, targetId, invitedBy: user.uid, createdAt: (/* @__PURE__ */ new Date()).toISOString() }
    });
    response.status(200).json({ sent: true, via: "extension" });
  } catch (error) {
    console.error("[Share] Invitation email could not be queued:", error);
    response.status(502).json({ error: error?.message || "The invitation email could not be queued." });
  }
  return true;
};

// services/billing/routeCosts.ts
var CHARGE_RULES = [
  // Generation (25): text -> floorplan image
  { reason: "floorplanGeneration", pattern: /^\/api\/text2plan\/image\/?$/ },
  { reason: "floorplanGeneration", pattern: /^\/api\/smart-text2plan\/image\/?$/ },
  { reason: "floorplanGeneration", pattern: /^\/api\/text4[a-j]\/image\/?$/ },
  { reason: "floorplanGeneration", pattern: /^\/api\/auto-plan\/(image|generate)\/?$/ },
  // Conversion (25): floorplan image -> geometry
  { reason: "floorplanConversion", pattern: /^\/api\/text4[a-j]\/(master-geometry|image-redraw|roboflow\/convert|structured3d\/convert)\/?$/ },
  // AI render (50)
  { reason: "aiRender", pattern: /^\/api\/ai-render\/jobs\/?$/ },
  { reason: "aiRender", pattern: /^\/api\/ai-render\/jobs\/[^/]+\/retry\/?$/ },
  // Revit jobs (25)
  { reason: "revitJob", pattern: /^\/api\/exports\/revit\/?$/ },
  { reason: "revitJob", pattern: /^\/api\/imports\/aps-revit\/?$/ }
];
var CHARGE_DETAILS = {
  floorplanGeneration: "Floorplan generation",
  floorplanConversion: "Floorplan conversion",
  aiRender: "AI render",
  revitJob: "Revit job"
};
var pathOf2 = (url) => {
  const raw = String(url || "");
  const queryIndex = raw.search(/[?#]/);
  return queryIndex === -1 ? raw : raw.slice(0, queryIndex);
};
var getRouteCharge = (url, method) => {
  if (String(method || "GET").toUpperCase() !== "POST") return null;
  const path3 = pathOf2(url);
  const rule = CHARGE_RULES.find((candidate) => candidate.pattern.test(path3));
  return rule ? { reason: rule.reason, amount: STEP_COSTS[rule.reason] } : null;
};
var isPublicApiRoute = (url, method) => String(method || "GET").toUpperCase() === "GET" && /^\/api\/billing\/pricing\/?$/.test(pathOf2(url));
var REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;
var generateRequestId = () => `req-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
var resolveRequestId = (headers) => {
  const raw = headers?.["x-request-id"] ?? headers?.["X-Request-Id"];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value && REQUEST_ID_PATTERN.test(value) && !/^__.*__$/.test(value)) return value;
  return generateRequestId();
};
var decideCharge = (input) => {
  const charge = getRouteCharge(input.url, input.method);
  if (!charge) return { kind: "free" };
  if (input.unmeteredAllowed) return { kind: "unmetered", why: "disabled", ...charge };
  if (!input.userId) return { kind: "unmetered", why: "anonymous", ...charge };
  if (!input.billingConfigured) return { kind: "unconfigured", ...charge };
  return { kind: "charge", ...charge };
};
var isEnvFlagOn = (value) => value === "1" || String(value || "").toLowerCase() === "true";

// services/apiGateway.ts
var JOB_RECORDS = /* @__PURE__ */ new Map();
var JOB_WATCH_INTERVAL_MS = 1e4;
var JOB_WATCH_MAX_MS = 60 * 60 * 1e3;
var pathOf3 = (url) => String(url || "").split(/[?#]/)[0];
var verifyRequest = verifyApiRequest;
var isBillingConfigured = hasAdminCredentials;
var JOB_ROUTE_PATTERNS = [
  { kind: "ai-render", pattern: /^\/api\/ai-render\/jobs\/([^/]+)(?:\/(?:result|cancel|retry|rate))?\/?$/ },
  { kind: "revit-export", pattern: /^\/api\/exports\/revit\/([^/]+)(?:\/download)?\/?$/ },
  { kind: "aps-revit-import", pattern: /^\/api\/imports\/aps-revit\/([^/]+)(?:\/result)?\/?$/ }
];
var JOB_CREATE_PATTERNS = [
  { kind: "ai-render", pattern: /^\/api\/ai-render\/jobs\/?$/ },
  { kind: "revit-export", pattern: /^\/api\/exports\/revit\/?$/ },
  { kind: "aps-revit-import", pattern: /^\/api\/imports\/aps-revit\/?$/ }
];
var matchJobId = (path3) => {
  for (const { kind, pattern } of JOB_ROUTE_PATTERNS) {
    const match = pattern.exec(path3);
    if (match && !["engines", "download"].includes(match[1])) return { kind, jobId: decodeURIComponent(match[1]) };
  }
  return null;
};
var refundQuietly = async (uid, requestId, detail) => {
  try {
    const { refunded } = await refundTokens(uid, requestId, detail);
    if (refunded) console.log(`[Billing] Refunded ${refunded} tokens to ${uid} for ${requestId}`);
  } catch (err) {
    console.error(`[Billing] Refund failed for ${requestId}:`, err);
  }
};
var isTerminalFailure = (status) => status === "failed" || status === "cancelled";
var watchAiRenderJob = (jobId, dispatch2) => {
  const record = JOB_RECORDS.get(jobId);
  if (!record || record.watching || !record.ownerId || !record.chargeRequestId) return;
  record.watching = true;
  const startedAt = Date.now();
  const tick = async () => {
    const current = JOB_RECORDS.get(jobId);
    if (!current?.ownerId || !current.chargeRequestId) return;
    let payload = null;
    let statusCode = 200;
    const probe = {
      status(code) {
        statusCode = code;
        return probe;
      },
      json(body) {
        payload = body;
      }
    };
    try {
      await dispatch2({ method: "GET", url: `/api/ai-render/jobs/${encodeURIComponent(jobId)}`, user: null }, probe);
    } catch {
      payload = null;
    }
    if (statusCode === 404) {
      current.watching = false;
      return;
    }
    if (isTerminalFailure(payload?.status)) {
      await refundQuietly(current.ownerId, current.chargeRequestId, `Refund: AI render ${payload.status}`);
      current.watching = false;
      return;
    }
    if (payload?.status === "completed" || Date.now() - startedAt > JOB_WATCH_MAX_MS) {
      current.watching = false;
      return;
    }
    setTimeout(tick, JOB_WATCH_INTERVAL_MS);
  };
  setTimeout(tick, JOB_WATCH_INTERVAL_MS);
};
var runGatedApiRequest = async (incoming, response, dispatch2) => {
  const method = String(incoming.method || "GET").toUpperCase();
  const url = String(incoming.url || "");
  const path3 = pathOf3(url);
  const auth = await verifyRequest({ headers: incoming.headers });
  const user = auth.user;
  const allowAnonymous = isEnvFlagOn(process.env.ALLOW_ANONYMOUS_API);
  if (!user && !allowAnonymous && !isPublicApiRoute(url, method)) {
    if (auth.failure === "server-unconfigured") {
      response.status(503).json({
        error: "Sign-in cannot be verified on the server right now. Please try again shortly.",
        reason: "server-unconfigured",
        detail: auth.message
      });
    } else {
      response.status(401).json({
        error: auth.failure === "invalid-token" ? "Your session has expired. Please sign in again." : "Sign in to continue.",
        reason: auth.failure || "no-token"
      });
    }
    return true;
  }
  if (path3.startsWith("/api/billing/")) {
    return routeBillingApiRequest({ method, url, body: incoming.body, user }, response);
  }
  if (path3.startsWith("/api/share/")) {
    return routeShareApiRequest({ method, url, body: incoming.body, user }, response);
  }
  const jobRef = matchJobId(path3);
  if (jobRef) {
    const record = JOB_RECORDS.get(jobRef.jobId);
    if (record?.ownerId && record.ownerId !== user?.uid) {
      response.status(404).json({ error: "Job not found" });
      return true;
    }
  }
  const decision = decideCharge({
    url,
    method,
    userId: user?.uid,
    billingConfigured: isBillingConfigured(),
    unmeteredAllowed: isEnvFlagOn(process.env.ALLOW_UNMETERED_API)
  });
  if (decision.kind === "unconfigured") {
    response.status(503).json({ error: BILLING_UNCONFIGURED_MESSAGE, reason: "billing-unconfigured" });
    return true;
  }
  let chargedRequestId = null;
  if (decision.kind === "charge" && user) {
    const requestId = resolveRequestId(incoming.headers);
    try {
      const result = await spendTokens(user.uid, {
        amount: decision.amount,
        requestId,
        reason: decision.reason,
        detail: CHARGE_DETAILS[decision.reason]
      });
      if (!result.ok) {
        const shortfall = result;
        response.status(INSUFFICIENT_TOKENS_STATUS).json({
          error: `That action needs ${shortfall.required} tokens and you have ${shortfall.balance}.`,
          required: shortfall.required,
          balance: shortfall.balance,
          reason: decision.reason
        });
        return true;
      }
      chargedRequestId = result.replayed ? null : requestId;
    } catch (err) {
      console.error("[Billing] Token ledger error:", err);
      response.status(503).json({ error: "Token balance could not be checked right now. Please try again shortly.", reason: "ledger-error" });
      return true;
    }
  }
  let finalStatus = 200;
  let payload;
  const tracked = {
    status(code) {
      finalStatus = code;
      response.status(code);
      return tracked;
    },
    json(body) {
      payload = body;
      response.json(body);
    }
  };
  let handled = false;
  try {
    handled = await dispatch2({ method, url, body: incoming.body, user }, tracked);
    return handled;
  } catch (err) {
    finalStatus = 500;
    throw err;
  } finally {
    const failed = !handled || finalStatus >= 400;
    if (chargedRequestId && user && failed) {
      await refundQuietly(user.uid, chargedRequestId);
    }
    if (handled && !failed && payload?.jobId) {
      const created = JOB_CREATE_PATTERNS.find((entry) => method === "POST" && entry.pattern.test(path3));
      if (created) {
        JOB_RECORDS.set(String(payload.jobId), { ownerId: user?.uid || null, chargeRequestId: chargedRequestId, kind: created.kind });
        if (created.kind === "ai-render" && isTerminalFailure(payload?.status)) {
          if (user && chargedRequestId) await refundQuietly(user.uid, chargedRequestId, `Refund: AI render ${payload.status}`);
        } else if (created.kind === "ai-render") {
          watchAiRenderJob(String(payload.jobId), dispatch2);
        }
      }
    }
    if (handled && !failed && jobRef?.kind === "ai-render") {
      const record = JOB_RECORDS.get(jobRef.jobId);
      if (record && /\/retry\/?$/.test(path3) && method === "POST" && user) {
        record.chargeRequestId = chargedRequestId;
        record.watching = false;
        if (isTerminalFailure(payload?.status)) {
          if (chargedRequestId) await refundQuietly(user.uid, chargedRequestId, `Refund: AI render ${payload.status}`);
        } else {
          watchAiRenderJob(jobRef.jobId, dispatch2);
        }
      } else if (record?.ownerId && record.chargeRequestId && isTerminalFailure(payload?.status)) {
        void refundQuietly(record.ownerId, record.chargeRequestId, `Refund: AI render ${payload.status}`);
      }
    }
  }
};

// services/revitExport/revitExportTypes.ts
var REVIT_EXPORT_VERSION = "revit-export-v1";

// services/revitExport/revitExportManifest.ts
init_constants();

// services/sharedBim/projectExportUtils.ts
init_constants();

// services/geometry/curveGeometry.ts
var TAU = Math.PI * 2;
var EPSILON = 1e-9;
var pointDistance = (a, b) => Math.hypot(b.x - a.x, b.y - a.y);
var midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
var getCurveSource = (element) => {
  const source = element.wallSource || (["arc", "circle", "ellipse"].includes(element.type) ? element.type : element.isCurved ? element.type : null);
  if (source === "arc" || source === "circle" || source === "ellipse") return source;
  if (element.isCurved && element.controlPoint) return "arc";
  if (element.p1 && element.p2) return "line";
  return null;
};
var isCurvedElement = (element) => {
  const source = getCurveSource(element);
  return source === "arc" || source === "circle" || source === "ellipse";
};
var interpolateAngle = (start, end, t, counterclockwise = false) => {
  let span = counterclockwise ? start - end : end - start;
  if (span < 0) span += TAU;
  return counterclockwise ? start - span * t : start + span * t;
};
var pointOnCircularArc = (center, radius, angle) => ({
  x: center.x + Math.cos(angle) * radius,
  y: center.y + Math.sin(angle) * radius
});
var getCurveBoxPoints = (element) => {
  if (!element.p1 || !element.p2) return null;
  const boxP1 = element.startT !== void 0 && element.p3 ? element.p3 : element.p1;
  const boxP2 = element.startT !== void 0 && element.p4 ? element.p4 : element.p2;
  return { boxP1, boxP2 };
};
var mappedTurn = (element, t) => {
  if (element.startT === void 0 || element.endT === void 0) return t;
  let span = element.endT - element.startT;
  if (span < 0) span += 1;
  return element.startT + t * span;
};
var ellipseAngleAt = (element, t) => {
  if (element.ellipseStartAngle !== void 0 || element.ellipseEndAngle !== void 0) {
    return interpolateAngle(
      element.ellipseStartAngle ?? 0,
      element.ellipseEndAngle ?? TAU,
      t,
      element.ellipseCounterclockwise
    );
  }
  return mappedTurn(element, t) * TAU;
};
var getCurvePoint = (element, t) => {
  if (!element.p1 || !element.p2) return null;
  const source = getCurveSource(element);
  const mappedT = mappedTurn(element, t);
  if (source === "circle") {
    const box = getCurveBoxPoints(element);
    if (!box) return null;
    const radius = pointDistance(box.boxP1, box.boxP2);
    const angle = mappedT * TAU;
    return pointOnCircularArc(box.boxP1, radius, angle);
  }
  if (source === "ellipse") {
    const box = getCurveBoxPoints(element);
    if (!box) return null;
    const center = element.ellipseCenter || midpoint(box.boxP1, box.boxP2);
    const rx = Math.max(EPSILON, element.ellipseRadiusX ?? Math.abs(box.boxP2.x - box.boxP1.x) / 2);
    const ry = Math.max(EPSILON, element.ellipseRadiusY ?? Math.abs(box.boxP2.y - box.boxP1.y) / 2);
    const angle = ellipseAngleAt(element, t);
    const rotation = element.ellipseRotation || 0;
    const cosR = Math.cos(rotation);
    const sinR = Math.sin(rotation);
    const x = Math.cos(angle) * rx;
    const y = Math.sin(angle) * ry;
    return {
      x: center.x + x * cosR - y * sinR,
      y: center.y + x * sinR + y * cosR
    };
  }
  if (source === "arc") {
    if (element.arcCenter && element.arcRadius !== void 0 && element.arcStartAngle !== void 0 && element.arcEndAngle !== void 0) {
      const angle = interpolateAngle(element.arcStartAngle, element.arcEndAngle, t, element.arcCounterclockwise);
      return pointOnCircularArc(element.arcCenter, element.arcRadius, angle);
    }
    const controlPoint = element.controlPoint || midpoint(element.p1, element.p2);
    const mt = 1 - t;
    return {
      x: mt * mt * element.p1.x + 2 * mt * t * controlPoint.x + t * t * element.p2.x,
      y: mt * mt * element.p1.y + 2 * mt * t * controlPoint.y + t * t * element.p2.y
    };
  }
  return {
    x: element.p1.x + t * (element.p2.x - element.p1.x),
    y: element.p1.y + t * (element.p2.y - element.p1.y)
  };
};
var sampleCurveElement = (element, samples = 24) => {
  if (!isCurvedElement(element)) return element.p1 && element.p2 ? [element.p1, element.p2] : [];
  const count = Math.max(1, Math.floor(samples));
  const points = [];
  for (let index = 0; index <= count; index += 1) {
    const point = getCurvePoint(element, index / count);
    if (point) points.push(point);
  }
  return points;
};

// services/revitExport/revitExportManifest.ts
var validateRevitExportManifest = (manifest) => {
  const errors = [];
  const warnings = [...manifest.summary?.warnings || []];
  if (manifest.manifestVersion !== REVIT_EXPORT_VERSION) errors.push(`Unsupported manifest version: ${manifest.manifestVersion}`);
  if (!manifest.project?.name) errors.push("Manifest project name is required.");
  if (!Array.isArray(manifest.levels) || manifest.levels.length === 0) errors.push("Manifest must contain at least one level.");
  if (!Array.isArray(manifest.elements)) errors.push("Manifest elements must be an array.");
  if (manifest.elements.some((element) => !element.id || !element.type)) errors.push("Every manifest element must include id and type.");
  const ids = manifest.elements.map((element) => element.id);
  if (ids.length !== new Set(ids).size) errors.push("Manifest element IDs must be unique.");
  if (JSON.stringify(manifest).toLowerCase().includes("ifcstep")) errors.push("Manifest must not contain IFC STEP data.");
  if (manifest.elements.length === 0) warnings.push("Manifest contains no exportable elements.");
  return { isValid: errors.length === 0, errors, warnings };
};

// services/revitExport/backend/apsRevitExportBackend.ts
var APS_AUTH_URL = "https://developer.api.autodesk.com/authentication/v2/token";
var APS_DATA_BASE_URL = "https://developer.api.autodesk.com";
var InMemoryRevitExportJobStore = class {
  constructor() {
    this.records = /* @__PURE__ */ new Map();
  }
  async create(record) {
    this.records.set(record.jobId, record);
  }
  async update(jobId, patch) {
    const existing = this.records.get(jobId);
    if (!existing) throw new Error(`Unknown Revit export job: ${jobId}`);
    const next = { ...existing, ...patch, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    this.records.set(jobId, next);
    return next;
  }
  async get(jobId) {
    return this.records.get(jobId) || null;
  }
};
var getApsRevitExportConfigFromEnv = (env = typeof process !== "undefined" ? process.env : {}) => {
  const config = {
    clientId: env.APS_CLIENT_ID || "",
    clientSecret: env.APS_CLIENT_SECRET || "",
    bucketKey: env.APS_BUCKET_KEY || "",
    region: env.APS_REGION || "",
    revitEngine: env.APS_REVIT_ENGINE || "",
    appBundleId: env.APS_REVIT_APPBUNDLE_ID || "",
    activityId: env.APS_REVIT_ACTIVITY_ID || "",
    activityAlias: env.APS_REVIT_ACTIVITY_ALIAS || "",
    callbackUrl: env.APS_REVIT_EXPORT_CALLBACK_URL,
    env
  };
  return Object.values({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    bucketKey: config.bucketKey,
    region: config.region,
    revitEngine: config.revitEngine,
    appBundleId: config.appBundleId,
    activityId: config.activityId,
    activityAlias: config.activityAlias
  }).every(Boolean) ? config : null;
};
var requireConfig = (config) => {
  if (config) return config;
  throw new Error("APS Revit export backend is not configured. Set APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET_KEY, APS_REGION, APS_REVIT_ENGINE, APS_REVIT_APPBUNDLE_ID, APS_REVIT_ACTIVITY_ID, and APS_REVIT_ACTIVITY_ALIAS on the server.");
};
var engineYear = (engine) => Number(String(engine || "").match(/Autodesk\.Revit\+(\d+)/)?.[1] || 0);
var engineEnvSuffix = (engine) => {
  const year = engineYear(engine);
  return year ? `_${year}` : "";
};
var configForEngine = (baseConfig, requestedEngine) => {
  if (!requestedEngine || requestedEngine === baseConfig.revitEngine) return baseConfig;
  const suffix = engineEnvSuffix(requestedEngine);
  const env = baseConfig.env || {};
  const engineConfig = {
    ...baseConfig,
    revitEngine: requestedEngine,
    appBundleId: env[`APS_REVIT_APPBUNDLE_ID${suffix}`] || "",
    activityId: env[`APS_REVIT_ACTIVITY_ID${suffix}`] || "",
    activityAlias: env[`APS_REVIT_ACTIVITY_ALIAS${suffix}`] || baseConfig.activityAlias
  };
  if (engineConfig.appBundleId && engineConfig.activityId && engineConfig.activityAlias) return engineConfig;
  throw new Error(`Revit engine ${requestedEngine} is available in APS, but this server does not have an AppBundle/Activity configured for it yet. Run the APS Revit export setup for Revit ${engineYear(requestedEngine)} or choose a configured version.`);
};
var designAutomationRegion = (region) => {
  const normalized = region.trim().toLowerCase();
  if (normalized === "us" || normalized === "usa" || normalized === "us-east") return "us-east";
  if (normalized === "emea" || normalized === "eu" || normalized === "europe") return "eu";
  return normalized || "us-east";
};
var designAutomationBaseUrl = (region) => `https://developer.api.autodesk.com/da/${designAutomationRegion(region)}/v3`;
var activityFullId = (config) => config.activityId.includes("+") ? config.activityId : `${config.activityId}+${config.activityAlias}`;
var makeJobId = () => `revit_export_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
var objectKey = (jobId, suffix) => `${jobId}/${suffix}`;
var requestJson = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`APS request failed ${response.status} ${response.statusText}: ${text.slice(0, 1e3)}`);
  }
  return text ? JSON.parse(text) : {};
};
var createToken = async (config) => {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "data:read data:write data:create bucket:read bucket:create code:all"
  });
  return requestJson(APS_AUTH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
};
var apsJson = async (token, url, init = {}) => requestJson(url, {
  ...init,
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...init.headers || {}
  }
});
var listRevitEngines = async (token, config) => {
  const payload = await apsJson(token, `${designAutomationBaseUrl(config.region)}/engines`, { method: "GET" });
  const engines = Array.isArray(payload) ? payload : payload.data || payload.value || [];
  return engines.filter((engine) => String(engine).startsWith("Autodesk.Revit+"));
};
var ensureBucket = async (token, bucketKey, region) => {
  const detailsUrl = `${APS_DATA_BASE_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/details`;
  const details = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (details.ok) return;
  if (details.status !== 404) {
    const text = await details.text();
    throw new Error(`Failed to inspect APS bucket ${bucketKey}: ${details.status} ${text}`);
  }
  await apsJson(token, `${APS_DATA_BASE_URL}/oss/v2/buckets`, {
    method: "POST",
    body: JSON.stringify({
      bucketKey,
      policyKey: "transient",
      region: region.toUpperCase().includes("EMEA") ? "EMEA" : "US"
    })
  });
};
var createSignedS3UploadUrl = async (token, bucketKey, key) => {
  const url = `${APS_DATA_BASE_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3upload?parts=1&minutesExpiration=60`;
  const response = await apsJson(token, url, { method: "GET" });
  const uploadUrl = response.urls?.[0] || response.uploadUrl || response.url;
  if (!uploadUrl || !response.uploadKey) throw new Error(`APS signed upload response did not include upload URL/uploadKey for ${key}.`);
  return { uploadUrl, uploadKey: response.uploadKey };
};
var completeSignedS3Upload = async (token, bucketKey, key, uploadKey) => {
  const url = `${APS_DATA_BASE_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3upload`;
  await apsJson(token, url, {
    method: "POST",
    body: JSON.stringify({ uploadKey })
  });
};
var uploadObject = async (token, bucketKey, key, contents, contentType) => {
  const { uploadUrl, uploadKey } = await createSignedS3UploadUrl(token, bucketKey, key);
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: typeof contents === "string" ? new TextEncoder().encode(contents) : contents
  });
  if (!upload.ok) {
    const text = await upload.text();
    throw new Error(`Failed to upload ${key} to signed S3 URL: ${upload.status} ${text}`);
  }
  await completeSignedS3Upload(token, bucketKey, key, uploadKey);
};
var createSignedDownloadUrl = async (token, bucketKey, key, minutesExpiration = 60) => {
  const url = `${APS_DATA_BASE_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3download?minutesExpiration=${minutesExpiration}`;
  const response = await apsJson(token, url, { method: "GET" });
  const signedUrl = response.url || response.signedUrl;
  if (!signedUrl) throw new Error(`APS signed download response did not include a URL for ${key}.`);
  return signedUrl;
};
var createAutomationSignedUrl = async (token, bucketKey, key, access) => {
  const signedAccess = access === "write" ? "readwrite" : access;
  const url = `${APS_DATA_BASE_URL}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signed?access=${encodeURIComponent(signedAccess)}`;
  const response = await apsJson(token, url, {
    method: "POST",
    body: JSON.stringify({
      minutesExpiration: 60,
      singleUse: false
    })
  });
  const signedUrl = response.signedUrl || response.url;
  if (!signedUrl) throw new Error(`APS signed URL response did not include a URL for ${key}.`);
  return signedUrl;
};
var submitWorkItem = async (token, config, urls) => {
  const argumentsPayload = {
    manifest: { url: urls.manifest, verb: "get" },
    resultRvt: { url: urls.outputRvt, verb: "put" },
    reportJson: { url: urls.report, verb: "put" },
    executionLog: { url: urls.executionLog, verb: "put" }
  };
  if (config.callbackUrl) {
    argumentsPayload.onComplete = { url: config.callbackUrl, verb: "post" };
  }
  return apsJson(token, `${designAutomationBaseUrl(config.region)}/workitems`, {
    method: "POST",
    body: JSON.stringify({
      activityId: activityFullId(config),
      arguments: argumentsPayload
    })
  });
};
var getWorkItem = async (token, config, workItemId) => apsJson(token, `${designAutomationBaseUrl(config.region)}/workitems/${encodeURIComponent(workItemId)}`, { method: "GET" });
var mapWorkItemStatus = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "success") return "validating";
  if (normalized === "failed" || normalized === "cancelled" || normalized === "timeout") return "failed";
  if (normalized === "pending") return "queued";
  if (normalized === "inprogress" || normalized === "in_progress") return "processing";
  return "processing";
};
var ApsRevitExportBackend = class {
  constructor(config = getApsRevitExportConfigFromEnv(), store = new InMemoryRevitExportJobStore()) {
    this.config = config;
    this.store = store;
  }
  async startExport(manifest) {
    const baseConfig = requireConfig(this.config);
    const requestedEngine = manifest.settings.revitEngine;
    const config = configForEngine(baseConfig, requestedEngine);
    const validation = validateRevitExportManifest(manifest);
    if (!validation.isValid) {
      throw new Error(`Invalid Revit export manifest: ${validation.errors.join("; ")}`);
    }
    const jobId = makeJobId();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const record = {
      jobId,
      status: "queued",
      progressMessage: "Preparing Revit export...",
      warnings: validation.warnings,
      errors: [],
      downloadUrl: null,
      reportUrl: null,
      createdAt: now,
      updatedAt: now,
      manifest,
      manifestObjectKey: objectKey(jobId, "input/revit-export-manifest.json"),
      rvtObjectKey: objectKey(jobId, "output/project.rvt"),
      reportObjectKey: objectKey(jobId, "output/revit-export-report.json"),
      logObjectKey: objectKey(jobId, "output/revit-export-execution.log")
    };
    await this.store.create(record);
    try {
      await this.store.update(jobId, { status: "uploading", progressMessage: "Uploading project data..." });
      const token = await createToken(config);
      await ensureBucket(token.access_token, config.bucketKey, config.region);
      await uploadObject(token.access_token, config.bucketKey, record.manifestObjectKey, JSON.stringify(manifest, null, 2), "application/json");
      await uploadObject(token.access_token, config.bucketKey, record.rvtObjectKey, new Uint8Array(), "application/octet-stream");
      await uploadObject(token.access_token, config.bucketKey, record.reportObjectKey, new Uint8Array(), "application/json");
      await uploadObject(token.access_token, config.bucketKey, record.logObjectKey, new Uint8Array(), "text/plain");
      const urls = {
        manifest: await createAutomationSignedUrl(token.access_token, config.bucketKey, record.manifestObjectKey, "read"),
        outputRvt: await createAutomationSignedUrl(token.access_token, config.bucketKey, record.rvtObjectKey, "write"),
        report: await createAutomationSignedUrl(token.access_token, config.bucketKey, record.reportObjectKey, "write"),
        executionLog: await createAutomationSignedUrl(token.access_token, config.bucketKey, record.logObjectKey, "write")
      };
      await this.store.update(jobId, { status: "processing", progressMessage: "Creating Revit model..." });
      const workItem = await submitWorkItem(token.access_token, config, urls);
      const updated = await this.store.update(jobId, {
        workItemId: workItem.id,
        status: mapWorkItemStatus(workItem.status),
        progressMessage: "Creating Revit model..."
      });
      return this.toResponse(updated);
    } catch (error) {
      const updated = await this.store.update(jobId, {
        status: "failed",
        progressMessage: "Revit export failed before Automation completed.",
        errors: [error instanceof Error ? error.message : String(error)]
      });
      return this.toResponse(updated);
    }
  }
  async listEngines() {
    const config = requireConfig(this.config);
    const token = await createToken(config);
    const engines = await listRevitEngines(token.access_token, config);
    const env = config.env || {};
    const rows = engines.map((engine) => {
      const suffix = engineEnvSuffix(engine);
      const configured = engine === config.revitEngine || Boolean(env[`APS_REVIT_ACTIVITY_ID${suffix}`]);
      return {
        engine,
        year: engineYear(engine),
        configured,
        isDefault: engine === config.revitEngine
      };
    }).filter((row) => row.year > 0).sort((a, b) => b.year - a.year);
    return { engines: rows };
  }
  async getStatus(jobId) {
    const record = await this.store.get(jobId);
    if (!record) throw new Error(`Unknown Revit export job: ${jobId}`);
    if (!record.workItemId || ["completed", "completed_with_warnings", "failed"].includes(record.status)) {
      return this.toResponse(record);
    }
    const config = requireConfig(this.config);
    const token = await createToken(config);
    const workItem = await getWorkItem(token.access_token, config, record.workItemId);
    const nextStatus = mapWorkItemStatus(workItem.status);
    if (nextStatus === "validating") {
      const downloadUrl = await createSignedDownloadUrl(token.access_token, config.bucketKey, record.rvtObjectKey);
      const reportUrl = await createSignedDownloadUrl(token.access_token, config.bucketKey, record.reportObjectKey);
      const warnings = [...record.warnings, ...workItem.reportUrl ? [] : []];
      const updated2 = await this.store.update(jobId, {
        status: warnings.length ? "completed_with_warnings" : "completed",
        progressMessage: "Preparing download...",
        downloadUrl,
        reportUrl,
        warnings
      });
      return this.toResponse(updated2);
    }
    if (nextStatus === "failed") {
      const updated2 = await this.store.update(jobId, {
        status: "failed",
        progressMessage: "APS Revit Automation failed.",
        errors: [...record.errors || [], workItem.statusDetails || workItem.error || "APS WorkItem failed."]
      });
      return this.toResponse(updated2);
    }
    const updated = await this.store.update(jobId, {
      status: nextStatus,
      progressMessage: nextStatus === "queued" ? "Queued in Revit Automation..." : "Creating Revit model..."
    });
    return this.toResponse(updated);
  }
  async getDownload(jobId) {
    const status = await this.getStatus(jobId);
    if (!status.downloadUrl) throw new Error(`Revit export job ${jobId} is not ready for download.`);
    return { downloadUrl: status.downloadUrl, reportUrl: status.reportUrl };
  }
  toResponse(record) {
    return {
      jobId: record.jobId,
      status: record.status,
      progressMessage: record.progressMessage,
      warnings: record.warnings,
      errors: record.errors,
      downloadUrl: record.downloadUrl,
      reportUrl: record.reportUrl,
      manifestObjectKey: record.manifestObjectKey,
      rvtObjectKey: record.rvtObjectKey,
      reportObjectKey: record.reportObjectKey,
      workItemId: record.workItemId
    };
  }
};

// services/revitExport/backend/revitExportApiRoutes.ts
var readJobId = (request) => {
  if (request.params?.jobId) return request.params.jobId;
  const match = String(request.url || "").match(/\/api\/exports\/revit\/([^/?#]+)/);
  return match?.[1] && match[1] !== "download" ? decodeURIComponent(match[1]) : void 0;
};
var createRevitExportApiRoutes = (backend = new ApsRevitExportBackend()) => ({
  getRevitExportEngines: async (_request, response) => {
    try {
      const engines = await backend.listEngines();
      response.status(200).json(engines);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  postRevitExport: async (request, response) => {
    try {
      const body = request.body;
      if (!body?.manifest) {
        response.status(400).json({ error: "Revit export request requires a direct manifest payload." });
        return;
      }
      const job = await backend.startExport(body.manifest);
      response.status(202).json(job);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  getRevitExportStatus: async (request, response) => {
    try {
      const jobId = readJobId(request);
      if (!jobId) {
        response.status(400).json({ error: "Missing Revit export jobId." });
        return;
      }
      const status = await backend.getStatus(jobId);
      response.status(200).json(status);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  getRevitExportDownload: async (request, response) => {
    try {
      const jobId = readJobId(request);
      if (!jobId) {
        response.status(400).json({ error: "Missing Revit export jobId." });
        return;
      }
      const download = await backend.getDownload(jobId);
      response.status(200).json(download);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
});
var routeRevitExportApiRequest = async (request, response, backend = new ApsRevitExportBackend()) => {
  const routes = createRevitExportApiRoutes(backend);
  const method = String(request.method || "GET").toUpperCase();
  const url = String(request.url || "");
  if (method === "GET" && /\/api\/exports\/revit\/engines\/?$/.test(url)) {
    await routes.getRevitExportEngines(request, response);
    return true;
  }
  if (method === "POST" && /\/api\/exports\/revit\/?$/.test(url)) {
    await routes.postRevitExport(request, response);
    return true;
  }
  if (method === "GET" && /\/api\/exports\/revit\/[^/]+\/download\/?$/.test(url)) {
    await routes.getRevitExportDownload(request, response);
    return true;
  }
  if (method === "GET" && /\/api\/exports\/revit\/[^/]+\/?$/.test(url)) {
    await routes.getRevitExportStatus(request, response);
    return true;
  }
  return false;
};

// services/apsRevitImport/apsRevitImportTypes.ts
var APS_REVIT_IMPORT_VERSION = "aps-revit-import-v1";

// services/apsRevitImport/apsRevitImportConverter.ts
init_constants();

// services/apsRevitImport/apsRevitImportCoordinateService.ts
var REVIT_FOOT_TO_METER = 0.3048;
var METER_TO_REVIT_FOOT = 1 / REVIT_FOOT_TO_METER;
var finite = (value, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
var ApsRevitImportCoordinateService = class {
  toAppLength(revitFeet, fallback = 0) {
    return finite(revitFeet, fallback) * REVIT_FOOT_TO_METER;
  }
  toAppPoint(point) {
    if (!point) return null;
    return {
      x: this.toAppLength(point.x),
      y: -this.toAppLength(point.y),
      z: point.z === void 0 ? void 0 : this.toAppLength(point.z)
    };
  }
  toAppRotationDegrees(revitRotationRadiansOrDegrees) {
    const raw = finite(revitRotationRadiansOrDegrees, 0);
    const degrees = Math.abs(raw) > Math.PI * 2 + 1e-3 ? raw : raw * 180 / Math.PI;
    return -degrees;
  }
  toAppAngleRadians(revitAngleRadiansOrDegrees) {
    const raw = finite(revitAngleRadiansOrDegrees, 0);
    const radians = Math.abs(raw) > Math.PI * 2 + 1e-3 ? raw * Math.PI / 180 : raw;
    return -radians;
  }
  toAppArea(revitSquareFeet, fallback = 0) {
    return finite(revitSquareFeet, fallback) * REVIT_FOOT_TO_METER * REVIT_FOOT_TO_METER;
  }
  toAppVolume(revitCubicFeet, fallback = 0) {
    return finite(revitCubicFeet, fallback) * REVIT_FOOT_TO_METER * REVIT_FOOT_TO_METER * REVIT_FOOT_TO_METER;
  }
};
var apsRevitImportCoordinates = new ApsRevitImportCoordinateService();

// services/apsRevitImport/apsRevitImportConverter.ts
var LAYERS = [
  { name: "0", visible: true, locked: false },
  { name: "WALLS", visible: true, locked: false },
  { name: "DOORS", visible: true, locked: false },
  { name: "WINDOWS", visible: true, locked: false },
  { name: "OPENINGS", visible: true, locked: false },
  { name: "COLUMNS", visible: true, locked: false },
  { name: "STAIRS", visible: true, locked: false },
  { name: "RAILINGS", visible: true, locked: false },
  { name: "FLOORS", visible: true, locked: false },
  { name: "CEILINGS", visible: true, locked: false },
  { name: "ROOMS", visible: true, locked: false },
  { name: "GRIDLINES", visible: true, locked: false },
  { name: "DIMENSIONS", visible: true, locked: false },
  { name: "TEXT", visible: true, locked: false },
  { name: "SHAPES", visible: true, locked: false },
  { name: "APS_REVIT_FALLBACK", visible: true, locked: false }
];
var DEFAULT_OPTIONS = {
  importModelElements: true,
  importPlanAnnotations: true,
  importDimensions: true,
  importGenericFamiliesAsBlocks: true,
  includeLinkedModelReferencesAsWarnings: true
};
var EPSILON2 = 1e-7;
var TAU2 = Math.PI * 2;
var STEP_SYNTAX_MARKER = ["ISO", "10303", "21"].join("-");
var getDefaultApsRevitImportOptions = (revitEngine = "") => ({
  ...DEFAULT_OPTIONS,
  revitEngine
});
var safeIdPart = (value) => String(value ?? "").trim().replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
var isSafeElementType = (value) => typeof value === "string" && [
  "line",
  "gridline",
  "wall",
  "arc",
  "circle",
  "ellipse",
  "rectangle",
  "door",
  "window",
  "wall-opening",
  "floor",
  "ceiling",
  "elevation-marker",
  "room",
  "stair",
  "column",
  "furniture",
  "dimension",
  "label",
  "railing",
  "counter",
  "fixture",
  "group",
  "asset"
].includes(value);
var toFinite = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (value && typeof value === "object") {
    const record = value;
    return toFinite(record.value ?? record.Value ?? record.number ?? record.length, fallback);
  }
  return fallback;
};
var firstDefined = (...values) => values.find((value) => value !== void 0 && value !== null);
var cleanCategory = (value) => String(value ?? "").toLowerCase().trim().replace(/^ost_/, "").replace(/[\s_-]+/g, "");
var isTruthyRevitParameter = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return ["1", "true", "yes"].includes(value.trim().toLowerCase());
  if (value && typeof value === "object") {
    const record = value;
    return isTruthyRevitParameter(record.value ?? record.Value ?? record.displayValue ?? record.DisplayValue);
  }
  return false;
};
var isRevitDetailDraftingCurve = (raw) => {
  if (/^Detail(?:Line|Arc|Curve)$/i.test(raw.className || "")) return true;
  const category = cleanCategory(raw.category || raw.builtInCategory);
  const hasCurveGeometry = !!raw.geometry?.locationCurve || !!raw.geometry?.curves?.length;
  const isLineOrCurve = category.includes("line") || category.includes("curve");
  const detailLineParameter = firstDefined(
    raw.parameters?.DetailLine,
    raw.parameters?.["Detail Line"],
    raw.parameters?.["DETAIL LINE"]
  );
  return hasCurveGeometry && isLineOrCurve && isTruthyRevitParameter(detailLineParameter);
};
var closePoints = (points) => {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < EPSILON2 ? points : [...points, first];
};
var pointDistance2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
var midpoint2 = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
var removeDuplicatePoints = (points, tolerance = EPSILON2) => points.filter((point, index) => index === 0 || pointDistance2(point, points[index - 1]) > tolerance);
var polygonCentroid2 = (points) => {
  if (!points.length) return { x: 0, y: 0 };
  const loop = closePoints(points);
  let twiceArea = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < loop.length - 1; i += 1) {
    const a = loop[i];
    const b = loop[i + 1];
    const cross = a.x * b.y - b.x * a.y;
    twiceArea += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  if (Math.abs(twiceArea) < EPSILON2) {
    return points.reduce((acc, point) => ({ x: acc.x + point.x / points.length, y: acc.y + point.y / points.length }), { x: 0, y: 0 });
  }
  return { x: x / (3 * twiceArea), y: y / (3 * twiceArea) };
};
var matchPreset = (presets, dimensions, tolerance = 3e-3) => presets.find((preset) => Object.entries(dimensions).every(([key, value]) => value === void 0 || preset[key] === void 0 || Math.abs(preset[key] - value) <= tolerance));
var sourceFamilyType = (raw) => [raw.familyName, raw.typeName].filter(Boolean).join(" : ") || raw.typeName || raw.name || raw.className || raw.category;
var buildLevelMap = (levels, manifest) => {
  const map = /* @__PURE__ */ new Map();
  manifest.levels.forEach((source, index) => {
    const target = levels[index];
    if (!target) return;
    [source.elementId, source.uniqueId, source.name, target.id, target.name].forEach((value) => {
      if (value !== void 0 && value !== null) map.set(String(value).toLowerCase(), target);
    });
  });
  return map;
};
var createLevels = (manifest, warnings) => {
  const sorted = [...manifest.levels || []].sort((a, b) => a.elevation - b.elevation || a.order - b.order || a.name.localeCompare(b.name));
  if (!sorted.length) {
    warnings.push("No Revit levels were extracted. A single fallback level was created.");
    return [{ id: "aps_revit_level_1", name: "Level 1", zElevation: 0, height: WALL_HEIGHT_DEFAULT, order: 0 }];
  }
  return sorted.map((level, index) => {
    const next = sorted[index + 1];
    const zElevation = apsRevitImportCoordinates.toAppLength(level.elevation);
    const nextElevation = next ? apsRevitImportCoordinates.toAppLength(next.elevation) : void 0;
    const height = nextElevation !== void 0 ? Math.max(0.1, nextElevation - zElevation) : WALL_HEIGHT_DEFAULT;
    return {
      id: `aps_revit_level_${safeIdPart(level.uniqueId || level.elementId || index)}`,
      name: level.name || `Level ${index + 1}`,
      zElevation,
      height,
      order: index,
      metadata: {
        apsRevitImport: {
          sourceElementId: level.elementId,
          sourceUniqueId: level.uniqueId,
          sourceElevationFeet: level.elevation,
          parameters: level.parameters || {}
        }
      }
    };
  });
};
var resolveLevel = (ctx, raw) => {
  for (const candidate of [raw.levelElementId, raw.levelUniqueId, raw.levelName]) {
    if (!candidate) continue;
    const match = ctx.levelMap.get(String(candidate).toLowerCase());
    if (match) return match;
  }
  const z = raw.geometry?.locationPoint?.z ?? raw.geometry?.boundingBox?.min.z;
  if (typeof z === "number") {
    const meters = apsRevitImportCoordinates.toAppLength(z);
    const closest = [...ctx.levels].sort((a, b) => Math.abs(a.zElevation - meters) - Math.abs(b.zElevation - meters))[0];
    if (closest) return closest;
  }
  return ctx.levels[0];
};
var resolveCeilingHostLevel = (ctx, raw) => {
  const bboxMinZ = raw.geometry?.boundingBox?.min.z;
  const zMeters = typeof bboxMinZ === "number" ? apsRevitImportCoordinates.toAppLength(bboxMinZ) : void 0;
  if (zMeters === void 0) return resolveLevel(ctx, raw);
  const sorted = [...ctx.levels].sort((a, b) => a.zElevation - b.zElevation);
  const tolerance = 0.025;
  let lower = sorted[0] || resolveLevel(ctx, raw);
  for (let index = 0; index < sorted.length; index += 1) {
    const level = sorted[index];
    if (level.zElevation < zMeters - tolerance) lower = level;
    if (Math.abs(level.zElevation - zMeters) <= tolerance) {
      return sorted[Math.max(0, index - 1)] || level;
    }
    if (level.zElevation > zMeters + tolerance) break;
  }
  return lower;
};
var makeTargetId = (ctx, raw, prefix) => {
  const roundTripId = raw.ourAppParameters?.OurApp_ElementId;
  const preferred = typeof roundTripId === "string" && roundTripId.trim() ? roundTripId.trim() : `${prefix}_${safeIdPart(raw.uniqueId || raw.elementId || crypto.randomUUID())}`;
  let candidate = preferred;
  let index = 1;
  while (ctx.usedIds.has(candidate)) {
    candidate = `${preferred}_${index}`;
    index += 1;
  }
  ctx.usedIds.add(candidate);
  return candidate;
};
var addRow = (ctx, raw, result, target, message) => {
  ctx.rows.push({
    sourceRevitElementId: raw.elementId,
    sourceRevitUniqueId: raw.uniqueId,
    sourceRevitCategory: raw.category,
    sourceRevitFamilyType: sourceFamilyType(raw),
    targetNativeType: target?.type,
    targetAppElementId: target?.id,
    result,
    warning: result === "native" ? message : void 0,
    fallbackReason: result === "fallback" || result === "skipped" ? message : void 0
  });
  if (message && result !== "native") ctx.warnings.push(`${raw.category} ${raw.elementId}: ${message}`);
};
var withImportMetadata = (element, raw, ctx, extra = {}) => ({
  ...element,
  sourceType: "aps_revit_import",
  sourceFileType: "rvt",
  sourceFileName: ctx.fileName,
  bimSourceId: raw.uniqueId || raw.elementId,
  bimSourceCategory: raw.category,
  revitFamilyName: raw.familyName,
  revitTypeName: raw.typeName,
  importTimestamp: ctx.manifest.extractedAt || (/* @__PURE__ */ new Date()).toISOString(),
  importVersion: APS_REVIT_IMPORT_VERSION,
  metadata: {
    ...element.metadata || {},
    apsRevitImport: {
      sourceElementId: raw.elementId,
      sourceUniqueId: raw.uniqueId,
      sourceCategory: raw.category,
      builtInCategory: raw.builtInCategory,
      className: raw.className,
      familyName: raw.familyName,
      typeName: raw.typeName,
      typeId: raw.typeId,
      hostElementId: raw.hostElementId,
      hostUniqueId: raw.hostUniqueId,
      levelElementId: raw.levelElementId,
      levelUniqueId: raw.levelUniqueId,
      materialIds: raw.materialIds || [],
      materialNames: raw.materialNames || [],
      parameters: raw.parameters || {},
      ourAppParameters: raw.ourAppParameters || {},
      sourceViewId: raw.sourceViewId || raw.geometry?.sourceViewId,
      sourceViewName: raw.sourceViewName || raw.geometry?.sourceViewName,
      warnings: raw.warnings || [],
      ...extra
    }
  }
});
var materialArray = (raw) => (raw.materialNames || []).map((name, index) => ({
  id: raw.materialIds?.[index] || name,
  name
}));
var curveStartEnd = (curve) => {
  const p1 = apsRevitImportCoordinates.toAppPoint(curve?.start || curve?.points?.[0]);
  const p2 = apsRevitImportCoordinates.toAppPoint(curve?.end || curve?.points?.[1]);
  return p1 && p2 ? { p1, p2 } : null;
};
var normalizeRadians = (angle) => (angle % TAU2 + TAU2) % TAU2;
var angleFromCenter = (point, center) => normalizeRadians(Math.atan2(point.y - center.y, point.x - center.x));
var hasDistinctEndpoints = (curve) => {
  const endpoints = curveStartEnd(curve);
  return !!endpoints && pointDistance2(endpoints.p1, endpoints.p2) > EPSILON2;
};
var isBoundedCircularArc = (curve) => !!curve && (curve.kind === "arc" || curve.kind === "circle") && curve.isBound !== false && !!curve.center && !!curve.radius && hasDistinctEndpoints(curve);
var interpolateAngle2 = (start, end, t, counterclockwise = false) => {
  let span = counterclockwise ? start - end : end - start;
  if (span < 0) span += TAU2;
  return counterclockwise ? start - span * t : start + span * t;
};
var pointOnCircle = (center, radius, angle) => ({
  x: center.x + Math.cos(angle) * radius,
  y: center.y + Math.sin(angle) * radius
});
var toAppDirection = (point) => {
  if (!point) return null;
  const x = toFinite(point.x, NaN);
  const y = toFinite(point.y, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y: -y };
};
var inferCurveCounterclockwise = (mid, pointAt, fallback = false) => {
  if (!mid) return fallback;
  const ccwPoint = pointAt(true);
  const cwPoint = pointAt(false);
  return pointDistance2(mid, ccwPoint) <= pointDistance2(mid, cwPoint);
};
var circularArcFromCurve = (curve) => {
  const endpoints = curveStartEnd(curve);
  const center = apsRevitImportCoordinates.toAppPoint(curve.center);
  const radius = apsRevitImportCoordinates.toAppLength(curve.radius || 0);
  if (!endpoints || !center || radius <= EPSILON2) return null;
  const startAngle = angleFromCenter(endpoints.p1, center);
  const endAngle = angleFromCenter(endpoints.p2, center);
  const mid = apsRevitImportCoordinates.toAppPoint(curve.mid || void 0);
  const counterclockwise = inferCurveCounterclockwise(
    mid,
    (candidate) => pointOnCircle(center, radius, interpolateAngle2(startAngle, endAngle, 0.5, candidate)),
    false
  );
  return {
    ...endpoints,
    center,
    radius,
    mid,
    startAngle,
    endAngle,
    counterclockwise
  };
};
var ellipsePointAt = (center, radiusX, radiusY, rotation, angle) => {
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const x = Math.cos(angle) * radiusX;
  const y = Math.sin(angle) * radiusY;
  return {
    x: center.x + x * cosR - y * sinR,
    y: center.y + x * sinR + y * cosR
  };
};
var ellipseAngleFromPoint = (point, center, radiusX, radiusY, rotation) => {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cosR = Math.cos(rotation);
  const sinR = Math.sin(rotation);
  const localX = dx * cosR + dy * sinR;
  const localY = -dx * sinR + dy * cosR;
  return normalizeRadians(Math.atan2(localY / Math.max(EPSILON2, radiusY), localX / Math.max(EPSILON2, radiusX)));
};
var ellipseFromCurve = (curve) => {
  const center = apsRevitImportCoordinates.toAppPoint(curve.center);
  if (!center) return null;
  const radiusX = apsRevitImportCoordinates.toAppLength(curve.radiusX ?? curve.radius ?? 0);
  const radiusY = apsRevitImportCoordinates.toAppLength(curve.radiusY ?? curve.radius ?? 0);
  if (radiusX <= EPSILON2 || radiusY <= EPSILON2) return null;
  const xDirection = toAppDirection(curve.xDirection);
  const rotation = xDirection && pointDistance2(xDirection, { x: 0, y: 0 }) > EPSILON2 ? Math.atan2(xDirection.y, xDirection.x) : apsRevitImportCoordinates.toAppAngleRadians(curve.rotation || 0);
  const endpoints = curveStartEnd(curve);
  const mid = apsRevitImportCoordinates.toAppPoint(curve.mid || void 0);
  const isPartial = !!endpoints && hasDistinctEndpoints(curve);
  const startAngle = isPartial ? ellipseAngleFromPoint(endpoints.p1, center, radiusX, radiusY, rotation) : void 0;
  const endAngle = isPartial ? ellipseAngleFromPoint(endpoints.p2, center, radiusX, radiusY, rotation) : void 0;
  const counterclockwise = startAngle === void 0 || endAngle === void 0 ? void 0 : inferCurveCounterclockwise(
    mid,
    (candidate) => ellipsePointAt(center, radiusX, radiusY, rotation, interpolateAngle2(startAngle, endAngle, 0.5, candidate)),
    false
  );
  return {
    center,
    radiusX,
    radiusY,
    rotation,
    startAngle,
    endAngle,
    counterclockwise
  };
};
var perpendicularDistanceToSegment = (point, start, end) => {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy;
  if (len2 <= EPSILON2) return pointDistance2(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / len2));
  return pointDistance2(point, { x: start.x + dx * t, y: start.y + dy * t });
};
var simplifyPolyline = (points, tolerance) => {
  if (points.length <= 2) return points;
  let maxDistance = -1;
  let splitIndex = -1;
  const start = points[0];
  const end = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const distance = perpendicularDistanceToSegment(points[index], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      splitIndex = index;
    }
  }
  if (maxDistance <= tolerance || splitIndex < 0) return [start, end];
  const left = simplifyPolyline(points.slice(0, splitIndex + 1), tolerance);
  const right = simplifyPolyline(points.slice(splitIndex), tolerance);
  return [...left.slice(0, -1), ...right];
};
var limitPolylinePoints = (points, maxPoints) => {
  if (points.length <= maxPoints) return points;
  const limited = [];
  for (let index = 0; index < maxPoints; index += 1) {
    const sourceIndex = Math.round(index * (points.length - 1) / (maxPoints - 1));
    limited.push(points[sourceIndex]);
  }
  return removeDuplicatePoints(limited);
};
var curvePointsToAppPolyline = (curve) => {
  const raw = (curve.points || []).map((point) => apsRevitImportCoordinates.toAppPoint(point)).filter(Boolean);
  const unique = removeDuplicatePoints(raw);
  if (unique.length <= 2) return unique;
  const simplified = simplifyPolyline(unique, curve.kind === "spline" ? 0.015 : 5e-3);
  return limitPolylinePoints(simplified, curve.kind === "spline" ? 129 : 257);
};
var curveToShape = (curve, base) => {
  const kind = curve.kind || "unknown";
  if ((kind === "polyline" || kind === "spline") && Array.isArray(curve.points) && curve.points.length > 1) {
    const points = curvePointsToAppPolyline(curve);
    return points.slice(0, -1).flatMap((p1, index) => {
      const p2 = points[index + 1];
      return [{ ...base, id: `${base.id}_${index}`, type: "line", p1, p2, layer: base.layer || "SHAPES" }];
    });
  }
  if (isBoundedCircularArc(curve)) {
    const arc = circularArcFromCurve(curve);
    if (!arc) return [];
    return [{
      ...base,
      type: "arc",
      p1: arc.p1,
      p2: arc.p2,
      controlPoint: arc.mid || midpoint2(arc.p1, arc.p2),
      arcCenter: arc.center,
      arcRadius: arc.radius,
      arcStartAngle: arc.startAngle,
      arcEndAngle: arc.endAngle,
      arcCounterclockwise: arc.counterclockwise,
      isCurved: true,
      layer: base.layer || "SHAPES"
    }];
  }
  if (kind === "circle" && curve.center && curve.radius) {
    const center = apsRevitImportCoordinates.toAppPoint(curve.center);
    if (!center) return [];
    const radius = apsRevitImportCoordinates.toAppLength(curve.radius);
    return [{
      ...base,
      type: "circle",
      p1: center,
      p2: { x: center.x + radius, y: center.y },
      layer: base.layer || "SHAPES"
    }];
  }
  if (kind === "ellipse" && curve.center) {
    const ellipse = ellipseFromCurve(curve);
    if (!ellipse) return [];
    return [{
      ...base,
      type: "ellipse",
      p1: { x: ellipse.center.x - ellipse.radiusX, y: ellipse.center.y - ellipse.radiusY },
      p2: { x: ellipse.center.x + ellipse.radiusX, y: ellipse.center.y + ellipse.radiusY },
      ellipseCenter: ellipse.center,
      ellipseRadiusX: ellipse.radiusX,
      ellipseRadiusY: ellipse.radiusY,
      ellipseRotation: ellipse.rotation,
      ellipseStartAngle: ellipse.startAngle,
      ellipseEndAngle: ellipse.endAngle,
      ellipseCounterclockwise: ellipse.counterclockwise,
      startT: ellipse.startAngle === void 0 ? void 0 : normalizeRadians(ellipse.startAngle) / TAU2,
      endT: ellipse.endAngle === void 0 ? void 0 : normalizeRadians(ellipse.endAngle) / TAU2,
      isCurved: true,
      layer: base.layer || "SHAPES"
    }];
  }
  const endpoints = curveStartEnd(curve);
  if (!endpoints) return [];
  if (kind === "arc" && curve.center) {
    const arc = circularArcFromCurve(curve);
    if (!arc) return [];
    return [{
      ...base,
      type: "arc",
      p1: arc.p1,
      p2: arc.p2,
      controlPoint: arc.mid || midpoint2(arc.p1, arc.p2),
      arcCenter: arc.center,
      arcRadius: arc.radius,
      arcStartAngle: arc.startAngle,
      arcEndAngle: arc.endAngle,
      arcCounterclockwise: arc.counterclockwise,
      isCurved: true,
      layer: base.layer || "SHAPES"
    }];
  }
  return [{
    ...base,
    type: "line",
    p1: endpoints.p1,
    p2: endpoints.p2,
    layer: base.layer || "SHAPES"
  }];
};
var nearestPointOnWall = (point, wall) => {
  if (!wall.p1 || !wall.p2) return null;
  const points = wall.isCurved || ["arc", "circle", "ellipse"].includes(wall.wallSource || "") ? sampleCurveElement(wall, 64) : [wall.p1, wall.p2];
  let best = null;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy;
    if (len2 < EPSILON2) continue;
    const localT = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / len2));
    const projected = { x: a.x + dx * localT, y: a.y + dy * localT };
    const candidate = {
      point: projected,
      t: (i + localT) / (points.length - 1),
      dist: pointDistance2(point, projected),
      angle: Math.atan2(dy, dx) * 180 / Math.PI
    };
    if (!best || candidate.dist < best.dist) best = candidate;
  }
  return best;
};
var findHostWall2 = (raw, point, walls) => {
  const hostKeys = [raw.hostElementId, raw.hostUniqueId].filter(Boolean).map(String);
  const preferred = hostKeys.length ? walls.filter((wall) => {
    const metadata = wall.metadata?.apsRevitImport || {};
    return hostKeys.includes(metadata.sourceElementId) || hostKeys.includes(metadata.sourceUniqueId);
  }) : [];
  const pool = preferred.length ? preferred : walls;
  let best = null;
  pool.forEach((wall) => {
    const candidate = nearestPointOnWall(point, wall);
    if (!candidate) return;
    if (!best || candidate.dist < best.dist) best = { wall, ...candidate };
  });
  return best;
};
var boundaryFromRaw = (raw) => {
  const loop = raw.geometry?.boundaryLoops?.find((points) => points.length >= 3) || raw.geometry?.footprint || [];
  return closePoints(loop.map((point) => apsRevitImportCoordinates.toAppPoint(point)).filter(Boolean));
};
var createFallback = (ctx, raw, reason) => {
  if (!ctx.options.importGenericFamiliesAsBlocks) {
    addRow(ctx, raw, "skipped", null, `${reason}; generic/custom family blocks are disabled.`);
    return null;
  }
  const level = resolveLevel(ctx, raw);
  const point = apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint) || apsRevitImportCoordinates.toAppPoint(raw.geometry?.boundingBox?.min) || { x: 0, y: 0 };
  const bbox = raw.geometry?.boundingBox;
  const width = raw.geometry?.width ? apsRevitImportCoordinates.toAppLength(raw.geometry.width) : bbox ? Math.max(0.05, Math.abs(apsRevitImportCoordinates.toAppLength(bbox.max.x - bbox.min.x))) : 1;
  const depth = raw.geometry?.depth ? apsRevitImportCoordinates.toAppLength(raw.geometry.depth) : bbox ? Math.max(0.05, Math.abs(apsRevitImportCoordinates.toAppLength(bbox.max.y - bbox.min.y))) : 1;
  const height = raw.geometry?.height ? apsRevitImportCoordinates.toAppLength(raw.geometry.height) : bbox ? Math.max(0.05, Math.abs(apsRevitImportCoordinates.toAppLength((bbox.max.z || 0) - (bbox.min.z || 0)))) : 0.75;
  const label = sourceFamilyType(raw);
  const lookupText = `${raw.familyName || ""} ${raw.typeName || ""} ${raw.name || ""}`.toLowerCase();
  const preset = INTERIOR_ELEMENT_PRESETS.find((candidate) => {
    const haystack = [candidate.label, candidate.subType, candidate.id, candidate.category].filter(Boolean).join(" ").toLowerCase();
    return haystack && lookupText.includes(String(candidate.subType || candidate.id || candidate.label).toLowerCase());
  });
  const base = preset ? normalizeInteriorElement({
    id: makeTargetId(ctx, raw, "aps_revit_item"),
    type: preset.type || "furniture",
    subType: preset.subType,
    label: label || preset.label,
    pos: point,
    width: width || preset.width,
    depth: depth || preset.depth,
    height: height || preset.height,
    rotation: apsRevitImportCoordinates.toAppRotationDegrees(raw.geometry?.rotation || 0),
    levelId: level.id,
    layer: "APS_REVIT_FALLBACK",
    category: preset.category || raw.category,
    iconType: preset.iconType,
    materials: materialArray(raw)
  }) : {
    id: makeTargetId(ctx, raw, "aps_revit_block"),
    type: "asset",
    assetType: "bim-object",
    label,
    displayName: label,
    pos: point,
    width,
    depth,
    height,
    rotation: apsRevitImportCoordinates.toAppRotationDegrees(raw.geometry?.rotation || 0),
    levelId: level.id,
    layer: "APS_REVIT_FALLBACK",
    category: raw.category,
    sourceFileType: "rvt",
    materials: materialArray(raw)
  };
  const element = withImportMetadata(base, raw, ctx, {
    fallbackReason: reason,
    boundingBox: raw.geometry?.boundingBox
  });
  addRow(ctx, raw, "fallback", element, reason);
  return element;
};
var createWall = (ctx, raw) => {
  const level = resolveLevel(ctx, raw);
  const curve = raw.geometry?.locationCurve;
  if (!curve) {
    return createFallback(ctx, raw, "Wall did not include a Revit LocationCurve that can become a native canvas wall.");
  }
  const thickness = apsRevitImportCoordinates.toAppLength(firstDefined(
    raw.ourAppParameters?.OurApp_Thickness,
    raw.geometry?.thickness,
    raw.parameters?.Width,
    raw.parameters?.["Width"]
  ), WALL_THICKNESS_DEFAULT / 0.3048);
  const height = apsRevitImportCoordinates.toAppLength(firstDefined(
    raw.ourAppParameters?.OurApp_Height,
    raw.geometry?.height,
    raw.parameters?.UnconnectedHeight,
    raw.parameters?.["Unconnected Height"]
  ), (level.height || WALL_HEIGHT_DEFAULT) / 0.3048);
  const preset = matchPreset(WALL_PRESETS, { thickness });
  const endpoints = curveStartEnd(curve);
  const circleCenter = curve.kind === "circle" ? apsRevitImportCoordinates.toAppPoint(curve.center || void 0) : null;
  const circleRadius = curve.kind === "circle" ? apsRevitImportCoordinates.toAppLength(curve.radius || 0) : 0;
  const ellipseGeometry = curve.kind === "ellipse" ? ellipseFromCurve(curve) : null;
  const p1 = endpoints?.p1 || circleCenter || (ellipseGeometry ? { x: ellipseGeometry.center.x - ellipseGeometry.radiusX, y: ellipseGeometry.center.y - ellipseGeometry.radiusY } : null);
  const p2 = endpoints?.p2 || (circleCenter && circleRadius > 0 ? { x: circleCenter.x + circleRadius, y: circleCenter.y } : null) || (ellipseGeometry ? { x: ellipseGeometry.center.x + ellipseGeometry.radiusX, y: ellipseGeometry.center.y + ellipseGeometry.radiusY } : null);
  if (!p1 || !p2) {
    return createFallback(ctx, raw, `Unsupported Revit wall curve "${curve.kind}" did not include enough curve geometry.`);
  }
  const base = {
    id: makeTargetId(ctx, raw, "aps_revit_wall"),
    type: "wall",
    p1,
    p2,
    thickness,
    height: Math.max(0.05, height),
    levelId: level.id,
    layer: "WALLS",
    label: raw.name || raw.typeName || preset?.label || "Wall",
    subType: preset?.id || raw.typeName,
    category: raw.category,
    materials: materialArray(raw),
    baseOffset: apsRevitImportCoordinates.toAppLength(firstDefined(raw.parameters?.BaseOffset, raw.parameters?.["Base Offset"]), 0),
    topOffset: apsRevitImportCoordinates.toAppLength(firstDefined(raw.parameters?.TopOffset, raw.parameters?.["Top Offset"]), 0)
  };
  if (isBoundedCircularArc(curve)) {
    const arc = circularArcFromCurve(curve);
    if (!arc) return createFallback(ctx, raw, `Unsupported Revit wall arc "${curve.kind}" did not include enough circular geometry.`);
    base.wallSource = "arc";
    base.isCurved = true;
    base.p1 = arc.p1;
    base.p2 = arc.p2;
    base.controlPoint = arc.mid || midpoint2(arc.p1, arc.p2);
    base.arcCenter = arc.center;
    base.arcRadius = arc.radius;
    base.arcStartAngle = arc.startAngle;
    base.arcEndAngle = arc.endAngle;
    base.arcCounterclockwise = arc.counterclockwise;
  } else if (curve.kind === "circle" && circleCenter && circleRadius > 0) {
    base.wallSource = "circle";
    base.isCurved = true;
    base.p1 = circleCenter;
    base.p2 = { x: circleCenter.x + circleRadius, y: circleCenter.y };
  } else if (curve.kind === "ellipse" && ellipseGeometry) {
    base.wallSource = "ellipse";
    base.isCurved = true;
    base.p1 = { x: ellipseGeometry.center.x - ellipseGeometry.radiusX, y: ellipseGeometry.center.y - ellipseGeometry.radiusY };
    base.p2 = { x: ellipseGeometry.center.x + ellipseGeometry.radiusX, y: ellipseGeometry.center.y + ellipseGeometry.radiusY };
    base.ellipseCenter = ellipseGeometry.center;
    base.ellipseRadiusX = ellipseGeometry.radiusX;
    base.ellipseRadiusY = ellipseGeometry.radiusY;
    base.ellipseRotation = ellipseGeometry.rotation;
    base.ellipseStartAngle = ellipseGeometry.startAngle;
    base.ellipseEndAngle = ellipseGeometry.endAngle;
    base.ellipseCounterclockwise = ellipseGeometry.counterclockwise;
    base.startT = ellipseGeometry.startAngle === void 0 ? void 0 : normalizeRadians(ellipseGeometry.startAngle) / TAU2;
    base.endT = ellipseGeometry.endAngle === void 0 ? void 0 : normalizeRadians(ellipseGeometry.endAngle) / TAU2;
  } else if (curve.kind !== "line") {
    return createFallback(ctx, raw, `Unsupported Revit wall curve "${curve.kind}" was preserved as a block/proxy.`);
  }
  const element = withImportMetadata(base, raw, ctx);
  addRow(ctx, raw, "native", element);
  return element;
};
var createHosted = (ctx, raw, walls, type) => {
  const point = apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint);
  if (!point) return createFallback(ctx, raw, `${type} did not include a Revit insertion point.`);
  const host = findHostWall2(raw, point, walls);
  if (!host) return createFallback(ctx, raw, `${type} could not be matched to a compatible native host wall.`);
  const level = resolveLevel(ctx, raw);
  const width = apsRevitImportCoordinates.toAppLength(firstDefined(
    raw.ourAppParameters?.OurApp_Width,
    raw.geometry?.width,
    raw.parameters?.Width,
    raw.parameters?.["Rough Width"]
  ), (type === "door" ? 0.9 : 1.1) / 0.3048);
  const height = apsRevitImportCoordinates.toAppLength(firstDefined(
    raw.ourAppParameters?.OurApp_Height,
    raw.geometry?.height,
    raw.parameters?.Height,
    raw.parameters?.["Rough Height"]
  ), (type === "door" ? DOOR_HEIGHT_DEFAULT : WALL_OPENING_HEIGHT_DEFAULT) / 0.3048);
  const sillHeight = type === "window" ? apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.height ? raw.parameters?.SillHeight : void 0, raw.parameters?.["Sill Height"]), WINDOW_SILL_HEIGHT_DEFAULT / 0.3048) : apsRevitImportCoordinates.toAppLength(firstDefined(raw.parameters?.BaseOffset, raw.parameters?.["Base Offset"]), 0);
  const preset = type === "door" ? matchPreset(DOOR_PRESETS, { width }) : type === "window" ? matchPreset(WINDOW_PRESETS, { width, height }) : void 0;
  const element = withImportMetadata({
    id: makeTargetId(ctx, raw, `aps_revit_${type.replace("-", "_")}`),
    type,
    pos: host.point,
    width,
    height,
    sillHeight: type === "window" ? sillHeight : void 0,
    topHeight: type === "window" ? Math.max(sillHeight + 0.05, apsRevitImportCoordinates.toAppLength(firstDefined(raw.parameters?.HeadHeight, raw.parameters?.["Head Height"]), (sillHeight + height) / 0.3048)) : void 0,
    rotation: host.angle,
    hostWallId: host.wall.id,
    hostT: host.t,
    levelId: level.id,
    layer: type === "door" ? "DOORS" : type === "window" ? "WINDOWS" : "OPENINGS",
    label: raw.name || raw.typeName || preset?.label || type,
    subType: preset?.subType || preset?.id || raw.typeName,
    category: raw.category,
    materials: materialArray(raw)
  }, raw, ctx, {
    hostDistanceMeters: host.dist,
    resolvedHostWallId: host.wall.id
  });
  addRow(ctx, raw, "native", element);
  return element;
};
var createBoundaryElement = (ctx, raw, type) => {
  const boundary = boundaryFromRaw(raw);
  if (boundary.length < 4) return createFallback(ctx, raw, `${type} did not include a reliable closed boundary loop.`);
  const level = type === "ceiling" ? resolveCeilingHostLevel(ctx, raw) : resolveLevel(ctx, raw);
  const heightOrThickness = type === "room" ? apsRevitImportCoordinates.toAppLength(raw.geometry?.height, level.height) : apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.thickness, raw.geometry?.height), DEFAULT_PROJECT_SETTINGS_3D.slabThickness / 0.3048);
  const elevation = type === "ceiling" ? 0 : apsRevitImportCoordinates.toAppLength(raw.geometry?.boundingBox?.min.z, 0) - level.zElevation;
  const element = withImportMetadata({
    id: makeTargetId(ctx, raw, `aps_revit_${type}`),
    type,
    boundary,
    pos: apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint) || polygonCentroid2(boundary),
    height: heightOrThickness,
    elevation,
    levelId: level.id,
    layer: type === "floor" ? "FLOORS" : type === "ceiling" ? "CEILINGS" : "ROOMS",
    label: raw.name || raw.typeName || type,
    category: raw.category,
    materials: materialArray(raw),
    metadata: type === "room" ? {
      roomShowArea: true,
      roomNameOnly: false
    } : void 0
  }, raw, ctx, {
    holes: raw.geometry?.holes || [],
    areaSquareMeters: raw.geometry?.area ? apsRevitImportCoordinates.toAppArea(raw.geometry.area) : void 0
  });
  addRow(ctx, raw, "native", element);
  return element;
};
var createColumn = (ctx, raw) => {
  const point = apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint) || apsRevitImportCoordinates.toAppPoint(raw.geometry?.boundingBox?.min);
  if (!point) return createFallback(ctx, raw, "Column did not include a reliable location point or bounding box.");
  const level = resolveLevel(ctx, raw);
  const bbox = raw.geometry?.boundingBox;
  const width = apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.width, raw.geometry?.diameter, bbox ? bbox.max.x - bbox.min.x : void 0), 0.45 / 0.3048);
  const depth = apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.depth, raw.geometry?.diameter, bbox ? bbox.max.y - bbox.min.y : void 0), width / 0.3048);
  const height = apsRevitImportCoordinates.toAppLength(firstDefined(raw.geometry?.height, bbox ? (bbox.max.z || 0) - (bbox.min.z || 0) : void 0), level.height / 0.3048);
  const shape = raw.geometry?.shapeHint === "circle" || cleanCategory(raw.typeName).includes("round") ? "circle" : "rect";
  const preset = matchPreset(COLUMN_PRESETS, { width, depth });
  const element = withImportMetadata({
    id: makeTargetId(ctx, raw, "aps_revit_column"),
    type: "column",
    pos: point,
    width,
    depth,
    height,
    rotation: apsRevitImportCoordinates.toAppRotationDegrees(raw.geometry?.rotation || 0),
    shape,
    levelId: level.id,
    layer: "COLUMNS",
    label: raw.name || raw.typeName || preset?.label || "Column",
    subType: preset?.id || raw.typeName,
    category: raw.category,
    materials: materialArray(raw)
  }, raw, ctx);
  addRow(ctx, raw, "native", element);
  return element;
};
var pathEndpoints = (raw) => {
  const pathCurve = raw.geometry?.path?.find((curve) => curve.start && curve.end);
  const line = curveStartEnd(pathCurve || raw.geometry?.locationCurve);
  if (line) return line;
  const bbox = raw.geometry?.boundingBox;
  if (!bbox) return null;
  const min = apsRevitImportCoordinates.toAppPoint(bbox.min);
  const max = apsRevitImportCoordinates.toAppPoint(bbox.max);
  if (!min || !max) return null;
  return Math.abs(max.x - min.x) >= Math.abs(max.y - min.y) ? { p1: { x: min.x, y: (min.y + max.y) / 2 }, p2: { x: max.x, y: (min.y + max.y) / 2 } } : { p1: { x: (min.x + max.x) / 2, y: min.y }, p2: { x: (min.x + max.x) / 2, y: max.y } };
};
var horizontalBoundingBoxSpanFeet = (raw) => {
  const bbox = raw.geometry?.boundingBox;
  if (!bbox) return null;
  return {
    x: Math.abs((bbox.max.x || 0) - (bbox.min.x || 0)),
    y: Math.abs((bbox.max.y || 0) - (bbox.min.y || 0))
  };
};
var readPathWidthFeet = (raw, type) => {
  if (type !== "stair") return toFinite(raw.geometry?.width, 0.05 / 0.3048);
  const fromParameters = firstDefined(
    raw.ourAppParameters?.OurApp_Width,
    raw.parameters?.ActualRunWidth,
    raw.parameters?.["Actual Run Width"],
    raw.parameters?.RunWidth,
    raw.parameters?.["Run Width"]
  );
  const parameterWidth = toFinite(fromParameters, NaN);
  if (Number.isFinite(parameterWidth) && parameterWidth > EPSILON2) return parameterWidth;
  const spans = horizontalBoundingBoxSpanFeet(raw);
  if (spans && spans.x > EPSILON2 && spans.y > EPSILON2) return Math.min(spans.x, spans.y);
  return toFinite(raw.geometry?.width, 1.05 / 0.3048);
};
var createPathElement = (ctx, raw, type) => {
  const endpoints = pathEndpoints(raw);
  if (!endpoints) return createFallback(ctx, raw, `${type} did not include a reliable line or path.`);
  const level = resolveLevel(ctx, raw);
  const width = apsRevitImportCoordinates.toAppLength(readPathWidthFeet(raw, type), type === "stair" ? 1.05 / 0.3048 : 0.05 / 0.3048);
  const height = apsRevitImportCoordinates.toAppLength(raw.geometry?.height, type === "railing" ? 1 / 0.3048 : level.height / 0.3048);
  const preset = type === "stair" ? matchPreset(STAIR_PRESETS, { width }, 0.05) : void 0;
  const element = withImportMetadata({
    id: makeTargetId(ctx, raw, `aps_revit_${type}`),
    type,
    p1: endpoints.p1,
    p2: endpoints.p2,
    width,
    height,
    levelId: level.id,
    layer: type === "stair" ? "STAIRS" : type === "railing" ? "RAILINGS" : "GRIDLINES",
    label: raw.name || raw.typeName || type,
    subType: preset?.subType || raw.typeName,
    category: raw.category,
    materials: materialArray(raw),
    metadata: type === "stair" ? {
      stepCount: toFinite(firstDefined(raw.parameters?.ActualTreadsNumber, raw.parameters?.["Actual Number of Treads"], raw.parameters?.TreadCount), void 0),
      riserCount: toFinite(firstDefined(raw.parameters?.ActualRisersNumber, raw.parameters?.["Actual Number of Risers"], raw.parameters?.RiserCount), void 0),
      treadCount: toFinite(firstDefined(raw.parameters?.ActualTreadsNumber, raw.parameters?.["Actual Number of Treads"], raw.parameters?.TreadCount), void 0)
    } : void 0
  }, raw, ctx);
  addRow(ctx, raw, "native", element);
  return element;
};
var createAnnotation = (ctx, raw) => {
  if (!ctx.options.importPlanAnnotations) {
    addRow(ctx, raw, "skipped", null, "Plan annotation import option is disabled.");
    return null;
  }
  if (isRevitDetailDraftingCurve(raw)) {
    addRow(ctx, raw, "skipped", null, "Revit detail/drafting curve skipped; APS import keeps model curves but excludes view-only drafting symbols.");
    return null;
  }
  const category = cleanCategory(raw.category);
  const level = resolveLevel(ctx, raw);
  if (category.includes("textnote") || category.includes("text") || raw.geometry?.text) {
    const pos = apsRevitImportCoordinates.toAppPoint(raw.geometry?.locationPoint) || apsRevitImportCoordinates.toAppPoint(raw.geometry?.boundingBox?.min) || { x: 0, y: 0 };
    const element = withImportMetadata({
      id: makeTargetId(ctx, raw, "aps_revit_text"),
      type: "label",
      pos,
      label: raw.geometry?.text || raw.name || "",
      rotation: apsRevitImportCoordinates.toAppRotationDegrees(raw.geometry?.rotation || 0),
      textAlignment: raw.geometry?.alignment === "center" ? "center" : raw.geometry?.alignment === "right" ? "right" : "left",
      textFontSize: apsRevitImportCoordinates.toAppLength(raw.parameters?.TextSize || raw.parameters?.["Text Size"], 0.25 / 0.3048),
      levelId: level.id,
      layer: "TEXT",
      viewId: "plan"
    }, raw, ctx);
    addRow(ctx, raw, "native", element);
    return element;
  }
  if (category.includes("dimension") || raw.className === "Dimension") {
    if (!ctx.options.importDimensions) {
      addRow(ctx, raw, "skipped", null, "Dimension import option is disabled.");
      return null;
    }
    const curve = raw.geometry?.curves?.[0] || raw.geometry?.locationCurve;
    const endpoints = curveStartEnd(curve);
    if (!endpoints) {
      const fallback = createFallback(ctx, raw, "Dimension references could not be mapped, so it was kept as a safe annotation fallback.");
      if (fallback) fallback.locked = true;
      return fallback;
    }
    const element = withImportMetadata({
      id: makeTargetId(ctx, raw, "aps_revit_dimension"),
      type: "dimension",
      p1: endpoints.p1,
      p2: endpoints.p2,
      label: raw.geometry?.valueText || raw.name,
      levelId: level.id,
      layer: "DIMENSIONS",
      locked: false,
      viewId: "plan"
    }, raw, ctx);
    addRow(ctx, raw, "native", element);
    return element;
  }
  const curves = raw.geometry?.curves || (raw.geometry?.locationCurve ? [raw.geometry.locationCurve] : []);
  if (curves.length) {
    const id = makeTargetId(ctx, raw, "aps_revit_curve");
    const shapes = curves.flatMap((curve, curveIndex) => curveToShape(curve, {
      id: curves.length === 1 ? id : `${id}_${curveIndex}`,
      levelId: level.id,
      layer: "SHAPES",
      viewId: "plan",
      label: raw.name
    })).map((shape) => withImportMetadata(shape, raw, ctx));
    shapes.forEach((shape) => addRow(ctx, raw, "native", shape));
    return shapes;
  }
  return createFallback(ctx, raw, "Annotation geometry was not recognized.");
};
var createElement = (ctx, raw, walls) => {
  const category = cleanCategory(raw.category || raw.builtInCategory || raw.className);
  const nativeType = raw.ourAppParameters?.OurApp_NativeElementType;
  if (isSafeElementType(nativeType)) {
    const nativeCategory = cleanCategory(nativeType);
    if (nativeCategory === "wall") return createWall(ctx, raw);
    if (nativeCategory === "door") return createHosted(ctx, raw, walls, "door");
    if (nativeCategory === "window") return createHosted(ctx, raw, walls, "window");
    if (nativeCategory === "wallopening") return createHosted(ctx, raw, walls, "wall-opening");
  }
  if (category.includes("wall") && !category.includes("opening")) return createWall(ctx, raw);
  if (category.includes("door")) return createHosted(ctx, raw, walls, "door");
  if (category.includes("window")) return createHosted(ctx, raw, walls, "window");
  if (category.includes("opening")) return createHosted(ctx, raw, walls, "wall-opening");
  if (category.includes("floor")) return createBoundaryElement(ctx, raw, "floor");
  if (category.includes("ceiling") || category.includes("roof")) return createBoundaryElement(ctx, raw, "ceiling");
  if (category.includes("room") || raw.className === "Room") return createBoundaryElement(ctx, raw, "room");
  if (category.includes("column")) return createColumn(ctx, raw);
  if (category.includes("stair")) return createPathElement(ctx, raw, "stair");
  if (category.includes("railing")) return createPathElement(ctx, raw, "railing");
  if (category.includes("grid")) return createPathElement(ctx, raw, "gridline");
  if (raw.isAnnotation || category.includes("line") || category.includes("curve") || category.includes("text") || category.includes("dimension")) {
    return createAnnotation(ctx, raw);
  }
  return createFallback(ctx, raw, "No native canvas equivalent is currently available for this Revit category/family.");
};
var flattenResults = (value) => Array.isArray(value) ? value : value ? [value] : [];
var projectBounds = (elements) => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (point) => {
    if (!point) return;
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  elements.forEach((element) => {
    visit(element.pos);
    visit(element.p1);
    visit(element.p2);
    visit(element.controlPoint);
    element.boundary?.forEach(visit);
  });
  if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 100, maxY: 100, width: 100, height: 100 };
  return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
};
var countBy = (values, key) => values.reduce((counts, value) => {
  const name = key(value) || "Unknown";
  counts[name] = (counts[name] || 0) + 1;
  return counts;
}, {});
var buildReport = (ctx, elements, errors) => {
  const fallbackElementCount = ctx.rows.filter((row) => row.result === "fallback").length;
  const skippedElementCount = ctx.rows.filter((row) => row.result === "skipped").length;
  const nativeElementCount = ctx.rows.filter((row) => row.result === "native").length;
  const bounds = projectBounds(elements);
  const selectedPlanViews = (ctx.manifest.views || []).filter((view) => view.selectedForAnnotations);
  const ignoredPlanViews = (ctx.manifest.views || []).filter((view) => !view.selectedForAnnotations);
  const wallCount = elements.filter((element) => element.type === "wall").length;
  const hostedWithoutWall = elements.filter((element) => ["door", "window", "wall-opening"].includes(element.type) && !element.hostWallId).length;
  const validation = {
    hasLevels: ctx.levels.length > 0,
    hasElements: elements.length > 0,
    projectBoundingBox: `${bounds.minX.toFixed(3)},${bounds.minY.toFixed(3)} to ${bounds.maxX.toFixed(3)},${bounds.maxY.toFixed(3)}`,
    coordinateTransform: "revit-internal feet -> meters, x=x, y=-y, z=z",
    wallCount,
    hostedElementsWithoutNativeWall: hostedWithoutWall,
    selectedPlanViewCount: selectedPlanViews.length,
    linkedModelCount: ctx.manifest.linkedModels?.length || 0,
    containsIfcStepSyntax: JSON.stringify(ctx.manifest).includes(STEP_SYNTAX_MARKER),
    emptyImportedProject: elements.length === 0
  };
  return {
    importVersion: APS_REVIT_IMPORT_VERSION,
    status: errors.length ? "failed" : ctx.warnings.length || fallbackElementCount || skippedElementCount ? "completed_with_warnings" : "completed",
    source: ctx.manifest.source,
    selectedRevitEngine: ctx.options.revitEngine,
    projectName: ctx.manifest.source.projectName || ctx.fileName.replace(/\.[^/.]+$/, ""),
    sourceElementCount: ctx.manifest.elements.length,
    importedElementCount: elements.length,
    nativeElementCount,
    fallbackElementCount,
    skippedElementCount,
    levels: ctx.levels.map((level) => ({
      ...level,
      sourceElementId: level.metadata?.apsRevitImport?.sourceElementId,
      sourceUniqueId: level.metadata?.apsRevitImport?.sourceUniqueId
    })),
    selectedPlanViews,
    ignoredPlanViews,
    linkedModels: ctx.manifest.linkedModels || [],
    classCounts: countBy(ctx.manifest.elements, (raw) => raw.category),
    targetTypeCounts: countBy(elements, (element) => element.type),
    elementMappings: ctx.rows,
    warnings: [.../* @__PURE__ */ new Set([...ctx.manifest.warnings, ...ctx.warnings])],
    errors,
    validation
  };
};
var convertApsRevitExtractionToNative = (manifest, fileName = manifest.source?.fileName || "Imported Revit Project.rvt", importOptions = {}) => {
  const warnings = [...manifest.warnings || []];
  const errors = [];
  if (manifest.manifestVersion !== APS_REVIT_IMPORT_VERSION) {
    errors.push(`Unsupported APS Revit import manifest version: ${manifest.manifestVersion}`);
  }
  if (JSON.stringify(manifest).includes(STEP_SYNTAX_MARKER)) {
    errors.push("APS Revit Importer manifest must not contain IFC STEP syntax.");
  }
  const levels = createLevels(manifest, warnings);
  const ctx = {
    manifest,
    fileName,
    options: { ...DEFAULT_OPTIONS, ...manifest.options || {}, ...importOptions },
    levels,
    levelMap: /* @__PURE__ */ new Map(),
    usedIds: /* @__PURE__ */ new Set(),
    rows: [],
    warnings
  };
  ctx.levelMap = buildLevelMap(levels, manifest);
  if (ctx.options.includeLinkedModelReferencesAsWarnings && manifest.linkedModels?.length) {
    manifest.linkedModels.forEach((link) => {
      ctx.warnings.push(`Linked Revit model detected but not imported as editable elements in V1: ${link.name}`);
    });
  }
  const sourceElements = ctx.options.importModelElements ? manifest.elements : manifest.elements.filter((element) => element.isAnnotation);
  const wallSource = sourceElements.filter((element) => cleanCategory(element.category).includes("wall") && !cleanCategory(element.category).includes("opening"));
  const nonWallSource = sourceElements.filter((element) => !wallSource.includes(element));
  const elements = [];
  const walls = [];
  wallSource.forEach((raw) => {
    const wall = createWall(ctx, raw);
    if (!wall) return;
    walls.push(wall);
    elements.push(wall);
  });
  nonWallSource.forEach((raw) => {
    const created = createElement(ctx, raw, walls);
    elements.push(...flattenResults(created));
  });
  if (!elements.length) {
    errors.push("APS Revit Importer produced an empty native project.");
  }
  const bounds = projectBounds(elements);
  const report = buildReport(ctx, elements, errors);
  const project = {
    name: `${(manifest.source.projectName || fileName).replace(/\.[^/.]+$/, "")} - APS Revit Import`,
    mode: "floorplan",
    levels,
    elements,
    layers: LAYERS,
    viewBox: {
      width: Math.max(100, bounds.width + 10),
      height: Math.max(100, bounds.height + 10)
    },
    settings3D: {
      ...DEFAULT_PROJECT_SETTINGS_3D,
      defaultLevelHeight: levels[0]?.height || WALL_HEIGHT_DEFAULT,
      wallHeight: levels[0]?.height || WALL_HEIGHT_DEFAULT,
      level1Z: levels[0]?.zElevation || 0,
      level2Z: levels[1]?.zElevation ?? (levels[0]?.zElevation || 0) + (levels[0]?.height || WALL_HEIGHT_DEFAULT)
    },
    metadata: {
      apsRevitImport: {
        importVersion: APS_REVIT_IMPORT_VERSION,
        importedAt: (/* @__PURE__ */ new Date()).toISOString(),
        sourceFileName: fileName,
        source: manifest.source,
        options: ctx.options,
        reportSummary: {
          nativeElementCount: report.nativeElementCount,
          fallbackElementCount: report.fallbackElementCount,
          skippedElementCount: report.skippedElementCount,
          warnings: report.warnings.length,
          errors: report.errors.length
        }
      }
    }
  };
  return {
    project,
    levels,
    elements,
    layers: LAYERS,
    report,
    canConvert: errors.length === 0 && elements.length > 0
  };
};

// services/apsRevitImport/backend/apsRevitImportBackend.ts
var APS_AUTH_URL2 = "https://developer.api.autodesk.com/authentication/v2/token";
var APS_DATA_BASE_URL2 = "https://developer.api.autodesk.com";
var InMemoryApsRevitImportJobStore = class {
  constructor() {
    this.records = /* @__PURE__ */ new Map();
  }
  async create(record) {
    this.records.set(record.jobId, record);
  }
  async update(jobId, patch) {
    const existing = this.records.get(jobId);
    if (!existing) throw new Error(`Unknown APS Revit import job: ${jobId}`);
    const next = { ...existing, ...patch, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    this.records.set(jobId, next);
    return next;
  }
  async get(jobId) {
    return this.records.get(jobId) || null;
  }
};
var getApsRevitImportConfigFromEnv = (env = typeof process !== "undefined" ? process.env : {}) => {
  const config = {
    clientId: env.APS_CLIENT_ID || "",
    clientSecret: env.APS_CLIENT_SECRET || "",
    bucketKey: env.APS_BUCKET_KEY || "",
    region: env.APS_REGION || "",
    revitEngine: env.APS_REVIT_IMPORT_ENGINE || env.APS_REVIT_ENGINE || "",
    appBundleId: env.APS_REVIT_IMPORT_APPBUNDLE_ID || "",
    activityId: env.APS_REVIT_IMPORT_ACTIVITY_ID || "",
    activityAlias: env.APS_REVIT_IMPORT_ACTIVITY_ALIAS || "dev",
    callbackUrl: env.APS_REVIT_IMPORT_CALLBACK_URL,
    env
  };
  return Object.values({
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    bucketKey: config.bucketKey,
    region: config.region,
    revitEngine: config.revitEngine,
    appBundleId: config.appBundleId,
    activityId: config.activityId,
    activityAlias: config.activityAlias
  }).every(Boolean) ? config : null;
};
var requireConfig2 = (config) => {
  if (config) return config;
  throw new Error("APS Revit Importer is not configured. Set APS_CLIENT_ID, APS_CLIENT_SECRET, APS_BUCKET_KEY, APS_REGION, APS_REVIT_ENGINE, APS_REVIT_IMPORT_APPBUNDLE_ID, APS_REVIT_IMPORT_ACTIVITY_ID, and APS_REVIT_IMPORT_ACTIVITY_ALIAS on the server.");
};
var engineYear2 = (engine) => Number(String(engine || "").match(/Autodesk\.Revit\+(\d+)/)?.[1] || 0);
var engineEnvSuffix2 = (engine) => {
  const year = engineYear2(engine);
  return year ? `_${year}` : "";
};
var configForEngine2 = (baseConfig, requestedEngine) => {
  if (!requestedEngine || requestedEngine === baseConfig.revitEngine) return baseConfig;
  const suffix = engineEnvSuffix2(requestedEngine);
  const env = baseConfig.env || {};
  const engineConfig = {
    ...baseConfig,
    revitEngine: requestedEngine,
    appBundleId: env[`APS_REVIT_IMPORT_APPBUNDLE_ID${suffix}`] || "",
    activityId: env[`APS_REVIT_IMPORT_ACTIVITY_ID${suffix}`] || "",
    activityAlias: env[`APS_REVIT_IMPORT_ACTIVITY_ALIAS${suffix}`] || baseConfig.activityAlias
  };
  if (engineConfig.appBundleId && engineConfig.activityId && engineConfig.activityAlias) return engineConfig;
  throw new Error(`Revit engine ${requestedEngine} is available in APS, but APS Revit Importer does not have a matching AppBundle/Activity configured yet.`);
};
var designAutomationRegion2 = (region) => {
  const normalized = region.trim().toLowerCase();
  if (normalized === "us" || normalized === "usa" || normalized === "us-east") return "us-east";
  if (normalized === "emea" || normalized === "eu" || normalized === "europe") return "eu";
  return normalized || "us-east";
};
var designAutomationBaseUrl2 = (region) => `https://developer.api.autodesk.com/da/${designAutomationRegion2(region)}/v3`;
var activityFullId2 = (config) => config.activityId.includes("+") ? config.activityId : `${config.activityId}+${config.activityAlias}`;
var makeJobId2 = () => `aps_revit_import_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
var cleanFileName = (name, fallback = "revit-import") => (name || fallback).replace(/[<>:"/\\|?*\u0000-\u001F]+/g, "_").replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 96) || fallback;
var objectKey2 = (jobId, suffix) => `${jobId}/${suffix}`;
var requestJson2 = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`APS request failed ${response.status} ${response.statusText}: ${text.slice(0, 1e3)}`);
  }
  return text ? JSON.parse(text) : {};
};
var createToken2 = async (config) => {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: "data:read data:write data:create bucket:read bucket:create code:all"
  });
  return requestJson2(APS_AUTH_URL2, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });
};
var apsJson2 = async (token, url, init = {}) => requestJson2(url, {
  ...init,
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    ...init.headers || {}
  }
});
var listRevitEngines2 = async (token, config) => {
  const payload = await apsJson2(token, `${designAutomationBaseUrl2(config.region)}/engines`, { method: "GET" });
  const engines = Array.isArray(payload) ? payload : payload.data || payload.value || [];
  return engines.filter((engine) => String(engine).startsWith("Autodesk.Revit+"));
};
var ensureBucket2 = async (token, bucketKey, region) => {
  const detailsUrl = `${APS_DATA_BASE_URL2}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/details`;
  const details = await fetch(detailsUrl, { headers: { Authorization: `Bearer ${token}` } });
  if (details.ok) return;
  if (details.status !== 404) {
    const text = await details.text();
    throw new Error(`Failed to inspect APS bucket ${bucketKey}: ${details.status} ${text}`);
  }
  await apsJson2(token, `${APS_DATA_BASE_URL2}/oss/v2/buckets`, {
    method: "POST",
    body: JSON.stringify({
      bucketKey,
      policyKey: "transient",
      region: region.toUpperCase().includes("EMEA") ? "EMEA" : "US"
    })
  });
};
var createSignedS3UploadUrl2 = async (token, bucketKey, key) => {
  const url = `${APS_DATA_BASE_URL2}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3upload?parts=1&minutesExpiration=60`;
  const response = await apsJson2(token, url, { method: "GET" });
  const uploadUrl = response.urls?.[0] || response.uploadUrl || response.url;
  if (!uploadUrl || !response.uploadKey) throw new Error(`APS signed upload response did not include upload URL/uploadKey for ${key}.`);
  return { uploadUrl, uploadKey: response.uploadKey };
};
var completeSignedS3Upload2 = async (token, bucketKey, key, uploadKey) => {
  const url = `${APS_DATA_BASE_URL2}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3upload`;
  await apsJson2(token, url, {
    method: "POST",
    body: JSON.stringify({ uploadKey })
  });
};
var uploadObject2 = async (token, bucketKey, key, contents, contentType) => {
  const { uploadUrl, uploadKey } = await createSignedS3UploadUrl2(token, bucketKey, key);
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: typeof contents === "string" ? new TextEncoder().encode(contents) : contents
  });
  if (!upload.ok) {
    const text = await upload.text();
    throw new Error(`Failed to upload ${key} to signed S3 URL: ${upload.status} ${text}`);
  }
  await completeSignedS3Upload2(token, bucketKey, key, uploadKey);
};
var createSignedDownloadUrl2 = async (token, bucketKey, key, minutesExpiration = 60) => {
  const url = `${APS_DATA_BASE_URL2}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signeds3download?minutesExpiration=${minutesExpiration}`;
  const response = await apsJson2(token, url, { method: "GET" });
  const signedUrl = response.url || response.signedUrl;
  if (!signedUrl) throw new Error(`APS signed download response did not include a URL for ${key}.`);
  return signedUrl;
};
var createAutomationSignedUrl2 = async (token, bucketKey, key, access) => {
  const signedAccess = access === "write" ? "readwrite" : access;
  const url = `${APS_DATA_BASE_URL2}/oss/v2/buckets/${encodeURIComponent(bucketKey)}/objects/${encodeURIComponent(key)}/signed?access=${encodeURIComponent(signedAccess)}`;
  const response = await apsJson2(token, url, {
    method: "POST",
    body: JSON.stringify({
      minutesExpiration: 60,
      singleUse: false
    })
  });
  const signedUrl = response.signedUrl || response.url;
  if (!signedUrl) throw new Error(`APS signed URL response did not include a URL for ${key}.`);
  return signedUrl;
};
var downloadJsonFromUrl = async (url) => {
  const response = await fetch(url);
  const text = await response.text();
  if (!response.ok) throw new Error(`Failed to download APS output JSON: ${response.status} ${text.slice(0, 500)}`);
  return JSON.parse(text);
};
var submitWorkItem2 = async (token, config, urls) => {
  const argumentsPayload = {
    inputRvt: { url: urls.inputRvt, verb: "get" },
    optionsJson: { url: urls.optionsJson, verb: "get" },
    extractionManifest: { url: urls.manifest, verb: "put" },
    extractionReport: { url: urls.extractionReport, verb: "put" },
    executionLog: { url: urls.executionLog, verb: "put" }
  };
  if (config.callbackUrl) {
    argumentsPayload.onComplete = { url: config.callbackUrl, verb: "post" };
  }
  return apsJson2(token, `${designAutomationBaseUrl2(config.region)}/workitems`, {
    method: "POST",
    body: JSON.stringify({
      activityId: activityFullId2(config),
      arguments: argumentsPayload
    })
  });
};
var getWorkItem2 = async (token, config, workItemId) => apsJson2(token, `${designAutomationBaseUrl2(config.region)}/workitems/${encodeURIComponent(workItemId)}`, { method: "GET" });
var mapWorkItemStatus2 = (status) => {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "success") return "converting_to_canvas";
  if (["failed", "failedinstructions", "faileddownload", "failedupload", "cancelled", "timeout"].includes(normalized)) return "failed";
  if (normalized === "pending") return "queued";
  if (normalized === "inprogress" || normalized === "in_progress") return "extracting_revit_data";
  return "extracting_revit_data";
};
var decodeBase64 = (value) => {
  const clean = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return new Uint8Array(Buffer.from(clean, "base64"));
};
var validateStartRequest = (request) => {
  if (!request?.fileName?.toLowerCase().endsWith(".rvt")) throw new Error("APS Revit Importer requires a .rvt source file.");
  if (!request.fileBase64) throw new Error("APS Revit Importer request is missing fileBase64.");
};
var ApsRevitImportBackend = class {
  constructor(config = getApsRevitImportConfigFromEnv(), store = new InMemoryApsRevitImportJobStore()) {
    this.config = config;
    this.store = store;
  }
  async startImport(request) {
    validateStartRequest(request);
    const baseConfig = requireConfig2(this.config);
    const options = { ...getDefaultApsRevitImportOptions(), ...request.options || {} };
    const config = configForEngine2(baseConfig, options.revitEngine || baseConfig.revitEngine);
    const jobId = makeJobId2();
    const now = (/* @__PURE__ */ new Date()).toISOString();
    const safeName = cleanFileName(request.fileName, "source.rvt");
    const record = {
      jobId,
      status: "queued",
      progressMessage: "Preparing APS Revit Importer job...",
      warnings: [],
      errors: [],
      project: null,
      report: null,
      manifest: null,
      createdAt: now,
      updatedAt: now,
      sourceFileName: request.fileName,
      options,
      inputObjectKey: objectKey2(jobId, `input/${safeName}`),
      optionsObjectKey: objectKey2(jobId, "input/aps-revit-import-options.json"),
      extractionManifestObjectKey: objectKey2(jobId, "output/RevitExtractionManifest.json"),
      extractionReportObjectKey: objectKey2(jobId, "output/RevitExtractionReport.json"),
      importReportObjectKey: objectKey2(jobId, "output/APSRevitImport_Report.json"),
      projectObjectKey: objectKey2(jobId, "output/APSRevitImport_Project.json"),
      logObjectKey: objectKey2(jobId, "output/APSRevitImport_Execution.log")
    };
    await this.store.create(record);
    try {
      await this.store.update(jobId, { status: "uploading", progressMessage: "Uploading RVT to APS OSS..." });
      const token = await createToken2(config);
      await ensureBucket2(token.access_token, config.bucketKey, config.region);
      await uploadObject2(token.access_token, config.bucketKey, record.inputObjectKey, decodeBase64(request.fileBase64), "application/octet-stream");
      await uploadObject2(token.access_token, config.bucketKey, record.optionsObjectKey, JSON.stringify({
        ...options,
        manifestVersion: APS_REVIT_IMPORT_VERSION,
        sourceFileName: request.fileName
      }, null, 2), "application/json");
      await uploadObject2(token.access_token, config.bucketKey, record.extractionManifestObjectKey, new Uint8Array(), "application/json");
      await uploadObject2(token.access_token, config.bucketKey, record.extractionReportObjectKey, new Uint8Array(), "application/json");
      await uploadObject2(token.access_token, config.bucketKey, record.importReportObjectKey, new Uint8Array(), "application/json");
      await uploadObject2(token.access_token, config.bucketKey, record.projectObjectKey, new Uint8Array(), "application/json");
      await uploadObject2(token.access_token, config.bucketKey, record.logObjectKey, new Uint8Array(), "text/plain");
      const urls = {
        inputRvt: await createAutomationSignedUrl2(token.access_token, config.bucketKey, record.inputObjectKey, "read"),
        optionsJson: await createAutomationSignedUrl2(token.access_token, config.bucketKey, record.optionsObjectKey, "read"),
        manifest: await createAutomationSignedUrl2(token.access_token, config.bucketKey, record.extractionManifestObjectKey, "write"),
        extractionReport: await createAutomationSignedUrl2(token.access_token, config.bucketKey, record.extractionReportObjectKey, "write"),
        executionLog: await createAutomationSignedUrl2(token.access_token, config.bucketKey, record.logObjectKey, "write")
      };
      await this.store.update(jobId, { status: "extracting_revit_data", progressMessage: "Extracting Revit DB data through APS Revit Automation..." });
      const workItem = await submitWorkItem2(token.access_token, config, urls);
      const updated = await this.store.update(jobId, {
        workItemId: workItem.id,
        status: mapWorkItemStatus2(workItem.status),
        progressMessage: "Extracting Revit DB data through APS Revit Automation..."
      });
      return this.toResponse(updated);
    } catch (error) {
      const updated = await this.store.update(jobId, {
        status: "failed",
        progressMessage: "APS Revit Importer failed before Automation completed.",
        errors: [error instanceof Error ? error.message : String(error)]
      });
      return this.toResponse(updated);
    }
  }
  async listEngines() {
    const config = requireConfig2(this.config);
    const token = await createToken2(config);
    const engines = await listRevitEngines2(token.access_token, config);
    const env = config.env || {};
    const rows = engines.map((engine) => {
      const suffix = engineEnvSuffix2(engine);
      const configured = engine === config.revitEngine || Boolean(env[`APS_REVIT_IMPORT_ACTIVITY_ID${suffix}`]);
      return {
        engine,
        year: engineYear2(engine),
        configured,
        isDefault: engine === config.revitEngine
      };
    }).filter((row) => row.year > 0).sort((a, b) => b.year - a.year);
    return { engines: rows };
  }
  async getStatus(jobId) {
    const record = await this.store.get(jobId);
    if (!record) throw new Error(`Unknown APS Revit import job: ${jobId}`);
    if (!record.workItemId || ["completed", "completed_with_warnings", "failed"].includes(record.status)) {
      return this.toResponse(record);
    }
    const baseConfig = requireConfig2(this.config);
    const config = configForEngine2(baseConfig, record.options.revitEngine || baseConfig.revitEngine);
    const token = await createToken2(config);
    const workItem = await getWorkItem2(token.access_token, config, record.workItemId);
    const nextStatus = mapWorkItemStatus2(workItem.status);
    if (nextStatus === "converting_to_canvas") {
      return this.finalizeSuccessfulWorkItem(record, token.access_token, config);
    }
    if (nextStatus === "failed") {
      const updated2 = await this.store.update(jobId, {
        status: "failed",
        progressMessage: "APS Revit Automation extraction failed.",
        errors: [...record.errors || [], workItem.statusDetails || workItem.error || "APS WorkItem failed."]
      });
      return this.toResponse(updated2);
    }
    const updated = await this.store.update(jobId, {
      status: nextStatus,
      progressMessage: nextStatus === "queued" ? "Queued in APS Revit Automation..." : "Extracting Revit DB data..."
    });
    return this.toResponse(updated);
  }
  async getResult(jobId) {
    const status = await this.getStatus(jobId);
    if (!["completed", "completed_with_warnings"].includes(status.status)) {
      throw new Error(`APS Revit import job ${jobId} is not ready.`);
    }
    return status;
  }
  async finalizeSuccessfulWorkItem(record, token, config) {
    await this.store.update(record.jobId, { status: "converting_to_canvas", progressMessage: "Converting Revit extraction manifest to native canvas project..." });
    const manifestUrl = await createSignedDownloadUrl2(token, config.bucketKey, record.extractionManifestObjectKey);
    const manifest = await downloadJsonFromUrl(manifestUrl);
    const conversion = convertApsRevitExtractionToNative(manifest, record.sourceFileName, record.options);
    const warnings = [.../* @__PURE__ */ new Set([...record.warnings || [], ...conversion.report.warnings])];
    const errors = [...record.errors || [], ...conversion.report.errors];
    await this.store.update(record.jobId, { status: "validating", progressMessage: "Validating imported native project..." });
    await uploadObject2(token, config.bucketKey, record.projectObjectKey, JSON.stringify(conversion.project, null, 2), "application/json");
    await uploadObject2(token, config.bucketKey, record.importReportObjectKey, JSON.stringify(conversion.report, null, 2), "application/json");
    const projectJsonUrl = await createSignedDownloadUrl2(token, config.bucketKey, record.projectObjectKey);
    const reportUrl = await createSignedDownloadUrl2(token, config.bucketKey, record.importReportObjectKey);
    const executionLogUrl = await createSignedDownloadUrl2(token, config.bucketKey, record.logObjectKey).catch(() => null);
    const status = errors.length ? "failed" : warnings.length || conversion.report.fallbackElementCount || conversion.report.skippedElementCount ? "completed_with_warnings" : "completed";
    const updated = await this.store.update(record.jobId, {
      status,
      progressMessage: status === "failed" ? "APS Revit import failed validation." : "APS Revit import completed.",
      warnings,
      errors,
      project: conversion.project,
      report: conversion.report,
      manifest,
      manifestUrl,
      projectJsonUrl,
      reportUrl,
      executionLogUrl,
      manifestObjectKey: record.extractionManifestObjectKey,
      reportObjectKey: record.importReportObjectKey,
      projectObjectKey: record.projectObjectKey,
      logObjectKey: record.logObjectKey
    });
    return this.toResponse(updated);
  }
  toResponse(record) {
    return {
      jobId: record.jobId,
      status: record.status,
      progressMessage: record.progressMessage,
      warnings: record.warnings,
      errors: record.errors,
      project: record.project,
      report: record.report,
      manifest: record.manifest,
      workItemId: record.workItemId,
      manifestUrl: record.manifestUrl,
      projectJsonUrl: record.projectJsonUrl,
      reportUrl: record.reportUrl,
      executionLogUrl: record.executionLogUrl,
      inputObjectKey: record.inputObjectKey,
      manifestObjectKey: record.manifestObjectKey || record.extractionManifestObjectKey,
      reportObjectKey: record.reportObjectKey || record.importReportObjectKey,
      projectObjectKey: record.projectObjectKey,
      logObjectKey: record.logObjectKey
    };
  }
};

// services/apsRevitImport/backend/apsRevitImportApiRoutes.ts
var readJobId2 = (request) => {
  if (request.params?.jobId) return request.params.jobId;
  const match = String(request.url || "").match(/\/api\/imports\/aps-revit\/([^/?#]+)/);
  return match?.[1] && match[1] !== "engines" ? decodeURIComponent(match[1]) : void 0;
};
var createApsRevitImportApiRoutes = (backend = new ApsRevitImportBackend()) => ({
  getEngines: async (_request, response) => {
    try {
      const engines = await backend.listEngines();
      response.status(200).json(engines);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  postImport: async (request, response) => {
    try {
      const body = request.body;
      const job = await backend.startImport(body);
      response.status(202).json(job);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  getStatus: async (request, response) => {
    try {
      const jobId = readJobId2(request);
      if (!jobId) {
        response.status(400).json({ error: "Missing APS Revit import jobId." });
        return;
      }
      const status = await backend.getStatus(jobId);
      response.status(200).json(status);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  },
  getResult: async (request, response) => {
    try {
      const jobId = readJobId2(request);
      if (!jobId) {
        response.status(400).json({ error: "Missing APS Revit import jobId." });
        return;
      }
      const result = await backend.getResult(jobId);
      response.status(200).json(result);
    } catch (error) {
      response.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  }
});
var routeApsRevitImportApiRequest = async (request, response, backend = new ApsRevitImportBackend()) => {
  const routes = createApsRevitImportApiRoutes(backend);
  const method = String(request.method || "GET").toUpperCase();
  const url = String(request.url || "");
  if (method === "GET" && /\/api\/imports\/aps-revit\/engines\/?$/.test(url)) {
    await routes.getEngines(request, response);
    return true;
  }
  if (method === "POST" && /\/api\/imports\/aps-revit\/?$/.test(url)) {
    await routes.postImport(request, response);
    return true;
  }
  if (method === "GET" && /\/api\/imports\/aps-revit\/[^/]+\/result\/?$/.test(url)) {
    await routes.getResult(request, response);
    return true;
  }
  if (method === "GET" && /\/api\/imports\/aps-revit\/[^/]+\/?$/.test(url)) {
    await routes.getStatus(request, response);
    return true;
  }
  return false;
};

// services/autoPlan/autoPlanImport.ts
init_constants();

// services/autoPlan/autoPlanValidation.ts
var EPS = 1e-6;
var polygonArea = (points) => {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area / 2);
};
var orientation = (a, b, c) => {
  const v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
  if (Math.abs(v) < EPS) return 0;
  return v > 0 ? 1 : 2;
};
var onSegment = (a, b, c) => Math.min(a.x, c.x) - EPS <= b.x && b.x <= Math.max(a.x, c.x) + EPS && Math.min(a.y, c.y) - EPS <= b.y && b.y <= Math.max(a.y, c.y) + EPS;
var segmentsIntersect = (a1, a2, b1, b2) => {
  const o1 = orientation(a1, a2, b1);
  const o2 = orientation(a1, a2, b2);
  const o3 = orientation(b1, b2, a1);
  const o4 = orientation(b1, b2, a2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a1, b1, a2)) return true;
  if (o2 === 0 && onSegment(a1, b2, a2)) return true;
  if (o3 === 0 && onSegment(b1, a1, b2)) return true;
  if (o4 === 0 && onSegment(b1, a2, b2)) return true;
  return false;
};
var validateAutoPlanBoundary = (boundary) => {
  const errors = [];
  const points = boundary.points || [];
  if (points.length < 3) errors.push("Boundary must have at least three points.");
  if (points.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    errors.push("Boundary contains invalid coordinates.");
  }
  const area = polygonArea(points);
  if (area <= 0.01) errors.push("Boundary area is too small to generate a usable plan.");
  for (let i = 0; i < points.length; i++) {
    const a1 = points[i];
    const a2 = points[(i + 1) % points.length];
    if (Math.hypot(a2.x - a1.x, a2.y - a1.y) < 0.05) {
      errors.push("Boundary contains a near-zero length edge.");
      break;
    }
    for (let j = i + 1; j < points.length; j++) {
      const isAdjacent = Math.abs(i - j) === 1 || i === 0 && j === points.length - 1;
      if (isAdjacent) continue;
      const b1 = points[j];
      const b2 = points[(j + 1) % points.length];
      if (segmentsIntersect(a1, a2, b1, b2)) {
        errors.push("Boundary is self-intersecting. Please redraw it as a simple closed polygon.");
        return errors;
      }
    }
  }
  return Array.from(new Set(errors));
};
var wallLength = (wall) => Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
var validateAutoPlanPayload = (payload) => {
  const errors = validateAutoPlanBoundary(payload.boundary);
  const wallIds = new Set(payload.walls.map((wall) => wall.id));
  payload.walls.forEach((wall) => {
    if (wallLength(wall) < 0.05) errors.push(`Wall ${wall.id} is too short.`);
    if (!Number.isFinite(wall.thickness) || wall.thickness <= 0) errors.push(`Wall ${wall.id} has invalid thickness.`);
  });
  const openingKeys = /* @__PURE__ */ new Set();
  payload.openings.forEach((opening) => {
    if (!wallIds.has(opening.hostWallId)) errors.push(`${opening.type} ${opening.id} is not hosted on a valid wall.`);
    if (!Number.isFinite(opening.position) || opening.position < 0 || opening.position > 1) {
      errors.push(`${opening.type} ${opening.id} has an invalid host position.`);
    }
    if (!Number.isFinite(opening.width) || opening.width <= 0) errors.push(`${opening.type} ${opening.id} has invalid width.`);
    const duplicateKey = `${opening.hostWallId}:${opening.position.toFixed(2)}:${opening.width.toFixed(2)}`;
    if (openingKeys.has(duplicateKey)) errors.push(`Duplicate opening detected on wall ${opening.hostWallId}.`);
    openingKeys.add(duplicateKey);
  });
  return Array.from(new Set(errors));
};

// services/autoPlan/autoPlanImport.ts
var pointOnWall = (wall, t) => ({
  x: wall.start.x + (wall.end.x - wall.start.x) * t,
  y: wall.start.y + (wall.end.y - wall.start.y) * t
});
var wallRotation = (wall) => Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x) * 180 / Math.PI;
var openingSubtype = (opening) => {
  if (opening.type === "wall_opening") return "open";
  if (opening.type === "window") return opening.metadata?.subType || "standard";
  return opening.metadata?.subType || (opening.width >= 1.2 ? "double" : "single");
};
var autoPlanPayloadToArchElements = (payload, levelId = "0") => {
  const warnings = validateAutoPlanPayload(payload);
  const wallsById = new Map(payload.walls.map((wall) => [wall.id, wall]));
  const batchId = `auto-plan-${Date.now()}`;
  const commonMetadata = {
    autoPlanBatchId: batchId,
    autoPlanGenerator: payload.metadata.generator,
    autoPlanModel: payload.metadata.model,
    autoPlanModelWeightsPath: payload.metadata.modelWeightsPath,
    autoPlanPrototypePath: payload.metadata.sourcePrototypePath
  };
  const walls = payload.walls.map((wall) => ({
    id: wall.id,
    type: "wall",
    levelId,
    p1: wall.start,
    p2: wall.end,
    thickness: wall.thickness,
    height: WALL_HEIGHT_DEFAULT,
    wallSource: "line",
    metadata: {
      ...commonMetadata,
      autoPlanSource: wall.source,
      autoPlanWallType: wall.wallType,
      ...wall.metadata || {}
    }
  }));
  const rooms = (payload.rooms || []).map((room) => ({
    id: room.id,
    type: "room",
    levelId,
    boundary: room.boundary,
    pos: room.boundary.length ? {
      x: room.boundary.reduce((sum, point) => sum + point.x, 0) / room.boundary.length,
      y: room.boundary.reduce((sum, point) => sum + point.y, 0) / room.boundary.length
    } : void 0,
    label: room.label,
    metadata: {
      ...commonMetadata,
      autoPlanSource: room.source,
      autoPlanRoomType: room.type,
      autoPlanModelTypeId: room.modelTypeId,
      ...room.metadata || {}
    }
  }));
  const openings = payload.openings.flatMap((opening) => {
    const host = wallsById.get(opening.hostWallId);
    if (!host) return [];
    const pos = pointOnWall(host, opening.position);
    const base = {
      id: opening.id,
      levelId,
      hostWallId: opening.hostWallId,
      hostT: opening.position,
      pos,
      width: opening.width,
      rotation: wallRotation(host),
      subType: openingSubtype(opening),
      metadata: {
        ...commonMetadata,
        autoPlanSource: opening.source,
        autoPlanOpeningType: opening.type,
        ...opening.metadata || {}
      }
    };
    if (opening.type === "door") {
      return [{
        ...base,
        type: "door",
        height: opening.height || DOOR_HEIGHT_DEFAULT
      }];
    }
    if (opening.type === "window") {
      const sillHeight = opening.sillHeight ?? WINDOW_SILL_HEIGHT_DEFAULT;
      const height = opening.height ?? Math.max(0.4, WINDOW_TOP_HEIGHT_DEFAULT - sillHeight);
      return [{
        ...base,
        type: "window",
        height,
        sillHeight,
        topHeight: sillHeight + height
      }];
    }
    return [{
      ...base,
      type: "wall-opening",
      height: opening.height || WALL_OPENING_HEIGHT_DEFAULT
    }];
  });
  const boundaryFloor = {
    id: `${batchId}-boundary-floor`,
    type: "floor",
    levelId,
    boundary: payload.boundary.points,
    metadata: {
      ...commonMetadata,
      autoPlanBoundary: true,
      autoPlanBoundaryType: payload.boundary.type
    }
  };
  return {
    elements: [boundaryFloor, ...rooms, ...walls, ...openings],
    warnings
  };
};

// services/autoPlan/autoPlanParser.ts
var MODEL_ROOM_MAP = {
  living_room: { internalType: "living_room", modelType: "living_room", modelTypeId: 1, displayLabel: "Living Room", publicZone: true },
  kitchen: { internalType: "kitchen", modelType: "kitchen", modelTypeId: 2, displayLabel: "Kitchen", serviceZone: true },
  dining: { internalType: "dining", modelType: "dining", modelTypeId: 7, displayLabel: "Dining", publicZone: true },
  bedroom: { internalType: "bedroom", modelType: "bedroom", modelTypeId: 3, displayLabel: "Bedroom", privateZone: true },
  master_bedroom: { internalType: "master_bedroom", modelType: "bedroom", modelTypeId: 3, displayLabel: "Master Bedroom", privateZone: true },
  child_room: { internalType: "child_room", modelType: "bedroom", modelTypeId: 3, displayLabel: "Child Room", privateZone: true },
  guest_room: { internalType: "guest_room", modelType: "bedroom", modelTypeId: 3, displayLabel: "Guest Room", privateZone: true },
  bathroom: { internalType: "bathroom", modelType: "bathroom", modelTypeId: 4, displayLabel: "Bathroom", serviceZone: true },
  powder_room: { internalType: "powder_room", modelType: "bathroom", modelTypeId: 4, displayLabel: "Powder Room / WC", serviceZone: true },
  balcony: { internalType: "balcony", modelType: "balcony", modelTypeId: 5, displayLabel: "Balcony", publicZone: true },
  terrace: { internalType: "terrace", modelType: "balcony", modelTypeId: 5, displayLabel: "Terrace", publicZone: true },
  study_room: { internalType: "study_room", modelType: "study_room", modelTypeId: 8, displayLabel: "Study Room", privateZone: true },
  storage: { internalType: "storage", modelType: "storage", modelTypeId: 9, displayLabel: "Storage", serviceZone: true },
  entrance: { internalType: "entrance", modelType: "entrance", modelTypeId: 6, displayLabel: "Entrance / Foyer", publicZone: true },
  foyer: { internalType: "foyer", modelType: "entrance", modelTypeId: 6, displayLabel: "Foyer", publicZone: true },
  corridor: { internalType: "corridor", modelType: "entrance", modelTypeId: 6, displayLabel: "Corridor / Circulation", publicZone: true },
  utility: { internalType: "utility", modelType: "storage", modelTypeId: 9, displayLabel: "Utility / Laundry", serviceZone: true },
  laundry: { internalType: "laundry", modelType: "storage", modelTypeId: 9, displayLabel: "Laundry", serviceZone: true }
};
var ROOM_PATTERNS = [
  { type: "master_bedroom", patterns: [/master\s+bed(room)?/i] },
  { type: "child_room", patterns: [/child(?:ren)?'?s?\s+room/i, /kids?\s+room/i] },
  { type: "guest_room", patterns: [/guest\s+room/i, /guest\s+bed(room)?/i] },
  { type: "bedroom", patterns: [/bed(room)?s?/i] },
  { type: "bathroom", patterns: [/bath(room)?s?/i, /\bbaths?\b/i] },
  { type: "powder_room", patterns: [/powder\s+room/i, /\bwc\b/i, /toilet/i] },
  { type: "kitchen", patterns: [/kitchens?/i] },
  { type: "dining", patterns: [/dining/i] },
  { type: "balcony", patterns: [/balcon(?:y|ies)/i], optional: true },
  { type: "terrace", patterns: [/terraces?/i], optional: true },
  { type: "study_room", patterns: [/stud(?:y|ies)/i, /home\s+office/i] },
  { type: "storage", patterns: [/stor(?:e|age)/i, /closets?/i] },
  { type: "entrance", patterns: [/entrance/i, /entry/i, /foyer/i] },
  { type: "corridor", patterns: [/corridor/i, /circulation/i] },
  { type: "utility", patterns: [/utility/i, /laundry/i] },
  { type: "stair", patterns: [/stairs?/i, /staircase/i] }
];
var NUMBER_WORDS = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10
};
var normalizeText = (value) => (value || "").trim();
var splitList = (value) => normalizeText(value).split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean);
var bedroomCountFromType = (type) => {
  const match = type.match(/^(\d)\s+Bedroom$/i);
  if (match) return Number(match[1]);
  if (type === "Studio") return 0;
  if (type === "Duplex" || type === "Penthouse" || type === "House" || type === "Row House" || type === "Farmhouse") return 3;
  if (type === "Villa") return 4;
  if (type === "Mansion") return 5;
  if (type === "Co-living") return 6;
  if (type === "Student Housing") return 8;
  if (type === "Senior Living") return 1;
  return null;
};
var extractCountNear = (text, type) => {
  const labels = {
    bedroom: "bed(?:room)?s?",
    master_bedroom: "master\\s+bed(?:room)?",
    child_room: "(?:child(?:ren)?|kid)s?\\s+room",
    guest_room: "guest\\s+(?:room|bed(?:room)?)",
    bathroom: "(?:bath(?:room)?s?|baths?)",
    powder_room: "(?:powder\\s+room|wc|toilet)",
    kitchen: "kitchens?",
    balcony: "balcon(?:y|ies)",
    study_room: "(?:stud(?:y|ies)|home\\s+office)",
    storage: "(?:stor(?:e|age)|closets?)",
    dining: "dining",
    entrance: "(?:entrance|entry|foyer)",
    corridor: "(?:corridor|circulation)",
    utility: "(?:utility|laundry)",
    terrace: "terraces?",
    stair: "stairs?"
  };
  const label = labels[type];
  if (!label) return null;
  const numericBefore = new RegExp(`(\\d+)\\s+${label}`, "i").exec(text);
  if (numericBefore) return Number(numericBefore[1]);
  const wordBefore = new RegExp(`\\b(${Object.keys(NUMBER_WORDS).join("|")})\\s+${label}`, "i").exec(text);
  if (wordBefore) return NUMBER_WORDS[wordBefore[1].toLowerCase()];
  const numericAfter = new RegExp(`${label}\\s*(?:x|:)?\\s*(\\d+)`, "i").exec(text);
  if (numericAfter) return Number(numericAfter[1]);
  return null;
};
var addOrUpdateRoom = (rooms, unsupported, type, count, required, metadata = {}) => {
  if (count <= 0) return;
  const mapping = MODEL_ROOM_MAP[type];
  if (!mapping) {
    unsupported.push({
      requestedType: type,
      reason: "No native HouseDiffusion/RPLAN label mapping is configured; preserving as metadata only."
    });
    rooms.set(type, {
      type,
      count,
      required,
      unsupportedByModel: true,
      metadata
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
      ...existing?.metadata || {},
      ...metadata,
      mappedFrom: mapping.internalType !== mapping.modelType ? mapping.internalType : void 0
    }
  });
  if (mapping.internalType !== mapping.modelType) {
    unsupported.push({
      requestedType: type,
      mappedTo: mapping.modelType,
      reason: `Mapped to the closest supported HouseDiffusion room label: ${mapping.displayLabel}.`
    });
  }
};
var inferCategoryFromType = (residentialType) => {
  if (["Studio", "1 Bedroom", "2 Bedroom", "3 Bedroom", "4 Bedroom", "Duplex", "Penthouse", "Serviced Apartment"].includes(residentialType)) return "Apartments";
  if (["House", "Villa", "Row House", "Farmhouse", "Mansion"].includes(residentialType)) return "Houses / Villas";
  if (["Co-living", "Student Housing", "Senior Living"].includes(residentialType)) return "Shared / Special Residential";
  return "Other Category";
};
var inferResidentialTypeFromPrompt = (prompt, fallback) => {
  const p = prompt.toLowerCase();
  if (/\bstudio\b/.test(p)) return "Studio";
  const br = /(\d+)\s*(?:bed|br|bedroom)/i.exec(prompt);
  if (br) {
    const count = Math.max(1, Math.min(4, Number(br[1])));
    return `${count} Bedroom`;
  }
  if (/\bduplex\b/.test(p)) return "Duplex";
  if (/\bpenthouse\b/.test(p)) return "Penthouse";
  if (/\bserviced apartment\b/.test(p)) return "Serviced Apartment";
  if (/\bvilla\b/.test(p)) return "Villa";
  if (/\brow house\b/.test(p)) return "Row House";
  if (/\bfarmhouse\b/.test(p)) return "Farmhouse";
  if (/\bmansion\b/.test(p)) return "Mansion";
  if (/\bco-?living\b/.test(p)) return "Co-living";
  if (/\bstudent housing\b/.test(p)) return "Student Housing";
  if (/\bsenior living\b/.test(p)) return "Senior Living";
  if (/\bhouse\b/.test(p)) return "House";
  return fallback;
};
var extractAdjacencyRules = (prompt, adjacencyNotes) => {
  const source = `${prompt}
${adjacencyNotes}`.toLowerCase();
  const rules = [];
  const add = (spaceA, spaceB, relationship) => {
    if (!rules.some((rule) => rule.spaceA === spaceA && rule.spaceB === spaceB && rule.relationship === relationship)) {
      rules.push({ spaceA, spaceB, relationship });
    }
  };
  if (/living.*kitchen|kitchen.*living|open kitchen/.test(source)) add("living_room", "kitchen", "near_or_connected");
  if (/living.*balcon|balcon.*living|connected to balcony/.test(source)) add("living_room", "balcony", "connected");
  if (/bedrooms?.*(near|private|cluster)|private zone/.test(source)) add("bedroom", "bathroom", "near");
  if (/bath.*kitchen|wet core|wet areas/.test(source)) add("bathroom", "kitchen", "near");
  if (/avoid|must not|away from/.test(source) && /bed.*living|living.*bed/.test(source)) add("bedroom", "living_room", "avoid");
  splitList(adjacencyNotes).forEach((note) => {
    const lower = note.toLowerCase();
    if (lower.includes("near") || lower.includes("connect")) {
      const tokens = Object.keys(MODEL_ROOM_MAP).filter((type) => lower.includes(type.replace(/_/g, " ")));
      if (tokens.length >= 2) add(tokens[0], tokens[1], lower.includes("connect") ? "connected" : "near");
    }
  });
  return rules;
};
var parseAutoPlanBrief = (input, boundary) => {
  const prompt = normalizeText(input.prompt);
  const residentialType = inferResidentialTypeFromPrompt(prompt, input.residentialType || "2 Bedroom");
  const category = input.category || inferCategoryFromType(residentialType);
  const rooms = /* @__PURE__ */ new Map();
  const unsupportedRequests = [];
  const promptLower = prompt.toLowerCase();
  addOrUpdateRoom(rooms, unsupportedRequests, "living_room", 1, true, { anchor: true });
  addOrUpdateRoom(rooms, unsupportedRequests, "kitchen", Math.max(1, input.kitchens || 1), true, {
    kitchenType: input.openKitchen || /open kitchen/i.test(prompt) ? "open" : "closed"
  });
  const typeBedrooms = bedroomCountFromType(residentialType);
  const promptBedrooms = extractCountNear(promptLower, "bedroom");
  const bedrooms = Math.max(0, input.bedrooms ?? promptBedrooms ?? typeBedrooms ?? 2);
  if (bedrooms > 0) addOrUpdateRoom(rooms, unsupportedRequests, "bedroom", bedrooms, true);
  const promptBaths = extractCountNear(promptLower, "bathroom");
  const baths = Math.max(1, input.bathrooms ?? promptBaths ?? (bedrooms <= 1 ? 1 : bedrooms <= 3 ? 2 : 3));
  addOrUpdateRoom(rooms, unsupportedRequests, "bathroom", baths, true);
  const promptBalconies = extractCountNear(promptLower, "balcony");
  const balconies = Math.max(0, input.balconies ?? promptBalconies ?? (/balcon/i.test(promptLower) ? 1 : 0));
  if (balconies > 0) addOrUpdateRoom(rooms, unsupportedRequests, "balcony", balconies, false);
  ROOM_PATTERNS.forEach(({ type, patterns, optional }) => {
    if (type === "bedroom" || type === "bathroom" || type === "kitchen" || type === "balcony") return;
    const requested = patterns.some((pattern) => pattern.test(prompt));
    const count = extractCountNear(promptLower, type) || (requested ? 1 : 0);
    if (count > 0) addOrUpdateRoom(rooms, unsupportedRequests, type, count, !optional);
  });
  input.requiredSpaces.forEach((space) => addOrUpdateRoom(rooms, unsupportedRequests, space, 1, true));
  input.optionalSpaces.forEach((space) => addOrUpdateRoom(rooms, unsupportedRequests, space, 1, false));
  const kitchen = rooms.get("kitchen");
  if (kitchen) {
    kitchen.kitchenType = input.openKitchen || /open kitchen/i.test(prompt) ? "open" : "closed";
  }
  return {
    projectType: "residential",
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
    unsupportedRequests
  };
};

// services/autoPlan/backend/runAutoPlanInference.ts
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// services/autoPlan/autoPlanTypes.ts
var AUTO_PLAN_PROTOTYPE_PATH_DEFAULT = "C:\\Users\\Muhammad Naqi Ejaz\\Documents\\Temp 23\\Archi26\\01. Codes\\02. Working Codes\\synaps-clone-mini";
var AUTO_PLAN_MODEL_PATH_DEFAULT = "C:\\Users\\Muhammad Naqi Ejaz\\Documents\\Temp 23\\Archi26\\06. Available Model\\01. HouseDiffusion\\model250000.pt";

// services/autoPlan/backend/runAutoPlanInference.ts
var AUTO_PLAN_TIMEOUT_MS = Number(process.env.AUTO_PLAN_TIMEOUT_MS || 9e5);
var AUTO_PLAN_STATUS_PATH = path.join(os.tmpdir(), "archai-auto-plan-status.json");
var AUTO_PLAN_HEARTBEAT_MS = Number(process.env.AUTO_PLAN_HEARTBEAT_MS || 5e3);
var resolvePrototypePath = () => process.env.AUTO_PLAN_PROTOTYPE_PATH || AUTO_PLAN_PROTOTYPE_PATH_DEFAULT;
var resolveModelPath = () => process.env.AUTO_PLAN_MODEL_PATH || AUTO_PLAN_MODEL_PATH_DEFAULT;
var resolvePythonPath = (prototypePath) => {
  if (process.env.AUTO_PLAN_PYTHON_PATH) return process.env.AUTO_PLAN_PYTHON_PATH;
  const prototypePython = path.join(prototypePath, "miniconda", "python.exe");
  if (existsSync(prototypePython)) return prototypePython;
  return process.platform === "win32" ? "python" : "python3";
};
var writeAutoPlanStatus = async (status) => {
  await writeFile(AUTO_PLAN_STATUS_PATH, JSON.stringify({
    ...status,
    updatedAt: (/* @__PURE__ */ new Date()).toISOString()
  }, null, 2), "utf8").catch(() => void 0);
};
var readAutoPlanStatus = async () => {
  try {
    const raw = await readFile(AUTO_PLAN_STATUS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
};
var collectProcess = (command, args, cwd) => new Promise((resolve, reject) => {
  const child = spawn(command, args, {
    cwd,
    shell: false,
    windowsHide: true,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      AUTO_PLAN_STATUS_PATH
    }
  });
  let stdout = "";
  let stderr = "";
  const startedAt = Date.now();
  const timer = setTimeout(() => {
    void writeAutoPlanStatus({
      state: "failed",
      message: `Auto Plan inference timed out after ${Math.round(AUTO_PLAN_TIMEOUT_MS / 1e3)} seconds.`,
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1e3),
      processActive: false
    });
    child.kill();
    reject(new Error(`Auto Plan inference timed out after ${AUTO_PLAN_TIMEOUT_MS} ms.`));
  }, AUTO_PLAN_TIMEOUT_MS);
  const heartbeat = setInterval(async () => {
    const current = await readAutoPlanStatus();
    if (current.state === "complete" || current.state === "failed") return;
    await writeAutoPlanStatus({
      ...current,
      state: current.state || "running_python",
      message: current.message || "HouseDiffusion subprocess is still running.",
      elapsedSeconds: Math.round((Date.now() - startedAt) / 1e3),
      processActive: true,
      heartbeatAt: (/* @__PURE__ */ new Date()).toISOString()
    });
  }, AUTO_PLAN_HEARTBEAT_MS);
  const cleanup = () => {
    clearTimeout(timer);
    clearInterval(heartbeat);
  };
  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.on("error", (error) => {
    cleanup();
    reject(error);
  });
  child.on("close", (code) => {
    cleanup();
    resolve({ code, stdout, stderr });
  });
});
var runAutoPlanInference = async (request) => {
  const prototypePath = resolvePrototypePath();
  const modelPath = resolveModelPath();
  const pythonPath = resolvePythonPath(prototypePath);
  const bridgePath = path.join(process.cwd(), "ml", "auto_plan", "inference_bridge.py");
  console.info("[Auto Plan] Resolving paths", { prototypePath, modelPath, pythonPath, bridgePath });
  await writeAutoPlanStatus({
    state: "resolving_paths",
    message: "Resolving Auto Plan prototype, model, and Python paths.",
    prototypePath,
    modelPath,
    pythonPath
  });
  if (!existsSync(prototypePath)) {
    throw new Error(`Auto Plan prototype path was not found: ${prototypePath}`);
  }
  if (!existsSync(modelPath)) {
    throw new Error(`Auto Plan model file was not found. Expected model path: ${modelPath}`);
  }
  if (!existsSync(bridgePath)) {
    throw new Error(`Auto Plan Python bridge was not found: ${bridgePath}`);
  }
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), "archai-auto-plan-"));
  const inputPath = path.join(tmpDir, "input.json");
  const outputPath = path.join(tmpDir, "output.json");
  try {
    await writeFile(inputPath, JSON.stringify({
      ...request,
      config: {
        prototypePath,
        modelPath
      }
    }), "utf8");
    console.info("[Auto Plan] Starting HouseDiffusion subprocess");
    await writeAutoPlanStatus({
      state: "starting_python",
      message: "Starting local HouseDiffusion Python subprocess.",
      prototypePath,
      modelPath,
      pythonPath,
      inputPath,
      outputPath
    });
    const result = await collectProcess(
      pythonPath,
      [
        bridgePath,
        "--input",
        inputPath,
        "--output",
        outputPath,
        "--prototype",
        prototypePath,
        "--model",
        modelPath,
        "--status",
        AUTO_PLAN_STATUS_PATH
      ],
      process.cwd()
    );
    if (result.code !== 0) {
      await writeAutoPlanStatus({
        state: "failed",
        message: `Auto Plan inference failed with exit code ${result.code}.`,
        stderr: result.stderr,
        stdout: result.stdout,
        modelPath
      });
      console.error("[Auto Plan] Inference failed", { code: result.code, stderr: result.stderr, stdout: result.stdout });
      throw new Error(`Auto Plan inference failed with exit code ${result.code}. ${result.stderr || result.stdout}`);
    }
    const raw = await readFile(outputPath, "utf8");
    const parsed = JSON.parse(raw);
    parsed.logs = [
      ...parsed.logs || [],
      ...result.stdout.split(/\r?\n/).filter(Boolean).map((message) => ({ level: "info", code: "PYTHON_STDOUT", message }))
    ];
    await writeAutoPlanStatus({
      state: "complete",
      message: "Auto Plan inference finished successfully.",
      modelPath,
      roomCount: parsed.payload?.rooms?.length || 0,
      wallCount: parsed.payload?.walls?.length || 0,
      openingCount: parsed.payload?.openings?.length || 0
    });
    return parsed;
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
};
var getAutoPlanResolvedPaths = () => {
  const prototypePath = resolvePrototypePath();
  return {
    prototypePath,
    modelPath: resolveModelPath(),
    pythonPath: resolvePythonPath(prototypePath)
  };
};
var getAutoPlanStatus = async () => {
  try {
    const raw = await readFile(AUTO_PLAN_STATUS_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      state: "idle",
      message: "No Auto Plan inference status has been recorded yet.",
      updatedAt: null,
      ...getAutoPlanResolvedPaths()
    };
  }
};

// services/autoPlan/backend/routes.ts
var routeAutoPlanApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/auto-plan")) return false;
  if (request.method === "GET" && url.startsWith("/api/auto-plan/health")) {
    response.json({
      ok: true,
      paths: getAutoPlanResolvedPaths()
    });
    return true;
  }
  if (request.method === "GET" && url.startsWith("/api/auto-plan/status")) {
    response.json({
      ok: true,
      status: await getAutoPlanStatus()
    });
    return true;
  }
  if (request.method !== "POST" || !url.startsWith("/api/auto-plan/generate")) {
    response.status(404).json({ error: "Unknown Auto Plan endpoint." });
    return true;
  }
  try {
    const body = request.body;
    if (!body?.boundary || !body?.briefInput) {
      response.status(400).json({ error: "Auto Plan requires boundary and briefInput." });
      return true;
    }
    const boundaryErrors = validateAutoPlanBoundary(body.boundary);
    if (boundaryErrors.length) {
      response.status(400).json({ error: boundaryErrors.join(" ") });
      return true;
    }
    const normalizedBrief = parseAutoPlanBrief(body.briefInput, body.boundary);
    console.info("[Auto Plan] Normalized brief", {
      residentialType: normalizedBrief.residentialType,
      rooms: normalizedBrief.rooms.map((room) => `${room.type}:${room.count}`).join(", "),
      unsupported: normalizedBrief.unsupportedRequests.length
    });
    const inferenceResponse = await runAutoPlanInference({
      ...body,
      normalizedBrief
    });
    const converted = autoPlanPayloadToArchElements(inferenceResponse.payload);
    response.json({
      ...inferenceResponse,
      payload: {
        ...inferenceResponse.payload,
        brief: normalizedBrief
      },
      projectElements: converted.elements,
      warnings: Array.from(/* @__PURE__ */ new Set([...inferenceResponse.warnings || [], ...converted.warnings]))
    });
    return true;
  } catch (error) {
    console.error("[Auto Plan] Request failed", error);
    response.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
    return true;
  }
};

// services/smartText2planBackend.ts
import { GoogleGenAI } from "@google/genai";
import { GoogleAuth } from "google-auth-library";
import fs2 from "fs";

// services/vertexKeyFile.ts
import fs from "fs";
import os2 from "os";
import path2 from "path";
var cache = /* @__PURE__ */ new Map();
var materialise = (json, fileName) => {
  try {
    const parsed = JSON.parse(json.trim().replace(/^'([\s\S]*)'$/, "$1"));
    if (!parsed?.client_email || !parsed?.private_key) return null;
    if (typeof parsed.private_key === "string") parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
    const target = path2.join(os2.tmpdir(), fileName);
    fs.writeFileSync(target, JSON.stringify(parsed), { mode: 384 });
    return target;
  } catch (error) {
    console.warn(`[Vertex] Could not read the service-account key from the environment: ${error instanceof Error ? error.message : error}`);
    return null;
  }
};
var resolveVertexKeyPath = (relativePath, envVarNames) => {
  const repoPath = path2.resolve(relativePath);
  if (fs.existsSync(repoPath)) return repoPath;
  const cacheKey = envVarNames.join("|");
  const cached2 = cache.get(cacheKey);
  if (cached2 && fs.existsSync(cached2)) return cached2;
  for (const name of envVarNames) {
    const value = process.env[name];
    if (!value) continue;
    const written = materialise(value, `archai-${path2.basename(relativePath)}`);
    if (written) {
      cache.set(cacheKey, written);
      return written;
    }
  }
  return repoPath;
};
var resolveDefaultVertexKeyPath = () => resolveVertexKeyPath("ml/auto_plan/gcp_key.json", ["GOOGLE_VERTEX_SA_KEY_JSON", "VERTEX_SA_KEY_JSON"]);
var resolveRenderVertexKeyPath = () => resolveVertexKeyPath("ml/auto_plan/rendair_gcp_key.json", ["GOOGLE_VERTEX_RENDER_SA_KEY_JSON", "RENDAIR_SA_KEY_JSON"]);

// services/smartText2planBackend.ts
var routeSmartText2PlanApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/smart-text2plan/generate")) {
    response.status(404).json({ error: "Unknown Smart Text2Plan endpoint." });
    return true;
  }
  try {
    const { designSummary, boundaryPoints } = request.body || {};
    const keyPath = resolveDefaultVertexKeyPath();
    if (!fs2.existsSync(keyPath)) {
      throw new Error(`Service account key not found at ${keyPath}`);
    }
    process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
    process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
    process.env.GOOGLE_CLOUD_LOCATION = "us";
    const auth = new GoogleAuth({
      keyFile: keyPath,
      scopes: "https://www.googleapis.com/auth/cloud-platform"
    });
    const ai = new GoogleGenAI({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true,
      httpOptions: { apiVersion: "v1beta1" }
    });
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

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
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;
    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(", ");
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }
    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;
    const modelName = "gemini-3.1-flash-lite";
    console.log(`[Smart Text2Plan] Sending generation request to Vertex AI base model: ${modelName}...`);
    const { SHARED_SCHEMA: SHARED_SCHEMA2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA2
      }
    });
    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }
    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;
  } catch (err) {
    console.error("[Smart Text2Plan] Error querying model:", err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
    return true;
  }
};

// services/text2planBackend.ts
import { GoogleGenAI as GoogleGenAI2 } from "@google/genai";
import { GoogleAuth as GoogleAuth2 } from "google-auth-library";
import fs3 from "fs";

// services/text4cImageConfig.ts
var TEXT4C_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ["IMAGE"],
  thinkingConfig: {
    thinkingLevel: "minimal",
    includeThoughts: false
  },
  imageConfig: {
    aspectRatio: "1:1",
    imageSize: "1K"
  }
};

// services/text2planBackend.ts
var VERTEX_KEY_PATH = resolveDefaultVertexKeyPath();
var VERTEX_SCOPE = "https://www.googleapis.com/auth/cloud-platform";
var cachedVertexAuth;
var cachedVertexClientPromise;
var configureVertexEnvironment = () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
  process.env.GOOGLE_CLOUD_LOCATION = "us";
};
var getVertexAuth = () => {
  if (!fs3.existsSync(VERTEX_KEY_PATH)) {
    throw new Error(`Service account key not found at ${VERTEX_KEY_PATH}`);
  }
  configureVertexEnvironment();
  if (!cachedVertexAuth) {
    cachedVertexAuth = new GoogleAuth2({ keyFile: VERTEX_KEY_PATH, scopes: VERTEX_SCOPE });
  }
  return cachedVertexAuth;
};
var getVertexClient = () => {
  if (!cachedVertexClientPromise) {
    cachedVertexClientPromise = getVertexAuth().getClient().catch((error) => {
      cachedVertexClientPromise = void 0;
      throw error;
    });
  }
  return cachedVertexClientPromise;
};
var warmText2PlanVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to warm the Google Cloud access token.");
  return { ready: true, warmupMs: Date.now() - startedAt };
};
var routeText2PlanApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/text2plan/generate") && !url.startsWith("/api/text2plan/image") && !url.startsWith("/api/text2plan/auth/warm")) {
    response.status(404).json({ error: "Unknown Text2Plan endpoint." });
    return true;
  }
  try {
    getVertexAuth();
    if (url.startsWith("/api/text2plan/auth/warm")) {
      const result = await warmText2PlanVertexAuth();
      console.log(`[Text 4.0 C] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }
    if (url.startsWith("/api/text2plan/image")) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt: prompt2 } = request.body || {};
        const authStartedAt = Date.now();
        const client = await getVertexClient();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse.token;
        const authMs = Date.now() - authStartedAt;
        if (!token) throw new Error("Failed to get Google Cloud access token");
        const vertexUrl = "https://aiplatform.googleapis.com/v1/projects/mod-trg-1260712-01/locations/global/publishers/google/models/gemini-3.1-flash-lite-image:generateContent";
        const vertexStartedAt = Date.now();
        const fetch2 = (await import("node-fetch")).default || global.fetch;
        const imgRes = await fetch2(vertexUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt2 }] }],
            generationConfig: TEXT4C_LOW_LATENCY_GENERATION_CONFIG
          })
        });
        if (!imgRes.ok) {
          const errText = await imgRes.text();
          throw new Error(`Vertex AI API error: ${imgRes.status} ${errText}`);
        }
        const data = await imgRes.json();
        const imagePart = data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
        const base64Data = imagePart?.inlineData?.data;
        if (!base64Data) {
          throw new Error("No image data returned from Gemini.");
        }
        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 C] Vertex image proxy completed in ${generationMs}ms (auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Data, generationMs, authMs, vertexMs });
      } catch (err) {
        console.error("Proxy Image Error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    const ai = new GoogleGenAI2({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true
    });
    const { designSummary, boundaryPoints } = request.body || {};
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

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
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;
    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(", ");
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }
    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;
    const modelName = "projects/738349838690/locations/us/endpoints/8469159836758573056";
    console.log(`[Text2Plan] Sending generation request to Vertex AI model: ${modelName}...`);
    const { SHARED_SCHEMA: SHARED_SCHEMA2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA2
      }
    });
    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }
    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;
  } catch (err) {
    console.error("[Text2Plan] Error querying model:", err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
    return true;
  }
};

// services/text4dBackend.ts
import { GoogleGenAI as GoogleGenAI3 } from "@google/genai";
import { GoogleAuth as GoogleAuth3 } from "google-auth-library";
import fs4 from "fs";

// services/text4dImageConfig.ts
var TEXT4D_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ["IMAGE"],
  thinkingConfig: {
    thinkingLevel: "minimal",
    includeThoughts: false
  },
  imageConfig: {
    aspectRatio: "1:1",
    imageSize: "1K"
  }
};
var TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION = `The confirmed enclosed area and numeric fixed-property footprint are hard rendering constraints; match the bounding-box ratio within 2%. Preserve architectural logic, adjacency, privacy, circulation, daylight, and useful rooms. Use a full rectangular exterior shell only when the user prompt says RECTANGLE LOCKED. When it says CREATIVE UNLOCKED, preserve the area and fixed-property bounding box but freely choose an architecturally intelligent compact, L/U-shaped, stepped, offset, or other coherent footprint; never force a rectangle by default. Count balconies, terraces, porches, decks, steps, and railings inside the fixed-property box but outside enclosed area. Exclude annotations and every door leaf or swing arc from dimensions and area. Draw all architecture first, reserving clear white label zones. Give every named space exactly one full Design Brief room name in thin black text at 0.33 times normal room-label height; never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels. Place a label only when its complete glyph box fits inside clear white floor space. No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark. Never render prompt instructions, pixel coordinates, bounding-box diagnostics, or wall-thickness notes as image text.`;

// services/text4dBackend.ts
var VERTEX_KEY_PATH2 = resolveDefaultVertexKeyPath();
var VERTEX_SCOPE2 = "https://www.googleapis.com/auth/cloud-platform";
var cachedVertexAuth2;
var cachedVertexClientPromise2;
var configureVertexEnvironment2 = () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH2;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
  process.env.GOOGLE_CLOUD_LOCATION = "us";
};
var getVertexAuth2 = () => {
  if (!fs4.existsSync(VERTEX_KEY_PATH2)) {
    throw new Error(`Service account key not found at ${VERTEX_KEY_PATH2}`);
  }
  configureVertexEnvironment2();
  if (!cachedVertexAuth2) {
    cachedVertexAuth2 = new GoogleAuth3({ keyFile: VERTEX_KEY_PATH2, scopes: VERTEX_SCOPE2 });
  }
  return cachedVertexAuth2;
};
var getVertexClient2 = () => {
  if (!cachedVertexClientPromise2) {
    cachedVertexClientPromise2 = getVertexAuth2().getClient().catch((error) => {
      cachedVertexClientPromise2 = void 0;
      throw error;
    });
  }
  return cachedVertexClientPromise2;
};
var warmText4dVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient2();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to warm the Google Cloud access token.");
  return { ready: true, warmupMs: Date.now() - startedAt };
};
var routeText4dApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/text4d/generate") && !url.startsWith("/api/text4d/image") && !url.startsWith("/api/text4d/auth/warm")) {
    response.status(404).json({ error: "Unknown Text4d endpoint." });
    return true;
  }
  try {
    getVertexAuth2();
    if (url.startsWith("/api/text4d/auth/warm")) {
      const result = await warmText4dVertexAuth();
      console.log(`[Text 4.0 D] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }
    if (url.startsWith("/api/text4d/image")) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt: prompt2 } = request.body || {};
        const authStartedAt = Date.now();
        const client = await getVertexClient2();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse.token;
        const authMs = Date.now() - authStartedAt;
        if (!token) throw new Error("Failed to get Google Cloud access token");
        const vertexUrl = "https://aiplatform.googleapis.com/v1/projects/mod-trg-1260712-01/locations/global/publishers/google/models/gemini-3.1-flash-lite-image:generateContent";
        const vertexStartedAt = Date.now();
        const fetch2 = (await import("node-fetch")).default || global.fetch;
        const imgRes = await fetch2(vertexUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: TEXT4D_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION }]
            },
            contents: [{ role: "user", parts: [{ text: prompt2 }] }],
            generationConfig: TEXT4D_LOW_LATENCY_GENERATION_CONFIG
          })
        });
        if (!imgRes.ok) {
          const errText = await imgRes.text();
          throw new Error(`Vertex AI API error: ${imgRes.status} ${errText}`);
        }
        const data = await imgRes.json();
        const imagePart = data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
        const base64Data = imagePart?.inlineData?.data;
        if (!base64Data) {
          throw new Error("No image data returned from Gemini.");
        }
        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 D] Vertex image proxy completed in ${generationMs}ms (auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Data, generationMs, authMs, vertexMs });
      } catch (err) {
        console.error("Proxy Image Error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    const ai = new GoogleGenAI3({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true
    });
    const { designSummary, boundaryPoints } = request.body || {};
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

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
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;
    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(", ");
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }
    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;
    const modelName = "projects/738349838690/locations/us/endpoints/8469159836758573056";
    console.log(`[Text4d] Sending generation request to Vertex AI model: ${modelName}...`);
    const { SHARED_SCHEMA: SHARED_SCHEMA2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA2
      }
    });
    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }
    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;
  } catch (err) {
    console.error("[Text4d] Error querying model:", err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
    return true;
  }
};

// services/text4eBackend.ts
import { GoogleGenAI as GoogleGenAI4 } from "@google/genai";
import { GoogleAuth as GoogleAuth4 } from "google-auth-library";
import fs5 from "fs";

// services/text4eImageConfig.ts
var TEXT4E_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ["IMAGE"],
  thinkingConfig: {
    thinkingLevel: "minimal",
    includeThoughts: false
  },
  imageConfig: {
    aspectRatio: "1:1",
    imageSize: "1K"
  }
};
var TEXT4E_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION = `The confirmed enclosed area and numeric fixed-property footprint are hard rendering constraints; match the bounding-box ratio within 2%. Preserve architectural logic, adjacency, privacy, circulation, daylight, and useful rooms. Use a full rectangular exterior shell only when the user prompt says RECTANGLE LOCKED. When it says CREATIVE UNLOCKED, preserve the area and fixed-property bounding box but freely choose an architecturally intelligent compact, L/U-shaped, stepped, offset, or other coherent footprint; never force a rectangle by default. Count balconies, terraces, porches, decks, steps, and railings inside the fixed-property box but outside enclosed area. Exclude annotations and every door leaf or swing arc from dimensions and area. Draw all architecture first, reserving clear white label zones. Give every named space exactly one full Design Brief room name in thin black text at 0.33 times normal room-label height; never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels. Place a label only when its complete glyph box fits inside clear white floor space. No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark. Never render prompt instructions, pixel coordinates, bounding-box diagnostics, or wall-thickness notes as image text.`;

// services/text4eBackend.ts
var VERTEX_KEY_PATH3 = resolveDefaultVertexKeyPath();
var VERTEX_SCOPE3 = "https://www.googleapis.com/auth/cloud-platform";
var cachedVertexAuth3;
var cachedVertexClientPromise3;
var configureVertexEnvironment3 = () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH3;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
  process.env.GOOGLE_CLOUD_LOCATION = "us";
};
var getVertexAuth3 = () => {
  if (!fs5.existsSync(VERTEX_KEY_PATH3)) {
    throw new Error(`Service account key not found at ${VERTEX_KEY_PATH3}`);
  }
  configureVertexEnvironment3();
  if (!cachedVertexAuth3) {
    cachedVertexAuth3 = new GoogleAuth4({ keyFile: VERTEX_KEY_PATH3, scopes: VERTEX_SCOPE3 });
  }
  return cachedVertexAuth3;
};
var getVertexClient3 = () => {
  if (!cachedVertexClientPromise3) {
    cachedVertexClientPromise3 = getVertexAuth3().getClient().catch((error) => {
      cachedVertexClientPromise3 = void 0;
      throw error;
    });
  }
  return cachedVertexClientPromise3;
};
var warmText4eVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient3();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to warm the Google Cloud access token.");
  return { ready: true, warmupMs: Date.now() - startedAt };
};
var routeText4eApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/text4e/generate") && !url.startsWith("/api/text4e/image") && !url.startsWith("/api/text4e/auth/warm")) {
    response.status(404).json({ error: "Unknown Text4e endpoint." });
    return true;
  }
  try {
    getVertexAuth3();
    if (url.startsWith("/api/text4e/auth/warm")) {
      const result = await warmText4eVertexAuth();
      console.log(`[Text 4.0 E] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }
    if (url.startsWith("/api/text4e/image")) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt: prompt2 } = request.body || {};
        const authStartedAt = Date.now();
        const client = await getVertexClient3();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse.token;
        const authMs = Date.now() - authStartedAt;
        if (!token) throw new Error("Failed to get Google Cloud access token");
        const vertexUrl = "https://aiplatform.googleapis.com/v1/projects/mod-trg-1260712-01/locations/global/publishers/google/models/gemini-3.1-flash-lite-image:generateContent";
        const vertexStartedAt = Date.now();
        const fetch2 = (await import("node-fetch")).default || global.fetch;
        const imgRes = await fetch2(vertexUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: TEXT4E_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION }]
            },
            contents: [{ role: "user", parts: [{ text: prompt2 }] }],
            generationConfig: TEXT4E_LOW_LATENCY_GENERATION_CONFIG
          })
        });
        if (!imgRes.ok) {
          const errText = await imgRes.text();
          throw new Error(`Vertex AI API error: ${imgRes.status} ${errText}`);
        }
        const data = await imgRes.json();
        const imagePart = data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
        const base64Eata = imagePart?.inlineData?.data;
        if (!base64Eata) {
          throw new Error("No image data returned from Gemini.");
        }
        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 E] Vertex image proxy completed in ${generationMs}ms (auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Eata, generationMs, authMs, vertexMs });
      } catch (err) {
        console.error("Proxy Image Error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    const ai = new GoogleGenAI4({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true
    });
    const { designSummary, boundaryPoints } = request.body || {};
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

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
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;
    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(", ");
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }
    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;
    const modelName = "projects/738349838690/locations/us/endpoints/8469159836758573056";
    console.log(`[Text4e] Sending generation request to Vertex AI model: ${modelName}...`);
    const { SHARED_SCHEMA: SHARED_SCHEMA2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA2
      }
    });
    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }
    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;
  } catch (err) {
    console.error("[Text4e] Error querying model:", err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
    return true;
  }
};

// services/text4fBackend.ts
import { GoogleGenAI as GoogleGenAI5 } from "@google/genai";
import { GoogleAuth as GoogleAuth5 } from "google-auth-library";
import fs6 from "fs";

// services/text4fImageConfig.ts
var TEXT4F_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ["IMAGE"],
  thinkingConfig: {
    thinkingLevel: "minimal",
    includeThoughts: false
  },
  imageConfig: {
    aspectRatio: "1:1",
    imageSize: "1K"
  }
};
var TEXT4F_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION = `The confirmed enclosed area and numeric fixed-property footprint are hard rendering constraints; match the bounding-box ratio within 2%. Preserve architectural logic, adjacency, privacy, circulation, daylight, and useful rooms. Use a full rectangular exterior shell only when the user prompt says RECTANGLE LOCKED. When it says CREATIVE UNLOCKED, preserve the area and fixed-property bounding box but freely choose an architecturally intelligent compact, L/U-shaped, stepped, offset, or other coherent footprint; never force a rectangle by default. Count balconies, terraces, porches, decks, steps, and railings inside the fixed-property box but outside enclosed area. Exclude annotations and every door leaf or swing arc from dimensions and area. Draw all architecture first, reserving clear white label zones. Give every named space exactly one full Design Brief room name in thin black text at 0.33 times normal room-label height; never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels. Place a label only when its complete glyph box fits inside clear white floor space. No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark. Never render prompt instructions, pixel coordinates, bounding-box diagnostics, or wall-thickness notes as image text.`;

// services/text4fBackend.ts
var VERTEX_KEY_PATH4 = resolveDefaultVertexKeyPath();
var VERTEX_SCOPE4 = "https://www.googleapis.com/auth/cloud-platform";
var cachedVertexAuth4;
var cachedVertexClientPromise4;
var configureVertexEnvironment4 = () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH4;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
  process.env.GOOGLE_CLOUD_LOCATION = "us";
};
var getVertexAuth4 = () => {
  if (!fs6.existsSync(VERTEX_KEY_PATH4)) {
    throw new Error(`Service account key not found at ${VERTEX_KEY_PATH4}`);
  }
  configureVertexEnvironment4();
  if (!cachedVertexAuth4) {
    cachedVertexAuth4 = new GoogleAuth5({ keyFile: VERTEX_KEY_PATH4, scopes: VERTEX_SCOPE4 });
  }
  return cachedVertexAuth4;
};
var getVertexClient4 = () => {
  if (!cachedVertexClientPromise4) {
    cachedVertexClientPromise4 = getVertexAuth4().getClient().catch((error) => {
      cachedVertexClientPromise4 = void 0;
      throw error;
    });
  }
  return cachedVertexClientPromise4;
};
var warmText4fVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient4();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to warm the Google Cloud access token.");
  return { ready: true, warmupMs: Date.now() - startedAt };
};
var routeText4fApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/text4f/generate") && !url.startsWith("/api/text4f/image") && !url.startsWith("/api/text4f/auth/warm")) {
    response.status(404).json({ error: "Unknown Text4f endpoint." });
    return true;
  }
  try {
    getVertexAuth4();
    if (url.startsWith("/api/text4f/auth/warm")) {
      const result = await warmText4fVertexAuth();
      console.log(`[Text 4.0 F] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }
    if (url.startsWith("/api/text4f/image")) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt: prompt2 } = request.body || {};
        const authStartedAt = Date.now();
        const client = await getVertexClient4();
        const tokenResponse = await client.getAccessToken();
        const token = tokenResponse.token;
        const authMs = Date.now() - authStartedAt;
        if (!token) throw new Error("Failed to get Google Cloud access token");
        const vertexUrl = "https://aiplatform.googleapis.com/v1/projects/mod-trg-1260712-01/locations/global/publishers/google/models/gemini-3.1-flash-lite-image:generateContent";
        const vertexStartedAt = Date.now();
        const fetch2 = (await import("node-fetch")).default || global.fetch;
        const imgRes = await fetch2(vertexUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            systemInstruction: {
              parts: [{ text: TEXT4F_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION }]
            },
            contents: [{ role: "user", parts: [{ text: prompt2 }] }],
            generationConfig: TEXT4F_LOW_LATENCY_GENERATION_CONFIG
          })
        });
        if (!imgRes.ok) {
          const errText = await imgRes.text();
          throw new Error(`Vertex AI API error: ${imgRes.status} ${errText}`);
        }
        const data = await imgRes.json();
        const imagePart = data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
        const base64Eata = imagePart?.inlineData?.data;
        if (!base64Eata) {
          throw new Error("No image data returned from Gemini.");
        }
        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 F] Vertex image proxy completed in ${generationMs}ms (auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Eata, generationMs, authMs, vertexMs });
      } catch (err) {
        console.error("Proxy Image Error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    const ai = new GoogleGenAI5({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true
    });
    const { designSummary, boundaryPoints } = request.body || {};
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

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
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;
    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(", ");
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }
    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;
    const modelName = "projects/738349838690/locations/us/endpoints/8469159836758573056";
    console.log(`[Text4f] Sending generation request to Vertex AI model: ${modelName}...`);
    const { SHARED_SCHEMA: SHARED_SCHEMA2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA2
      }
    });
    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }
    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;
  } catch (err) {
    console.error("[Text4f] Error querying model:", err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
    return true;
  }
};

// services/text4gBackend.ts
import { GoogleGenAI as GoogleGenAI6 } from "@google/genai";
import { GoogleAuth as GoogleAuth6 } from "google-auth-library";
import fs7 from "fs";

// services/text4gImageConfig.ts
var TEXT4G_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ["IMAGE"],
  thinkingConfig: {
    thinkingLevel: "minimal",
    includeThoughts: false
  },
  imageConfig: {
    aspectRatio: "1:1",
    imageSize: "1K"
  }
};
var TEXT4G_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION = `The confirmed enclosed area and numeric fixed-property footprint are hard rendering constraints; match the bounding-box ratio within 2%. Preserve architectural logic, adjacency, privacy, circulation, daylight, and useful rooms. Use a full rectangular exterior shell only when the user prompt says RECTANGLE LOCKED. When it says CREATIVE UNLOCKED, preserve the area and fixed-property bounding box but freely choose an architecturally intelligent compact, L/U-shaped, stepped, offset, or other coherent footprint; never force a rectangle by default. Count balconies, terraces, porches, decks, steps, and railings inside the fixed-property box but outside enclosed area. Exclude annotations and every door leaf or swing arc from dimensions and area. Draw all architecture first, reserving clear white label zones. Give every named space exactly one full Design Brief room name in thin black text at 0.33 times normal room-label height; never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels. Place a label only when its complete glyph box fits inside clear white floor space. No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark. Never render prompt instructions, pixel coordinates, bounding-box diagnostics, or wall-thickness notes as image text.`;

// services/text4gBackend.ts
import { MediaResolution, ThinkingLevel, Type as Type2 } from "@google/genai";

// services/text4gMasterFloorplanData.ts
var edgeKey = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
var orientation2 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
var strictlyIntersects = (a, b, c, d) => {
  const abC = orientation2(a, b, c);
  const abD = orientation2(a, b, d);
  const cdA = orientation2(c, d, a);
  const cdB = orientation2(c, d, b);
  const epsilon = 1e-6;
  return (abC > epsilon && abD < -epsilon || abC < -epsilon && abD > epsilon) && (cdA > epsilon && cdB < -epsilon || cdA < -epsilon && cdB > epsilon);
};
var validateText4gMasterFloorplanGraph = (rawData) => {
  const errors = [];
  if (rawData?.coordinateSpace !== "normalized_0_1000") errors.push("coordinateSpace must be normalized_0_1000.");
  const junctions = Array.isArray(rawData?.junctions) ? rawData.junctions : [];
  const junctionMap = /* @__PURE__ */ new Map();
  for (const junction of junctions) {
    const id = String(junction?.id || "").trim();
    const x = Number(junction?.x), y = Number(junction?.y);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1e3 || y < 0 || y > 1e3) {
      errors.push("Every junction requires a unique ID and coordinates inside 0..1000.");
      continue;
    }
    if (junctionMap.has(id)) errors.push(`Duplicate junction ID ${id}.`);
    junctionMap.set(id, { id, x, y });
  }
  const rawLoop = Array.isArray(rawData?.exteriorLoop) ? rawData.exteriorLoop.map(String) : [];
  const exteriorLoop = rawLoop.length > 1 && rawLoop[0] === rawLoop[rawLoop.length - 1] ? rawLoop.slice(0, -1) : rawLoop;
  if (exteriorLoop.length < 3) errors.push("Exterior loop requires at least three junctions.");
  if (new Set(exteriorLoop).size !== exteriorLoop.length) errors.push("Exterior loop must not repeat junction IDs.");
  for (const id of exteriorLoop) if (!junctionMap.has(id)) errors.push(`Exterior loop references missing junction ${id}.`);
  const walls = Array.isArray(rawData?.walls) ? rawData.walls : [];
  const wallMap = /* @__PURE__ */ new Map();
  const wallEdges = /* @__PURE__ */ new Set();
  for (const wall of walls) {
    const id = String(wall?.id || "").trim();
    const start = String(wall?.startJunctionId || "");
    const end = String(wall?.endJunctionId || "");
    if (!id || !junctionMap.has(start) || !junctionMap.has(end) || start === end) {
      errors.push("Every wall requires a unique ID and two different existing junction references.");
      continue;
    }
    if (wallMap.has(id)) errors.push(`Duplicate wall ID ${id}.`);
    const key = edgeKey(start, end);
    if (wallEdges.has(key)) errors.push(`Duplicate wall edge ${start}-${end}.`);
    const curveType = String(wall.curveType || "line").toLowerCase();
    if (curveType !== "line") {
      const centerX = Number(wall.centerX), centerY = Number(wall.centerY);
      const radiusX = Number(wall.radiusX ?? wall.radius), radiusY = Number(wall.radiusY ?? wall.radius);
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || centerX < 0 || centerX > 1e3 || centerY < 0 || centerY > 1e3 || !Number.isFinite(radiusX) || radiusX <= 0 || !Number.isFinite(radiusY) || radiusY <= 0 || !Number.isFinite(Number(wall.startAngle)) || !Number.isFinite(Number(wall.endAngle))) {
        errors.push(`Curved wall ${id} requires complete center, radius, and angle metadata.`);
      }
    }
    wallMap.set(id, wall);
    wallEdges.add(key);
  }
  for (let index = 0; index < exteriorLoop.length; index += 1) {
    const a = exteriorLoop[index];
    const b = exteriorLoop[(index + 1) % exteriorLoop.length];
    const matches = walls.filter((wall) => edgeKey(String(wall.startJunctionId), String(wall.endJunctionId)) === edgeKey(a, b) && /exterior|outer/i.test(String(wall.type || "")));
    if (matches.length !== 1) errors.push(`Exterior edge ${a}-${b} must have exactly one exterior wall.`);
  }
  if (exteriorLoop.every((id) => junctionMap.has(id))) {
    for (let aIndex = 0; aIndex < exteriorLoop.length; aIndex += 1) {
      const aNext = (aIndex + 1) % exteriorLoop.length;
      for (let bIndex = aIndex + 1; bIndex < exteriorLoop.length; bIndex += 1) {
        const bNext = (bIndex + 1) % exteriorLoop.length;
        if (aIndex === bIndex || aNext === bIndex || bNext === aIndex) continue;
        if (strictlyIntersects(
          junctionMap.get(exteriorLoop[aIndex]),
          junctionMap.get(exteriorLoop[aNext]),
          junctionMap.get(exteriorLoop[bIndex]),
          junctionMap.get(exteriorLoop[bNext])
        )) errors.push("Exterior loop self-intersects.");
      }
    }
  }
  const apertures = Array.isArray(rawData?.apertures) ? rawData.apertures : [];
  for (const aperture of apertures) {
    const host = wallMap.get(String(aperture?.hostWallId || ""));
    const offset = Number(aperture?.offset), widthRatio = Number(aperture?.widthRatio);
    if (!host) errors.push("Every aperture must reference an existing host wall.");
    if (!Number.isFinite(offset) || !Number.isFinite(widthRatio) || widthRatio <= 0 || offset < 0 || offset > 1 || offset - widthRatio / 2 < -1e-6 || offset + widthRatio / 2 > 1 + 1e-6) {
      errors.push("Every aperture must be fully contained by its host wall.");
    }
  }
  return {
    valid: errors.length === 0 && walls.length >= exteriorLoop.length && exteriorLoop.length >= 3,
    errors: [...new Set(errors)],
    exteriorJunctionCount: exteriorLoop.length,
    apertureCount: apertures.length
  };
};

// services/text4gBackend.ts
var VERTEX_KEY_PATH5 = resolveDefaultVertexKeyPath();
var VERTEX_SCOPE5 = "https://www.googleapis.com/auth/cloud-platform";
var cachedVertexAuth5;
var cachedVertexClientPromise5;
var configureVertexEnvironment5 = () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH5;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
  process.env.GOOGLE_CLOUD_LOCATION = "us";
};
var getVertexAuth5 = () => {
  if (!fs7.existsSync(VERTEX_KEY_PATH5)) {
    throw new Error(`Service account key not found at ${VERTEX_KEY_PATH5}`);
  }
  configureVertexEnvironment5();
  if (!cachedVertexAuth5) {
    cachedVertexAuth5 = new GoogleAuth6({ keyFile: VERTEX_KEY_PATH5, scopes: VERTEX_SCOPE5 });
  }
  return cachedVertexAuth5;
};
var getVertexClient5 = () => {
  if (!cachedVertexClientPromise5) {
    cachedVertexClientPromise5 = getVertexAuth5().getClient().catch((error) => {
      cachedVertexClientPromise5 = void 0;
      throw error;
    });
  }
  return cachedVertexClientPromise5;
};
var warmText4gVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient5();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to warm the Google Cloud access token.");
  return { ready: true, warmupMs: Date.now() - startedAt };
};
var routeText4gApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/text4g/generate") && !url.startsWith("/api/text4g/image") && !url.startsWith("/api/text4g/master-geometry") && !url.startsWith("/api/text4g/auth/warm")) {
    response.status(404).json({ error: "Unknown Text4g endpoint." });
    return true;
  }
  try {
    getVertexAuth5();
    if (url.startsWith("/api/text4g/auth/warm")) {
      const result = await warmText4gVertexAuth();
      console.log(`[Text 4.0 G] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }
    if (url.startsWith("/api/text4g/image")) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt: prompt2 } = request.body || {};
        const authStartedAt = Date.now();
        await getVertexClient5();
        const authMs = Date.now() - authStartedAt;
        const vertexStartedAt = Date.now();
        const imageAi = new GoogleGenAI6({
          project: "mod-trg-1260712-01",
          location: "global",
          vertexai: true
        });
        const data = await imageAi.models.generateContent({
          model: "gemini-3.1-flash-lite-image",
          contents: [{ role: "user", parts: [{ text: prompt2 }] }],
          config: {
            systemInstruction: TEXT4G_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION,
            ...TEXT4G_LOW_LATENCY_GENERATION_CONFIG,
            responseModalities: [...TEXT4G_LOW_LATENCY_GENERATION_CONFIG.responseModalities]
          }
        });
        const imagePart = data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
        const base64Data = imagePart?.inlineData?.data;
        if (!base64Data) {
          throw new Error("No image data returned from Gemini.");
        }
        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 G] Vertex image proxy completed in ${generationMs}ms (auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Data, generationMs, authMs, vertexMs });
      } catch (err) {
        console.error("Proxy Image Error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    if (url.startsWith("/api/text4g/master-geometry")) {
      try {
        const transcriptionStartedAt = Date.now();
        const { imageBytes, mimeType = "image/jpeg", prompt: prompt2, thinkingLevel = "minimal" } = request.body || {};
        if (!imageBytes || !prompt2) {
          response.status(400).json({ error: "Text 4.0 G master geometry requires imageBytes and prompt." });
          return true;
        }
        const authStartedAt = Date.now();
        await getVertexClient5();
        const authMs = Date.now() - authStartedAt;
        const ai2 = new GoogleGenAI6({
          project: "mod-trg-1260712-01",
          location: "global",
          vertexai: true,
          httpOptions: { apiVersion: "v1beta1" }
        });
        const coordinate = { type: Type2.NUMBER, minimum: 0, maximum: 1e3 };
        const MASTER_FLOORPLAN_SCHEMA = {
          type: Type2.OBJECT,
          properties: {
            coordinateSpace: { type: Type2.STRING, enum: ["normalized_0_1000"] },
            junctions: {
              type: Type2.ARRAY,
              minItems: 3,
              items: {
                type: Type2.OBJECT,
                properties: {
                  id: { type: Type2.STRING },
                  x: coordinate,
                  y: coordinate
                },
                required: ["id", "x", "y"]
              }
            },
            exteriorLoop: {
              type: Type2.ARRAY,
              minItems: 3,
              items: { type: Type2.STRING }
            },
            walls: {
              type: Type2.ARRAY,
              minItems: 3,
              items: {
                type: Type2.OBJECT,
                properties: {
                  id: { type: Type2.STRING },
                  startJunctionId: { type: Type2.STRING },
                  endJunctionId: { type: Type2.STRING },
                  type: { type: Type2.STRING, enum: ["exterior", "interior", "partition", "glass"] },
                  curveType: { type: Type2.STRING, enum: ["line", "arc", "circle", "ellipse"] },
                  centerX: coordinate,
                  centerY: coordinate,
                  radius: { type: Type2.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  radiusX: { type: Type2.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  radiusY: { type: Type2.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  rotation: { type: Type2.NUMBER },
                  startAngle: { type: Type2.NUMBER },
                  endAngle: { type: Type2.NUMBER },
                  counterclockwise: { type: Type2.BOOLEAN },
                  confidence: { type: Type2.NUMBER, minimum: 0, maximum: 1 }
                },
                required: ["id", "startJunctionId", "endJunctionId", "type", "curveType"]
              }
            },
            apertures: {
              type: Type2.ARRAY,
              items: {
                type: Type2.OBJECT,
                properties: {
                  id: { type: Type2.STRING },
                  hostWallId: { type: Type2.STRING },
                  offset: { type: Type2.NUMBER, minimum: 0, maximum: 1 },
                  widthRatio: { type: Type2.NUMBER, minimum: 1e-6, maximum: 1 },
                  kind: { type: Type2.STRING, enum: ["door", "window", "opening", "unknown"] },
                  subtype: { type: Type2.STRING, enum: ["single", "double", "sliding", "folding", "glass", "standard", "bay", "full-height", "unknown"] },
                  hingeSide: { type: Type2.STRING, enum: ["left", "right", "unknown"] },
                  swingDirection: { type: Type2.STRING, enum: ["inward", "outward", "unknown"] },
                  confidence: { type: Type2.NUMBER, minimum: 0, maximum: 1 }
                },
                required: ["id", "hostWallId", "offset", "widthRatio", "kind"]
              }
            }
          },
          required: ["coordinateSpace", "junctions", "exteriorLoop", "walls", "apertures"]
        };
        const masterModel = "gemini-3.5-flash-lite";
        const normalizedThinkingLevel = String(thinkingLevel).toLowerCase();
        const masterThinkingLevel = {
          minimal: ThinkingLevel.MINIMAL,
          low: ThinkingLevel.LOW,
          medium: ThinkingLevel.MEDIUM,
          high: ThinkingLevel.HIGH
        }[normalizedThinkingLevel] || ThinkingLevel.MINIMAL;
        const appliedThinkingLevel = ["minimal", "low", "medium", "high"].includes(normalizedThinkingLevel) ? normalizedThinkingLevel : "minimal";
        const requestModel = async () => {
          const modelStartedAt = Date.now();
          const genResponse2 = await ai2.models.generateContent({
            model: masterModel,
            contents: [{
              role: "user",
              parts: [
                { text: prompt2 },
                { inlineData: { data: imageBytes, mimeType } }
              ]
            }],
            config: {
              mediaResolution: MediaResolution.MEDIA_RESOLUTION_HIGH,
              thinkingConfig: {
                thinkingLevel: masterThinkingLevel,
                includeThoughts: false
              },
              responseMimeType: "application/json",
              responseSchema: MASTER_FLOORPLAN_SCHEMA
            }
          });
          if (!genResponse2.text) throw new Error(`No master floorplan data returned from ${masterModel}.`);
          return { geometry: JSON.parse(genResponse2.text), modelMs: Date.now() - modelStartedAt, model: masterModel };
        };
        const result = await requestModel();
        const validation = validateText4gMasterFloorplanGraph(result.geometry);
        const totalModelMs = result.modelMs;
        const geometry = result.geometry;
        const transcriptionMs = Date.now() - transcriptionStartedAt;
        console.log(`[Text 4.0 G] Master geometry graph completed in ${transcriptionMs}ms (auth ${authMs}ms, model ${totalModelMs}ms, ${result.model}, valid ${validation.valid})`);
        response.json({ geometry, transcriptionMs, authMs, modelMs: totalModelMs, model: result.model, thinkingLevel: appliedThinkingLevel, validation });
      } catch (err) {
        console.error("[Text 4.0 G] Master floorplan data error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    const ai = new GoogleGenAI6({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true
    });
    const { designSummary, boundaryPoints } = request.body || {};
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

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
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;
    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(", ");
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }
    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;
    const modelName = "projects/738349838690/locations/us/endpoints/8469159836758573056";
    console.log(`[Text4g] Sending generation request to Vertex AI model: ${modelName}...`);
    const { SHARED_SCHEMA: SHARED_SCHEMA2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA2
      }
    });
    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }
    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;
  } catch (err) {
    console.error("[Text4g] Error querying model:", err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
    return true;
  }
};

// services/text4hBackend.ts
import { GoogleGenAI as GoogleGenAI7 } from "@google/genai";
import { GoogleAuth as GoogleAuth7 } from "google-auth-library";
import fs8 from "fs";

// services/text4hImageConfig.ts
var TEXT4H_IMAGE_MODEL = "gemini-3.1-flash-lite-image";
var TEXT4H_AUTOSCAN_REDRAW_PROMPT = `A professional 2D architectural floor plan rendered on a clean, solid white background. High-contrast minimalist style. All structural exterior walls are exactly 9 inches thick and filled with a solid, pure black color. All interior partition walls are exactly 4.5 inches thick and also filled with solid black. No wall shading, no textures, and no patterns. Doors are drawn as clean single-line arcs showing swing direction. Windows are represented by simple parallel lines within the black walls. Crisp, highly legible sans-serif black text labels each room with its name and exact dimensions underneath (e.g., 'Room Name
00'-0" x 00'-0"'). No furniture layout, no flooring textures, and no color fills outside of the black walls. The layout must perfectly adhere to the following specific architectural requirements. Act as an experienced draftsman, take input from the attached floorplan, and give output on the above explained visual graphics format. Do not be creative, only act as draftsman and ditto 100% reproduce on required graphics format, do NOT make any architectural / interior changes.`;
var TEXT4H_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ["IMAGE"],
  thinkingConfig: {
    thinkingLevel: "minimal",
    includeThoughts: false
  },
  imageConfig: {
    aspectRatio: "1:1",
    imageSize: "1K"
  }
};
var TEXT4H_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION = `The confirmed enclosed area and numeric fixed-property footprint are hard rendering constraints; match the bounding-box ratio within 2%. Preserve architectural logic, adjacency, privacy, circulation, daylight, and useful rooms. Use a full rectangular exterior shell only when the user prompt says RECTANGLE LOCKED. When it says CREATIVE UNLOCKED, preserve the area and fixed-property bounding box but freely choose an architecturally intelligent compact, L/U-shaped, stepped, offset, or other coherent footprint; never force a rectangle by default. Count balconies, terraces, porches, decks, steps, and railings inside the fixed-property box but outside enclosed area. Exclude annotations and every door leaf or swing arc from dimensions and area. Draw all architecture first, reserving clear white label zones. Give every named space exactly one full Design Brief room name in thin black text at 0.33 times normal room-label height; never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels. Place a label only when its complete glyph box fits inside clear white floor space. No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark. Never render prompt instructions, pixel coordinates, bounding-box diagnostics, or wall-thickness notes as image text.`;

// services/text4hBackend.ts
import { MediaResolution as MediaResolution2, ThinkingLevel as ThinkingLevel2, Type as Type3 } from "@google/genai";

// services/text4hMasterFloorplanData.ts
var edgeKey2 = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
var orientation3 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
var strictlyIntersects2 = (a, b, c, d) => {
  const abC = orientation3(a, b, c);
  const abD = orientation3(a, b, d);
  const cdA = orientation3(c, d, a);
  const cdB = orientation3(c, d, b);
  const epsilon = 1e-6;
  return (abC > epsilon && abD < -epsilon || abC < -epsilon && abD > epsilon) && (cdA > epsilon && cdB < -epsilon || cdA < -epsilon && cdB > epsilon);
};
var validateText4hMasterFloorplanGraph = (rawData) => {
  const errors = [];
  if (rawData?.coordinateSpace !== "normalized_0_1000") errors.push("coordinateSpace must be normalized_0_1000.");
  const junctions = Array.isArray(rawData?.junctions) ? rawData.junctions : [];
  const junctionMap = /* @__PURE__ */ new Map();
  for (const junction of junctions) {
    const id = String(junction?.id || "").trim();
    const x = Number(junction?.x), y = Number(junction?.y);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1e3 || y < 0 || y > 1e3) {
      errors.push("Every junction requires a unique ID and coordinates inside 0..1000.");
      continue;
    }
    if (junctionMap.has(id)) errors.push(`Duplicate junction ID ${id}.`);
    junctionMap.set(id, { id, x, y });
  }
  const rawLoop = Array.isArray(rawData?.exteriorLoop) ? rawData.exteriorLoop.map(String) : [];
  const exteriorLoop = rawLoop.length > 1 && rawLoop[0] === rawLoop[rawLoop.length - 1] ? rawLoop.slice(0, -1) : rawLoop;
  if (exteriorLoop.length < 3) errors.push("Exterior loop requires at least three junctions.");
  if (new Set(exteriorLoop).size !== exteriorLoop.length) errors.push("Exterior loop must not repeat junction IDs.");
  for (const id of exteriorLoop) if (!junctionMap.has(id)) errors.push(`Exterior loop references missing junction ${id}.`);
  const walls = Array.isArray(rawData?.walls) ? rawData.walls : [];
  const wallMap = /* @__PURE__ */ new Map();
  const wallEdges = /* @__PURE__ */ new Set();
  for (const wall of walls) {
    const id = String(wall?.id || "").trim();
    const start = String(wall?.startJunctionId || "");
    const end = String(wall?.endJunctionId || "");
    if (!id || !junctionMap.has(start) || !junctionMap.has(end) || start === end) {
      errors.push("Every wall requires a unique ID and two different existing junction references.");
      continue;
    }
    if (wallMap.has(id)) errors.push(`Duplicate wall ID ${id}.`);
    const key = edgeKey2(start, end);
    if (wallEdges.has(key)) errors.push(`Duplicate wall edge ${start}-${end}.`);
    const curveType = String(wall.curveType || "line").toLowerCase();
    if (curveType !== "line") {
      const centerX = Number(wall.centerX), centerY = Number(wall.centerY);
      const radiusX = Number(wall.radiusX ?? wall.radius), radiusY = Number(wall.radiusY ?? wall.radius);
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || centerX < 0 || centerX > 1e3 || centerY < 0 || centerY > 1e3 || !Number.isFinite(radiusX) || radiusX <= 0 || !Number.isFinite(radiusY) || radiusY <= 0 || !Number.isFinite(Number(wall.startAngle)) || !Number.isFinite(Number(wall.endAngle))) {
        errors.push(`Curved wall ${id} requires complete center, radius, and angle metadata.`);
      }
    }
    wallMap.set(id, wall);
    wallEdges.add(key);
  }
  for (let index = 0; index < exteriorLoop.length; index += 1) {
    const a = exteriorLoop[index];
    const b = exteriorLoop[(index + 1) % exteriorLoop.length];
    const matches = walls.filter((wall) => edgeKey2(String(wall.startJunctionId), String(wall.endJunctionId)) === edgeKey2(a, b) && /exterior|outer/i.test(String(wall.type || "")));
    if (matches.length !== 1) errors.push(`Exterior edge ${a}-${b} must have exactly one exterior wall.`);
  }
  if (exteriorLoop.every((id) => junctionMap.has(id))) {
    for (let aIndex = 0; aIndex < exteriorLoop.length; aIndex += 1) {
      const aNext = (aIndex + 1) % exteriorLoop.length;
      for (let bIndex = aIndex + 1; bIndex < exteriorLoop.length; bIndex += 1) {
        const bNext = (bIndex + 1) % exteriorLoop.length;
        if (aIndex === bIndex || aNext === bIndex || bNext === aIndex) continue;
        if (strictlyIntersects2(
          junctionMap.get(exteriorLoop[aIndex]),
          junctionMap.get(exteriorLoop[aNext]),
          junctionMap.get(exteriorLoop[bIndex]),
          junctionMap.get(exteriorLoop[bNext])
        )) errors.push("Exterior loop self-intersects.");
      }
    }
  }
  const apertures = Array.isArray(rawData?.apertures) ? rawData.apertures : [];
  for (const aperture of apertures) {
    const host = wallMap.get(String(aperture?.hostWallId || ""));
    const offset = Number(aperture?.offset), widthRatio = Number(aperture?.widthRatio);
    if (!host) errors.push("Every aperture must reference an existing host wall.");
    if (!Number.isFinite(offset) || !Number.isFinite(widthRatio) || widthRatio <= 0 || offset < 0 || offset > 1 || offset - widthRatio / 2 < -1e-6 || offset + widthRatio / 2 > 1 + 1e-6) {
      errors.push("Every aperture must be fully contained by its host wall.");
    }
  }
  return {
    valid: errors.length === 0 && walls.length >= exteriorLoop.length && exteriorLoop.length >= 3,
    errors: [...new Set(errors)],
    exteriorJunctionCount: exteriorLoop.length,
    apertureCount: apertures.length
  };
};

// services/text4hBackend.ts
var VERTEX_KEY_PATH6 = resolveDefaultVertexKeyPath();
var VERTEX_SCOPE6 = "https://www.googleapis.com/auth/cloud-platform";
var cachedVertexAuth6;
var cachedVertexClientPromise6;
var configureVertexEnvironment6 = () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH6;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
  process.env.GOOGLE_CLOUD_LOCATION = "us";
};
var getVertexAuth6 = () => {
  if (!fs8.existsSync(VERTEX_KEY_PATH6)) {
    throw new Error(`Service account key not found at ${VERTEX_KEY_PATH6}`);
  }
  configureVertexEnvironment6();
  if (!cachedVertexAuth6) {
    cachedVertexAuth6 = new GoogleAuth7({ keyFile: VERTEX_KEY_PATH6, scopes: VERTEX_SCOPE6 });
  }
  return cachedVertexAuth6;
};
var getVertexClient6 = () => {
  if (!cachedVertexClientPromise6) {
    cachedVertexClientPromise6 = getVertexAuth6().getClient().catch((error) => {
      cachedVertexClientPromise6 = void 0;
      throw error;
    });
  }
  return cachedVertexClientPromise6;
};
var warmText4hVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient6();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to warm the Google Cloud access token.");
  return { ready: true, warmupMs: Date.now() - startedAt };
};
var routeText4hApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/text4h/generate") && !url.startsWith("/api/text4h/image") && !url.startsWith("/api/text4h/master-geometry") && !url.startsWith("/api/text4h/auth/warm")) {
    response.status(404).json({ error: "Unknown Text4h endpoint." });
    return true;
  }
  try {
    getVertexAuth6();
    if (url.startsWith("/api/text4h/auth/warm")) {
      const result = await warmText4hVertexAuth();
      console.log(`[Text 4.0 H] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }
    if (url.startsWith("/api/text4h/image-redraw")) {
      try {
        const imageRequestStartedAt = Date.now();
        const { imageBytes, mimeType = "image/jpeg", dimensions } = request.body || {};
        if (!imageBytes) {
          response.status(400).json({ error: "AutoScan redraw requires imageBytes." });
          return true;
        }
        const unitSystem = dimensions?.unitSystem === "imperial" ? "imperial" : "metric";
        const lengthUnit = unitSystem === "imperial" ? "feet" : "meters";
        const areaUnit = unitSystem === "imperial" ? "square feet" : "square meters";
        const validMeasurement = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
        const scaleParts = [
          validMeasurement(dimensions?.width) ? `property width ${dimensions.width} ${lengthUnit}` : "",
          validMeasurement(dimensions?.depth) ? `property depth ${dimensions.depth} ${lengthUnit}` : "",
          validMeasurement(dimensions?.area) ? `enclosed area ${dimensions.area} ${areaUnit}` : ""
        ].filter(Boolean);
        const redrawPrompt = scaleParts.length > 0 ? `${TEXT4H_AUTOSCAN_REDRAW_PROMPT}

Confirmed user scale marking: ${scaleParts.join("; ")}. Use these values as scale references while reproducing the attached plan exactly; do not invent a missing dimension or alter the architecture.` : TEXT4H_AUTOSCAN_REDRAW_PROMPT;
        const authStartedAt = Date.now();
        await getVertexClient6();
        const authMs = Date.now() - authStartedAt;
        const vertexStartedAt = Date.now();
        const imageAi = new GoogleGenAI7({
          project: "mod-trg-1260712-01",
          location: "global",
          vertexai: true
        });
        const data = await imageAi.models.generateContent({
          model: TEXT4H_IMAGE_MODEL,
          contents: [{
            role: "user",
            parts: [
              { text: redrawPrompt },
              { inlineData: { data: imageBytes, mimeType } }
            ]
          }],
          config: {
            ...TEXT4H_LOW_LATENCY_GENERATION_CONFIG,
            responseModalities: [...TEXT4H_LOW_LATENCY_GENERATION_CONFIG.responseModalities]
          }
        });
        const imagePart = data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
        const redrawnImageBytes = imagePart?.inlineData?.data;
        if (!redrawnImageBytes) throw new Error("No redrawn image returned from Gemini.");
        const vertexMs = Date.now() - vertexStartedAt;
        response.json({
          imageBytes: redrawnImageBytes,
          mimeType: imagePart?.inlineData?.mimeType || "image/jpeg",
          generationMs: Date.now() - imageRequestStartedAt,
          authMs,
          vertexMs
        });
      } catch (err) {
        console.error("[AutoScan] Gemini redraw failed.", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    if (url.startsWith("/api/text4h/image")) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt: prompt2 } = request.body || {};
        const authStartedAt = Date.now();
        await getVertexClient6();
        const authMs = Date.now() - authStartedAt;
        const vertexStartedAt = Date.now();
        const selectedModel = TEXT4H_IMAGE_MODEL;
        const imageAi = new GoogleGenAI7({
          project: "mod-trg-1260712-01",
          location: "global",
          vertexai: true
        });
        const data = await imageAi.models.generateContent({
          model: selectedModel,
          contents: [{ role: "user", parts: [{ text: prompt2 }] }],
          config: {
            systemInstruction: TEXT4H_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION,
            ...TEXT4H_LOW_LATENCY_GENERATION_CONFIG,
            responseModalities: [...TEXT4H_LOW_LATENCY_GENERATION_CONFIG.responseModalities]
          }
        });
        const imagePart = data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
        const base64Data = imagePart?.inlineData?.data;
        if (!base64Data) {
          throw new Error("No image data returned from Gemini.");
        }
        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 H] Vertex image proxy completed in ${generationMs}ms (model: ${selectedModel}, auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Data, generationMs, authMs, vertexMs });
      } catch (err) {
        console.error("Proxy Image Error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    if (url.startsWith("/api/text4h/master-geometry")) {
      try {
        const transcriptionStartedAt = Date.now();
        const { imageBytes, mimeType = "image/jpeg", prompt: prompt2, thinkingLevel = "minimal" } = request.body || {};
        if (!imageBytes || !prompt2) {
          response.status(400).json({ error: "Text 4.0 H master geometry requires imageBytes and prompt." });
          return true;
        }
        const authStartedAt = Date.now();
        await getVertexClient6();
        const authMs = Date.now() - authStartedAt;
        const ai2 = new GoogleGenAI7({
          project: "mod-trg-1260712-01",
          location: "global",
          vertexai: true,
          httpOptions: { apiVersion: "v1beta1" }
        });
        const coordinate = { type: Type3.NUMBER, minimum: 0, maximum: 1e3 };
        const MASTER_FLOORPLAN_SCHEMA = {
          type: Type3.OBJECT,
          properties: {
            coordinateSpace: { type: Type3.STRING, enum: ["normalized_0_1000"] },
            junctions: {
              type: Type3.ARRAY,
              minItems: 3,
              items: {
                type: Type3.OBJECT,
                properties: {
                  id: { type: Type3.STRING },
                  x: coordinate,
                  y: coordinate
                },
                required: ["id", "x", "y"]
              }
            },
            exteriorLoop: {
              type: Type3.ARRAY,
              minItems: 3,
              items: { type: Type3.STRING }
            },
            walls: {
              type: Type3.ARRAY,
              minItems: 3,
              items: {
                type: Type3.OBJECT,
                properties: {
                  id: { type: Type3.STRING },
                  startJunctionId: { type: Type3.STRING },
                  endJunctionId: { type: Type3.STRING },
                  type: { type: Type3.STRING, enum: ["exterior", "interior", "partition", "glass"] },
                  curveType: { type: Type3.STRING, enum: ["line", "arc", "circle", "ellipse"] },
                  centerX: coordinate,
                  centerY: coordinate,
                  radius: { type: Type3.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  radiusX: { type: Type3.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  radiusY: { type: Type3.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  rotation: { type: Type3.NUMBER },
                  startAngle: { type: Type3.NUMBER },
                  endAngle: { type: Type3.NUMBER },
                  counterclockwise: { type: Type3.BOOLEAN },
                  confidence: { type: Type3.NUMBER, minimum: 0, maximum: 1 }
                },
                required: ["id", "startJunctionId", "endJunctionId", "type", "curveType"]
              }
            },
            apertures: {
              type: Type3.ARRAY,
              items: {
                type: Type3.OBJECT,
                properties: {
                  id: { type: Type3.STRING },
                  hostWallId: { type: Type3.STRING },
                  offset: { type: Type3.NUMBER, minimum: 0, maximum: 1 },
                  widthRatio: { type: Type3.NUMBER, minimum: 1e-6, maximum: 1 },
                  kind: { type: Type3.STRING, enum: ["door", "window", "opening", "unknown"] },
                  subtype: { type: Type3.STRING, enum: ["single", "double", "sliding", "folding", "glass", "standard", "bay", "full-height", "unknown"] },
                  hingeSide: { type: Type3.STRING, enum: ["left", "right", "unknown"] },
                  swingDirection: { type: Type3.STRING, enum: ["inward", "outward", "unknown"] },
                  confidence: { type: Type3.NUMBER, minimum: 0, maximum: 1 }
                },
                required: ["id", "hostWallId", "offset", "widthRatio", "kind"]
              }
            }
          },
          required: ["coordinateSpace", "junctions", "exteriorLoop", "walls", "apertures"]
        };
        const masterModel = "gemini-3.5-flash-lite";
        const normalizedThinkingLevel = String(thinkingLevel).toLowerCase();
        const masterThinkingLevel = {
          minimal: ThinkingLevel2.MINIMAL,
          low: ThinkingLevel2.LOW,
          medium: ThinkingLevel2.MEDIUM,
          high: ThinkingLevel2.HIGH
        }[normalizedThinkingLevel] || ThinkingLevel2.MINIMAL;
        const appliedThinkingLevel = ["minimal", "low", "medium", "high"].includes(normalizedThinkingLevel) ? normalizedThinkingLevel : "minimal";
        const requestModel = async () => {
          const modelStartedAt = Date.now();
          const genResponse2 = await ai2.models.generateContent({
            model: masterModel,
            contents: [{
              role: "user",
              parts: [
                { text: prompt2 },
                { inlineData: { data: imageBytes, mimeType } }
              ]
            }],
            config: {
              mediaResolution: MediaResolution2.MEDIA_RESOLUTION_HIGH,
              thinkingConfig: {
                thinkingLevel: masterThinkingLevel,
                includeThoughts: false
              },
              responseMimeType: "application/json",
              responseSchema: MASTER_FLOORPLAN_SCHEMA
            }
          });
          if (!genResponse2.text) throw new Error(`No master floorplan data returned from ${masterModel}.`);
          return { geometry: JSON.parse(genResponse2.text), modelMs: Date.now() - modelStartedAt, model: masterModel };
        };
        const result = await requestModel();
        const validation = validateText4hMasterFloorplanGraph(result.geometry);
        const totalModelMs = result.modelMs;
        const geometry = result.geometry;
        const transcriptionMs = Date.now() - transcriptionStartedAt;
        console.log(`[Text 4.0 H] Master geometry graph completed in ${transcriptionMs}ms (auth ${authMs}ms, model ${totalModelMs}ms, ${result.model}, valid ${validation.valid})`);
        response.json({ geometry, transcriptionMs, authMs, modelMs: totalModelMs, model: result.model, thinkingLevel: appliedThinkingLevel, validation });
      } catch (err) {
        console.error("[Text 4.0 H] Master floorplan data error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    const ai = new GoogleGenAI7({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true
    });
    const { designSummary, boundaryPoints } = request.body || {};
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

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
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;
    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(", ");
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }
    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;
    const modelName = "projects/738349838690/locations/us/endpoints/8469159836758573056";
    console.log(`[Text4h] Sending generation request to Vertex AI model: ${modelName}...`);
    const { SHARED_SCHEMA: SHARED_SCHEMA2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA2
      }
    });
    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }
    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;
  } catch (err) {
    console.error("[Text4h] Error querying model:", err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
    return true;
  }
};

// services/text4jBackend.ts
import { GoogleGenAI as GoogleGenAI8 } from "@google/genai";
import { GoogleAuth as GoogleAuth8 } from "google-auth-library";
import fs9 from "fs";

// services/text4jImageConfig.ts
var TEXT4J_LOW_LATENCY_GENERATION_CONFIG = {
  temperature: 0.2,
  candidateCount: 1,
  responseModalities: ["IMAGE"],
  thinkingConfig: {
    thinkingLevel: "minimal",
    includeThoughts: false
  },
  imageConfig: {
    aspectRatio: "1:1",
    imageSize: "1K"
  }
};
var TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION = `The confirmed enclosed area and numeric fixed-property footprint are hard rendering constraints; match the bounding-box ratio within 2%. Preserve architectural logic, adjacency, privacy, circulation, daylight, and useful rooms. Use a full rectangular exterior shell only when the user prompt says RECTANGLE LOCKED. When it says CREATIVE UNLOCKED, preserve the area and fixed-property bounding box but freely choose an architecturally intelligent compact, L/U-shaped, stepped, offset, or other coherent footprint; never force a rectangle by default. Count balconies, terraces, porches, decks, steps, and railings inside the fixed-property box but outside enclosed area. Exclude annotations and every door leaf or swing arc from dimensions and area. Draw all architecture first, reserving clear white label zones. Give every named space exactly one full Design Brief room name in thin black text at 0.33 times normal room-label height; never abbreviate and never render room dimensions, room areas, label backgrounds, legends, or duplicate labels. Place a label only when its complete glyph box fits inside clear white floor space. No label glyph may touch, cross, obscure, or replace any wall, door leaf, swing arc, window, wall opening, column, stair, railing, fixture, or other architectural mark. Never render prompt instructions, pixel coordinates, bounding-box diagnostics, or wall-thickness notes as image text.`;

// services/text4jBackend.ts
import { MediaResolution as MediaResolution3, ThinkingLevel as ThinkingLevel3, Type as Type4 } from "@google/genai";

// services/text4jMasterFloorplanData.ts
var edgeKey3 = (a, b) => a < b ? `${a}\0${b}` : `${b}\0${a}`;
var orientation4 = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
var strictlyIntersects3 = (a, b, c, d) => {
  const abC = orientation4(a, b, c);
  const abD = orientation4(a, b, d);
  const cdA = orientation4(c, d, a);
  const cdB = orientation4(c, d, b);
  const epsilon = 1e-6;
  return (abC > epsilon && abD < -epsilon || abC < -epsilon && abD > epsilon) && (cdA > epsilon && cdB < -epsilon || cdA < -epsilon && cdB > epsilon);
};
var validateText4jMasterFloorplanGraph = (rawData) => {
  const errors = [];
  if (rawData?.coordinateSpace !== "normalized_0_1000") errors.push("coordinateSpace must be normalized_0_1000.");
  const junctions = Array.isArray(rawData?.junctions) ? rawData.junctions : [];
  const junctionMap = /* @__PURE__ */ new Map();
  for (const junction of junctions) {
    const id = String(junction?.id || "").trim();
    const x = Number(junction?.x), y = Number(junction?.y);
    if (!id || !Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1e3 || y < 0 || y > 1e3) {
      errors.push("Every junction requires a unique ID and coordinates inside 0..1000.");
      continue;
    }
    if (junctionMap.has(id)) errors.push(`Duplicate junction ID ${id}.`);
    junctionMap.set(id, { id, x, y });
  }
  const rawLoop = Array.isArray(rawData?.exteriorLoop) ? rawData.exteriorLoop.map(String) : [];
  const exteriorLoop = rawLoop.length > 1 && rawLoop[0] === rawLoop[rawLoop.length - 1] ? rawLoop.slice(0, -1) : rawLoop;
  if (exteriorLoop.length < 3) errors.push("Exterior loop requires at least three junctions.");
  if (new Set(exteriorLoop).size !== exteriorLoop.length) errors.push("Exterior loop must not repeat junction IDs.");
  for (const id of exteriorLoop) if (!junctionMap.has(id)) errors.push(`Exterior loop references missing junction ${id}.`);
  const walls = Array.isArray(rawData?.walls) ? rawData.walls : [];
  const wallMap = /* @__PURE__ */ new Map();
  const wallEdges = /* @__PURE__ */ new Set();
  for (const wall of walls) {
    const id = String(wall?.id || "").trim();
    const start = String(wall?.startJunctionId || "");
    const end = String(wall?.endJunctionId || "");
    if (!id || !junctionMap.has(start) || !junctionMap.has(end) || start === end) {
      errors.push("Every wall requires a unique ID and two different existing junction references.");
      continue;
    }
    if (wallMap.has(id)) errors.push(`Duplicate wall ID ${id}.`);
    const key = edgeKey3(start, end);
    if (wallEdges.has(key)) errors.push(`Duplicate wall edge ${start}-${end}.`);
    const curveType = String(wall.curveType || "line").toLowerCase();
    if (curveType !== "line") {
      const centerX = Number(wall.centerX), centerY = Number(wall.centerY);
      const radiusX = Number(wall.radiusX ?? wall.radius), radiusY = Number(wall.radiusY ?? wall.radius);
      if (!Number.isFinite(centerX) || !Number.isFinite(centerY) || centerX < 0 || centerX > 1e3 || centerY < 0 || centerY > 1e3 || !Number.isFinite(radiusX) || radiusX <= 0 || !Number.isFinite(radiusY) || radiusY <= 0 || !Number.isFinite(Number(wall.startAngle)) || !Number.isFinite(Number(wall.endAngle))) {
        errors.push(`Curved wall ${id} requires complete center, radius, and angle metadata.`);
      }
    }
    wallMap.set(id, wall);
    wallEdges.add(key);
  }
  for (let index = 0; index < exteriorLoop.length; index += 1) {
    const a = exteriorLoop[index];
    const b = exteriorLoop[(index + 1) % exteriorLoop.length];
    const matches = walls.filter((wall) => edgeKey3(String(wall.startJunctionId), String(wall.endJunctionId)) === edgeKey3(a, b) && /exterior|outer/i.test(String(wall.type || "")));
    if (matches.length !== 1) errors.push(`Exterior edge ${a}-${b} must have exactly one exterior wall.`);
  }
  if (exteriorLoop.every((id) => junctionMap.has(id))) {
    for (let aIndex = 0; aIndex < exteriorLoop.length; aIndex += 1) {
      const aNext = (aIndex + 1) % exteriorLoop.length;
      for (let bIndex = aIndex + 1; bIndex < exteriorLoop.length; bIndex += 1) {
        const bNext = (bIndex + 1) % exteriorLoop.length;
        if (aIndex === bIndex || aNext === bIndex || bNext === aIndex) continue;
        if (strictlyIntersects3(
          junctionMap.get(exteriorLoop[aIndex]),
          junctionMap.get(exteriorLoop[aNext]),
          junctionMap.get(exteriorLoop[bIndex]),
          junctionMap.get(exteriorLoop[bNext])
        )) errors.push("Exterior loop self-intersects.");
      }
    }
  }
  const apertures = Array.isArray(rawData?.apertures) ? rawData.apertures : [];
  for (const aperture of apertures) {
    const host = wallMap.get(String(aperture?.hostWallId || ""));
    const offset = Number(aperture?.offset), widthRatio = Number(aperture?.widthRatio);
    if (!host) errors.push("Every aperture must reference an existing host wall.");
    if (!Number.isFinite(offset) || !Number.isFinite(widthRatio) || widthRatio <= 0 || offset < 0 || offset > 1 || offset - widthRatio / 2 < -1e-6 || offset + widthRatio / 2 > 1 + 1e-6) {
      errors.push("Every aperture must be fully contained by its host wall.");
    }
  }
  return {
    valid: errors.length === 0 && walls.length >= exteriorLoop.length && exteriorLoop.length >= 3,
    errors: [...new Set(errors)],
    exteriorJunctionCount: exteriorLoop.length,
    apertureCount: apertures.length
  };
};

// services/text4jBackend.ts
var STRUCTURED3D_BASE_URL = (process.env.STRUCTURED3D_URL || "http://127.0.0.1:5000").replace(/\/$/, "");
var decodeImagePayload = (value) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Text 4.0 J Structured3D conversion requires imageBase64.");
  }
  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s);
  return {
    mimeType: match?.[1] || "image/png",
    bytes: Buffer.from(match?.[2] || value, "base64")
  };
};
var VERTEX_KEY_PATH7 = resolveDefaultVertexKeyPath();
var VERTEX_SCOPE7 = "https://www.googleapis.com/auth/cloud-platform";
var cachedVertexAuth7;
var cachedVertexClientPromise7;
var configureVertexEnvironment7 = () => {
  process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH7;
  process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
  process.env.GOOGLE_CLOUD_PROJECT = "mod-trg-1260712-01";
  process.env.GOOGLE_CLOUD_LOCATION = "us";
};
var getVertexAuth7 = () => {
  if (!fs9.existsSync(VERTEX_KEY_PATH7)) {
    throw new Error(`Service account key not found at ${VERTEX_KEY_PATH7}`);
  }
  configureVertexEnvironment7();
  if (!cachedVertexAuth7) {
    cachedVertexAuth7 = new GoogleAuth8({ keyFile: VERTEX_KEY_PATH7, scopes: VERTEX_SCOPE7 });
  }
  return cachedVertexAuth7;
};
var getVertexClient7 = () => {
  if (!cachedVertexClientPromise7) {
    cachedVertexClientPromise7 = getVertexAuth7().getClient().catch((error) => {
      cachedVertexClientPromise7 = void 0;
      throw error;
    });
  }
  return cachedVertexClientPromise7;
};
var warmText4jVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient7();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Failed to warm the Google Cloud access token.");
  return { ready: true, warmupMs: Date.now() - startedAt };
};
var routeText4jApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/text4j/generate") && !url.startsWith("/api/text4j/image") && !url.startsWith("/api/text4j/master-geometry") && !url.startsWith("/api/text4j/auth/warm") && !url.startsWith("/api/text4j/structured3d/convert")) {
    response.status(404).json({ error: "Unknown Text4j endpoint." });
    return true;
  }
  try {
    if (url.startsWith("/api/text4j/structured3d/convert")) {
      const { mimeType, bytes } = decodeImagePayload(request.body?.imageBase64);
      const form = new FormData();
      form.append("file", new Blob([bytes], { type: mimeType }), `text4j-source.${mimeType.split("/")[1] || "png"}`);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3e4);
      try {
        const structuredResponse = await fetch(`${STRUCTURED3D_BASE_URL}/api/convert/archai-candidates`, {
          method: "POST",
          body: form,
          signal: controller.signal
        });
        const contentType = structuredResponse.headers.get("content-type") || "";
        const payload = contentType.includes("application/json") ? await structuredResponse.json() : void 0;
        if (!structuredResponse.ok) {
          const routeHint = structuredResponse.status === 404 ? " The running Structured3D service has not loaded the Text 4.0 J candidate API; restart that service on port 5000." : "";
          response.status(structuredResponse.status).json({
            success: false,
            error: payload?.error || `Structured3D candidate API returned HTTP ${structuredResponse.status}.${routeHint}`
          });
          return true;
        }
        response.status(structuredResponse.status).json(payload);
      } finally {
        clearTimeout(timeout);
      }
      return true;
    }
    getVertexAuth7();
    if (url.startsWith("/api/text4j/auth/warm")) {
      const result = await warmText4jVertexAuth();
      console.log(`[Text 4.0 J] Vertex auth ready in ${result.warmupMs}ms`);
      response.json(result);
      return true;
    }
    if (url.startsWith("/api/text4j/image")) {
      try {
        const imageRequestStartedAt = Date.now();
        const { prompt: prompt2, imageModel } = request.body || {};
        const authStartedAt = Date.now();
        await getVertexClient7();
        const authMs = Date.now() - authStartedAt;
        const vertexStartedAt = Date.now();
        const selectedModel = imageModel || "gemini-3.1-flash-lite-image";
        let base64Data;
        if (selectedModel === "imagen-3.0-generate-001" || selectedModel === "imagen-3.0-fast-generate-001" || selectedModel === "imagen-3.0-generate-002") {
          const candidateModels = selectedModel.startsWith("imagen-3.0-generate") ? ["imagen-3.0-generate-002", "imagen-3.0-generate-001"] : ["imagen-3.0-fast-generate-001", "imagen-3.0-fast-generate-002"];
          const candidateLocations = ["us-central1", "us", "us-east4"];
          let lastErr;
          for (const loc of candidateLocations) {
            for (const mod of candidateModels) {
              try {
                console.log(`[Text 4.0 J] Attempting Imagen model ${mod} in location ${loc}...`);
                const imagenAi = new GoogleGenAI8({
                  project: "mod-trg-1260712-01",
                  location: loc,
                  vertexai: true
                });
                const imagenRes = await imagenAi.models.generateImages({
                  model: mod,
                  prompt: prompt2,
                  config: {
                    numberOfImages: 1,
                    aspectRatio: "1:1",
                    outputMimeType: "image/jpeg"
                  }
                });
                const img = imagenRes.generatedImages?.[0];
                base64Data = img?.image?.imageBytes;
                if (base64Data) {
                  console.log(`[Text 4.0 J] Successfully generated image with ${mod} in ${loc}`);
                  break;
                }
              } catch (e) {
                lastErr = e;
                console.warn(`[Text 4.0 J] Imagen model ${mod} in location ${loc} failed:`, e.message || e);
              }
            }
            if (base64Data) break;
          }
          if (!base64Data) {
            throw lastErr || new Error(`No image data returned from ${selectedModel}.`);
          }
        } else {
          const imageAi = new GoogleGenAI8({
            project: "mod-trg-1260712-01",
            location: "global",
            vertexai: true
          });
          const data = await imageAi.models.generateContent({
            model: "gemini-3.1-flash-lite-image",
            contents: [{ role: "user", parts: [{ text: prompt2 }] }],
            config: {
              systemInstruction: TEXT4J_IMAGE_GEOMETRY_SYSTEM_INSTRUCTION,
              ...TEXT4J_LOW_LATENCY_GENERATION_CONFIG,
              responseModalities: [...TEXT4J_LOW_LATENCY_GENERATION_CONFIG.responseModalities]
            }
          });
          const imagePart = data.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
          base64Data = imagePart?.inlineData?.data;
          if (!base64Data) {
            throw new Error("No image data returned from Gemini.");
          }
        }
        const vertexMs = Date.now() - vertexStartedAt;
        const generationMs = Date.now() - imageRequestStartedAt;
        console.log(`[Text 4.0 J] Vertex image proxy completed in ${generationMs}ms (model: ${selectedModel}, auth ${authMs}ms, model ${vertexMs}ms)`);
        response.json({ imageBytes: base64Data, generationMs, authMs, vertexMs });
      } catch (err) {
        console.error("Proxy Image Error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    if (url.startsWith("/api/text4j/master-geometry")) {
      try {
        const transcriptionStartedAt = Date.now();
        const { imageBytes, mimeType = "image/jpeg", prompt: prompt2, thinkingLevel = "minimal" } = request.body || {};
        if (!imageBytes || !prompt2) {
          response.status(400).json({ error: "Text 4.0 J master geometry requires imageBytes and prompt." });
          return true;
        }
        const authStartedAt = Date.now();
        await getVertexClient7();
        const authMs = Date.now() - authStartedAt;
        const ai2 = new GoogleGenAI8({
          project: "mod-trg-1260712-01",
          location: "global",
          vertexai: true,
          httpOptions: { apiVersion: "v1beta1" }
        });
        const coordinate = { type: Type4.NUMBER, minimum: 0, maximum: 1e3 };
        const MASTER_FLOORPLAN_SCHEMA = {
          type: Type4.OBJECT,
          properties: {
            coordinateSpace: { type: Type4.STRING, enum: ["normalized_0_1000"] },
            junctions: {
              type: Type4.ARRAY,
              minItems: 3,
              items: {
                type: Type4.OBJECT,
                properties: {
                  id: { type: Type4.STRING },
                  x: coordinate,
                  y: coordinate
                },
                required: ["id", "x", "y"]
              }
            },
            exteriorLoop: {
              type: Type4.ARRAY,
              minItems: 3,
              items: { type: Type4.STRING }
            },
            walls: {
              type: Type4.ARRAY,
              minItems: 3,
              items: {
                type: Type4.OBJECT,
                properties: {
                  id: { type: Type4.STRING },
                  startJunctionId: { type: Type4.STRING },
                  endJunctionId: { type: Type4.STRING },
                  type: { type: Type4.STRING, enum: ["exterior", "interior", "partition", "glass"] },
                  curveType: { type: Type4.STRING, enum: ["line", "arc", "circle", "ellipse"] },
                  centerX: coordinate,
                  centerY: coordinate,
                  radius: { type: Type4.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  radiusX: { type: Type4.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  radiusY: { type: Type4.NUMBER, minimum: 1e-6, maximum: 1e3 },
                  rotation: { type: Type4.NUMBER },
                  startAngle: { type: Type4.NUMBER },
                  endAngle: { type: Type4.NUMBER },
                  counterclockwise: { type: Type4.BOOLEAN },
                  confidence: { type: Type4.NUMBER, minimum: 0, maximum: 1 }
                },
                required: ["id", "startJunctionId", "endJunctionId", "type", "curveType"]
              }
            },
            apertures: {
              type: Type4.ARRAY,
              items: {
                type: Type4.OBJECT,
                properties: {
                  id: { type: Type4.STRING },
                  hostWallId: { type: Type4.STRING },
                  offset: { type: Type4.NUMBER, minimum: 0, maximum: 1 },
                  widthRatio: { type: Type4.NUMBER, minimum: 1e-6, maximum: 1 },
                  kind: { type: Type4.STRING, enum: ["door", "window", "opening", "unknown"] },
                  subtype: { type: Type4.STRING, enum: ["single", "double", "sliding", "folding", "glass", "standard", "bay", "full-height", "unknown"] },
                  hingeSide: { type: Type4.STRING, enum: ["left", "right", "unknown"] },
                  swingDirection: { type: Type4.STRING, enum: ["inward", "outward", "unknown"] },
                  confidence: { type: Type4.NUMBER, minimum: 0, maximum: 1 }
                },
                required: ["id", "hostWallId", "offset", "widthRatio", "kind"]
              }
            }
          },
          required: ["coordinateSpace", "junctions", "exteriorLoop", "walls", "apertures"]
        };
        const masterModel = "gemini-3.5-flash-lite";
        const normalizedThinkingLevel = String(thinkingLevel).toLowerCase();
        const masterThinkingLevel = {
          minimal: ThinkingLevel3.MINIMAL,
          low: ThinkingLevel3.LOW,
          medium: ThinkingLevel3.MEDIUM,
          high: ThinkingLevel3.HIGH
        }[normalizedThinkingLevel] || ThinkingLevel3.MINIMAL;
        const appliedThinkingLevel = ["minimal", "low", "medium", "high"].includes(normalizedThinkingLevel) ? normalizedThinkingLevel : "minimal";
        const requestModel = async () => {
          const modelStartedAt = Date.now();
          const genResponse2 = await ai2.models.generateContent({
            model: masterModel,
            contents: [{
              role: "user",
              parts: [
                { text: prompt2 },
                { inlineData: { data: imageBytes, mimeType } }
              ]
            }],
            config: {
              mediaResolution: MediaResolution3.MEDIA_RESOLUTION_HIGH,
              thinkingConfig: {
                thinkingLevel: masterThinkingLevel,
                includeThoughts: false
              },
              responseMimeType: "application/json",
              responseSchema: MASTER_FLOORPLAN_SCHEMA
            }
          });
          if (!genResponse2.text) throw new Error(`No master floorplan data returned from ${masterModel}.`);
          return { geometry: JSON.parse(genResponse2.text), modelMs: Date.now() - modelStartedAt, model: masterModel };
        };
        const result = await requestModel();
        const validation = validateText4jMasterFloorplanGraph(result.geometry);
        const totalModelMs = result.modelMs;
        const geometry = result.geometry;
        const transcriptionMs = Date.now() - transcriptionStartedAt;
        console.log(`[Text 4.0 J] Master geometry graph completed in ${transcriptionMs}ms (auth ${authMs}ms, model ${totalModelMs}ms, ${result.model}, valid ${validation.valid})`);
        response.json({ geometry, transcriptionMs, authMs, modelMs: totalModelMs, model: result.model, thinkingLevel: appliedThinkingLevel, validation });
      } catch (err) {
        console.error("[Text 4.0 J] Master floorplan data error:", err);
        response.status(500).json({ error: err.message });
      }
      return true;
    }
    const ai = new GoogleGenAI8({
      project: "mod-trg-1260712-01",
      location: "us",
      vertexai: true
    });
    const { designSummary, boundaryPoints } = request.body || {};
    const systemInstruction = `
YOU ARE A FINE-TUNED ARCHITECTURAL DESIGN ENGINE.

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
- **WET AREAS**: Group Kitchen/Bath if possible (Wet-over-Wet for multi-floor).

=============================
3. MANDATORY ELEMENTS
=============================
- **Slabs**: Generate 'floor' slabs for each room/zone.
- **Strictly Architectural**: Do NOT place furniture (beds, sofas, tables) or fixtures (toilets, sinks). Only walls, doors, windows, stairs, and slabs.

=============================
4. OUTPUT
=============================
- Valid JSON matching schema.
- Use 'levelIndex' (0, 1..) for multi-story.
`;
    let boundaryContext = "Generate an optimal building footprint.";
    if (boundaryPoints && boundaryPoints.length > 2) {
      const coords = boundaryPoints.map((p) => `[${p.x.toFixed(2)}, ${p.y.toFixed(2)}]`).join(", ");
      boundaryContext = `FIXED BOUNDARY (Must stay strictly inside): [${coords}]`;
    }
    const prompt = `
Design Brief: "${designSummary}"
Boundary Context: ${boundaryContext}

Execute full architectural reasoning using the fine-tuned dataset parameters.
Follow strict scale (Meters).
If brief implies 1 floor, NO stairs.
Do NOT include furniture.
`;
    const modelName = "projects/738349838690/locations/us/endpoints/8469159836758573056";
    console.log(`[Text4j] Sending generation request to Vertex AI model: ${modelName}...`);
    const { SHARED_SCHEMA: SHARED_SCHEMA2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
    const genResponse = await ai.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: SHARED_SCHEMA2
      }
    });
    if (!genResponse.text) {
      throw new Error("No response returned from Vertex AI model.");
    }
    const parsedData = JSON.parse(genResponse.text);
    response.json(parsedData);
    return true;
  } catch (err) {
    console.error("[Text4j] Error querying model:", err);
    response.status(500).json({
      error: err instanceof Error ? err.message : String(err)
    });
    return true;
  }
};

// services/aiRender/jobStore.ts
var COLLECTION = "aiRenderJobs";
var JOB_TTL_MS = 6 * 60 * 60 * 1e3;
var SWEEP_BATCH = 10;
var INLINE_DATA_URL_LIMIT = 512;
var DATA_URL = /^data:([^;,]+);base64,([\s\S]*)$/;
var isDurableJobStoreEnabled = () => {
  if (!process.env.VERCEL && process.env.AI_RENDER_DURABLE_JOBS !== "1") return false;
  try {
    return hasAdminCredentials();
  } catch {
    return false;
  }
};
var extensionFor = (mimeType) => mimeType === "video/mp4" ? "mp4" : mimeType === "model/gltf-binary" ? "glb" : mimeType === "image/jpeg" ? "jpg" : "png";
var stripHeavyValues = (value, depth = 0) => {
  if (typeof value === "string") return value.length > INLINE_DATA_URL_LIMIT && value.startsWith("data:") ? "" : value;
  if (Array.isArray(value)) return depth > 6 ? [] : value.map((entry) => stripHeavyValues(entry, depth + 1));
  if (value && typeof value === "object") {
    if (depth > 6) return {};
    const out = {};
    for (const [key, entry] of Object.entries(value)) {
      const cleaned = stripHeavyValues(entry, depth + 1);
      if (cleaned !== void 0) out[key] = cleaned;
    }
    return out;
  }
  return value === void 0 ? null : value;
};
var putJob = async (job) => {
  if (!isDurableJobStoreEnabled() || !job?.jobId) return;
  try {
    const bucket = getAdminStorageBucket();
    const outputs = [];
    for (const [index, output] of (job.outputs || []).entries()) {
      const match = typeof output?.signed_url === "string" ? DATA_URL.exec(output.signed_url) : null;
      if (!match) {
        outputs.push({ ...output, storagePath: null });
        continue;
      }
      const [, mimeType, base64] = match;
      const path3 = `${COLLECTION}/${job.jobId}/out_${index}.${extensionFor(mimeType)}`;
      await bucket.file(path3).save(Buffer.from(base64, "base64"), { contentType: mimeType, resumable: false });
      outputs.push({ ...output, signed_url: "", storagePath: path3, storageMimeType: mimeType });
    }
    await getAdminFirestore().collection(COLLECTION).doc(job.jobId).set({
      ...stripHeavyValues({ ...job, outputs: void 0 }),
      outputs,
      storedAt: Date.now()
    });
  } catch (error) {
    console.warn(`[AI-Render] Could not store job ${job.jobId}:`, error?.message || error);
  }
};
var getStoredJob = async (jobId) => {
  if (!isDurableJobStoreEnabled()) return null;
  try {
    const snap = await getAdminFirestore().collection(COLLECTION).doc(jobId).get();
    if (!snap.exists) return null;
    const job = snap.data();
    const bucket = getAdminStorageBucket();
    job.outputs = await Promise.all((job.outputs || []).map(async (output) => {
      if (!output?.storagePath) return output;
      try {
        const [buffer] = await bucket.file(output.storagePath).download();
        const mimeType = output.storageMimeType || "image/png";
        return { ...output, signed_url: `data:${mimeType};base64,${buffer.toString("base64")}` };
      } catch {
        return output;
      }
    }));
    return job;
  } catch (error) {
    console.warn(`[AI-Render] Could not read stored job ${jobId}:`, error?.message || error);
    return null;
  }
};
var sweepExpiredJobs = async () => {
  if (!isDurableJobStoreEnabled()) return;
  try {
    const cutoff = Date.now() - JOB_TTL_MS;
    const stale = await getAdminFirestore().collection(COLLECTION).where("storedAt", "<", cutoff).limit(SWEEP_BATCH).get();
    if (stale.empty) return;
    const bucket = getAdminStorageBucket();
    for (const doc of stale.docs) {
      await bucket.deleteFiles({ prefix: `${COLLECTION}/${doc.id}/` }).catch(() => void 0);
      await doc.ref.delete().catch(() => void 0);
    }
  } catch (error) {
    console.warn("[AI-Render] Could not clear old jobs:", error?.message || error);
  }
};

// services/aiRender/backend.ts
import { GoogleAuth as GoogleAuth10 } from "google-auth-library";
import fs11 from "fs";

// services/aiRender/workflowRegistry.ts
var RAW_WORKFLOWS = {
  1: {
    id: 1,
    slug: "text-to-render",
    name: "Text to Render",
    description: "Create photorealistic renders from text prompts or reference images.",
    input_types: ["text", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "TASK: Create a photorealistic architectural visualization.\nPROJECT: {{project_type}}\nSCENE: {{space_type}}\nDESIGN DIRECTION: {{architectural_style}} {{interior_style}}\nDESIGN DESCRIPTION: {{design_intent}}\nMATERIAL PALETTE: {{materials}}\nCOLOR PALETTE: {{colors}}\nFURNITURE: {{furniture}}\nLIGHTING: {{lighting}}\nTIME OF DAY: {{time_of_day}}\nCAMERA: {{camera_angle}} {{lens}} {{composition}}\nENVIRONMENT: {{location_context}} {{landscape}}\nPEOPLE: {{people}}\nMOOD: {{mood}}\nUSER REQUIREMENTS: {{custom_instruction}}\n{{UNIVERSAL_QUALITY_BLOCK}}\nDo not create warped architecture, distorted furniture, floating objects, random text, logos or watermarks.",
    required_fields: ["user_input"],
    optional_fields: ["style", "materials", "colors", "camera_angle", "lighting", "mood", "people", "landscape", "custom_instruction"],
    default_values: {},
    estimated_time: "10-35 sec (Pro) / 4-12 sec (Flash)",
    async: false,
    manual_test_criteria: "Pass when: Prompt adherence >= 4/5, Photorealism >= 4/5, Architectural plausibility >= 4/5, Material realism >= 4/5, Composition/camera quality >= 4/5, No major AI artifacts.",
    prompt_version: "text_to_render:v1"
  },
  2: {
    id: 2,
    slug: "sketch-to-render",
    name: "Sketch to Render",
    description: "Convert architectural sketches into photorealistic renders.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "controlnet_gpu",
    default_model: "flux-2-pro",
    allowed_models: ["flux-2-pro", "stable-diffusion-xl"],
    model_dropdown: true,
    prompt_template: "TASK: Convert the supplied architectural sketch into a photorealistic architectural visualization.\nSTRUCTURAL PRIORITY: Treat sketch lines as authoritative design geometry. Preserve: building massing, roof form, major edges, fa\xE7ade divisions, openings, doors, windows, floor levels, primary perspective.\nDESIGN STYLE: {{style}}\nMATERIALS: {{materials}}\nDESIGN DETAILS: {{design_intent}}\nENVIRONMENT: {{environment}}\nLANDSCAPE: {{landscape}}\nLIGHTING: {{lighting}}\nMaintain the perspective implied by the source sketch.\nUSER REQUIREMENTS: {{custom_instruction}}\n{{UNIVERSAL_QUALITY_BLOCK}}",
    required_fields: ["source_image"],
    optional_fields: ["style", "materials", "lighting", "environment", "landscape", "custom_instruction"],
    default_values: { controlnet_type: "scribble", controlnet_conditioning_scale: 0.8 },
    estimated_time: "15-45 sec (Warm) / 45-120 sec (Cold)",
    async: true,
    manual_test_criteria: "Sketch geometry preservation >= 4/5, Window/door correspondence >= 90% visually, Perspective preservation >= 4/5, Photorealism >= 4/5, Material adherence >= 4/5, No major added/removed structural elements.",
    prompt_version: "sketch_to_render:v1"
  },
  3: {
    id: 3,
    slug: "elevation-to-render",
    name: "Elevation to Render",
    description: "Convert architectural elevations into realistic fa\xE7ade renders.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "controlnet_gpu",
    default_model: "stable-diffusion-xl",
    allowed_models: ["stable-diffusion-xl"],
    model_dropdown: false,
    prompt_template: "TASK: Convert the supplied architectural elevation into a realistic architectural fa\xE7ade visualization.\nELEVATION AUTHORITY: Preserve fa\xE7ade proportions, floor heights, roofline, windows, doors, balconies and structural grid. Do not reposition architectural openings.\nMATERIALS: {{materials}}\nSTYLE: {{architectural_style}}\nGLAZING: {{glazing}}\nLANDSCAPE: {{landscape}}\nLIGHTING: {{lighting}}\nENVIRONMENT: {{environment}}\nUSER REQUIREMENTS: {{custom_instruction}}\nCreate realistic fa\xE7ade depth, material joints, glazing reflections and recess shadows while maintaining source geometry.",
    required_fields: ["source_image"],
    optional_fields: ["materials", "architectural_style", "glazing", "landscape", "lighting", "environment", "custom_instruction"],
    default_values: { controlnet_type: "lineart", controlnet_conditioning_scale: 0.9 },
    estimated_time: "20-60 sec (Warm) / 60-120 sec (Cold)",
    async: true,
    manual_test_criteria: "Opening location match >= 95%, Floor-height/massing match >= 4/5, Fa\xE7ade material quality >= 4/5, No unrequested geometry change, Overall photorealism >= 4/5.",
    prompt_version: "elevation_to_render:v1"
  },
  4: {
    id: 4,
    slug: "three-d-model-to-render",
    name: "3D Model to Render",
    description: "Convert 3D model views into photorealistic renders.",
    input_types: ["image/png"],
    // expects depth pass image
    output_types: ["image/png"],
    provider: "controlnet_gpu",
    default_model: "stable-diffusion-xl",
    allowed_models: ["stable-diffusion-xl"],
    model_dropdown: false,
    prompt_template: "TASK: Transform the supplied depth/geometry reference into a photorealistic architectural rendering.\nGEOMETRY AUTHORITY: Preserve scene geometry, massing, camera, floor levels and primary openings.\nSTYLE: {{style}}\nMATERIALS: {{materials}}\nFURNITURE: {{furniture}}\nLANDSCAPE: {{landscape}}\nLIGHTING: {{lighting}}\nATMOSPHERE: {{mood}}\nUSER REQUIREMENTS: {{custom_instruction}}\nApply physically believable materials and lighting while respecting supplied geometry.",
    required_fields: ["source_image"],
    // depth pass input
    optional_fields: ["style", "materials", "furniture", "landscape", "lighting", "mood", "custom_instruction"],
    default_values: { controlnet_type: "depth", controlnet_conditioning_scale: 0.75 },
    estimated_time: "20-60 sec (Warm) / 60-120 sec (Cold)",
    async: true,
    manual_test_criteria: "3D silhouette preservation >= 95%, Camera match >= 4/5, Depth/occlusion correctness >= 4/5, Materials >= 4/5, Photorealism >= 4/5, No major geometry hallucination.",
    prompt_version: "3d_model_to_render:v1"
  },
  5: {
    id: 5,
    slug: "image-to-render",
    name: "Image to Render",
    description: "Transform an existing image into a photorealistic architectural render.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3.1-flash-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "TASK: Transform the supplied image into a professional photorealistic architectural visualization.\n{{SOURCE_IMAGE_AUTHORITY}}\nImprove: materials, lighting, textures, reflections, shadows, atmospheric depth, photographic finish.\nTARGET STYLE: {{style}}\nMATERIAL CHANGES: {{materials}}\nLIGHTING: {{lighting}}\nREQUESTED CHANGES: {{requested_changes}}\nUSER REQUIREMENTS: {{custom_instruction}}\n{{UNIVERSAL_QUALITY_BLOCK}}",
    required_fields: ["source_image"],
    optional_fields: ["style", "materials", "lighting", "requested_changes", "custom_instruction"],
    default_values: {},
    estimated_time: "6-18 sec (Recommended)",
    async: false,
    manual_test_criteria: "Original geometry preservation >= 4/5, Camera preservation >= 4/5, Visual-quality improvement clearly noticeable, Prompt adherence >= 4/5, No unrelated redesign, Photorealism >= 4/5.",
    prompt_version: "image_to_render:v1"
  },
  6: {
    id: 6,
    slug: "floor-plan-to-render",
    name: "Floor Plan to Render",
    description: "Convert a floor plan into a rendered/furnished visualization.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "controlnet_gpu",
    default_model: "flux-2-pro",
    allowed_models: ["flux-2-pro", "stable-diffusion-xl"],
    model_dropdown: false,
    prompt_template: "TASK: Convert the supplied architectural floor plan into a furnished top-down architectural visualization.\nPLAN AUTHORITY: Preserve external walls, internal partitions, doors, windows, room boundaries, circulation and relative room proportions.\nROOM FUNCTIONS: {{room_labels}}\nSTYLE: {{style}}\nFLOOR MATERIALS: {{floor_materials}}\nFURNITURE: {{furniture}}\nCOLORS: {{colors}}\nUSER REQUIREMENTS: {{custom_instruction}}\nProduce a clean orthographic top-down visualization.",
    required_fields: ["source_image"],
    optional_fields: ["room_labels", "style", "floor_materials", "furniture", "colors", "custom_instruction"],
    default_values: { controlnet_type: "segment", controlnet_conditioning_scale: 0.8 },
    estimated_time: "30-90 sec (Warm) / 60-150 sec (Cold)",
    async: true,
    manual_test_criteria: "Wall layout match >= 95%, Door/window consistency >= 90%, Room-function correctness >= 90%, Furniture scale/circulation >= 4/5, No major plan alteration, Rendering quality >= 4/5.",
    prompt_version: "floorplan_to_render:v1"
  },
  7: {
    id: 7,
    slug: "render-to-moodboard",
    name: "Render to Moodboard",
    description: "Extract the design language of a render and create a moodboard.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    // returns the composed moodboard / swatches
    provider: "gemini_analysis",
    // uses Stage 1: gemini-2.5-flash -> Stage 2: gemini-3.1-flash-image
    default_model: "gemini-2.5-flash",
    allowed_models: ["gemini-2.5-flash"],
    model_dropdown: false,
    prompt_template: "Analyze the supplied architectural render. Return structured JSON containing: design style, primary color hex codes, woods, stones, metals, fabrics, flooring, wall finishes, furniture style, lighting style, decorative elements, design keywords.",
    required_fields: ["source_image"],
    optional_fields: [],
    default_values: {},
    estimated_time: "30-90 sec (requires swatch generation)",
    async: true,
    manual_test_criteria: "Extracted palette resemblance >= 4/5, Material identification accuracy >= 4/5, Swatches visually correspond to source >= 4/5, Moodboard design coherence >= 4/5, No unrelated style invention.",
    prompt_version: "render_to_moodboard:v1"
  },
  8: {
    id: 8,
    slug: "render-variation",
    name: "Render Variation",
    description: "Generate alternative design variations of an existing render.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3.1-flash-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "TASK: Create a design variation of the supplied architectural render.\nSTRUCTURAL LOCK: Preserve camera, perspective, architecture, openings and spatial layout.\nCHANGE ONLY: {{variation_scope}}\nTARGET STYLE: {{style}}\nMATERIALS: {{materials}}\nCOLORS: {{colors}}\nFURNITURE: {{furniture}}\nUSER REQUIREMENTS: {{custom_instruction}}\nTHE OUTPUT MUST REMAIN RECOGNIZABLY THE SAME PROJECT FROM THE SAME VIEWPOINT.",
    required_fields: ["source_image"],
    optional_fields: ["variation_scope", "style", "materials", "colors", "furniture", "custom_instruction"],
    default_values: {},
    estimated_time: "6-18 sec",
    async: false,
    manual_test_criteria: "Same-project recognition >= 4/5, Camera preservation >= 4/5, Requested variation clearly visible, Unrequested changes minimal, Overall quality >= 4/5.",
    prompt_version: "render_variation:v1"
  },
  9: {
    id: 9,
    slug: "edit-canvas",
    name: "Edit Canvas",
    description: "Select areas and make localized AI edits.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "TASK: Edit only the selected target region.\nREQUESTED EDIT: {{edit_instruction}}\nRestrict modification to the selected target. Preserve everything unrelated to the request. Match the existing scale, perspective, lighting, shadows, reflections and photographic character. Do not redesign surrounding areas.",
    required_fields: ["source_image", "mask"],
    optional_fields: ["edit_instruction"],
    default_values: {},
    estimated_time: "10-35 sec",
    async: false,
    manual_test_criteria: "Edit contained inside intended area >= 4/5, Boundary blending >= 4/5, Requested edit accuracy >= 4/5, Protected-area preservation >= 95%, No visible seams/ghosting.",
    prompt_version: "edit_canvas:v1"
  },
  10: {
    id: 10,
    slug: "conversational-edit",
    name: "Conversational Edit",
    description: "Edit an image through natural-language conversation.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "You are an architectural image-editing engine. Each instruction modifies the current image state. For localized requests: modify only relevant objects, preserve architecture, preserve camera, preserve unrelated elements, maintain realistic scale and lighting, preserve previous accepted edits unless explicitly reversed.",
    required_fields: ["source_image", "user_input"],
    optional_fields: ["conversation_history"],
    default_values: {},
    estimated_time: "15-45 sec",
    async: false,
    manual_test_criteria: "Target-object identification >= 90%, Turn-to-turn edit memory >= 4/5, Previous accepted edits preserved, Locality of changes >= 4/5, Final realism >= 4/5.",
    prompt_version: "conversational_edit:v1"
  },
  11: {
    id: 11,
    slug: "select-and-modify",
    name: "Select and Modify",
    description: "Select a specific object/surface and modify it.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "TARGET: {{identified_object}}\nREQUESTED MODIFICATION: {{modification}}\nModify only the selected object. Preserve its position and physically appropriate scale unless requested otherwise. Match perspective, lighting, shadows and reflections. Everything outside the target should remain unchanged.",
    required_fields: ["source_image", "mask"],
    optional_fields: ["identified_object", "modification"],
    default_values: {},
    estimated_time: "10-35 sec",
    async: false,
    manual_test_criteria: "Correct selected object >= 95%, Edit spill outside target minimal, Requested change >= 4/5, Lighting integration >= 4/5, Scene preservation >= 4/5.",
    prompt_version: "select_and_modify:v1"
  },
  12: {
    id: 12,
    slug: "annotate-image",
    name: "Annotate Image",
    description: "Add structured architectural/design annotations.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["text/json"],
    provider: "gemini_analysis",
    default_model: "gemini-2.5-flash",
    allowed_models: ["gemini-2.5-flash"],
    model_dropdown: false,
    prompt_template: "Identify significant architectural/interior-design elements. For each object return: id category label description bounding box confidence. Use normalized bounding boxes: [ymin, xmin, ymax, xmax]. Return valid JSON only.",
    required_fields: ["source_image"],
    optional_fields: [],
    default_values: {},
    estimated_time: "2-8 sec",
    async: false,
    manual_test_criteria: "Object identification precision >= 90%, Bounding-box placement visually correct >= 90%, Labels meaningful >= 4/5, No hallucinated major objects, Frontend annotations align with image.",
    prompt_version: "annotate_image:v1"
  },
  13: {
    id: 13,
    slug: "remove-object",
    name: "Remove Object",
    description: "Remove a selected object and reconstruct its background.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Remove only: {{target_object}}\nReconstruct the hidden background in a physically plausible way. Continue surrounding wall, floor, ceiling, materials, architecture, lighting and reflections. The result should appear as if the object never existed. Do not add a replacement object. Do not modify unrelated scene elements.",
    required_fields: ["source_image", "mask"],
    optional_fields: ["target_object"],
    default_values: {},
    estimated_time: "10-35 sec",
    async: false,
    manual_test_criteria: "Object fully removed, No ghosting, Background reconstruction >= 4/5, Material continuation >= 4/5, Protected scene unchanged >= 4/5.",
    prompt_version: "remove_object:v1"
  },
  14: {
    id: 14,
    slug: "extend-image",
    name: "Extend Image",
    description: "Expand a render beyond its existing boundaries.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Extend the supplied image to {{target_aspect_ratio}}. Keep original image content unchanged. Generate only the additional surroundings required outside the original boundaries. Continue architecture, flooring, ceiling, landscape, sky, perspective, material patterns, lighting and shadows naturally. USER REQUIREMENTS: {{custom_instruction}}",
    required_fields: ["source_image"],
    optional_fields: ["target_aspect_ratio", "custom_instruction"],
    default_values: {},
    estimated_time: "12-50 sec",
    async: false,
    manual_test_criteria: "Original pixels/composition visually preserved, Extension seam invisible, Perspective continuation >= 4/5, Architectural plausibility >= 4/5, Lighting continuity >= 4/5.",
    prompt_version: "extend_image:v1"
  },
  15: {
    id: 15,
    slug: "virtual-staging",
    name: "Virtual Staging",
    description: "Furnish and decorate an empty room.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3.1-flash-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "TASK: Virtually stage the supplied empty room.\nROOM AUTHORITY: Do not alter room dimensions, walls, windows, doors, ceiling, permanent architecture or camera.\nROOM TYPE: {{room_type}}\nSTYLE: {{style}}\nFURNITURE: {{furniture}}\nMATERIALS: {{materials}}\nCOLORS: {{colors}}\nMOOD: {{mood}}\nUse realistic furniture scale and circulation. Do not obstruct doors. Furniture must contact the floor naturally and cast plausible shadows.\n{{UNIVERSAL_QUALITY_BLOCK}}",
    required_fields: ["source_image"],
    optional_fields: ["room_type", "style", "furniture", "materials", "colors", "mood"],
    default_values: {},
    estimated_time: "8-25 sec",
    async: false,
    manual_test_criteria: "Room architecture preservation >= 95%, Furniture scale >= 4/5, Interior-design quality >= 4/5, Circulation plausibility >= 4/5, Lighting/shadow integration >= 4/5.",
    prompt_version: "virtual_staging:v1"
  },
  16: {
    id: 16,
    slug: "image-adjustments",
    name: "Image Adjustments",
    description: "Adjust brightness, contrast, saturation and related image properties.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "local_adjustment",
    default_model: "pillow-opencv",
    allowed_models: ["pillow-opencv"],
    model_dropdown: false,
    prompt_template: "",
    required_fields: ["source_image"],
    optional_fields: ["brightness", "contrast", "saturation", "temperature", "tint", "exposure", "highlights", "shadows", "sharpness", "gamma"],
    default_values: { brightness: 0, contrast: 0, saturation: 0, temperature: 0, tint: 0, exposure: 0, highlights: 0, shadows: 0, sharpness: 0, gamma: 1 },
    estimated_time: "< 1 sec",
    async: false,
    manual_test_criteria: "Slider response deterministic, No geometry/content changes, Reset returns original image.",
    prompt_version: "image_adjustments:v1"
  },
  17: {
    id: 17,
    slug: "fix-people",
    name: "Fix People",
    description: "Correct distorted or unnatural people.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Correct the selected person's visible anatomical/generation problems. Correct: hands, fingers, limbs, face, body proportions, posture, clothing geometry, floor/furniture contact. Preserve approximate position, pose, scale, activity and surrounding architecture. Match lighting, shadows, depth of field and color temperature. Do not alter unrelated people or architecture.",
    required_fields: ["source_image", "mask"],
    optional_fields: [],
    default_values: {},
    estimated_time: "10-35 sec",
    async: false,
    manual_test_criteria: "Anatomy >= 4/5, Hands/face improved, Original position preserved, Architecture unchanged, Lighting integration >= 4/5.",
    prompt_version: "fix_people:v1"
  },
  18: {
    id: 18,
    slug: "populate-render",
    name: "Populate Render",
    description: "Add realistic people to architectural scenes.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3.1-flash-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Add realistic people to the supplied architectural visualization. NUMBER: {{people_count}}\nDESCRIPTION: {{people_description}}\nACTIVITY: {{activity}}\nPLACEMENT: {{placement}}\nPeople must have believable physical scale, respect perspective, contact actual surfaces, match lighting and cast plausible shadows. Do not alter architecture, furniture or camera.",
    required_fields: ["source_image"],
    optional_fields: ["people_count", "people_description", "activity", "placement"],
    default_values: { people_count: 2 },
    estimated_time: "8-25 sec",
    async: false,
    manual_test_criteria: "Human realism >= 4/5, Scale/perspective >= 4/5, Lighting integration >= 4/5, Architecture unchanged, No duplicate/distorted people.",
    prompt_version: "populate_render:v1"
  },
  19: {
    id: 19,
    slug: "change-camera-angle",
    name: "Change Camera Angle",
    description: "Create an approximate alternate viewpoint.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["video/mp4"],
    provider: "veo_video",
    default_model: "veo-3.1-lite",
    allowed_models: ["veo-3.1-lite"],
    model_dropdown: false,
    prompt_template: "A smooth architectural camera movement approximately {{angle_change}} to the {{direction}}. Maintain the same architecture, materials, furniture and lighting. Use stable professional architectural cinematography. No moving walls. No shifting windows. No moving furniture. No geometry morphing. End on a clean, stable architectural composition suitable for extraction as a still frame.",
    required_fields: ["source_image", "angle_change", "direction"],
    optional_fields: [],
    default_values: { audio: false, duration_seconds: 4 },
    estimated_time: "1-5 min",
    async: true,
    manual_test_criteria: "New viewpoint visibly changed, Project identity >= 4/5, Major geometry consistency >= 4/5, No visible object morphing, Final extracted frame sharp/stable.",
    prompt_version: "change_camera_angle:v1"
  },
  20: {
    id: 20,
    slug: "style-transfer",
    name: "Style Transfer",
    description: "Transfer the visual style of one image to another.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "IMAGE 1 defines architecture, geometry, layout and camera. IMAGE 2 defines aesthetic style. Transfer from Image 2: materials, colors, furniture aesthetic, decorative language, lighting mood, visual atmosphere. Preserve from Image 1: architecture, geometry, spatial layout, perspective, structural openings. Do not copy unrelated geometry from Image 2.",
    required_fields: ["source_image", "style_reference_image"],
    optional_fields: [],
    default_values: {},
    estimated_time: "10-35 sec",
    async: false,
    manual_test_criteria: "Style resemblance >= 4/5, Base architecture preservation >= 4/5, No reference-geometry leakage, Material/color transfer >= 4/5, Photorealism >= 4/5.",
    prompt_version: "style_transfer:v1"
  },
  21: {
    id: 21,
    slug: "change-material",
    name: "Change Material",
    description: "Change the material of a selected surface.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Change only the material of: {{target_surface}}\nNEW MATERIAL: {{new_material}}\nColor: {{color}}\nTexture: {{texture}}\nFinish: {{finish}}\nRoughness: {{roughness}}\nPattern/veining: {{pattern}}\nJoints/grout: {{joints}}\nUse physically appropriate texture scale. Preserve exact surface geometry and all unrelated elements.",
    required_fields: ["source_image", "mask", "target_surface", "new_material"],
    optional_fields: ["color", "texture", "finish", "roughness", "pattern", "joints"],
    default_values: {},
    estimated_time: "10-35 sec",
    async: false,
    manual_test_criteria: "Only selected surface changes, Material identity >= 4/5, Texture scale >= 4/5, Lighting/reflection response >= 4/5, Geometry unchanged.",
    prompt_version: "change_material:v1"
  },
  22: {
    id: 22,
    slug: "change-season",
    name: "Change Season",
    description: "Transform the environmental season.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3.1-flash-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Transform the supplied exterior visualization into {{target_season}}. Preserve building geometry, camera, permanent materials and hardscape. Update vegetation, ground condition, atmospheric color, sky and environmental lighting appropriately. Seasonal effects must be physically plausible. Do not redesign architecture.",
    required_fields: ["source_image", "target_season"],
    optional_fields: ["mood"],
    default_values: {},
    estimated_time: "6-20 sec",
    async: false,
    manual_test_criteria: "Season clearly recognizable, Architecture preservation >= 95%, Vegetation consistency >= 4/5, Weather/ground consistency >= 4/5, No unrealistic seasonal artifacts.",
    prompt_version: "change_season:v1"
  },
  23: {
    id: 23,
    slug: "change-time-of-day",
    name: "Change Time of Day",
    description: "Change the scene's lighting/time.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3.1-flash-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Change scene illumination to {{target_time_of_day}}. Preserve architecture, geometry, materials, landscape, objects and camera.\nLIGHTING: {{lighting_description}}\nSUN: {{sun_direction}}\nINTERIOR LIGHTING: {{interior_lighting}}\nUpdate shadows, glazing reflections and color temperature consistently. Do not modify the design itself.",
    required_fields: ["source_image", "target_time_of_day"],
    optional_fields: ["lighting_description", "sun_direction", "interior_lighting"],
    default_values: {},
    estimated_time: "6-20 sec",
    async: false,
    manual_test_criteria: "Target time visually convincing >= 4/5, Shadow direction consistency >= 4/5, Architecture unchanged, Window/reflection behavior >= 4/5, No excessive color grading.",
    prompt_version: "change_time_of_day:v1"
  },
  24: {
    id: 24,
    slug: "change-weather",
    name: "Change Weather",
    description: "Change weather and atmospheric conditions.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3.1-flash-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Change only environmental weather conditions to {{target_weather}}. Preserve architecture, geometry, materials, camera, landscape design and objects.\nWEATHER: {{weather_description}}\nATMOSPHERE: {{atmosphere}}\nGROUND: {{ground_condition}}\nSKY: {{sky}}\nLIGHT: {{lighting}}\nApply physically plausible wetness, reflection, fog, snow or diffused light as appropriate. Do not redesign architecture.",
    required_fields: ["source_image", "target_weather"],
    optional_fields: ["weather_description", "atmosphere", "ground_condition", "sky", "lighting"],
    default_values: {},
    estimated_time: "6-20 sec",
    async: false,
    manual_test_criteria: "Weather clearly recognizable, Physical effects coherent >= 4/5, Architecture unchanged >= 95%, Reflections/wetness/snow realistic >= 4/5, No excessive artificial effects.",
    prompt_version: "change_weather:v1"
  },
  25: {
    id: 25,
    slug: "design-to-maquette",
    name: "Design to Maquette",
    description: "Convert a design into a physical architectural-model aesthetic.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image"],
    model_dropdown: true,
    prompt_template: "Convert the supplied architectural design into a professionally photographed physical architectural maquette. Preserve recognizable massing, proportions and primary geometry. Materials may include: white museum board, balsa wood, basswood, translucent acrylic, subtle grey card. Place the model on a clean architectural model base. Use professional studio tabletop photography and model-scale shadows. The result must clearly read as a physical scale model rather than a full-size real building.",
    required_fields: ["source_image"],
    optional_fields: ["maquette_material", "style"],
    default_values: {},
    estimated_time: "10-35 sec",
    async: false,
    manual_test_criteria: "Original massing recognizability >= 4/5, Clearly reads as physical model >= 4/5, Model material realism >= 4/5, Scale cues convincing, No major geometry change.",
    prompt_version: "design_to_maquette:v1"
  },
  26: {
    id: 26,
    slug: "upscale-and-enhance",
    name: "Upscale & Enhance",
    description: "Increase apparent detail/resolution of a render.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image"],
    model_dropdown: false,
    prompt_template: "Enhance the supplied architectural render to high-resolution professional presentation quality. Preserve exactly: composition, geometry, architecture, camera, objects, materials, colors, lighting. Improve only: micro-detail, texture clarity, edge quality, material definition, subtle reflections, fine architectural details, natural photographic sharpness. Do not hallucinate new design elements. Do not oversharpen.",
    required_fields: ["source_image"],
    optional_fields: ["upscale_factor"],
    default_values: { upscale_factor: "4x" },
    estimated_time: "15-50 sec",
    async: false,
    manual_test_criteria: "Output resolution increased, Fine-detail improvement >= 4/5, No hallucinated architecture, No material redesign, No oversharpening, Original composition preserved.",
    prompt_version: "upscale_and_enhance:v1"
  },
  27: {
    id: 27,
    slug: "upscale-video",
    name: "Upscale Video",
    description: "Increase video resolution.",
    input_types: ["video/mp4"],
    output_types: ["video/mp4"],
    provider: "veo_video",
    default_model: "veo-3.1-lite",
    allowed_models: ["veo-3.1-lite"],
    model_dropdown: false,
    prompt_template: "",
    required_fields: ["source_video"],
    optional_fields: ["target_resolution"],
    default_values: { target_resolution: "1080p" },
    estimated_time: "1-10 min",
    async: true,
    manual_test_criteria: "Resolution visibly improved, Video duration unchanged, No introduced geometry distortion, No flicker increase, Motion remains smooth, Audio preserved.",
    prompt_version: "upscale_video:v1"
  },
  28: {
    id: 28,
    slug: "image-to-video",
    name: "Image to Video",
    description: "Animate a static render into cinematic video.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["video/mp4"],
    provider: "veo_video",
    default_model: "veo-3.1-lite",
    allowed_models: ["veo-3.1-lite"],
    model_dropdown: false,
    prompt_template: "Create professional architectural cinematography beginning from the supplied image. Maintain architecture, furniture, materials, landscape and project identity. CAMERA MOVEMENT: {{camera_motion}}\nSPEED: {{speed}}\nSHOT TYPE: {{shot_type}}\nUse smooth stabilized professional motion. Maintain consistent architectural geometry and object identity. Avoid geometry morphing, moving walls, moving furniture, camera shake and sudden zoom. Use natural parallax and smooth acceleration/deceleration.",
    required_fields: ["source_image", "camera_motion"],
    optional_fields: ["speed", "shot_type", "audio", "duration_seconds", "resolution"],
    default_values: { duration_seconds: 4, resolution: "720p", audio: false },
    estimated_time: "1-5 min",
    async: true,
    manual_test_criteria: "Camera movement matches request >= 4/5, Architecture stable >= 4/5, No object morphing, Motion smooth >= 4/5, Source identity maintained, Video valid.",
    prompt_version: "image_to_video:v1"
  },
  29: {
    id: 29,
    slug: "image-to-3d-model",
    name: "Image to 3D Model",
    description: "Convert an object image into a reusable textured 3D asset.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["model/gltf-binary"],
    provider: "trellis_3d",
    default_model: "TRELLIS.2-4B",
    allowed_models: ["TRELLIS.2-4B"],
    model_dropdown: false,
    prompt_template: "",
    required_fields: ["source_image"],
    optional_fields: [],
    default_values: { task: "image_to_3d" },
    estimated_time: "2-6 min",
    async: true,
    manual_test_criteria: "Rotate result 360 deg: Silhouette match >= 4/5, Proportions >= 4/5, Texture correspondence >= 4/5, Back/side plausible, No severe holes, GLB imports correctly.",
    prompt_version: "image_to_3d_model:v1"
  },
  30: {
    id: 30,
    slug: "image-to-scene",
    name: "Image to Scene",
    description: "Convert room imagery into an explorable scene.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"],
    output_types: ["application/octet-stream"],
    provider: "trellis_3d",
    default_model: "TRELLIS.2-4B",
    allowed_models: ["TRELLIS.2-4B", "GSplat"],
    model_dropdown: true,
    prompt_template: "",
    required_fields: ["source_image"],
    optional_fields: [],
    default_values: { task: "generate_scene", format: "splat" },
    estimated_time: "3-10 min",
    async: true,
    manual_test_criteria: "Scene opens successfully, Navigation stable, Primary room proportions >= 4/5, Major furniture placement >= 4/5, No severe floating geometry, No catastrophic holes.",
    prompt_version: "image_to_scene:v1"
  },
  31: {
    id: 31,
    slug: "reference-guided",
    name: "Reference Guided",
    description: "This workflow creates architectural or interior renders using design drawings and visual references. The drawing guides the core design\u2014layout, geometry, proportions, openings, and key spatial details\u2014while reference images guide the style, materials, lighting, colors, and overall mood. Users can also add a text prompt for specific instructions. The final render should stay faithful to the design while adopting the desired visual character from the references.",
    input_types: ["image/png", "image/jpeg", "image/webp", "image/heic", "image/heif", "text"],
    output_types: ["image/png"],
    provider: "vertex_image",
    default_model: "gemini-3-pro-image",
    allowed_models: ["gemini-3-pro-image", "gemini-3.1-flash-image", "gemini-3.1-flash-lite-image", "flux-2-pro", "stable-diffusion-xl"],
    model_dropdown: true,
    prompt_template: "TASK: Create a photorealistic architectural visualization using dual-channel drawing and reference guidance.\nDRAWING AUTHORITY: The attached design drawing strictly dictates the spatial layout, architectural geometry, wall partitions, openings, window placement, and core structural proportions.\nREFERENCE GUIDANCE: Extract and synthesize material textures, lighting conditions, atmosphere, color palette, and visual style from the attached reference images.\nDESIGN STYLE: {{style}}\nMATERIALS: {{materials}}\nLIGHTING: {{lighting}}\nENVIRONMENT: {{environment}}\nUSER INSTRUCTIONS: {{custom_instruction}}\n{{UNIVERSAL_QUALITY_BLOCK}}",
    required_fields: ["drawing_image"],
    optional_fields: ["reference_images", "user_input", "style", "materials", "lighting", "environment", "mood", "custom_instruction"],
    default_values: { controlnet_conditioning_scale: 0.85 },
    estimated_time: "10-35 sec (Pro) / 4-12 sec (Flash)",
    async: false,
    manual_test_criteria: "Core design drawing layout and openings preserved >= 95%, Reference style/material fidelity transferred >= 4/5, Photorealism >= 4/5, Cohesive architectural lighting and perspective synthesis.",
    prompt_version: "reference_guided:v1"
  }
};
var HUB_MAPPING = {
  1: "image_studio",
  2: "image_studio",
  3: "image_studio",
  4: "image_studio",
  5: "image_studio",
  6: "image_studio",
  7: "raster_canvas",
  8: "image_studio",
  9: "raster_canvas",
  10: "image_studio",
  11: "raster_canvas",
  12: "raster_canvas",
  13: "raster_canvas",
  14: "raster_canvas",
  15: "raster_canvas",
  16: "raster_canvas",
  17: "raster_canvas",
  18: "raster_canvas",
  19: "video_studio",
  20: "image_studio",
  21: "raster_canvas",
  22: "image_studio",
  23: "image_studio",
  24: "image_studio",
  25: "image_studio",
  26: "image_studio",
  27: "video_studio",
  28: "video_studio",
  29: "gen_3d",
  30: "gen_3d",
  31: "image_studio"
};
var WORKFLOWS = Object.fromEntries(
  Object.entries(RAW_WORKFLOWS).map(([idStr, wf]) => {
    const id = Number(idStr);
    return [id, { ...wf, hubCategory: HUB_MAPPING[id] || "image_studio" }];
  })
);

// services/aiRender/modelPricingRegistry.ts
var PRICING_METADATA = {
  pricing_version: "2026-08-08",
  effective_date: "2026-08-08",
  currency: "USD",
  gpu_zonal_redundancy: false,
  // Set to true if zonal redundancy is verified
  video_upscale_price_config: "pending project SKU"
};
var GOOGLE_IMAGE_PRO_INPUT_1M = 2;
var GOOGLE_IMAGE_PRO_IMAGE_TOKENS = 560;
var GOOGLE_IMAGE_FLASH_INPUT_1M = 0.5;
var GOOGLE_IMAGE_FLASH_IMAGE_TOKENS = 1120;
var GOOGLE_IMAGE_LITE_INPUT_1M = 0.25;
var GOOGLE_IMAGE_LITE_IMAGE_TOKENS = 1120;
var GPU_NON_ZONAL_RATE = 3947e-7;
var GPU_ZONAL_RATE = 4989e-7;
var WorkflowCostEstimator = class {
  static calculate(workflowId, modelName, options = {}) {
    const inputImages = options.input_images_count ?? 1;
    const promptTokens = options.prompt_tokens_estimate ?? 1e3;
    const resolution = options.resolution ?? "2K";
    if (modelName === "gemini-3-pro-image") {
      const inputCost = promptTokens / 1e6 * GOOGLE_IMAGE_PRO_INPUT_1M + inputImages * (GOOGLE_IMAGE_PRO_IMAGE_TOKENS / 1e6) * GOOGLE_IMAGE_PRO_INPUT_1M;
      let outputCost = 0.1344;
      if (resolution === "4K") outputCost = 0.24;
      const timeText = resolution === "4K" ? "15\u201350 seconds" : "10\u201335 seconds";
      return { estimateUsd: parseFloat((inputCost + outputCost).toFixed(4)), durationText: timeText };
    }
    if (modelName === "gemini-3.1-flash-image") {
      const inputCost = promptTokens / 1e6 * GOOGLE_IMAGE_FLASH_INPUT_1M + inputImages * (GOOGLE_IMAGE_FLASH_IMAGE_TOKENS / 1e6) * GOOGLE_IMAGE_FLASH_INPUT_1M;
      let outputCost = 0.1008;
      if (resolution === "512") outputCost = 0.04482;
      else if (resolution === "1K") outputCost = 0.0672;
      else if (resolution === "4K") outputCost = 0.1512;
      let timeText = "6\u201318 seconds";
      if (resolution === "512" || resolution === "1K") timeText = "4\u201312 seconds";
      else if (resolution === "4K") timeText = "10\u201330 seconds";
      return { estimateUsd: parseFloat((inputCost + outputCost).toFixed(4)), durationText: timeText };
    }
    if (modelName === "gemini-3.1-flash-lite-image") {
      const inputCost = promptTokens / 1e6 * GOOGLE_IMAGE_LITE_INPUT_1M + inputImages * (GOOGLE_IMAGE_LITE_IMAGE_TOKENS / 1e6) * GOOGLE_IMAGE_LITE_INPUT_1M;
      const outputCost = 0.0336;
      return { estimateUsd: parseFloat((inputCost + outputCost).toFixed(4)), durationText: "2\u20138 seconds" };
    }
    if (modelName === "flux-2-pro" || modelName === "stable-diffusion-xl" || modelName === "TRELLIS.2-4B" || modelName === "GSplat") {
      const isZonal = PRICING_METADATA.gpu_zonal_redundancy;
      const secRate = isZonal ? GPU_ZONAL_RATE : GPU_NON_ZONAL_RATE;
      let warmSec = 30;
      let coldSec = 90;
      let durationText = "15\u201345 seconds";
      if (workflowId === 29) {
        warmSec = 120;
        coldSec = 300;
        durationText = "2\u20136 minutes";
      } else if (workflowId === 30) {
        warmSec = 180;
        coldSec = 450;
        durationText = "3\u201310 minutes";
      }
      const minCost = secRate * warmSec;
      const maxCost = secRate * coldSec;
      return { estimateUsd: parseFloat(minCost.toFixed(4)), durationText: `${durationText} (Est. cost range: $${minCost.toFixed(3)}-$${maxCost.toFixed(3)})` };
    }
    if (modelName === "veo-3.1-lite") {
      if (workflowId === 27) {
        return { estimateUsd: 0, durationText: "1\u201310 minutes", isPendingSku: true };
      }
      const duration = options.duration_seconds ?? 4;
      const hasAudio = options.audio ?? false;
      const res = options.resolution ?? "720p";
      let ratePerSec = 0.03;
      if (res === "1080p") {
        ratePerSec = hasAudio ? 0.08 : 0.05;
      } else {
        ratePerSec = hasAudio ? 0.05 : 0.03;
      }
      return { estimateUsd: parseFloat((duration * ratePerSec).toFixed(2)), durationText: "1\u20135 minutes" };
    }
    if (modelName === "gemini-2.5-flash") {
      return { estimateUsd: 5e-3, durationText: "2\u20138 seconds" };
    }
    if (modelName === "gemini-2.5-pro") {
      return { estimateUsd: 0.012, durationText: "3\u201312 seconds" };
    }
    return { estimateUsd: 0, durationText: "unknown" };
  }
};
var ActualUsageCostCalculator = class {
  static calculate(modelName, elapsedSec, options = {}) {
    const inputImages = options.input_images_count ?? 1;
    const inputTokens = options.inputTokens ?? 1e3;
    const resolution = options.resolution ?? "2K";
    if (modelName === "gemini-3-pro-image") {
      const inputCost = inputTokens / 1e6 * GOOGLE_IMAGE_PRO_INPUT_1M + inputImages * (GOOGLE_IMAGE_PRO_IMAGE_TOKENS / 1e6) * GOOGLE_IMAGE_PRO_INPUT_1M;
      const outputCost = resolution === "4K" ? 0.24 : 0.1344;
      return parseFloat((inputCost + outputCost).toFixed(5));
    }
    if (modelName === "gemini-3.1-flash-image") {
      const inputCost = inputTokens / 1e6 * GOOGLE_IMAGE_FLASH_INPUT_1M + inputImages * (GOOGLE_IMAGE_FLASH_IMAGE_TOKENS / 1e6) * GOOGLE_IMAGE_FLASH_INPUT_1M;
      let outputCost = 0.1008;
      if (resolution === "512") outputCost = 0.04482;
      else if (resolution === "1K") outputCost = 0.0672;
      else if (resolution === "4K") outputCost = 0.1512;
      return parseFloat((inputCost + outputCost).toFixed(5));
    }
    if (modelName === "gemini-3.1-flash-lite-image") {
      const inputCost = inputTokens / 1e6 * GOOGLE_IMAGE_LITE_INPUT_1M + inputImages * (GOOGLE_IMAGE_LITE_IMAGE_TOKENS / 1e6) * GOOGLE_IMAGE_LITE_INPUT_1M;
      return parseFloat((inputCost + 0.0336).toFixed(5));
    }
    if (modelName === "flux-2-pro" || modelName === "stable-diffusion-xl" || modelName === "TRELLIS.2-4B" || modelName === "GSplat") {
      const isZonal = PRICING_METADATA.gpu_zonal_redundancy;
      const rate = isZonal ? GPU_ZONAL_RATE : GPU_NON_ZONAL_RATE;
      return parseFloat(((elapsedSec + 30) * rate).toFixed(5));
    }
    if (modelName === "veo-3.1-lite") {
      const duration = options.duration_seconds ?? 4;
      const hasAudio = options.audio ?? false;
      const res = options.resolution ?? "720p";
      let ratePerSec = 0.03;
      if (res === "1080p") {
        ratePerSec = hasAudio ? 0.08 : 0.05;
      } else {
        ratePerSec = hasAudio ? 0.05 : 0.03;
      }
      return parseFloat((duration * ratePerSec).toFixed(5));
    }
    return 0;
  }
};

// services/aiRender/promptCompiler.ts
var IMAGE_STYLE_PROMPTS = {
  realistic: "high-end photorealistic architectural photography, realistic materials, balanced exposure, physically accurate lighting",
  artistic_sketch: "artistic hand-drawn architectural sketch, black and white pencil linework, artistic paper texture, clean hand-drawn strokes",
  architectural_drawing: "professional architectural drawing, clean precise ink lines, fine detailing, orthographic or perspective projection sketch, white background",
  oil_painting: "rich impasto oil painting, textured canvas, visible thick brushstrokes, artistic painterly style, classical oil colors",
  watercolor: "soft watercolor painting, bleeding pigments, artistic paper texture, delicate hand-painted washes, light artistic splashes",
  marker_drawing: "marker sketch, vibrant alcohol marker coloring, clean architectural outline, hand-colored architectural rendering",
  charcoal_drawing: "textured charcoal drawing, smudged dark shading, high contrast graphite and carbon strokes, artistic sketch paper",
  retro_comic: "retro comic book style, bold black outlines, halftone dot shading, vintage pop-art colors, stylized graphic illustration",
  illustration: "digital architectural illustration, clean vector shapes, stylized flat shading, modern artistic graphic design",
  dynamic_blur: "architectural rendering with dynamic motion blur, long exposure effects, light trails, sense of speed and movement, blurred figures and cars"
};

// services/aiRender/promptEnhancer.ts
var PromptEnhancerEngine = class {
  /**
   * Builds a clean, direct, 100% faithful Reference-Guided prompt structure
   * that strictly enforces the uploaded Drawing's architectural geometry and
   * the uploaded Reference's visual style, materials, lighting, and finishes.
   */
  static buildReferenceGuidedPrompt(request) {
    const metaList = request.reference_images_metadata || [];
    const drawings = metaList.filter((m) => m.category === "drawing" || !m.category && (m.label?.toLowerCase().includes("drawing") || m.label?.toLowerCase().includes("floorplan") || m.label?.toLowerCase().includes("elevation") || m.label?.toLowerCase().includes("sketch") || m.id === "1"));
    const references = metaList.filter((m) => m.category === "reference" || !drawings.includes(m));
    const drawingPrompts = [];
    if (drawings.length > 0) {
      drawings.forEach((d, i) => {
        const rawType = d.drawingType === "Custom" && d.customDrawingType?.trim() ? d.customDrawingType.trim() : d.drawingType || "Floor Plan";
        let typeName = rawType;
        if (rawType.toLowerCase().includes("floor") || rawType.toLowerCase().includes("plan")) typeName = "Floorplan";
        else if (rawType.toLowerCase().includes("elevation") || rawType.toLowerCase().includes("facade")) typeName = "Elevation";
        else if (rawType.toLowerCase().includes("sketch")) typeName = "Sketch";
        else if (rawType.toLowerCase().includes("3d") || rawType.toLowerCase().includes("model")) typeName = "3D Model Screenshot";
        else if (rawType.toLowerCase().includes("section")) typeName = "Section Drawing";
        const imgLabel = `[Image ${d.id || i + 1}: Design Drawing - ${typeName}]`;
        const notes = d.label?.trim() ? ` [Drawing Notes: ${d.label.trim()}]` : "";
        if (typeName.toLowerCase().includes("floorplan") || typeName.toLowerCase().includes("plan")) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as floorplan of the space. Produce an architectural/interior rendering following 100% of architectural and interior layout details as per the floorplan (exact room partitions, walls, kitchen counters/islands, sinks, appliances, furniture layout, door openings, and window locations). Irrespective of whichever camera angle or perspective view is chosen, the rendered space MUST be of this exact floorplan without altering, moving, or hallucinating any layout geometry.`);
        } else if (typeName.toLowerCase().includes("elevation")) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the elevation drawing of the space. Produce a render following 100% of architectural facade details, vertical proportions, rooflines, and window/door openings as per this elevation.`);
        } else if (typeName.toLowerCase().includes("sketch")) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the architectural sketch. Produce a render following 100% of the architectural design, perspective lines, massing, and spatial geometry as per this sketch.`);
        } else if (typeName.toLowerCase().includes("3d")) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the 3D model screenshot. Produce a render preserving 100% of the 3D spatial geometry, perspective view, and volumetric massing.`);
        } else if (typeName.toLowerCase().includes("section")) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the section drawing. Produce a render following 100% of the vertical ceiling heights, slab thicknesses, and floor levels.`);
        } else {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the architectural drawing. Produce a render following 100% of the architectural structure, geometry, and layout details as per this drawing.`);
        }
      });
    } else {
      drawingPrompts.push(`- Use the image [Image 1: Design Drawing - Floorplan] as floorplan of the space. Produce an architectural render following 100% of the architectural layout, walls, and spatial details as per the floorplan.`);
    }
    const referencePrompts = [];
    if (references.length > 0) {
      references.forEach((r, i) => {
        const imgIndex = r.id || drawings.length + i + 1;
        const aspects = r.referenceAspects && r.referenceAspects.length > 0 ? r.referenceAspects : ["All (Complete Theme & Mood)"];
        let aspectsLabel = "";
        if (aspects.includes("All (Complete Theme & Mood)")) {
          aspectsLabel = "All Theme (Style, Lighting, Materials, Furniture, Landscape)";
        } else {
          aspectsLabel = aspects.map((a) => a.split(" ")[0]).join(", ");
        }
        const imgLabel = `[Image ${imgIndex}: Visual Reference - ${aspectsLabel}]`;
        const notes = r.label?.trim() ? ` [Reference Notes: ${r.label.trim()}]` : "";
        if (aspects.includes("All (Complete Theme & Mood)")) {
          referencePrompts.push(`- Use the image ${imgLabel}${notes} as visual reference for style, lighting, and materials of all elements (ceiling, walls, flooring, cabinetry finishes, furniture, fixtures, lighting ambiance, and outdoor environment if any). 100% faithfully replicate this exact visual theme, color palette, and material finishes across the space.`);
        } else {
          const detailDirectives = [];
          if (aspects.includes("Visual Style & Theme")) detailDirectives.push("visual design style, aesthetic identity, and color palette");
          if (aspects.includes("Materials & Textures")) detailDirectives.push("materials and surface finishes of all elements (wood, stone, metal, fabrics, ceiling, walls, flooring)");
          if (aspects.includes("Lighting & Atmosphere")) detailDirectives.push("lighting conditions, color temperature, shadow softness, and ambient illumination");
          if (aspects.includes("Furniture & Decor")) detailDirectives.push("furniture style, cabinetry design, and decor elements");
          if (aspects.includes("Environment & Landscape")) detailDirectives.push("outdoor landscape, vegetation, and contextual surroundings");
          referencePrompts.push(`- Use the image ${imgLabel}${notes} as visual reference for ${detailDirectives.join("; ")}. 100% faithfully extract and apply these elements to the space.`);
        }
      });
    } else {
      referencePrompts.push(`- Use the attached visual reference image(s) as visual reference for style, lighting, and materials of all elements.`);
    }
    let userDirective = "";
    const cleanInput = (request.user_input || "").trim();
    if (cleanInput && cleanInput.toLowerCase() !== "reference guided" && cleanInput.toLowerCase() !== "reference-guided") {
      userDirective = `

USER SPECIFIC INSTRUCTIONS:
${cleanInput}`;
    }
    return `TASK: Produce a professional architectural rendering by strictly synthesizing the attached Design Drawing and Visual Reference:

1. ARCHITECTURAL LAYOUT & GEOMETRY (Drawing Authority):
${drawingPrompts.join("\n")}

2. VISUAL STYLE, MATERIALS & LIGHTING (Reference Authority):
${referencePrompts.join("\n")}

3. SYNTHESIS MANDATE:
The Design Drawing 100% dictates the spatial layout, walls, and geometry. The Visual Reference 100% dictates the visual style, materials, lighting, and finishes. Produce a single cohesive, high-end architectural photograph matching both with 100% fidelity.${userDirective}

VISUAL QUALITY: High-end architectural photography, 8k crisp details, physically accurate light bounces and contact shadows, balanced natural exposure, no distortion.`;
  }
  /**
   * Fast rule-based contextual prompt generator for offline or instant local fallback.
   * Features a Universal Dynamic Fallback Engine: If a prompt is out-of-syllabus (e.g. beach, mountain,
   * cave, space, fantasy environment), it NEVER injects hardcoded assumptions or unrelated furniture.
   * It produces a 100% safe, contextually true, non-presumptive structured prompt.
   */
  static enhanceOffline(request) {
    const workflow = WORKFLOWS[request.workflow_id] || WORKFLOWS[1];
    if (workflow.slug === "reference-guided") {
      return this.buildReferenceGuidedPrompt(request);
    }
    const input = (request.user_input || "").trim();
    const lower = input.toLowerCase();
    const styleKey = request.image_style || "realistic";
    const styleDesc = IMAGE_STYLE_PROMPTS[styleKey] || IMAGE_STYLE_PROMPTS["realistic"];
    let userDetectedStyle = null;
    let styleMaterialsOverride = null;
    let styleFurnitureOverride = null;
    if (lower.includes("classical") || lower.includes("neoclassical") || lower.includes("traditional") || lower.includes("victorian") || lower.includes("baroque") || lower.includes("georgian")) {
      userDetectedStyle = "classical architectural style featuring intricate wainscoting, crown moldings, wall sconces, and refined period craftsmanship";
      styleMaterialsOverride = "honed calacatta marble, carved mahogany wood paneling, ornate ceiling plasterwork, gilded bronze fixtures, rich velvet textiles";
      styleFurnitureOverride = "carved wooden console, tufted Chesterfield seating, antique brass hardware, upholstered wingback armchairs";
    } else if (lower.includes("industrial") || lower.includes("urban loft") || lower.includes("raw concrete") || lower.includes("exposed brick")) {
      userDetectedStyle = "industrial architectural style with exposed structural steel, raw concrete finishes, and utilitarian open-plan aesthetics";
      styleMaterialsOverride = "board-formed raw concrete, exposed steel I-beams, reclaimed red brickwork, polished concrete floors, matte black metal framing";
      styleFurnitureOverride = "steel-frame industrial desks, distressed leather sofas, factory-pendant lighting, reclaimed wood shelving";
    } else if (lower.includes("japandi") || lower.includes("wabi-sabi") || lower.includes("zen") || lower.includes("japanese minimal")) {
      userDetectedStyle = "japandi architectural style fusing Scandinavian functionality with minimalist Japanese wabi-sabi organic harmony";
      styleMaterialsOverride = "pale white oak, micro-cement plaster walls, natural unbleached linen, paper lantern diffusers, woven tatami textures";
      styleFurnitureOverride = "low-profile solid wood seating, minimal slatted wood divider screens, handcrafted ceramic vessels, organic wool rugs";
    } else if (lower.includes("scandinavian") || lower.includes("nordic") || lower.includes("hygge")) {
      userDetectedStyle = "scandinavian architectural style characterized by light wood tones, functional minimalism, and daylight optimization";
      styleMaterialsOverride = "light ash wood flooring, white painted brick, wool upholstery, matte brass, sheer linen curtains";
      styleFurnitureOverride = "minimalist Scandinavian lounge chairs, light wood dining table, subtle geometric pendant lights";
    } else if (lower.includes("mid-century") || lower.includes("mcm") || lower.includes("retro modern")) {
      userDetectedStyle = "mid-century modern architectural style featuring organic geometric shapes, rich timber veneers, and seamless integration";
      styleMaterialsOverride = "rich teak veneer, terrazzo tile flooring, accent brickwork, brushed brass, warm walnut paneling";
      styleFurnitureOverride = "iconic molded plywood lounge chairs, tapered wooden legs, sunburst wall sconces, retro credenza";
    } else if (lower.includes("brutalist") || lower.includes("monolithic") || lower.includes("beton brut")) {
      userDetectedStyle = "brutalist architectural style celebrating monolithic concrete geometry, bold architectural volumes, and raw material mass";
      styleMaterialsOverride = "heavy board-formed exposed concrete, raw slate stone, darkened steel plates, unvarnished timber accents";
      styleFurnitureOverride = "monolithic concrete seating benches, blocky geometric upholstered seating, recessed wall niches";
    } else if (lower.includes("art deco") || lower.includes("glam") || lower.includes("luxury deco")) {
      userDetectedStyle = "art deco architectural style featuring bold geometric motifs, luxurious polished metallic accents, and high-contrast elegance";
      styleMaterialsOverride = "high-gloss ebony timber, polished brass inlay, fluted glass panels, nero marquina marble, velvet upholstery";
      styleFurnitureOverride = "curved velvet plush sofas, geometric mirrored consoles, brass sunburst chandeliers, chevron inlay accent tables";
    } else if (lower.includes("biophilic") || lower.includes("organic architecture") || lower.includes("green building")) {
      userDetectedStyle = "biophilic organic architectural style integrating living natural foliage, fluid organic curves, and daylight immersion";
      styleMaterialsOverride = "living plant walls, rammed earth surfaces, curved bamboo, natural river stone pavers, triple-glazed glass";
      styleFurnitureOverride = "curved organic seating, rattan loungers, integrated planter benches, natural timber slab tables";
    } else if (lower.includes("high-tech") || lower.includes("parametric") || lower.includes("futuristic")) {
      userDetectedStyle = "high-tech parametric architectural style featuring fluid curved geometry, smart lighting integration, and advanced structural glazing";
      styleMaterialsOverride = "white composite solid surfaces, curved structural glass, anodized aluminum panels, LED cove illumination";
      styleFurnitureOverride = "sculptural fluid lounge pods, integrated smart touch consoles, ergonomic floating desks";
    } else if (lower.includes("rustic") || lower.includes("farmhouse") || lower.includes("country house")) {
      userDetectedStyle = "rustic farmhouse architectural style with exposed timber trusses, tactile natural stone, and warm artisanal elements";
      styleMaterialsOverride = "hand-hewn wooden ceiling beams, fieldstone masonry, lime-washed plaster, forged iron hardware";
      styleFurnitureOverride = "reclaimed wood trestle dining table, woven rush chairs, wrought iron chandelier, slipcovered sofas";
    } else if (lower.includes("mediterranean") || lower.includes("spanish villa") || lower.includes("tuscan")) {
      userDetectedStyle = "mediterranean villa architectural style with whitewashed stucco walls, terracotta tile flooring, and graceful arched openings";
      styleMaterialsOverride = "terracotta floor tiles, hand-painted ceramic tiles, wrought iron railings, lime plaster walls, exposed dark timber beams";
      styleFurnitureOverride = "carved wood benches, wrought iron outdoor tables, linen-draped daybeds, rustic timber sideboard";
    } else if (lower.includes("minimalist") || lower.includes("ultra-minimal") || lower.includes("clean lines")) {
      userDetectedStyle = "ultra-minimalist architectural style focusing on pure geometric form, hidden joinery, and shadow gaps";
      styleMaterialsOverride = "seamless micro-cement flooring, matte white wall surfaces, flush trimless doors, hidden architectural light slots";
      styleFurnitureOverride = "recessed flush cabinetry, low-profile linear seating, minimal monolithic tables";
    }
    let detectedSpace = "";
    if (lower.includes("bird's eye") || lower.includes("birds eye") || lower.includes("aerial") || lower.includes("drone view") || lower.includes("top down") || lower.includes("top-down")) {
      detectedSpace = "Bird's Eye Aerial View & Spatial Perspective";
    } else if (lower.includes("bathroom") || lower.includes("bath") || lower.includes("ensuite") || lower.includes("powder room") || lower.includes("washroom") || lower.includes("spa")) {
      detectedSpace = "Luxury Bathroom & Spa Enclosure";
    } else if (lower.includes("pool") || lower.includes("swimming pool") || lower.includes("infinity pool") || lower.includes("jacuzzi")) {
      detectedSpace = "Outdoor Swimming Pool & Sun Deck";
    } else if (lower.includes("living room") || lower.includes("living area") || lower.includes("salon") || lower.includes("lounge")) {
      detectedSpace = "Living Room & Social Lounge";
    } else if (lower.includes("kitchen") || lower.includes("culinary") || lower.includes("kitchenette") || lower.includes("pantry")) {
      detectedSpace = "Modern Kitchen & Island Dining";
    } else if (lower.includes("bedroom") || lower.includes("master bed") || lower.includes("guest room") || lower.includes("suite")) {
      detectedSpace = "Master Bedroom Suite";
    } else if (lower.includes("dining") || lower.includes("dining room") || lower.includes("banquet")) {
      detectedSpace = "Dining Room & Entertaining Area";
    } else if (lower.includes("terrace") || lower.includes("patio") || lower.includes("deck") || lower.includes("balcony") || lower.includes("veranda")) {
      detectedSpace = "Outdoor Terrace & Lounge Deck";
    } else if (lower.includes("facade") || lower.includes("fa\xE7ade") || lower.includes("exterior") || lower.includes("front elevation")) {
      detectedSpace = "Exterior Architectural Facade & Main Elevation";
    } else if (lower.includes("lobby") || lower.includes("reception") || lower.includes("foyer") || lower.includes("entrance hall") || lower.includes("entryway")) {
      detectedSpace = "Grand Entryway & Reception Foyer";
    } else if (lower.includes("courtyard") || lower.includes("atrium") || lower.includes("garden courtyard")) {
      detectedSpace = "Central Landscaped Courtyard & Atrium";
    } else if (lower.includes("office") || lower.includes("workspace") || lower.includes("conference") || lower.includes("study")) {
      detectedSpace = "Executive Office & Workspace";
    } else if (lower.includes("garden") || lower.includes("lawn") || lower.includes("backyard") || lower.includes("landscape")) {
      detectedSpace = "Manicured Landscape Garden & Grounds";
    }
    const isInteriorLike = lower.includes("inside") || lower.includes("interior") || lower.includes("room") || lower.includes("hall") || lower.includes("bath") || lower.includes("kitchen") || lower.includes("bedroom") || lower.includes("office") || lower.includes("cave");
    const isExteriorLike = lower.includes("exterior") || lower.includes("facade") || lower.includes("fa\xE7ade") || lower.includes("building") || lower.includes("tower") || lower.includes("stadium") || lower.includes("outside");
    const isNatureLike = lower.includes("beach") || lower.includes("mountain") || lower.includes("forest") || lower.includes("landscape") || lower.includes("park") || lower.includes("sea") || lower.includes("river") || lower.includes("canyon") || lower.includes("desert") || lower.includes("nature") || lower.includes("island");
    const isSpaceLike = lower.includes("space") || lower.includes("orbit") || lower.includes("moon") || lower.includes("planet") || lower.includes("station");
    let project = isSpaceLike ? "Aerospace & Orbital Station" : isNatureLike ? "Landscape & Natural Environment" : isInteriorLike ? "Residential Interior" : isExteriorLike ? "Residential & Commercial Architecture" : "Architectural Visualization Project";
    let scene = input || workflow.name;
    let designDirection = userDetectedStyle || "Contemporary architectural and interior design with refined detailing, clean geometry, and harmonious proportions";
    let materials = styleMaterialsOverride || "Natural oak timber, honed stone, smooth plaster, textured textiles, and brushed metal accents";
    let colors = "Cohesive architectural palette with neutral tones, warm wood accents, and natural textures";
    let furniture = styleFurnitureOverride || "Contextually appropriate architectural furniture with ergonomic proportions and clean joinery";
    let lighting = "Soft natural daylight with balanced exposure and gentle contact shadows";
    let timeOfDay = "Mid-afternoon";
    let environment = "Surrounding natural site context, lush foliage, and open clear sky";
    let mood = "Atmospheric, serene, balanced, and immersive architectural presence";
    if (lower.includes("stadium") || lower.includes("arena") || lower.includes("cricket") || lower.includes("football") || lower.includes("soccer") || lower.includes("sports complex") || lower.includes("athletic") || lower.includes("ballpark") || lower.includes("gymnasium") || lower.includes("colosseum") || lower.includes("grandstand")) {
      project = "Sports & Athletic Venue";
      if (!detectedSpace) detectedSpace = "Cricket Stadium & Playing Field Arena";
      scene = input ? `${input}` : "Modern sports stadium & athletic playing field";
      designDirection = userDetectedStyle || "Modern sports stadium architecture with expansive grandstands and structural canopy";
      furniture = "Stadium grandstand seating, player dugouts, LED perimeter scoreboards, team benches";
      materials = styleMaterialsOverride || "Hybrid grass turf, polished concrete concourses, structural steel roof trusses, high-impact stadium seating modules";
      colors = "Vibrant green turf, neutral concrete greys, bold stadium accent trim";
      environment = "Sports complex precinct, high-mast floodlight towers, open sky";
      mood = "Grand, heroic, atmospheric, monumental athletic presence";
    } else if (lower.includes("high rise") || lower.includes("skyscraper") || lower.includes("tower") || lower.includes("curtain wall") || lower.includes("building exterior") || lower.includes("commercial exterior")) {
      project = "Commercial Architecture";
      if (!detectedSpace) detectedSpace = "High-Rise Architectural Facade & Skyline View";
      scene = input ? `${input}` : "High-rise architectural building facade";
      furniture = "Ground-floor streetscape planters, architectural entrance canopy";
      materials = styleMaterialsOverride || "Unitized high-performance glass curtain wall, anodized aluminum composite panels, architectural louvers, structural steel frame";
      colors = "Reflective silver glass, dark bronze aluminum trim, concrete greys";
      environment = "Vibrant city financial district, urban boulevard with surrounding towers";
      mood = "Monolithic, iconic, prestigious urban presence";
    } else if (lower.includes("urban") || lower.includes("plaza") || lower.includes("masterplan") || lower.includes("master plan") || lower.includes("pedestrian zone") || lower.includes("civic") || lower.includes("streetscape")) {
      project = "Urban Master Plan & Civic Plaza";
      if (!detectedSpace) detectedSpace = "Public Urban Pedestrian Plaza & Gathering Space";
      scene = input ? `${input}` : "Public urban pedestrian plaza & transit hub";
      furniture = "Integrated stone public benches, outdoor cafe seating, street lighting posts, bike racks";
      materials = styleMaterialsOverride || "Granite paving tiles, linear water features, integrated stone seating, public art sculptures, permeable pavers";
      colors = "Cool granite greys, warm timber accents, lush urban greenery";
      environment = "Active city center, pedestrian walkways, surrounding modern mixed-use architecture";
      mood = "Vibrant, public, human-scaled civic experience";
    } else if (lower.includes("lawn") || lower.includes("garden") || lower.includes("landscape") || lower.includes("hardscape") || lower.includes("patio") || lower.includes("pool") || lower.includes("yard") || lower.includes("terrace") || lower.includes("park") || lower.includes("deck") || lower.includes("balcony") || lower.includes("courtyard")) {
      project = "Landscape & Outdoor Architecture";
      if (!detectedSpace) detectedSpace = lower.includes("pool") ? "Outdoor Infinity Pool & Living Deck" : lower.includes("lawn") ? "Landscaped Lawn & Garden" : "Outdoor Living Terrace & Patio";
      scene = input ? `${input}` : lower.includes("lawn") ? "exterior lawn & landscaped garden" : lower.includes("park") ? "public park & landscape gardens" : "outdoor hardscape living terrace";
      furniture = styleFurnitureOverride || "Modern outdoor garden loungers, teak patio seating, outdoor architectural planters, fire pit lounge";
      materials = styleMaterialsOverride || "Lush natural turf, bluestone pavers, natural timber decking, architectural glass, dark metal trim, water features";
      colors = "Deep greens, warm earth tones, cool stone greys";
      environment = "Manicured contemporary landscaping, mature canopy trees, open sky";
      mood = "Serene, expansive, high-end landscape ambiance";
    } else if (lower.includes("restaurant") || lower.includes("cafe") || lower.includes("lounge") || lower.includes("bar") || lower.includes("bistro") || lower.includes("coffee shop")) {
      project = "Commercial Hospitality & Dining";
      if (!detectedSpace) detectedSpace = "Boutique Restaurant Dining Hall & Cocktail Bar";
      scene = input ? `${input}` : "High-end boutique restaurant & lounge";
      furniture = styleFurnitureOverride || "Curated dining banquettes, marble-top tables, upholstered dining armchairs, bar stools";
      materials = styleMaterialsOverride || "Fluted timber bar front, ambient warm LED cove strip lighting, acoustic plaster, polished brass trim, terrazzo floor";
      colors = "Rich warm amber, dark walnut, deep forest green accents";
      environment = "Bustling urban hospitality venue with warm interior atmosphere";
      mood = "Intimate, moody, atmospheric, inviting";
    } else if (lower.includes("commercial office") || lower.includes("corporate") || lower.includes("co-working") || lower.includes("conference room") || lower.includes("headquarters") || lower.includes("tech office")) {
      project = "Corporate & Commercial Office";
      if (!detectedSpace) detectedSpace = "Open-Plan Corporate Office & Executive Lounge";
      scene = input ? `${input}` : "Modern corporate office & open workspace";
      furniture = styleFurnitureOverride || "Ergonomic task desks, modular acoustic lounge pods, executive conference table, breakroom seating";
      materials = styleMaterialsOverride || "Acoustic ceiling baffles, glazed office partitions, polished micro-cement flooring, oak veneer paneling";
      colors = "Clean whites, subtle charcoal, warm timber, corporate blue/green accents";
      environment = "Bright professional office floor with floor-to-ceiling perimeter glazing";
      mood = "Collaborative, focused, innovative, professional";
    } else if (lower.includes("retail") || lower.includes("showroom") || lower.includes("store") || lower.includes("boutique") || lower.includes("mall")) {
      project = "Commercial Retail & Showroom";
      if (!detectedSpace) detectedSpace = "Luxury Retail Boutique & Product Display Space";
      scene = input ? `${input}` : "Luxury retail store & product showroom";
      furniture = styleFurnitureOverride || "Sculptural product display pedestals, customer lounge seating, minimalist cash wrap desk";
      materials = styleMaterialsOverride || "Backlit onyx display walls, polished terrazzo floor, minimalist brass clothing racks, frameless glass display cases";
      colors = "Neutral ivory, warm gold accents, soft greys";
      environment = "High-end shopping district interior";
      mood = "Exclusive, curated, luxurious, pristine";
    } else if (lower.includes("hotel") || lower.includes("reception") || lower.includes("atrium") || lower.includes("resort")) {
      project = "Hospitality & Resort";
      if (!detectedSpace) detectedSpace = "Luxury Hotel Grand Atrium & Reception Lobby";
      scene = input ? `${input}` : "Luxury hotel reception lobby & atrium";
      furniture = styleFurnitureOverride || "Curved reception desk, luxury lounge clusters, architectural side tables, plush accent armchairs";
      materials = styleMaterialsOverride || "Double-height marble feature wall, custom glass chandelier, brass trim, acoustical plaster ceiling";
      colors = "Warm beige, champagne bronze, rich deep navy";
      environment = "Five-star hotel grand atrium with lush indoor landscaping";
      mood = "Grand, welcoming, opulent, serene";
    } else if (lower.includes("museum") || lower.includes("gallery") || lower.includes("library") || lower.includes("auditorium") || lower.includes("cultural") || lower.includes("university") || lower.includes("school") || lower.includes("campus")) {
      project = "Institutional & Cultural Architecture";
      if (!detectedSpace) detectedSpace = "Sculptural Exhibition Gallery & Central Hall";
      scene = input ? `${input}` : "Contemporary art gallery & museum exhibition space";
      furniture = styleFurnitureOverride || "Sculptural display plinths, minimalist bench seating";
      materials = styleMaterialsOverride || "Smooth white museum plaster, polished concrete floors, concealed perimeter lighting slots, acoustic ceiling";
      colors = "Pure architectural white, neutral concrete greys, dark accent framing";
      environment = "Cultural institution precinct";
      mood = "Contemplative, luminous, spacious, serene";
    } else if (lower.includes("villa") || lower.includes("house") || lower.includes("home") || lower.includes("mansion") || lower.includes("apartment") || lower.includes("penthouse") || lower.includes("residence") || lower.includes("residential")) {
      project = "Residential Architecture & Living";
      if (!detectedSpace) detectedSpace = "Contemporary Living Space & Indoor-Outdoor Connection";
    }
    const fullProjectDescriptor = detectedSpace ? `${project} \u2014 ${detectedSpace}` : `${project} \u2014 ${scene}`;
    let finalPeople = "no people, clean unpopulated architectural space";
    if (request.people === "blurred") {
      finalPeople = "subtle architectural motion-blurred figures passing naturally through the space to emphasize human scale";
    } else if (request.people === "realistic") {
      finalPeople = "naturally posed, stylishly dressed people engaged authentically in the environment with realistic interaction";
    }
    let finalCamera = "eye-level architectural one-point perspective with straight vertical lines";
    if (request.camera_angle === "custom" && request.custom_camera?.trim()) {
      finalCamera = request.custom_camera.trim();
    } else if (request.camera_angle === "eye_level") {
      finalCamera = "eye-level straight architectural perspective with perfectly vertical wall lines";
    } else if (request.camera_angle === "low_angle") {
      finalCamera = "low-angle dynamic architectural perspective looking slightly upward to convey monumentality";
    } else if (request.camera_angle === "high_angle") {
      finalCamera = "elevated high-angle overview looking downward across the architectural composition";
    } else if (request.camera_angle === "aerial_birds_eye") {
      finalCamera = "bird's eye aerial drone perspective capturing full site layout, geometry, and contextual landscape";
    } else if (request.camera_angle === "wide_angle") {
      finalCamera = "expansive wide-angle architectural shot (24mm rectilinear lens) with zero barrel distortion";
    } else if (request.camera_angle === "close_up_detail") {
      finalCamera = "shallow depth-of-field close-up detail shot focusing on material junction and craft";
    }
    let finalLighting = lighting;
    if (request.lighting === "custom" && request.custom_lighting?.trim()) {
      finalLighting = request.custom_lighting.trim();
    } else if (request.lighting === "golden_hour") {
      finalLighting = "warm golden-hour late afternoon sunlight with long warm amber shadows and glowing highlights";
      timeOfDay = "Golden hour / late afternoon";
    } else if (request.lighting === "blue_hour") {
      finalLighting = "deep twilight blue-hour ambient illumination with glowing interior warm accent lights";
      timeOfDay = "Blue hour / twilight";
    } else if (request.lighting === "overcast_soft") {
      finalLighting = "soft diffuse northern overcast daylight with gentle shadows and true material colors";
      timeOfDay = "Midday overcast";
    } else if (request.lighting === "bright_sunlight") {
      finalLighting = "crisp direct sunlight with sharp high-contrast shadows and clean highlights";
      timeOfDay = "Midday";
    } else if (request.lighting === "dramatic_night") {
      finalLighting = "dramatic night scene featuring architectural LED uplighting, backlit features, and moody pools of light";
      timeOfDay = "Night";
    } else if (request.lighting === "warm_interior") {
      finalLighting = "warm 2700K ambient interior lighting with layered cove lights, recessed pin spots, and glowing pendants";
      timeOfDay = "Evening";
    } else if (request.lighting === "studio_clean") {
      finalLighting = "high-key clean studio illumination with perfectly balanced softbox fill and zero harsh shadows";
      timeOfDay = "Studio controlled";
    }
    let finalMaterials = materials;
    if (request.materials === "custom" && request.custom_materials?.trim()) {
      finalMaterials = request.custom_materials.trim();
    } else if (request.materials === "warm_wood_stone") {
      finalMaterials = "honed roman travertine stone, quarter-sawn white oak timber, micro-cement plaster, and brushed bronze hardware";
    } else if (request.materials === "concrete_steel") {
      finalMaterials = "smooth board-formed architectural concrete, blackened structural steel, fluted glass, and polished dark slate";
    } else if (request.materials === "marble_brass") {
      finalMaterials = "bookmatched calacatta marble, polished brass inlays, fluted acoustic walnut, and high-gloss lacquer";
    } else if (request.materials === "stucco_terracotta") {
      finalMaterials = "hand-applied lime-wash stucco, artisanal terracotta pavers, natural linen fabrics, and rustic timber beams";
    } else if (request.materials === "glass_aluminum") {
      finalMaterials = "low-iron ultra-clear curtain wall glazing, anodized dark bronze aluminum panels, and architectural mesh";
    }
    let finalEnvironment = environment;
    if (request.environment === "custom" && request.custom_environment?.trim()) {
      finalEnvironment = request.custom_environment.trim();
    } else if (request.environment === "lush_garden") {
      finalEnvironment = "lush manicured garden with mature olive trees, ornamental grasses, architectural shrubs, and soft landscape lighting";
    } else if (request.environment === "urban_city") {
      finalEnvironment = "bustling metropolitan downtown skyline with surrounding architectural towers and paved city sidewalk";
    } else if (request.environment === "coastal_ocean") {
      finalEnvironment = "breathtaking coastal shoreline with calm turquoise ocean water and distant horizon";
    } else if (request.environment === "mountain_forest") {
      finalEnvironment = "serene alpine mountain ridge surrounded by dense pine trees and misty peaks";
    } else if (request.environment === "desert_oasis") {
      finalEnvironment = "tranquil desert landscape with sculptural native cacti, sand dunes, and warm sunset horizon";
    } else if (request.environment === "studio_neutral") {
      finalEnvironment = "minimalist neutral studio cyclorama background";
    }
    let finalMood = mood;
    if (request.mood === "custom" && request.custom_mood?.trim()) {
      finalMood = request.custom_mood.trim();
    } else if (request.mood === "calm_serene") {
      finalMood = "calm, serene, and tranquil architectural sanctuary";
    } else if (request.mood === "grand_dramatic") {
      finalMood = "grand, dramatic, and awe-inspiring architectural monumentality";
    } else if (request.mood === "intimate_cozy") {
      finalMood = "intimate, warm, cozy, and inviting living ambiance";
    } else if (request.mood === "vibrant_energetic") {
      finalMood = "vibrant, energetic, and active public experience";
    } else if (request.mood === "sophisticated_luxurious") {
      finalMood = "sophisticated, refined, and luxurious high-end elegance";
    }
    const qualityBlock = `QUALITY AND REALISM: Create a professional architectural visualization suitable for presentation by a leading architecture, interior-design or real-estate visualization studio. Use physically believable proportions, realistic material response, accurate texture scale, natural reflections, plausible roughness, realistic illumination, contact shadows and balanced exposure. Materials should look physically real rather than synthetic or uniformly smooth. Maintain believable construction logic, furniture scale and human proportions. Lighting must interact consistently with geometry and materials. The output should resemble premium architectural photography or a professional high-end rendering rather than obvious AI artwork. Avoid excessive HDR, artificial sharpening, oversaturation, plastic materials, warped geometry and implausible architectural details.
Do not create warped architecture, distorted furniture, floating objects, random text, logos or watermarks.`;
    const visStyle = `${styleDesc}, ${finalCamera}, high-end editorial publication standard, crisp 8k details, physically accurate light bounces and contact shadows`;
    let referenceImageDirective = "";
    const totalImages = request.reference_images_count || request.reference_images_metadata?.length || (request.has_reference_image ? 1 : 0);
    if (workflow.slug === "reference-guided") {
      const metaList = request.reference_images_metadata || [];
      const drawings = metaList.filter((m) => m.category === "drawing" || !m.category && (m.label?.toLowerCase().includes("drawing") || m.label?.toLowerCase().includes("floorplan") || m.label?.toLowerCase().includes("elevation") || m.label?.toLowerCase().includes("sketch") || m.id === "1"));
      const references = metaList.filter((m) => m.category === "reference" || !drawings.includes(m));
      let drawingDirectives = "";
      if (drawings.length > 0) {
        drawingDirectives = drawings.map((d, i) => {
          const dType = d.drawingType === "Custom" && d.customDrawingType?.trim() ? d.customDrawingType.trim() : d.drawingType || "Floor Plan";
          const dNotes = d.label?.trim() ? ` (Details: ${d.label.trim()})` : "";
          let typeSpecificRule = "";
          const lowerType = dType.toLowerCase();
          if (lowerType.includes("floor") || lowerType.includes("plan")) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (2D ARCHITECTURAL FLOOR PLAN):
  * The generated rendering MUST 100% RELIGIOUSLY and STRICTLY follow the exact architectural layout, room partitions, exterior/interior wall positions, structural columns, door openings, window placements, and spatial proportions shown in [Image ${d.id || i + 1}].
  * Irrespective of whichever perspective angle or camera position is chosen, the rendered space MUST BE OF THIS EXACT FLOOR PLAN. Do NOT alter, hallucinate, add, remove, or rearrange any walls, rooms, or spatial boundaries from this layout.`;
          } else if (lowerType.includes("elevation") || lowerType.includes("facade")) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (ARCHITECTURAL ELEVATION / FACADE):
  * The generated rendering MUST 100% RELIGIOUSLY and STRICTLY follow the exact vertical proportions, story heights, fenestration pattern, facade rhythm, roofline, and architectural openings shown in [Image ${d.id || i + 1}].`;
          } else if (lowerType.includes("sketch") || lowerType.includes("line")) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (ARCHITECTURAL SKETCH / CONCEPT DRAWING):
  * The generated rendering MUST 100% RELIGIOUSLY follow the exact perspective composition, geometric massing, architectural forms, and structural outlines established in [Image ${d.id || i + 1}].`;
          } else if (lowerType.includes("3d") || lowerType.includes("massing") || lowerType.includes("model")) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (3D MODEL / MASSING SCREENSHOT):
  * The generated rendering MUST PRESERVE 100% of the 3D spatial geometry, volumetric forms, structural scale, and perspective alignment shown in [Image ${d.id || i + 1}].`;
          } else if (lowerType.includes("section")) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (SECTION DRAWING):
  * The generated rendering MUST RELIGIOUSLY follow the vertical floor-to-ceiling heights, slab thicknesses, and spatial relationships shown in [Image ${d.id || i + 1}].`;
          } else {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (${dType.toUpperCase()}):
  * The generated rendering MUST RELIGIOUSLY adhere to the exact structural layout, geometry, and spatial boundaries shown in [Image ${d.id || i + 1}].`;
          }
          return `\u25CF [Image ${d.id || i + 1}] -> ARCHITECTURAL DESIGN DRAWING [Type: ${dType}]${dNotes}:
${typeSpecificRule}`;
        }).join("\n\n");
      } else {
        drawingDirectives = `\u25CF [Image 1] -> ARCHITECTURAL DESIGN DRAWING:
- MANDATE: The generated render MUST RELIGIOUSLY follow the exact layout, geometry, wall boundaries, and architectural structure shown in [Image 1]. Irrespective of angle, render this exact floorplan/structure.`;
      }
      let referenceDirectives = "";
      if (references.length > 0) {
        referenceDirectives = references.map((r, i) => {
          const imgIndex = r.id || drawings.length + i + 1;
          const aspects = r.referenceAspects && r.referenceAspects.length > 0 ? r.referenceAspects : ["All (Complete Theme & Mood)"];
          const aspectsStr = aspects.join(", ");
          const rNotes = r.label?.trim() ? ` (Details: ${r.label.trim()})` : "";
          const aspectInstructions = [];
          if (aspects.includes("All (Complete Theme & Mood)") || aspects.includes("Visual Style & Theme")) {
            aspectInstructions.push(`  * VISUAL STYLE & THEME: 100% EXPLICITLY ADOPT the exact architectural style, aesthetic identity, color palette, and visual mood from [Image ${imgIndex}].`);
          }
          if (aspects.includes("All (Complete Theme & Mood)") || aspects.includes("Materials & Textures")) {
            aspectInstructions.push(`  * MATERIALS & TEXTURES: EXTRACT and APPLY the exact physical materials, surface finishes (wood species/grain, stone veining, tile patterns, metal sheen, plaster/concrete texture, fabrics) from [Image ${imgIndex}].`);
          }
          if (aspects.includes("All (Complete Theme & Mood)") || aspects.includes("Lighting & Atmosphere")) {
            aspectInstructions.push(`  * LIGHTING & ATMOSPHERE: EXTRACT and REPLICATE the exact lighting condition, color temperature (e.g. warm golden hour, diffuse daylight, moody twilight), shadow softness, and ambient illumination from [Image ${imgIndex}].`);
          }
          if (aspects.includes("All (Complete Theme & Mood)") || aspects.includes("Furniture & Decor")) {
            aspectInstructions.push(`  * FURNITURE & DECOR: EXTRACT the furniture models, styling pieces, light fixtures, and decor elements from [Image ${imgIndex}] and place them harmoniously within the spaces established by the Design Drawing.`);
          }
          if (aspects.includes("All (Complete Theme & Mood)") || aspects.includes("Environment & Landscape")) {
            aspectInstructions.push(`  * ENVIRONMENT & LANDSCAPE: EXTRACT the surrounding outdoor landscape, vegetation, terrain, and exterior environment from [Image ${imgIndex}].`);
          }
          return `\u25CF [Image ${imgIndex}] -> VISUAL REFERENCE [Aspects: ${aspectsStr}]${rNotes}:
${aspectInstructions.join("\n")}`;
        }).join("\n\n");
      } else {
        referenceDirectives = `\u25CF Reference Images -> VISUAL STYLE & THEMATIC REFERENCE:
- MANDATE: 100% EXPLICITLY adopt the visual style, material textures, and lighting ambiance from the attached reference images.`;
      }
      referenceImageDirective = `

===================================================================
CRITICAL MULTIMODAL REFERENCE-GUIDED SYNTHESIS MANDATE
===================================================================
You are provided with input images having strict, segregated authorities. You MUST obey their designations religiously without mixing their roles:

--- CHANNEL 1: DESIGN DRAWING (CORE GEOMETRY & LAYOUT AUTHORITY) ---
${drawingDirectives}

--- CHANNEL 2: VISUAL REFERENCES (STYLE, MATERIALS, LIGHTING & MOOD) ---
${referenceDirectives}

--- CROSS-CHANNEL SYNTHESIS RULE ---
- The DESIGN DRAWING is the absolute authority for spatial layout, room boundaries, walls, and structural geometry.
- The VISUAL REFERENCES are the absolute authority for visual style, materials, lighting, colors, and textures.
- Synthesize them so the final image is an ultra-realistic, professional architectural render depicting the exact structure of Channel 1, finished 100% with the aesthetic theme and materials of Channel 2.`;
    } else if (totalImages > 1) {
      const metaList = request.reference_images_metadata || [];
      const imageDescriptions = Array.from({ length: totalImages }, (_, i) => {
        const meta = metaList[i];
        const label = meta?.label ? ` (${meta.label})` : "";
        const name = meta?.name ? ` [${meta.name}]` : "";
        return `- Image ${i + 1}${label}${name}`;
      }).join("\n");
      referenceImageDirective = `

MULTI-IMAGE ARCHITECTURAL COMPOSITION & ELEMENT SYNTHESIS:
The user has attached ${totalImages} reference images to compose the final visualization:
${imageDescriptions}

INSTRUCTIONS FOR MULTI-IMAGE COMPOSITION:
- Analyze the user prompt to identify which specific architectural features, geometry, furniture models (e.g. sofa, chairs, tables), materials, finishes, lighting, or floorplan layouts should be extracted from each numbered image (Image 1, Image 2, Image 3, etc.).
- Seamlessly integrate the specified elements into one unified, cohesive scene without geometric distortion.
- Harmonize perspective, vanishing points, camera field of view, lighting temperature, and contact shadows across all combined elements.`;
    } else if (request.has_reference_image || totalImages === 1) {
      const cnStrength = request.controlnet_strength !== void 0 ? request.controlnet_strength : 80;
      const cnNote = request.controlnet_enabled ? ` ControlNet conditioning fidelity is set to ${cnStrength}%.` : "";
      if (workflow.slug === "sketch-to-render" || workflow.slug.includes("sketch")) {
        referenceImageDirective = `

REFERENCE IMAGE FIDELITY (SKETCH-TO-RENDER): The attached input image is an architectural sketch. You MUST strictly follow the spatial layout, building massing, roof form, facade outlines, window openings, and perspective lines from the sketch.${cnNote} Render photorealistic materials, lighting, glass reflections, and environmental context onto this exact geometry.`;
      } else if (workflow.slug === "floor-plan-to-3d" || workflow.slug.includes("plan")) {
        referenceImageDirective = `

REFERENCE IMAGE FIDELITY (PLAN-TO-3D): The attached input image is an architectural floor plan / site plan. Accurately translate the exact room partitioning, walls, doors, and openings shown in the plan into an architectural 3D rendering with realistic depth and lighting.${cnNote}`;
      } else if (workflow.slug.includes("clay") || workflow.slug.includes("cad") || workflow.slug.includes("model") || workflow.slug.includes("three-d")) {
        referenceImageDirective = `

REFERENCE IMAGE FIDELITY (MODEL-TO-PHOTOREAL): The attached input image is a 3D massing model. You MUST preserve 100% of the 3D model geometry, perspective angle, and structural volumes.${cnNote} Replace plain/clay surfaces with rich architectural materials, realistic glass, and environmental context.`;
      } else if (workflow.slug.includes("staging") || workflow.slug.includes("redesign") || workflow.slug.includes("renovation")) {
        referenceImageDirective = `

REFERENCE IMAGE FIDELITY (VIRTUAL STAGING / REDESIGN): The attached input image is an interior photograph. Strictly preserve the room boundaries, walls, ceiling, flooring boundary, and windows from the input image while furnishing and styling the space.${cnNote}`;
      } else {
        referenceImageDirective = `

REFERENCE IMAGE FIDELITY: The attached input image is the foundational visual and spatial reference. Follow its overall architectural form, camera angle, perspective, and composition while applying the specified style, lighting, material palette, and environment enhancements.${cnNote}`;
      }
    }
    return `PROJECT: ${fullProjectDescriptor}
DESIGN (ARCHITECTURE, INTERIOR OR LANDSCAPE): ${designDirection}
CONTEXT: ${finalEnvironment}
MATERIAL: ${finalMaterials}
LIGHTING: ${finalLighting} (${timeOfDay})
VIS STYLE: ${visStyle}${referenceImageDirective}

QUALITY AND PHOTOREALISM:
${qualityBlock}`;
  }
  /**
   * Calls Google Cloud Vertex AI (gemini-2.5-flash Text-to-Text API) to produce a context-aware prompt.
   */
  static async enhanceWithVertex(request, getAccessToken) {
    const workflow = WORKFLOWS[request.workflow_id] || WORKFLOWS[1];
    if (workflow.slug === "reference-guided") {
      return this.buildReferenceGuidedPrompt(request);
    }
    const token = await getAccessToken();
    if (!token) {
      return this.enhanceOffline(request);
    }
    const styleKey = request.image_style || "realistic";
    const styleDesc = IMAGE_STYLE_PROMPTS[styleKey] || IMAGE_STYLE_PROMPTS["realistic"];
    const systemInstruction = `You are Google Cloud's expert Architectural Prompt Enhancement AI for Professional Image Generation Workflows.
Your task is to transform any user's architectural request into an impeccably structured, professional-grade prompt following our exact 6-tier architectural schema:

SCHEMA FORMAT TO OUTPUT (OUTPUT ONLY THESE HEADERS IN THIS EXACT ORDER):
PROJECT: <Describe what the project is (e.g. Residential Villa, Boutique Restaurant, Commercial Office Tower, Luxury Resort, Sports Venue) and what the space/view is (e.g. Master Bathroom, Outdoor Infinity Pool, Living Lounge, Facade, Bird's Eye Aerial View)>
DESIGN (ARCHITECTURE, INTERIOR OR LANDSCAPE): <Describe the architectural / interior / landscape design style (e.g. Contemporary Minimalist, Classical Neoclassical, Mid-Century Modern, Japandi, Brutalist, Biophilic Organic, Mediterranean Villa, etc.) with specific design principles>
CONTEXT: <Describe the surrounding environment, site condition, landscape or urban backdrop (e.g. coastal cliffside overlooking ocean, dense urban skyline, lush alpine forest, serene suburban garden)>
MATERIAL: <Describe the detailed physical materials, finishes, and textures (e.g. honed travertine stone, white oak timber, microcement floors, fluted glass, polished brass, fair-faced concrete)>
LIGHTING: <Describe the lighting scheme and atmospheric conditions (e.g. golden hour sunlight with long warm shadows, soft diffuse daylight, dramatic interior architectural LED cove lighting, moody twilight illumination)>
VIS STYLE: <Describe the visual rendering style (e.g. Architectural photography, professional high-end photorealistic rendering, crisp 8k details, balanced exposure, physically accurate reflections and contact shadows)>

QUALITY AND PHOTOREALISM:
Create a professional architectural visualization suitable for presentation by a leading architecture, interior-design or real-estate visualization studio. Use physically believable proportions, realistic material response, accurate texture scale, natural reflections, plausible roughness, realistic illumination, contact shadows and balanced exposure. Maintain believable construction logic, furniture scale and human proportions. Avoid excessive HDR, artificial sharpening, oversaturation, plastic materials, warped geometry and implausible architectural details. Do not create warped architecture, distorted furniture, floating objects, random text, logos or watermarks.

STRICT RULES:
1. Output ONLY the plain text matching the schema above.
2. DO NOT wrap in markdown code fences or backticks (no \`\`\` text).
3. Always include all 6 key sections: PROJECT, DESIGN (ARCHITECTURE, INTERIOR OR LANDSCAPE), CONTEXT, MATERIAL, LIGHTING, VIS STYLE.
4. If Reference-Guided Workflow: The drawing strictly guides the core design\u2014layout, geometry, proportions, openings, and key spatial details\u2014while reference images guide the style, materials, lighting, colors, and overall mood. Instruct the model that the final render must stay faithful to the design drawing while adopting the visual character from the references.
5. If Multiple Reference Images Uploaded: You MUST instruct the generation model to cross-synthesize elements from each numbered image (Image 1, Image 2, Image 3, etc.) exactly as specified by the user's prompt (e.g. placing furniture from Image 2 into the room space of Image 1 while applying materials from Image 3).
6. If Single Reference Image Uploaded: You MUST instruct the generation model to treat the input image as authoritative for geometry, perspective, walls, and composition.
7. Adapt to any user design type or requirement with high architectural fidelity.`;
    const imgCount = request.reference_images_count || request.reference_images_metadata?.length || (request.has_reference_image ? 1 : 0);
    const metaStr = request.reference_images_metadata && request.reference_images_metadata.length > 0 ? request.reference_images_metadata.map((m, idx) => `Image ${idx + 1}: ${m.label || m.name || "Reference"}`).join("; ") : imgCount > 0 ? `${imgCount} Image(s) Attached` : "None";
    const userPrompt = `User Design Prompt: "${request.user_input || workflow.name}"
Workflow: ${workflow.name} (${workflow.slug})
Target Image Model: ${request.model}
Image Style: ${styleKey} (${styleDesc})
Attached Reference Images: ${imgCount > 0 ? "YES" : "NO"} (${metaStr})
ControlNet Conditioning: ${request.controlnet_enabled ? `ON (Fidelity Strength: ${request.controlnet_strength || 80}%)` : "OFF"}
People Option: ${request.people || "none"}
Camera Option: ${request.camera_angle || "auto"} ${request.custom_camera ? `(Custom: ${request.custom_camera})` : ""}
Lighting Option: ${request.lighting || "auto"} ${request.custom_lighting ? `(Custom: ${request.custom_lighting})` : ""}
Materials Option: ${request.materials || "auto"} ${request.custom_materials ? `(Custom: ${request.custom_materials})` : ""}
Environment Option: ${request.environment || "auto"} ${request.custom_environment ? `(Custom: ${request.custom_environment})` : ""}
Mood Option: ${request.mood || "auto"} ${request.custom_mood ? `(Custom: ${request.custom_mood})` : ""}`;
    try {
      const vertexUrl = `https://aiplatform.googleapis.com/v1/projects/rendair-competitor/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`;
      const res = await fetch(vertexUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024
          }
        })
      });
      if (!res.ok) {
        console.warn(`[PromptEnhancer] Vertex call failed (${res.status}), using smart offline fallback`);
        return this.enhanceOffline(request);
      }
      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text || typeof text !== "string") {
        return this.enhanceOffline(request);
      }
      let cleaned = text.trim();
      if (cleaned.startsWith("```")) {
        cleaned = cleaned.replace(/^```[a-z]*\n?/, "").replace(/\n?```$/, "").trim();
      }
      return cleaned;
    } catch (err) {
      console.warn("[PromptEnhancer] Error in Vertex AI call:", err);
      return this.enhanceOffline(request);
    }
  }
};

// services/aiRender/sampleGlb.ts
function createArchitecturalChairGlbBuffer() {
  function addBox(x0, y0, z0, x1, y1, z1) {
    const p = [
      // Front (z1)
      x0,
      y0,
      z1,
      x1,
      y0,
      z1,
      x1,
      y1,
      z1,
      x0,
      y1,
      z1,
      // Back (z0)
      x1,
      y0,
      z0,
      x0,
      y0,
      z0,
      x0,
      y1,
      z0,
      x1,
      y1,
      z0,
      // Top (y1)
      x0,
      y1,
      z1,
      x1,
      y1,
      z1,
      x1,
      y1,
      z0,
      x0,
      y1,
      z0,
      // Bottom (y0)
      x0,
      y0,
      z0,
      x1,
      y0,
      z0,
      x1,
      y0,
      z1,
      x0,
      y0,
      z1,
      // Right (x1)
      x1,
      y0,
      z1,
      x1,
      y0,
      z0,
      x1,
      y1,
      z0,
      x1,
      y1,
      z1,
      // Left (x0)
      x0,
      y0,
      z0,
      x0,
      y0,
      z1,
      x0,
      y1,
      z1,
      x0,
      y1,
      z0
    ];
    const n = [
      // Front
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      // Back
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,
      // Top
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      // Bottom
      0,
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,
      // Right
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      1,
      0,
      0,
      // Left
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,
      0,
      -1,
      0,
      0
    ];
    return { positions: p, normals: n };
  }
  const boxes = [
    // Seat cushion
    [-0.35, 0.35, -0.35, 0.35, 0.45, 0.35],
    // Backrest
    [-0.35, 0.45, -0.35, 0.35, 0.85, -0.25],
    // Left armrest
    [-0.42, 0.35, -0.35, -0.35, 0.6, 0.35],
    // Right armrest
    [0.35, 0.35, -0.35, 0.42, 0.6, 0.35],
    // 4 architectural frame legs
    [-0.35, 0, -0.35, -0.3, 0.35, -0.3],
    [0.3, 0, -0.35, 0.35, 0.35, -0.3],
    [-0.35, 0, 0.3, -0.3, 0.35, 0.35],
    [0.3, 0, 0.3, 0.35, 0.35, 0.35]
  ];
  const allPositions = [];
  const allNormals = [];
  const allIndices = [];
  let vertOffset = 0;
  boxes.forEach(([x0, y0, z0, x1, y1, z1]) => {
    const box = addBox(x0, y0, z0, x1, y1, z1);
    allPositions.push(...box.positions);
    allNormals.push(...box.normals);
    for (let f = 0; f < 6; f++) {
      const base = vertOffset + f * 4;
      allIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    vertOffset += 24;
  });
  const positions = new Float32Array(allPositions);
  const normals = new Float32Array(allNormals);
  const indices = new Uint16Array(allIndices);
  const posByteLength = positions.byteLength;
  const normByteLength = normals.byteLength;
  const indByteLength = indices.byteLength;
  const totalBinLength = posByteLength + normByteLength + indByteLength;
  const binBuffer = new Uint8Array(totalBinLength);
  binBuffer.set(new Uint8Array(positions.buffer), 0);
  binBuffer.set(new Uint8Array(normals.buffer), posByteLength);
  binBuffer.set(new Uint8Array(indices.buffer), posByteLength + normByteLength);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const gltfJson = {
    asset: { version: "2.0", generator: "ArchitectAI-TRELLIS-3D" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: "AI_Architectural_Armchair" }],
    meshes: [{
      name: "Armchair_Mesh",
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0
      }]
    }],
    materials: [{
      name: "Modern_Velvet_Indigo",
      pbrMetallicRoughness: {
        baseColorFactor: [0.28, 0.35, 0.95, 1],
        metallicFactor: 0.15,
        roughnessFactor: 0.35
      },
      doubleSided: true
    }],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: "VEC3",
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ]
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126,
        count: normals.length / 3,
        type: "VEC3",
        max: [1, 1, 1],
        min: [-1, -1, -1]
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123,
        count: indices.length,
        type: "SCALAR",
        max: [vertOffset - 1],
        min: [0]
      }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posByteLength, target: 34962 },
      { buffer: 0, byteOffset: posByteLength, byteLength: normByteLength, target: 34962 },
      { buffer: 0, byteOffset: posByteLength + normByteLength, byteLength: indByteLength, target: 34963 }
    ],
    buffers: [{ byteLength: totalBinLength }]
  };
  let jsonString = JSON.stringify(gltfJson);
  while (jsonString.length % 4 !== 0) jsonString += " ";
  const encoder = new TextEncoder();
  const jsonBuffer = encoder.encode(jsonString);
  const jsonChunkLength = jsonBuffer.length;
  const binChunkLength = binBuffer.length;
  const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;
  const glbBuffer = new Uint8Array(totalLength);
  const view = new DataView(glbBuffer.buffer);
  view.setUint32(0, 1179937895, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, totalLength, true);
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, 1313821514, true);
  glbBuffer.set(jsonBuffer, 20);
  const binOffset = 20 + jsonChunkLength;
  view.setUint32(binOffset, binChunkLength, true);
  view.setUint32(binOffset + 4, 5130562, true);
  glbBuffer.set(binBuffer, binOffset + 8);
  return glbBuffer;
}
function getSample3DModelBase64() {
  const buf = createArchitecturalChairGlbBuffer();
  let binary = "";
  const len = buf.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return typeof btoa === "function" ? btoa(binary) : Buffer.from(buf).toString("base64");
}
function getSample3DModelDataUri() {
  return `data:model/gltf-binary;base64,${getSample3DModelBase64()}`;
}

// services/aiRender/unifiedRendererClient.ts
import { GoogleAuth as GoogleAuth9 } from "google-auth-library";
import fs10 from "fs";
var UNIFIED_RENDERER_MODELS = ["flux-2-pro", "stable-diffusion-xl"];
var DEFAULT_TIMEOUT_MS = 3e5;
var VERTEX_KEY_PATH8 = resolveRenderVertexKeyPath();
var getUnifiedRendererUrl = () => (process.env.UNIFIED_RENDERER_URL || "").trim().replace(/\/+$/, "");
var isUnifiedRendererEnabledFor = (model, outputTypes) => !!getUnifiedRendererUrl() && UNIFIED_RENDERER_MODELS.includes(model) && outputTypes.includes("image/png");
var cachedIdTokenAuth;
var getAuthorizationHeader = async (audience) => {
  if (process.env.UNIFIED_RENDERER_REQUIRE_AUTH !== "true") return void 0;
  cachedIdTokenAuth ||= fs10.existsSync(VERTEX_KEY_PATH8) ? new GoogleAuth9({ keyFile: VERTEX_KEY_PATH8 }) : new GoogleAuth9();
  const client = await cachedIdTokenAuth.getIdTokenClient(audience);
  const headers = await client.getRequestHeaders();
  return typeof headers?.get === "function" ? headers.get("authorization") || void 0 : headers?.Authorization;
};
var looksLikeImage = (base64) => base64.length > 100 && (base64.startsWith("iVBORw0KGgo") || base64.startsWith("/9j/") || base64.startsWith("UklGR"));
async function renderWithUnifiedRenderer(request) {
  const baseUrl = getUnifiedRendererUrl();
  if (!baseUrl) return null;
  const timeoutMs = Number(process.env.UNIFIED_RENDERER_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const tag = `[AI-Render Job ${request.jobId} Variant ${request.variantIndex + 1}]`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { "Content-Type": "application/json" };
    const authorization = await getAuthorizationHeader(baseUrl);
    if (authorization) headers["Authorization"] = authorization;
    console.log(`${tag} Sending ${request.model} request to unified GPU renderer (timeout ${timeoutMs}ms)`);
    const res = await fetch(`${baseUrl}/render`, {
      method: "POST",
      signal: controller.signal,
      headers,
      body: JSON.stringify({
        model: request.model,
        prompt: request.prompt,
        images: request.images.map((img) => ({
          mime_type: img.mimeType,
          base64: img.base64Data,
          category: img.category,
          drawing_type: img.drawingType,
          label: img.label
        })),
        mask: request.mask ? { mime_type: request.mask.mimeType, base64: request.mask.base64Data } : void 0,
        aspect_ratio: request.aspectRatio,
        resolution: request.resolution,
        controlnet_enabled: request.controlnetEnabled,
        controlnet_type: request.controlnetType,
        controlnet_scale: request.controlnetScale,
        seed: request.seed
      })
    });
    if (!res.ok) {
      console.warn(`${tag} Unified GPU renderer returned status ${res.status}: ${await res.text()}`);
      return null;
    }
    const data = await res.json();
    const base64 = typeof data?.image_base64 === "string" ? data.image_base64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, "") : "";
    if (!looksLikeImage(base64)) {
      console.warn(`${tag} Unified GPU renderer responded without an image (${JSON.stringify(data).slice(0, 200)}); falling back.`);
      return null;
    }
    console.log(`${tag} Unified GPU renderer succeeded with ${data.model_used || request.model} in ${Date.now() - startedAt}ms`);
    return base64;
  } catch (err) {
    const reason = err?.name === "AbortError" ? `timed out after ${timeoutMs}ms (GPU cold start?)` : err?.message || String(err);
    console.warn(`${tag} Unified GPU renderer call failed: ${reason}; falling back.`);
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

// services/aiRender/backend.ts
var VERTEX_KEY_PATH9 = resolveRenderVertexKeyPath();
var VERTEX_SCOPE8 = "https://www.googleapis.com/auth/cloud-platform";
var cachedVertexAuth8;
var cachedVertexClientPromise8;
var configureVertexEnvironment8 = () => {
  if (fs11.existsSync(VERTEX_KEY_PATH9)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = VERTEX_KEY_PATH9;
    process.env.GOOGLE_GENAI_USE_VERTEXAI = "true";
    process.env.GOOGLE_CLOUD_PROJECT = "rendair-competitor";
    process.env.GOOGLE_CLOUD_LOCATION = "us-central1";
  }
};
var getVertexAuth8 = () => {
  if (!fs11.existsSync(VERTEX_KEY_PATH9)) {
    return null;
  }
  configureVertexEnvironment8();
  if (!cachedVertexAuth8) {
    cachedVertexAuth8 = new GoogleAuth10({ keyFile: VERTEX_KEY_PATH9, scopes: VERTEX_SCOPE8 });
  }
  return cachedVertexAuth8;
};
var getVertexClient8 = () => {
  const auth = getVertexAuth8();
  if (!auth) return null;
  if (!cachedVertexClientPromise8) {
    cachedVertexClientPromise8 = auth.getClient().catch((error) => {
      cachedVertexClientPromise8 = void 0;
      throw error;
    });
  }
  return cachedVertexClientPromise8;
};
function normalizeError(err) {
  const msg = err?.message || String(err);
  if (msg.includes("MIME") || msg.includes("format")) return "UNSUPPORTED_MIME_TYPE";
  if (msg.includes("size") || msg.includes("large")) return "FILE_TOO_LARGE";
  if (msg.includes("401") || msg.includes("auth") || msg.includes("token")) return "AUTHENTICATION_FAILED";
  if (msg.includes("429") || msg.includes("quota") || msg.includes("rate limit")) return "PROVIDER_RATE_LIMIT";
  if (msg.includes("timeout") || msg.includes("deadline")) return "GPU_COLD_START_TIMEOUT";
  if (msg.includes("safety") || msg.includes("block")) return "SAFETY_BLOCKED";
  if (msg.includes("not found") || msg.includes("404")) return "MODEL_UNAVAILABLE";
  return "GENERATION_FAILED";
}
var JOBS_DB = {};
var readJob = async (jobId) => {
  const local = JOBS_DB[jobId];
  if (local) return local;
  const stored = await getStoredJob(jobId);
  if (stored) JOBS_DB[jobId] = stored;
  return stored || null;
};
var MOCK_ARCH_IMAGES = [
  "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
  // Contemporary villa
  "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1200&q=80",
  // Modern kitchen/dining
  "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1200&q=80",
  // Penthouse living room
  "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80"
  // Luxury bathroom
];
var MOCK_ARCH_VIDEOS = [
  "https://assets.mixkit.co/videos/preview/mixkit-modern-apartment-interior-design-with-creative-lighting-43093-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-bright-kitchen-with-wooden-details-in-modern-house-41577-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-luxury-home-exterior-with-swimming-pool-and-green-lawn-41618-large.mp4",
  "https://assets.mixkit.co/videos/preview/mixkit-living-room-with-modern-furniture-and-large-windows-41574-large.mp4"
];
async function generateMockVariant(job) {
  const delay = job.model.includes("pro") ? 2500 : 1200;
  await new Promise((r) => setTimeout(r, delay));
  return {
    base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
    // 1x1 mock PNG
    usedFallbackMock: true
  };
}
async function generateVariant(job, workflow, index, isMock) {
  const useUnifiedRenderer = isUnifiedRendererEnabledFor(job.model, workflow.output_types);
  if (isMock && !useUnifiedRenderer || workflow.provider === "local_adjustment" || workflow.provider === "gemini_analysis") {
    return generateMockVariant(job);
  }
  try {
    let targetModel = job.model;
    if (!targetModel.startsWith("gemini-")) {
      targetModel = "gemini-3.1-flash-image";
    }
    const inputImagesList = [];
    const parseImageEntry = (entry, defaultName = "Reference") => {
      if (!entry) return null;
      let rawStr = "";
      let mime = "image/png";
      let label = typeof entry === "object" ? entry.label : "";
      let name = typeof entry === "object" ? entry.name : defaultName;
      let category = typeof entry === "object" ? entry.category : void 0;
      let drawingType = typeof entry === "object" ? entry.drawingType : void 0;
      let customDrawingType = typeof entry === "object" ? entry.customDrawingType : void 0;
      let referenceAspects = typeof entry === "object" ? entry.referenceAspects : void 0;
      if (typeof entry === "string") {
        rawStr = entry;
      } else if (typeof entry === "object") {
        rawStr = entry.base64 || entry.base64Data || entry.signed_url || entry.url || "";
      }
      if (!rawStr || typeof rawStr !== "string" || rawStr.length < 50) return null;
      if (rawStr.startsWith("data:image/")) {
        const match = rawStr.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match) {
          mime = match[1];
          rawStr = match[2];
        }
      }
      return { mimeType: mime, base64Data: rawStr, label, name, category, drawingType, customDrawingType, referenceAspects };
    };
    const rawMultiImages = job.options?.uploaded_images || job.options?.parameters?.uploaded_images;
    if (Array.isArray(rawMultiImages) && rawMultiImages.length > 0) {
      rawMultiImages.forEach((img, idx) => {
        const parsed = parseImageEntry(img, `Image ${idx + 1}`);
        if (parsed) inputImagesList.push(parsed);
      });
    }
    if (inputImagesList.length === 0) {
      const singleRaw = job.options?.uploaded_image || job.options?.assets?.[0]?.signed_url || job.options?.assets?.[0]?.base64Data || job.options?.source_image;
      const parsedSingle = parseImageEntry(singleRaw, "Image 1");
      if (parsedSingle) {
        parsedSingle.label = "Original Base Image to Edit";
        inputImagesList.push(parsedSingle);
      }
    }
    const rawMask = job.options?.mask_image || job.options?.parameters?.mask_image || job.options?.options?.mask_image;
    let hasMask = false;
    if (rawMask) {
      const parsedMask = parseImageEntry(rawMask, "Inpainting Mask");
      if (parsedMask) {
        parsedMask.label = "Inpainting Mask (WHITE = Target Region to Edit/Remove/Replace, BLACK = Strictly Preserve 100% Untouched)";
        inputImagesList.push(parsedMask);
        hasMask = true;
      }
    }
    const hasInputImage = inputImagesList.length > 0;
    const aspect = (job.options?.parameters?.aspect_ratio === "custom" ? job.options?.parameters?.custom_aspect_ratio : job.options?.parameters?.aspect_ratio) || "16:9";
    const resolution = job.options?.parameters?.resolution || "2K";
    let canvasSpec = `[MANDATORY CANVAS SPECIFICATION]
ASPECT RATIO: ${aspect}
RESOLUTION: ${resolution}`;
    if (hasInputImage) {
      canvasSpec += `
PROPORTION FIDELITY: Maintain 1:1 true physical proportions of all architectural geometry. DO NOT stretch, squish, warp, or skew the scene. If the requested aspect ratio (${aspect}) differs from the input image, seamlessly extend (outpaint) the surrounding landscape, sky, floor, or architectural context to naturally fill the canvas without distorting focal structures.`;
    }
    let inpaintingSpec = "";
    if (hasMask) {
      inpaintingSpec = `

[CRITICAL LOCALIZED INPAINTING MANDATE]
- You are performing surgical inpainting.
- The attached Inpainting Mask specifies the EXACT target region with WHITE pixels.
- Modify ONLY the content located within the white masked area.
- DO NOT touch, remove, alter, or regenerate any elements in the black area.
- If there are other similar objects in the scene (such as other ceiling lights, windows, or furniture items) that are outside the white mask, THEY MUST REMAIN COMPLETELY PRESERVED AND UNCHANGED.`;
    }
    const finalPrompt = `${job.prompt}

${canvasSpec}${inpaintingSpec}`;
    if (useUnifiedRenderer) {
      const maskImage = hasMask ? inputImagesList[inputImagesList.length - 1] : void 0;
      const gpuBase64 = await renderWithUnifiedRenderer({
        jobId: job.jobId,
        variantIndex: index,
        model: job.model,
        prompt: job.prompt,
        images: hasMask ? inputImagesList.slice(0, -1) : inputImagesList,
        mask: maskImage,
        aspectRatio: aspect,
        resolution,
        controlnetEnabled: job.options?.parameters?.controlnet_enabled ?? job.options?.controlnet_enabled,
        controlnetType: job.options?.parameters?.controlnet_type ?? workflow.default_values?.controlnet_type,
        controlnetScale: job.options?.parameters?.controlnet_strength_percent != null ? Number(job.options.parameters.controlnet_strength_percent) / 100 : workflow.default_values?.controlnet_conditioning_scale
      });
      if (gpuBase64) {
        job.logs?.push(`Variant ${index + 1} rendered on the unified GPU renderer (${job.model}).`);
        return { base64: gpuBase64, usedFallbackMock: false };
      }
      job.logs?.push(`Variant ${index + 1}: unified GPU renderer unavailable, falling back to Vertex AI.`);
      if (isMock) return generateMockVariant(job);
    }
    const client = await getVertexClient8();
    const tokenResponse = await client?.getAccessToken();
    const token = tokenResponse?.token;
    const fetch2 = (await import("node-fetch")).default || global.fetch;
    let base64 = "";
    if (hasInputImage) {
      let targetModel2 = job.model || "gemini-3.1-flash-image";
      if (!targetModel2.startsWith("gemini")) {
        targetModel2 = "gemini-3.1-flash-image";
      }
      const multimodalModels = Array.from(/* @__PURE__ */ new Set([targetModel2, "gemini-3.1-flash-image", "gemini-3-pro-image"]));
      const client2 = await getVertexClient8();
      const token2 = await client2?.getAccessToken().then((r) => r.token);
      for (const m of multimodalModels) {
        if (base64) break;
        try {
          const vertexUrl = `https://aiplatform.googleapis.com/v1/projects/rendair-competitor/locations/global/publishers/google/models/${m}:generateContent`;
          const userParts = [];
          inputImagesList.forEach((img, idx) => {
            let tag = `[Image ${idx + 1}]:`;
            if (img.category === "drawing") {
              const rawType = img.drawingType === "Custom" && img.customDrawingType ? img.customDrawingType : img.drawingType || "Floor Plan";
              let typeName = rawType;
              if (rawType.toLowerCase().includes("floor") || rawType.toLowerCase().includes("plan")) typeName = "Floorplan";
              else if (rawType.toLowerCase().includes("elevation") || rawType.toLowerCase().includes("facade")) typeName = "Elevation";
              else if (rawType.toLowerCase().includes("sketch")) typeName = "Sketch";
              else if (rawType.toLowerCase().includes("3d") || rawType.toLowerCase().includes("model")) typeName = "3D Model Screenshot";
              else if (rawType.toLowerCase().includes("section")) typeName = "Section Drawing";
              tag = `[Image ${idx + 1}: Design Drawing - ${typeName}]:`;
            } else if (img.category === "reference") {
              const aspects = img.referenceAspects && img.referenceAspects.length > 0 ? img.referenceAspects : ["All (Complete Theme & Mood)"];
              let aspectsLabel = "";
              if (aspects.includes("All (Complete Theme & Mood)")) {
                aspectsLabel = "All Theme (Style, Lighting, Materials, Furniture, Landscape)";
              } else {
                aspectsLabel = aspects.map((a) => a.split(" ")[0]).join(", ");
              }
              tag = `[Image ${idx + 1}: Visual Reference - ${aspectsLabel}]:`;
            } else if (img.label) {
              tag = `[Image ${idx + 1}: ${img.label}]:`;
            }
            userParts.push({ text: tag });
            userParts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.base64Data
              }
            });
          });
          userParts.push({ text: finalPrompt });
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 95e3);
          const res = await fetch2(vertexUrl, {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Authorization": `Bearer ${token2}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents: [{
                role: "user",
                parts: userParts
              }],
              generationConfig: {
                candidateCount: 1,
                responseModalities: ["IMAGE"]
              }
            })
          });
          clearTimeout(timeoutId);
          if (res.ok) {
            const data = await res.json();
            const imagePart = data?.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
            base64 = imagePart?.inlineData?.data || "";
          } else {
            const errText = await res.text();
            console.warn(`[AI-Render] Gemini multimodal image call (${m}) returned status ${res.status}: ${errText}`);
          }
        } catch (err) {
          console.warn(`[AI-Render] Gemini multimodal image call (${m}) failed: ${err.message}`);
        }
      }
    }
    if (!base64 && !hasInputImage) {
      const imagenModels = [
        "imagen-3.0-generate-002",
        "imagen-3.0-fast-generate-001",
        "imagen-3.0-generate-001"
      ];
      for (const m of imagenModels) {
        if (base64) break;
        try {
          const imagenUrl = `https://us-central1-aiplatform.googleapis.com/v1/projects/rendair-competitor/locations/us-central1/publishers/google/models/${m}:predict`;
          const instancePayload = { prompt: finalPrompt };
          const res = await fetch2(imagenUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              instances: [instancePayload],
              parameters: {
                sampleCount: 1,
                aspectRatio: aspect,
                outputOptions: { mimeType: "image/png" }
              }
            })
          });
          if (res.ok) {
            const data = await res.json();
            base64 = data?.predictions?.[0]?.bytesBase64Encoded || "";
          } else {
            const errText = await res.text();
            console.warn(`[AI-Render] Imagen model ${m} returned status ${res.status}: ${errText}`);
          }
        } catch (err) {
          console.warn(`[AI-Render] Imagen model ${m} call failed: ${err.message}`);
        }
      }
    }
    if (!base64) {
      let targetModel2 = job.model;
      if (!targetModel2.startsWith("gemini-")) {
        targetModel2 = "gemini-3.1-flash-image";
      }
      const vertexUrl = `https://aiplatform.googleapis.com/v1/projects/rendair-competitor/locations/global/publishers/google/models/${targetModel2}:generateContent`;
      const userParts = [];
      inputImagesList.forEach((img, idx) => {
        const tag = img.label ? `[REFERENCE IMAGE ${idx + 1} (${img.label})]:` : `[REFERENCE IMAGE ${idx + 1}]:`;
        userParts.push({ text: tag });
        userParts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.base64Data
          }
        });
      });
      userParts.push({ text: finalPrompt });
      const res = await fetch2(vertexUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: userParts }],
          generationConfig: {
            candidateCount: 1,
            responseModalities: ["IMAGE"]
          }
        })
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Vertex AI API returned status ${res.status}: ${errText}`);
      }
      const data = await res.json();
      const imagePart = data?.candidates?.flatMap((candidate) => candidate.content?.parts || []).find((part) => part.inlineData?.data);
      base64 = imagePart?.inlineData?.data;
    }
    if (!base64) throw new Error("No image bytes returned from Vertex AI.");
    return { base64, usedFallbackMock: false };
  } catch (liveError) {
    console.error(`[AI-Render Job ${job.jobId} Variant ${index + 1}] Live call failed: ${liveError.message}`);
    throw liveError;
  }
}
async function runAsyncJob(jobId) {
  const job = JOBS_DB[jobId];
  if (!job) return;
  const workflow = WORKFLOWS[job.workflowId];
  const startTime = Date.now();
  const variants = job.options?.parameters?.variants || job.options?.variants || job.options?.options?.variants || 1;
  console.log(`[AI-Render Job ${jobId}] Starting execution for workflow: ${workflow.slug} (${workflow.name}) with ${variants} variants in parallel`);
  try {
    job.status = "normalizing";
    console.log(`[AI-Render Job ${jobId}] State: normalizing (AI prompt enhancement)`);
    job.logs?.push("Parsing design intent and enhancing architectural prompt with AI.");
    if (!job.options?.is_custom_edited) {
      try {
        const getAccessToken = async () => {
          const client = await getVertexClient8();
          if (!client) return null;
          const res = await client.getAccessToken();
          return res.token || null;
        };
        const enhanced = await PromptEnhancerEngine.enhanceWithVertex({
          user_input: job.options.user_input || "",
          workflow_id: job.workflowId,
          image_style: job.options.image_style || "realistic",
          model: job.model,
          people: job.options.people,
          camera_angle: job.options.camera_angle,
          custom_camera: job.options.custom_camera,
          lighting: job.options.lighting,
          custom_lighting: job.options.custom_lighting,
          materials: job.options.materials,
          custom_materials: job.options.custom_materials,
          environment: job.options.environment,
          custom_environment: job.options.custom_environment,
          mood: job.options.mood,
          custom_mood: job.options.custom_mood,
          has_reference_image: !!job.options.uploaded_image || Array.isArray(job.options.uploaded_images) && job.options.uploaded_images.length > 0,
          reference_images_count: Array.isArray(job.options.uploaded_images) ? job.options.uploaded_images.length : job.options.uploaded_image ? 1 : 0,
          reference_images_metadata: Array.isArray(job.options.uploaded_images) ? job.options.uploaded_images : void 0,
          controlnet_enabled: job.options?.parameters?.controlnet_enabled ?? job.options?.controlnet_enabled,
          controlnet_strength: job.options?.parameters?.controlnet_strength_percent ?? job.options?.controlnet_strength ?? 80
        }, getAccessToken);
        if (enhanced) {
          job.prompt = enhanced;
        }
      } catch (e) {
        console.warn(`[AI-Render Job ${jobId}] AI prompt enhancement fallback:`, e);
      }
    }
    job.status = "preprocessing";
    console.log(`[AI-Render Job ${jobId}] State: preprocessing`);
    job.logs?.push("Validating and converting uploaded source files.");
    await new Promise((r) => setTimeout(r, 600));
    job.status = "generating";
    console.log(`[AI-Render Job ${jobId}] State: generating`);
    job.logs?.push(`Contacting provider adapters and launching ${variants} parallel api calls...`);
    const isMock = !getVertexAuth8();
    const results = await Promise.all(
      Array.from({ length: variants }).map((_, idx) => generateVariant(job, workflow, idx, isMock))
    );
    const anyUsedFallback = results.some((r) => r.usedFallbackMock);
    const usedFallbackMock = anyUsedFallback;
    job.status = "postprocessing";
    console.log(`[AI-Render Job ${jobId}] State: postprocessing`);
    job.logs?.push("Finalizing assets, saving private rendering references.");
    await new Promise((r) => setTimeout(r, 400));
    let mimeType = "image/png";
    let outputType = "image";
    if (workflow.output_types.includes("video/mp4")) {
      outputType = "video";
      mimeType = "video/mp4";
    } else if (workflow.output_types.includes("model/gltf-binary") || workflow.output_types.includes("application/octet-stream")) {
      outputType = "3d";
      mimeType = "model/gltf-binary";
    }
    job.outputs = results.map((res, index) => {
      let signedUrl = `data:${mimeType};base64,${res.base64}`;
      if (outputType === "video") {
        const duration = job.options?.parameters?.duration_seconds || job.options?.duration_seconds || job.options?.options?.duration_seconds || 4;
        const baseVideo = MOCK_ARCH_VIDEOS[index % MOCK_ARCH_VIDEOS.length];
        signedUrl = `${baseVideo}#t=0,${duration}`;
      } else if (outputType === "3d") {
        signedUrl = getSample3DModelDataUri();
      } else if (res.usedFallbackMock) {
        const sourceImage = job.options?.assets?.source_image || job.options?.assets?.image;
        if (sourceImage && workflow.slug !== "render-to-moodboard") {
          signedUrl = sourceImage;
        } else if (workflow.slug === "render-to-moodboard") {
          const MOODBOARD_MOCKS = [
            "https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1586023492125-27b2c045efd7?auto=format&fit=crop&w=1200&q=80",
            "https://images.unsplash.com/photo-1507089947368-19c1da9775ae?auto=format&fit=crop&w=1200&q=80"
          ];
          signedUrl = MOODBOARD_MOCKS[index % MOODBOARD_MOCKS.length];
        } else {
          signedUrl = MOCK_ARCH_IMAGES[index % MOCK_ARCH_IMAGES.length];
        }
      }
      return {
        type: outputType,
        mime_type: mimeType,
        gcs_uri: `gs://rendair-competitor-assets/users/dev-user/ai-render/${jobId}/outputs/output_${index}.${mimeType === "image/png" ? "png" : mimeType === "video/mp4" ? "mp4" : "glb"}`,
        signed_url: signedUrl,
        width: 1024,
        height: 1024
      };
    });
    job.status = "completed";
    job.processingTimeMs = Date.now() - startTime;
    job.actualCostUsdEstimate = usedFallbackMock ? 0 : ActualUsageCostCalculator.calculate(job.model, job.processingTimeMs / 1e3 / variants, {
      duration_seconds: job.options?.parameters?.duration_seconds || job.options?.duration_seconds || job.options?.options?.duration_seconds || 4,
      resolution: job.options?.parameters?.resolution || job.options?.resolution || job.options?.options?.resolution || "2K",
      audio: job.options?.parameters?.audio ?? job.options?.audio ?? job.options?.options?.audio ?? false
    }) * variants;
    console.log(`[AI-Render Job ${jobId}] State: completed in ${job.processingTimeMs}ms. Cost: $${job.actualCostUsdEstimate}`);
    job.logs?.push(`Job completed successfully with ${variants} variants.`);
  } catch (err) {
    console.error(`[AI-Render Job ${jobId}] Failed:`, err);
    job.status = "failed";
    job.error = normalizeError(err);
    job.processingTimeMs = Date.now() - startTime;
    job.logs?.push(`Job failed: ${job.error}. Raw: ${err.message || err}`);
    job.actualCostUsdEstimate = 0;
  }
}
var warmAiRenderVertexAuth = async () => {
  const startedAt = Date.now();
  const client = await getVertexClient8();
  if (!client) {
    return { ready: false, isMock: true, warmupMs: 0 };
  }
  const tokenResponse = await client.getAccessToken();
  if (!tokenResponse?.token) throw new Error("Failed to warm the Google Cloud access token.");
  return { ready: true, warmupMs: Date.now() - startedAt };
};
var routeAiRenderApiRequest = async (request, response) => {
  const url = request.url || "";
  if (!url.startsWith("/api/ai-render")) {
    return false;
  }
  console.log(`[AI-Render API] Request: ${request.method} ${url}`);
  if (url === "/api/ai-render/auth/warm" && request.method === "POST") {
    try {
      const result = await warmAiRenderVertexAuth();
      console.log(`[AI-Render API] Vertex auth prewarmed in ${result.warmupMs}ms`);
      response.json(result);
    } catch (e) {
      console.warn(`[AI-Render API] Vertex auth prewarm failed:`, e);
      response.json({ ready: false, error: e.message });
    }
    return true;
  }
  if (url === "/api/ai-render/workflows" && request.method === "GET") {
    response.json(Object.values(WORKFLOWS));
    return true;
  }
  if (url.startsWith("/api/ai-render/models") && request.method === "GET") {
    const buffer = createArchitecturalChairGlbBuffer();
    if (response.send) {
      response.setHeader?.("Content-Type", "model/gltf-binary");
      response.setHeader?.("Content-Disposition", 'attachment; filename="sample-3d.glb"');
      response.send(Buffer.from(buffer), "model/gltf-binary");
    } else {
      response.json({
        dataUri: getSample3DModelDataUri(),
        glbBase64: getSample3DModelBase64()
      });
    }
    return true;
  }
  if (url === "/api/ai-render/enhance-prompt" && request.method === "POST") {
    const body = request.body || {};
    const { user_input, workflow_id, image_style, model } = body;
    const reqPayload = {
      ...body,
      user_input: user_input || "",
      workflow_id: Number(workflow_id || 1),
      image_style: image_style || "realistic",
      model: model || "gemini-3-pro-image"
    };
    try {
      const getAccessToken = async () => {
        const client = await getVertexClient8();
        if (!client) return null;
        const res = await client.getAccessToken();
        return res.token || null;
      };
      const enhancedPrompt = await PromptEnhancerEngine.enhanceWithVertex(
        reqPayload,
        getAccessToken
      );
      response.json({ enhanced_prompt: enhancedPrompt });
    } catch (e) {
      console.warn("[AI-Render API] Prompt enhancement error:", e);
      const fallbackPrompt = PromptEnhancerEngine.enhanceOffline(reqPayload);
      response.json({ enhanced_prompt: fallbackPrompt });
    }
    return true;
  }
  if (url === "/api/ai-render/uploads" && request.method === "POST") {
    const { filename, base64Data } = request.body || {};
    response.json({
      gcs_uri: `gs://rendair-competitor-assets/users/dev-user/ai-render/temp-uploads/${filename || "upload.png"}`,
      signed_url: base64Data || "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="
    });
    return true;
  }
  if (url === "/api/ai-render/jobs" && request.method === "POST") {
    const body = request.body || {};
    const { workflow_id, model, user_input, assets, options, parameters, override_prompt } = body;
    const workflow = WORKFLOWS[workflow_id];
    if (!workflow) {
      response.status(400).json({ error: "Invalid workflow_id" });
      return true;
    }
    const effectiveParams = parameters || options || {};
    const selectedModel = model || workflow.default_model;
    const jobId = "job_" + Math.random().toString(36).substr(2, 9);
    const resolvedOverride = override_prompt || options?.override_prompt || (typeof user_input === "string" && user_input.startsWith("TASK:") ? user_input : void 0);
    const compiledPrompt = resolvedOverride || PromptEnhancerEngine.enhanceOffline({
      user_input: user_input || workflow.name,
      workflow_id: workflow.id,
      image_style: body.image_style || options?.image_style || "realistic",
      model: selectedModel
    });
    const variants = effectiveParams?.variants || body.variants || 1;
    const costResult = WorkflowCostEstimator.calculate(workflow_id, selectedModel, effectiveParams);
    const mergedOptions = {
      ...body,
      parameters: effectiveParams,
      options: effectiveParams,
      user_input,
      assets
    };
    const newJob = {
      jobId,
      workflowId: workflow_id,
      status: "queued",
      model: selectedModel,
      options: mergedOptions,
      prompt: compiledPrompt,
      estimatedCostUsd: costResult.estimateUsd * variants,
      actualCostUsdEstimate: 0,
      processingTimeMs: 0,
      outputs: [],
      promptVersion: workflow.prompt_version,
      logs: ["Job created and queued."],
      createdAt: Date.now()
    };
    JOBS_DB[jobId] = newJob;
    if (isDurableJobStoreEnabled()) {
      await runAsyncJob(jobId);
      await putJob(JOBS_DB[jobId]);
      void sweepExpiredJobs();
      response.json(JOBS_DB[jobId]);
      return true;
    }
    void runAsyncJob(jobId);
    response.json(newJob);
    return true;
  }
  const statusMatch = url.match(/^\/api\/ai-render\/jobs\/([^/]+)$/);
  if (statusMatch && request.method === "GET") {
    const jobId = statusMatch[1];
    const job = await readJob(jobId);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
    } else {
      response.json(job);
    }
    return true;
  }
  const resultMatch = url.match(/^\/api\/ai-render\/jobs\/([^/]+)\/result$/);
  if (resultMatch && request.method === "GET") {
    const jobId = resultMatch[1];
    const job = await readJob(jobId);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
    } else {
      response.json({ status: job.status, outputs: job.outputs, error: job.error });
    }
    return true;
  }
  const cancelMatch = url.match(/^\/api\/ai-render\/jobs\/([^/]+)\/cancel$/);
  if (cancelMatch && request.method === "POST") {
    const jobId = cancelMatch[1];
    const job = await readJob(jobId);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
    } else {
      job.status = "cancelled";
      job.logs?.push("Job cancelled by user.");
      await putJob(job);
      response.json(job);
    }
    return true;
  }
  const retryMatch = url.match(/^\/api\/ai-render\/jobs\/([^/]+)\/retry$/);
  if (retryMatch && request.method === "POST") {
    const jobId = retryMatch[1];
    const job = await readJob(jobId);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
    } else {
      job.status = "queued";
      job.logs = ["Job retried."];
      if (isDurableJobStoreEnabled()) {
        await runAsyncJob(jobId);
        await putJob(JOBS_DB[jobId]);
        response.json(JOBS_DB[jobId]);
        return true;
      }
      void runAsyncJob(jobId);
      response.json(job);
    }
    return true;
  }
  const rateMatch = url.match(/^\/api\/ai-render\/jobs\/([^/]+)\/rate$/);
  if (rateMatch && request.method === "POST") {
    const jobId = rateMatch[1];
    const { rating } = request.body || {};
    const job = await readJob(jobId);
    if (!job) {
      response.status(404).json({ error: "Job not found" });
    } else {
      job.userRating = rating;
      await putJob(job);
      response.json({ success: true, job });
    }
    return true;
  }
  response.status(404).json({ error: "Not Found" });
  return true;
};

// services/vercelApiHandler.ts
var revitExportBackend = null;
var apsRevitImportBackend = null;
var dispatch = async (gated, response) => {
  const url = String(gated.url || "");
  const request = { method: gated.method, url, body: gated.body };
  if (url.startsWith("/api/exports/revit")) {
    revitExportBackend ||= new ApsRevitExportBackend();
    return routeRevitExportApiRequest(request, response, revitExportBackend);
  }
  if (url.startsWith("/api/imports/aps-revit")) {
    apsRevitImportBackend ||= new ApsRevitImportBackend();
    return routeApsRevitImportApiRequest(request, response, apsRevitImportBackend);
  }
  if (url.startsWith("/api/auto-plan")) return routeAutoPlanApiRequest(request, response);
  if (url.startsWith("/api/smart-text2plan")) return routeSmartText2PlanApiRequest(request, response);
  if (url.startsWith("/api/text4j")) return routeText4jApiRequest(request, response);
  if (url.startsWith("/api/text4h")) return routeText4hApiRequest(request, response);
  if (url.startsWith("/api/text4g")) return routeText4gApiRequest(request, response);
  if (url.startsWith("/api/text4f")) return routeText4fApiRequest(request, response);
  if (url.startsWith("/api/text4e")) return routeText4eApiRequest(request, response);
  if (url.startsWith("/api/text4d")) return routeText4dApiRequest(request, response);
  if (url.startsWith("/api/text2plan")) return routeText2PlanApiRequest(request, response);
  if (url.startsWith("/api/ai-render")) return routeAiRenderApiRequest(request, response);
  return false;
};
var resolveUrl = (req) => {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const rewrittenPath = requestUrl.searchParams.get("__path") || req.query?.__path;
  if (!rewrittenPath) return `${requestUrl.pathname}${requestUrl.search}`;
  requestUrl.searchParams.delete("__path");
  const rest = requestUrl.searchParams.toString();
  return `${rewrittenPath}${rest ? `?${rest}` : ""}`;
};
var readBody = async (req) => {
  if (req.method !== "POST") return void 0;
  if (req.body !== void 0) return typeof req.body === "string" && req.body.trim() ? JSON.parse(req.body) : req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw.trim() ? JSON.parse(raw) : void 0;
};
async function handler(req, res) {
  const sendJson = (status, payload) => {
    if (res.writableEnded) return;
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  };
  const response = {
    status(code) {
      res.statusCode = code;
      return response;
    },
    json(payload) {
      if (res.writableEnded) return;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(payload));
    }
  };
  try {
    const url = resolveUrl(req);
    let body;
    try {
      body = await readBody(req);
    } catch (error) {
      sendJson(400, { error: `Invalid JSON body: ${error instanceof Error ? error.message : String(error)}` });
      return;
    }
    const handled = await runGatedApiRequest({ method: req.method, url, headers: req.headers, body }, response, dispatch);
    if (!handled) sendJson(404, { error: "Not Found" });
  } catch (error) {
    sendJson(500, { error: error instanceof Error ? error.message : String(error) });
  }
}
export {
  handler as default
};
