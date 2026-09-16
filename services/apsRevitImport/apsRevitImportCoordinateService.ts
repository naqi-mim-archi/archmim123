import { Point } from '../../types';
import { ApsRevitPoint3 } from './apsRevitImportTypes';

export const REVIT_FOOT_TO_METER = 0.3048;
export const METER_TO_REVIT_FOOT = 1 / REVIT_FOOT_TO_METER;

export interface AppPoint3 extends Point {
  z?: number;
}

const finite = (value: unknown, fallback = 0): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : fallback
);

export class ApsRevitImportCoordinateService {
  toAppLength(revitFeet: unknown, fallback = 0): number {
    return finite(revitFeet, fallback) * REVIT_FOOT_TO_METER;
  }

  toAppPoint(point?: ApsRevitPoint3 | null): AppPoint3 | null {
    if (!point) return null;
    return {
      x: this.toAppLength(point.x),
      y: -this.toAppLength(point.y),
      z: point.z === undefined ? undefined : this.toAppLength(point.z),
    };
  }

  toAppRotationDegrees(revitRotationRadiansOrDegrees: unknown): number {
    const raw = finite(revitRotationRadiansOrDegrees, 0);
    const degrees = Math.abs(raw) > Math.PI * 2 + 0.001 ? raw : raw * 180 / Math.PI;
    return -degrees;
  }

  toAppAngleRadians(revitAngleRadiansOrDegrees: unknown): number {
    const raw = finite(revitAngleRadiansOrDegrees, 0);
    const radians = Math.abs(raw) > Math.PI * 2 + 0.001 ? raw * Math.PI / 180 : raw;
    return -radians;
  }

  toAppArea(revitSquareFeet: unknown, fallback = 0): number {
    return finite(revitSquareFeet, fallback) * REVIT_FOOT_TO_METER * REVIT_FOOT_TO_METER;
  }

  toAppVolume(revitCubicFeet: unknown, fallback = 0): number {
    return finite(revitCubicFeet, fallback) * REVIT_FOOT_TO_METER * REVIT_FOOT_TO_METER * REVIT_FOOT_TO_METER;
  }
}

export const apsRevitImportCoordinates = new ApsRevitImportCoordinateService();
