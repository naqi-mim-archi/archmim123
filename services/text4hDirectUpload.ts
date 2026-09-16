import type { Point } from '../types';
import type { ConfirmedText4hBrief } from './text4hBrief';

export type Text4hDirectUploadUnitSystem = 'imperial' | 'metric';

export interface Text4hDirectUploadScaleInput {
  unitSystem: Text4hDirectUploadUnitSystem;
  width: string;
  depth: string;
  area: string;
}

export interface Text4hDirectUploadValidation {
  valid: boolean;
  errors: string[];
  hasDimensions: boolean;
  hasCompleteDimensions: boolean;
  hasArea: boolean;
  width?: number;
  depth?: number;
  area?: number;
}

export interface PreparedText4hDirectUpload {
  brief: ConfirmedText4hBrief;
  requestedBoundary?: Point[];
  requestedExtentsMeters: { width?: number; depth?: number };
  validation: Text4hDirectUploadValidation;
}

const normalizeMeasurement = (value: string): string => value
  .trim()
  .toLowerCase()
  .replace(/[’′]/g, "'")
  .replace(/[“”″]/g, '"')
  .replace(/,/g, '')
  .replace(/\s+/g, ' ');

const nonNegativeNumber = (value: string): number | undefined => {
  if (!/^\d+(?:\.\d+)?$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

const mixedNumber = (value: string): number | undefined => {
  const normalized = value.trim();
  const decimal = nonNegativeNumber(normalized);
  if (decimal !== undefined) return decimal;

  const mixed = normalized.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  const fraction = normalized.match(/^(\d+)\/(\d+)$/);
  const match = mixed ?? fraction;
  if (!match) return undefined;

  const whole = mixed ? Number(match[1]) : 0;
  const numerator = Number(match[mixed ? 2 : 1]);
  const denominator = Number(match[mixed ? 3 : 2]);
  if (!Number.isFinite(whole) || !Number.isFinite(numerator) || denominator <= 0 || numerator >= denominator) return undefined;
  return whole + numerator / denominator;
};

const imperialLengthInFeet = (value: string): number | undefined => {
  const normalized = normalizeMeasurement(value);
  if (!normalized) return undefined;

  const parseFeetAndInches = (feetText: string, inchesText = ''): number | undefined => {
    const feet = nonNegativeNumber(feetText);
    if (feet === undefined) return undefined;
    const cleanedInches = inchesText
      .trim()
      .replace(/^-\s*/, '')
      .replace(/\s*(?:"|in|inch|inches)\s*$/, '')
      .trim();
    const inches = cleanedInches ? mixedNumber(cleanedInches) : 0;
    if (inches === undefined || inches >= 12) return undefined;
    const total = feet + inches / 12;
    return total > 0 ? total : undefined;
  };

  const feetWithUnit = normalized.match(/^(\d+(?:\.\d+)?)\s*(?:'|ft|foot|feet)\s*(.*)$/);
  if (feetWithUnit) return parseFeetAndInches(feetWithUnit[1], feetWithUnit[2]);

  // Common architectural shorthand: 25-6 means 25 feet 6 inches.
  const architecturalShorthand = normalized.match(/^(\d+(?:\.\d+)?)\s*-\s*(.+)$/);
  if (architecturalShorthand) return parseFeetAndInches(architecturalShorthand[1], architecturalShorthand[2]);

  const inchesOnly = normalized.match(/^(.+?)\s*(?:"|in|inch|inches)$/);
  if (inchesOnly) {
    const inches = mixedNumber(inchesOnly[1]);
    return inches !== undefined && inches > 0 ? inches / 12 : undefined;
  }

  const decimalFeet = nonNegativeNumber(normalized);
  return decimalFeet !== undefined && decimalFeet > 0 ? decimalFeet : undefined;
};

const metricLengthInMeters = (value: string): number | undefined => {
  const normalized = normalizeMeasurement(value);
  if (!normalized) return undefined;
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(m|meter|meters|metre|metres|cm|centimeter|centimeters|centimetre|centimetres|mm|millimeter|millimeters|millimetre|millimetres)?$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const unit = match[2] ?? 'm';
  if (unit === 'cm' || unit.startsWith('centi')) return amount / 100;
  if (unit === 'mm' || unit.startsWith('milli')) return amount / 1000;
  return amount;
};

const propertyArea = (value: string, unitSystem: Text4hDirectUploadUnitSystem): number | undefined => {
  const normalized = normalizeMeasurement(value);
  if (!normalized) return undefined;
  const match = normalized.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);
  if (!match) return undefined;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;
  const suffix = match[2].trim();
  const validSuffix = unitSystem === 'imperial'
    ? /^(?:|sq\.?\s*ft|sqft|sft|ft(?:2|²)|square\s+(?:foot|feet))$/
    : /^(?:|sq\.?\s*m|sqm|m(?:2|²)|square\s+(?:meter|meters|metre|metres))$/;
  return validSuffix.test(suffix) ? amount : undefined;
};

export const validateText4hDirectUploadScale = (
  input: Text4hDirectUploadScaleInput,
): Text4hDirectUploadValidation => {
  const errors: string[] = [];
  const widthEntered = input.width.trim().length > 0;
  const depthEntered = input.depth.trim().length > 0;
  const areaEntered = input.area.trim().length > 0;
  const parseLength = input.unitSystem === 'imperial' ? imperialLengthInFeet : metricLengthInMeters;
  const width = parseLength(input.width);
  const depth = parseLength(input.depth);
  const area = propertyArea(input.area, input.unitSystem);
  const lengthExample = input.unitSystem === 'imperial' ? `25'-6" or 25.5 ft` : '7.62 m, 762 cm, or 7620 mm';
  const areaExample = input.unitSystem === 'imperial' ? '1,000 sq ft' : '92.9 m²';

  if (widthEntered && width === undefined) errors.push(`Enter property width as a positive ${input.unitSystem} length, for example ${lengthExample}.`);
  if (depthEntered && depth === undefined) errors.push(`Enter property depth as a positive ${input.unitSystem} length, for example ${lengthExample}.`);
  if (areaEntered && area === undefined) errors.push(`Enter property area in the selected unit system, for example ${areaExample}.`);

  const hasDimensions = width !== undefined || depth !== undefined;
  const hasCompleteDimensions = width !== undefined && depth !== undefined;
  const hasArea = area !== undefined;
  if (!hasDimensions) {
    errors.push('Enter at least one property dimension before conversion. Property area is optional.');
  }

  return { valid: errors.length === 0, errors, hasDimensions, hasCompleteDimensions, hasArea, width, depth, area };
};

export const prepareText4hDirectUpload = (
  sourceBrief: ConfirmedText4hBrief,
  input: Text4hDirectUploadScaleInput,
): PreparedText4hDirectUpload => {
  const validation = validateText4hDirectUploadScale(input);
  const lengthUnit = input.unitSystem === 'imperial' ? 'ft' : 'm';
  const areaUnit = input.unitSystem === 'imperial' ? 'sq_ft' : 'sq_m';
  const width = validation.width ?? 0;
  const depth = validation.depth ?? 0;
  const area = validation.area ?? 0;
  const meterScale = input.unitSystem === 'imperial' ? 0.3048 : 1;
  const requestedBoundary = validation.hasCompleteDimensions
    ? [
        { x: 0, y: 0 },
        { x: width * meterScale, y: 0 },
        { x: width * meterScale, y: depth * meterScale },
        { x: 0, y: depth * meterScale },
      ]
    : undefined;

  return {
    validation,
    requestedBoundary,
    requestedExtentsMeters: {
      ...(validation.width !== undefined ? { width: validation.width * meterScale } : {}),
      ...(validation.depth !== undefined ? { depth: validation.depth * meterScale } : {}),
    },
    brief: {
      ...sourceBrief,
      dimensions: {
        area: {
          value: area,
          unit: areaUnit,
          source: validation.hasArea ? 'user_confirmed' : 'application_default',
        },
        envelope: {
          width,
          depth,
          unit: lengthUnit,
          scope: 'enclosed_plan_envelope',
          source: validation.hasCompleteDimensions ? 'user_confirmed' : 'application_default',
        },
        // The upload test supplies scale context, not a generation constraint.
        rectangularBoundary: { locked: false, source: 'ineligible' },
      },
      provenance: { ...sourceBrief.provenance, confirmed: true, lastEditedSection: 'dimensions' },
    },
  };
};
