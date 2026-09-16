import type { Point } from '../../../../types';
import type { GeneratedData } from '../../types';
import { generateFloorplanImage4j } from '../../../../services/imageGenService4j';
import {
  classifyText4jRasterGeometry,
  extractGeometryFromLocalImage,
} from '../../../../services/localImageToJSON4j';
import { warmLocalFloorplanOcr4j } from '../../../../services/localFloorplanOcr4j';
import type { ConfirmedText4jBrief } from '../../../../services/text4jBrief';
import { text4jBriefToDesignSummary } from '../../../../services/text4jBrief';
import { annotateText4jGeneratedImageRooms } from '../../../../services/text4jGeneratedImageRoomLabels';
import type { Text4jMasterFloorplanSourceKind } from '../../../../services/text4jMasterFloorplanData';
import { resolveText4jWallPreset } from '../../../../services/text4jPresetResolver';
import {
  requestText4jStructuredGeometry,
  type Text4jStructuredGeometry,
} from '../../../../services/text4jStructured3dClient';
import { reconcileText4jStructuredGeometry } from '../../../../services/text4jStructuredGeometryReconciler';
export { refineDesignRequirements4j } from '../../../../services/chatService4j';
export { completeText4jGeometry } from './geometry';

export interface Text4jImageConversionOptions {
  workflowStartedAt?: number;
  warmOcr?: boolean;
  annotateGeneratedPreview?: boolean;
  requestedExtentsMeters?: { width?: number; depth?: number };
  preventFallbackForCurvilinearGenerated?: boolean;
  sourceKind?: Text4jMasterFloorplanSourceKind;
  useMasterFloorplanData?: boolean;
  /** Receives the unscaled Structured3D wall-candidate payload for the middle comparison pane. */
  onStructuredReady?: (geometry: Text4jStructuredGeometry) => void;
  /** Emits a raster-only, import-locked preview while local OCR continues. */
  onGeometryReady?: (geometry: GeneratedData) => void;
}

const text4jBriefRequestsCurvilinearGeometry = (brief: ConfirmedText4jBrief): boolean => {
  const text = [
    brief.project.purpose,
    brief.project.type,
    brief.project.variant || '',
    brief.planningStyle,
    ...brief.adjacency.map(rule => rule.description),
  ].join(' ');
  return /\b(?:circular|circle|round|radial|curved|curvilinear|arc|elliptic|elliptical|ellipse|organic|semi[-\s]?circular)\b/i.test(text);
};

const buildText4jImageOnlyFailureGeometry = (
  base64Image: string,
  confirmedBrief: ConfirmedText4jBrief,
  error: unknown,
): GeneratedData => {
  const reason = error instanceof Error ? error.message : String(error || 'unknown raster topology');
  const requestedRoomLabels = confirmedBrief.rooms.reduce((sum, room) => sum + Math.max(1, room.count), 0);
  return {
    boundary: [],
    walls: [],
    doors: [],
    windows: [],
    openings: [],
    rooms: [],
    columns: [],
    stairs: [],
    slabs: [],
    railings: [],
    furniture: [],
    fixtures: [],
    sourceImageBase64: base64Image,
    extractionDiagnostics: {
      confidence: 'low',
      canImport: false,
      scaleSource: 'requested-boundary',
      warnings: [
        `Curvilinear generated image was preserved without deterministic rectangular fallback because local tracing reported: ${reason}`,
      ],
      detectedRoomLabels: 0,
      requestedRoomLabels,
    },
  };
};

const classifyText4jBase64Heometry = async (base64Image: string): Promise<'orthogonal' | 'angular' | 'curved' | 'hybrid'> => {
  if (typeof Image === 'undefined' || typeof document === 'undefined') return 'orthogonal';
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      try {
        const maxDimension = 1200;
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve('orthogonal');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(classifyText4jRasterGeometry(ctx.getImageData(0, 0, width, height)));
      } catch {
        resolve('orthogonal');
      }
    };
    img.onerror = () => resolve('orthogonal');
    img.src = base64Image;
  });
};

export async function convertFloorplanImage4j(
  base64Image: string,
  confirmedBrief: ConfirmedText4jBrief,
  requestedBoundary?: Point[],
  options: Text4jImageConversionOptions = {},
): Promise<GeneratedData> {
  const workflowStartedAt = options.workflowStartedAt ?? Date.now();
  const designSummary = text4jBriefToDesignSummary(confirmedBrief);
  const exteriorWallThicknessMeters = resolveText4jWallPreset({
    semanticRole: 'exterior',
    projectClass: [confirmedBrief.project.category, confirmedBrief.project.type, confirmedBrief.project.purpose].filter(Boolean).join(' '),
    evidenceStrength: 'none',
  }).resolvedValues.thicknessM ?? 0.23;

  // Direct uploads have no Gemini wait during which the cached worker can
  // warm. This remains best-effort and does not change the extractor itself.
  if (options.warmOcr !== false) void warmLocalFloorplanOcr4j();

  console.log('[Text 4.0 J] Step 2: Running Structured3D and the unchanged J-local baseline in parallel');
  const structuredStartedAt = Date.now();
  const extractionStartedAt = Date.now();
  const structuredTask = requestText4jStructuredGeometry(base64Image).then(structuredGeometry => {
    options.onStructuredReady?.(structuredGeometry);
    console.log(`[Text 4.0 J] Structured3D returned ${structuredGeometry.walls.length} wall-face candidates in ${Date.now() - structuredStartedAt}ms (service ${structuredGeometry.processingMs}ms)`);
    return structuredGeometry;
  });
  const localTask = extractGeometryFromLocalImage(base64Image, {
      requestedBoundary,
      requestedWidthMeters: options.requestedExtentsMeters?.width,
      requestedDepthMeters: options.requestedExtentsMeters?.depth,
      designSummary,
      enforceRequestedEnvelope: true,
      exteriorWallThicknessMeters,
      // The raster-only callback makes the plan visible immediately. The final
      // result now waits for OCR instead of discarding labels at a 900ms cutoff.
      awaitOcrCompletion: true,
      onGeometryReady: options.onGeometryReady
        ? provisional => {
            provisional.sourceImageBase64 = base64Image;
            options.onGeometryReady?.(provisional);
          }
        : undefined,
    });
  const [structuredResult, localResult] = await Promise.allSettled([structuredTask, localTask]);
  if (structuredResult.status === 'rejected') throw structuredResult.reason;

  let rawGeometry: GeneratedData;
  if (localResult.status === 'rejected') {
    const error = localResult.reason;
    const rasterMode = options.preventFallbackForCurvilinearGenerated
      ? await classifyText4jBase64Heometry(base64Image)
      : 'orthogonal';
    const shouldPreventCurvilinearFallback = options.preventFallbackForCurvilinearGenerated
      && (text4jBriefRequestsCurvilinearGeometry(confirmedBrief) || rasterMode === 'curved' || rasterMode === 'hybrid');
    if (shouldPreventCurvilinearFallback) {
      console.warn(`[Text 4.0 J] ${rasterMode} image tracing failed after mature extraction; preserving raster without rectangular fallback geometry.`, error);
      rawGeometry = buildText4jImageOnlyFailureGeometry(base64Image, confirmedBrief, error);
      if (rawGeometry.extractionDiagnostics?.warnings) {
        rawGeometry.extractionDiagnostics.warnings = [
          ...rawGeometry.extractionDiagnostics.warnings,
          `Full curvilinear/hybrid extraction reported: ${error instanceof Error ? error.message : String(error || 'unknown raster topology')}`,
        ];
      }
    } else throw new Error(`Text 4.0 J hybrid refinement failed after Structured3D geometry: ${error instanceof Error ? error.message : String(error)}`);
  } else {
    console.log('[Text 4.0 J] Step 3: Reconciling paired Structured3D wall faces over the unchanged Local baseline');
    const reconciled = await reconcileText4jStructuredGeometry(base64Image, localResult.value, structuredResult.value);
    rawGeometry = reconciled.data;
    console.log(`[Text 4.0 J] Geometry reconciliation kept ${reconciled.audit.acceptedRepairs} repairs from ${reconciled.audit.pairedCenterlines} paired centerline candidates; ${reconciled.audit.rejectedOverlap} overlap and ${reconciled.audit.rejectedLengthBudget} length-budget candidates were rejected individually.`);
  }
  console.log(`[Text 4.0 J] Local extraction completed in ${Date.now() - extractionStartedAt}ms; total workflow ${Date.now() - workflowStartedAt}ms`);

  let previewImage = base64Image;
  if (options.annotateGeneratedPreview) {
    // Generated-image labels remain presentation-only and are deliberately not
    // applied to uploads, preserving the exact raster under conversion test.
    try {
      previewImage = await annotateText4jGeneratedImageRooms(base64Image, rawGeometry, confirmedBrief);
    } catch (error) {
      console.warn('[Text 4.0 J] Deterministic room-dimension annotation was unavailable; preserving the generated image.', error);
    }
  }
  rawGeometry.sourceImageBase64 = previewImage;
  return rawGeometry;
}

export async function generateFloorplan4j(
  confirmedBrief: ConfirmedText4jBrief,
  requestedBoundary?: Point[],
  options: Pick<Text4jImageConversionOptions, 'onGeometryReady'> = {},
): Promise<GeneratedData> {
  const workflowStartedAt = Date.now();

  // Warm the cached local OCR worker while Vertex renders the image. This is
  // best-effort and never delays or prevents the image-generation request.
  void warmLocalFloorplanOcr4j();

  // 1. Generate the source image using the confirmed canonical brief.
  console.log('[Text 4.0 J] Step 1: Generating Image');
  const base64Image = await generateFloorplanImage4j(confirmedBrief);
  return convertFloorplanImage4j(base64Image, confirmedBrief, requestedBoundary, {
    workflowStartedAt,
    warmOcr: false,
    annotateGeneratedPreview: false,
    preventFallbackForCurvilinearGenerated: true,
    sourceKind: 'generated',
    useMasterFloorplanData: false,
    onGeometryReady: options.onGeometryReady,
  });
}
