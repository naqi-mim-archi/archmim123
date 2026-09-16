/**
 * Conservative preset resolution for Text 4.0 E digitization.
 *
 * This module intentionally has no React or editor dependencies. The IDs, labels,
 * dimensions and subtypes below mirror WALL_PRESETS, DOOR_PRESETS and
 * WINDOW_PRESETS in constants.tsx. The regression test compares both catalogs so
 * a future catalog change cannot silently make digitization use stale values.
 *
 * Resolution policy:
 * - measured geometry is never overwritten by a role-based assumption;
 * - a measured element is snapped to a catalog preset only when the caller
 *   supplies a finite tolerance and the complete measured signature is inside it;
 * - otherwise its measured dimensions are preserved as a custom element;
 * - door-role defaults are allowed only when measured width is unavailable and
 *   the image evidence is explicitly weak or absent.
 */

export const TEXT4E_WALL_PRESETS = [
  { id: 'wall_ext_res', label: 'Residential Exterior (9")', thicknessM: 0.230, subtype: 'exterior' },
  { id: 'wall_ext_comm', label: 'Commercial Exterior (12")', thicknessM: 0.300, subtype: 'exterior' },
  { id: 'wall_ext_light', label: 'Lightweight Exterior (6")', thicknessM: 0.150, subtype: 'exterior' },
  { id: 'wall_int_struct', label: 'Structural Interior (6")', thicknessM: 0.150, subtype: 'structural-interior' },
  { id: 'wall_int_res', label: 'Res/Comm Interior (4.5")', thicknessM: 0.115, subtype: 'interior' },
  { id: 'wall_part', label: 'Partition Wall (3")', thicknessM: 0.075, subtype: 'partition' },
  { id: 'wall_glass', label: 'Glass Partition', thicknessM: 0.012, subtype: 'glass' },
] as const;

export const TEXT4E_DOOR_PRESETS = [
  { id: 'door_single_sm', label: 'Single 2\'3" (Bath)', widthM: 0.686, subtype: 'single' },
  { id: 'door_single_md', label: 'Single 2\'9" (Bed)', widthM: 0.838, subtype: 'single' },
  { id: 'door_single_lg', label: 'Single 3\'0" (Office)', widthM: 0.914, subtype: 'single' },
  { id: 'door_main', label: 'Main Entrance 4\'0"', widthM: 1.219, subtype: 'single' },
  { id: 'door_double_int', label: 'Double 5\'0"', widthM: 1.524, subtype: 'double' },
  { id: 'door_double_main', label: 'Double Main 6\'0"', widthM: 1.829, subtype: 'double' },
  { id: 'door_sliding', label: 'Sliding Door', widthM: 1.5, subtype: 'sliding' },
  { id: 'door_folding', label: 'Folding Door', widthM: 1.5, subtype: 'folding' },
  { id: 'door_glass', label: 'Glass Door', widthM: 0.914, subtype: 'glass' },
] as const;

export const TEXT4E_WINDOW_PRESETS = [
  { id: 'win_reg_sm', label: 'Regular 3\'x4\'', widthM: 0.914, heightM: 1.219, subtype: 'regular' },
  { id: 'win_reg_md', label: 'Regular 4\'x4\'', widthM: 1.219, heightM: 1.219, subtype: 'regular' },
  { id: 'win_reg_lg', label: 'Regular 5\'x4\'', widthM: 1.524, heightM: 1.219, subtype: 'regular' },
  { id: 'win_liv', label: 'Living 6\'x4\'', widthM: 1.829, heightM: 1.219, subtype: 'regular' },
  { id: 'win_angled_bay', label: 'Angled Bay Window', widthM: 2.5, heightM: null, subtype: 'angled-bay' },
  { id: 'win_box_bay', label: 'Box Bay Window', widthM: 2.0, heightM: null, subtype: 'box-bay' },
  { id: 'win_curved_bay', label: 'Curved Bay Window', widthM: 2.5, heightM: null, subtype: 'curved-bay' },
] as const;

export type Text4eEvidenceStrength = 'strong' | 'medium' | 'weak' | 'none';
export type Text4eResolutionConfidence = 'high' | 'medium' | 'low' | 'unresolved';
export type Text4eResolutionProvenance =
  | 'measured-preset'
  | 'measured-custom'
  | 'role-default'
  | 'semantic-default'
  | 'unresolved';
export type Text4eWallRole = 'exterior' | 'interior' | 'structural-interior' | 'partition' | 'glass';

export interface Text4eMeasuredValues {
  widthM: number | null;
  heightM: number | null;
  thicknessM: number | null;
}

export interface Text4ePresetResolution {
  kind: 'wall' | 'door' | 'window';
  presetId: string | null;
  presetLabel: string | null;
  subtype: string;
  measuredValues: Text4eMeasuredValues;
  resolvedValues: Text4eMeasuredValues;
  confidence: Text4eResolutionConfidence;
  provenance: Text4eResolutionProvenance;
  /** Maximum absolute catalog delta across dimensions used for matching. */
  matchDeltaM: number | null;
  /** Echoes the caller's valid tolerance; null means catalog snapping was disabled. */
  toleranceM: number | null;
  requiresReview: boolean;
  rationale: string;
}

export interface ResolveText4eWallInput {
  semanticRole: Text4eWallRole;
  projectClass?: string | null;
  measuredThicknessM?: number | null;
  evidenceStrength?: Text4eEvidenceStrength;
  /** Required for measured-to-preset snapping. No implicit tolerance is applied. */
  toleranceM?: number | null;
}

export interface ResolveText4eDoorInput {
  measuredWidthM?: number | null;
  measuredHeightM?: number | null;
  detectedSubtype?: string | null;
  roomRole?: string | null;
  evidenceStrength?: Text4eEvidenceStrength;
  /** Required for measured-to-preset snapping. No implicit tolerance is applied. */
  toleranceM?: number | null;
}

export interface ResolveText4eWindowInput {
  measuredWidthM?: number | null;
  measuredHeightM?: number | null;
  detectedSubtype?: string | null;
  evidenceStrength?: Text4eEvidenceStrength;
  /** Required for measured-to-preset snapping. No implicit tolerance is applied. */
  toleranceM?: number | null;
}

const cleanText = (value?: string | null): string => (value || '')
  .toLowerCase()
  .replace(/[_/]+/g, '-')
  .replace(/\s+/g, ' ')
  .trim();

const positiveMeasurement = (value?: number | null): number | null => (
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
);

const explicitTolerance = (value?: number | null): number | null => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
);

const evidenceConfidence = (
  strength: Text4eEvidenceStrength,
  unresolved = false,
): Text4eResolutionConfidence => {
  if (unresolved) return 'unresolved';
  if (strength === 'strong') return 'high';
  if (strength === 'medium') return 'medium';
  return 'low';
};

const emptyValues = (): Text4eMeasuredValues => ({ widthM: null, heightM: null, thicknessM: null });

const normalizeDoorSubtype = (value?: string | null): string => {
  const subtype = cleanText(value);
  if (!subtype) return '';
  if (subtype.includes('sliding')) return 'sliding';
  if (subtype.includes('folding') || subtype.includes('bi-fold')) return 'folding';
  if (subtype.includes('double')) return 'double';
  if (subtype.includes('glass') || subtype.includes('glazed')) return 'glass';
  if (subtype.includes('single') || subtype.includes('hinged')) return 'single';
  return subtype;
};

const normalizeWindowSubtype = (value?: string | null): string => {
  const subtype = cleanText(value);
  if (!subtype) return '';
  if (subtype.includes('angled') && subtype.includes('bay')) return 'angled-bay';
  if (subtype.includes('box') && subtype.includes('bay')) return 'box-bay';
  if (subtype.includes('curved') && subtype.includes('bay')) return 'curved-bay';
  if (subtype === 'regular' || subtype === 'standard') return 'regular';
  return subtype;
};

const roleDoorPresetId = (role?: string | null): string | null => {
  const normalized = cleanText(role);
  if (!normalized) return null;
  if (/\b(bath|bathroom|powder|toilet|wc|lavatory)\b/.test(normalized)) return 'door_single_sm';
  if (/\b(bed|bedroom|master bedroom|primary bedroom|guest room)\b/.test(normalized)) return 'door_single_md';
  if (/\b(main entrance|main entry|primary entrance|front door|entry door|entrance door)\b/.test(normalized)) return 'door_main';
  if (/\b(office|circulation|corridor|hall|living|general)\b/.test(normalized)) return 'door_single_lg';
  return null;
};

const wallCandidates = (role: Text4eWallRole): readonly (typeof TEXT4E_WALL_PRESETS)[number][] => {
  if (role === 'exterior') return TEXT4E_WALL_PRESETS.filter(preset => preset.subtype === 'exterior');
  return TEXT4E_WALL_PRESETS.filter(preset => preset.subtype === role);
};

const semanticWallPresetId = (role: Text4eWallRole, projectClass?: string | null): string => {
  if (role === 'glass') return 'wall_glass';
  if (role === 'partition') return 'wall_part';
  if (role === 'structural-interior') return 'wall_int_struct';
  if (role === 'interior') return 'wall_int_res';

  const project = cleanText(projectClass);
  if (/\b(lightweight|modular|temporary)\b/.test(project)) return 'wall_ext_light';
  if (/\b(commercial|office|retail|showroom|restaurant|food|healthcare|hospital|education|school|industrial|warehouse|institutional|public|mixed-use)\b/.test(project)) {
    return 'wall_ext_comm';
  }
  return 'wall_ext_res';
};

export const resolveText4eWallPreset = (input: ResolveText4eWallInput): Text4ePresetResolution => {
  const measuredThicknessM = positiveMeasurement(input.measuredThicknessM);
  const toleranceM = explicitTolerance(input.toleranceM);
  const evidence = input.evidenceStrength || 'none';
  const measuredValues: Text4eMeasuredValues = { ...emptyValues(), thicknessM: measuredThicknessM };

  if (measuredThicknessM !== null) {
    const nearest = wallCandidates(input.semanticRole)
      .map(preset => ({ preset, delta: Math.abs(preset.thicknessM - measuredThicknessM) }))
      .sort((a, b) => a.delta - b.delta)[0];
    if (nearest && toleranceM !== null && nearest.delta <= toleranceM) {
      return {
        kind: 'wall',
        presetId: nearest.preset.id,
        presetLabel: nearest.preset.label,
        subtype: nearest.preset.subtype,
        measuredValues,
        resolvedValues: { ...emptyValues(), thicknessM: nearest.preset.thicknessM },
        confidence: evidenceConfidence(evidence),
        provenance: 'measured-preset',
        matchDeltaM: nearest.delta,
        toleranceM,
        requiresReview: evidence === 'weak' || evidence === 'none',
        rationale: `Measured thickness is within ${toleranceM} m of the ${nearest.preset.label} catalog preset.`,
      };
    }

    return {
      kind: 'wall',
      presetId: null,
      presetLabel: null,
      subtype: input.semanticRole,
      measuredValues,
      resolvedValues: { ...emptyValues(), thicknessM: measuredThicknessM },
      confidence: evidenceConfidence(evidence),
      provenance: 'measured-custom',
      matchDeltaM: nearest?.delta ?? null,
      toleranceM,
      requiresReview: evidence === 'weak' || evidence === 'none',
      rationale: toleranceM === null
        ? 'Measured wall thickness was preserved because no catalog-match tolerance was supplied.'
        : 'Measured wall thickness does not match a compatible catalog preset within tolerance and was preserved as custom.',
    };
  }

  const presetId = semanticWallPresetId(input.semanticRole, input.projectClass);
  const preset = TEXT4E_WALL_PRESETS.find(candidate => candidate.id === presetId)!;
  const explicitProjectClass = cleanText(input.projectClass).length > 0;
  return {
    kind: 'wall',
    presetId: preset.id,
    presetLabel: preset.label,
    subtype: preset.subtype,
    measuredValues,
    resolvedValues: { ...emptyValues(), thicknessM: preset.thicknessM },
    confidence: input.semanticRole === 'exterior' && !explicitProjectClass ? 'low' : 'medium',
    provenance: 'semantic-default',
    matchDeltaM: null,
    toleranceM,
    requiresReview: true,
    rationale: input.semanticRole === 'exterior'
      ? `No reliable thickness was measured; ${preset.label} was selected from project class "${input.projectClass || 'unspecified residential default'}".`
      : `No reliable thickness was measured; ${preset.label} was selected from the ${input.semanticRole} semantic role.`,
  };
};

export const resolveText4eDoorPreset = (input: ResolveText4eDoorInput): Text4ePresetResolution => {
  const measuredWidthM = positiveMeasurement(input.measuredWidthM);
  const measuredHeightM = positiveMeasurement(input.measuredHeightM);
  const toleranceM = explicitTolerance(input.toleranceM);
  const evidence = input.evidenceStrength || 'none';
  const detectedSubtype = normalizeDoorSubtype(input.detectedSubtype);
  const measuredValues: Text4eMeasuredValues = {
    ...emptyValues(),
    widthM: measuredWidthM,
    heightM: measuredHeightM,
  };

  if (measuredWidthM !== null) {
    const knownSubtype = TEXT4E_DOOR_PRESETS.some(preset => preset.subtype === detectedSubtype);
    const candidates = knownSubtype
      ? TEXT4E_DOOR_PRESETS.filter(preset => preset.subtype === detectedSubtype)
      : detectedSubtype ? [] : [...TEXT4E_DOOR_PRESETS];
    const nearest = candidates
      .map(preset => ({ preset, delta: Math.abs(preset.widthM - measuredWidthM) }))
      .sort((a, b) => a.delta - b.delta)[0];

    if (nearest && toleranceM !== null && nearest.delta <= toleranceM) {
      return {
        kind: 'door',
        presetId: nearest.preset.id,
        presetLabel: nearest.preset.label,
        subtype: nearest.preset.subtype,
        measuredValues,
        resolvedValues: { ...emptyValues(), widthM: nearest.preset.widthM, heightM: measuredHeightM },
        confidence: evidenceConfidence(evidence),
        provenance: 'measured-preset',
        matchDeltaM: nearest.delta,
        toleranceM,
        requiresReview: evidence === 'weak' || evidence === 'none',
        rationale: `Measured clear width is within ${toleranceM} m of the ${nearest.preset.label} catalog preset.`,
      };
    }

    return {
      kind: 'door',
      presetId: null,
      presetLabel: null,
      subtype: detectedSubtype || 'custom',
      measuredValues,
      resolvedValues: { ...emptyValues(), widthM: measuredWidthM, heightM: measuredHeightM },
      confidence: evidenceConfidence(evidence),
      provenance: 'measured-custom',
      matchDeltaM: nearest?.delta ?? null,
      toleranceM,
      requiresReview: evidence === 'weak' || evidence === 'none',
      rationale: toleranceM === null
        ? 'Measured door dimensions were preserved because no catalog-match tolerance was supplied.'
        : 'Measured door dimensions do not match a compatible catalog preset within tolerance and were preserved as custom.',
    };
  }

  const weakEvidence = evidence === 'weak' || evidence === 'none';
  const rolePresetId = weakEvidence ? roleDoorPresetId(input.roomRole) : null;
  const rolePreset = rolePresetId
    ? TEXT4E_DOOR_PRESETS.find(candidate => candidate.id === rolePresetId) || null
    : null;
  if (rolePreset) {
    return {
      kind: 'door',
      presetId: rolePreset.id,
      presetLabel: rolePreset.label,
      subtype: rolePreset.subtype,
      measuredValues,
      resolvedValues: { ...emptyValues(), widthM: rolePreset.widthM, heightM: measuredHeightM },
      confidence: 'low',
      provenance: 'role-default',
      matchDeltaM: null,
      toleranceM,
      requiresReview: true,
      rationale: `No reliable clear width was measured; ${rolePreset.label} was inferred from room role "${input.roomRole}".`,
    };
  }

  return {
    kind: 'door',
    presetId: null,
    presetLabel: null,
    subtype: detectedSubtype || 'unresolved',
    measuredValues,
    resolvedValues: { ...emptyValues(), heightM: measuredHeightM },
    confidence: 'unresolved',
    provenance: 'unresolved',
    matchDeltaM: null,
    toleranceM,
    requiresReview: true,
    rationale: weakEvidence
      ? 'No reliable door width or supported room-role default is available.'
      : 'Role defaults are prohibited because image evidence is not weak; a measured width is required.',
  };
};

export const resolveText4eWindowPreset = (input: ResolveText4eWindowInput): Text4ePresetResolution => {
  const measuredWidthM = positiveMeasurement(input.measuredWidthM);
  const measuredHeightM = positiveMeasurement(input.measuredHeightM);
  const toleranceM = explicitTolerance(input.toleranceM);
  const evidence = input.evidenceStrength || 'none';
  const detectedSubtype = normalizeWindowSubtype(input.detectedSubtype);
  const measuredValues: Text4eMeasuredValues = {
    ...emptyValues(),
    widthM: measuredWidthM,
    heightM: measuredHeightM,
  };

  if (measuredWidthM !== null) {
    const knownSubtype = TEXT4E_WINDOW_PRESETS.some(preset => preset.subtype === detectedSubtype);
    // With no symbol subtype, only regular windows are eligible. Width alone must
    // never turn an ordinary opening into a bay window.
    const candidates = knownSubtype
      ? TEXT4E_WINDOW_PRESETS.filter(preset => preset.subtype === detectedSubtype)
      : detectedSubtype ? [] : TEXT4E_WINDOW_PRESETS.filter(preset => preset.subtype === 'regular');
    const nearest = candidates
      .map(preset => {
        const widthDelta = Math.abs(preset.widthM - measuredWidthM);
        const heightComparable = measuredHeightM !== null && preset.heightM !== null;
        const heightDelta = heightComparable ? Math.abs(preset.heightM! - measuredHeightM) : 0;
        const completeSignature = measuredHeightM === null || preset.heightM !== null;
        return {
          preset,
          delta: Math.max(widthDelta, heightDelta),
          score: widthDelta + heightDelta,
          completeSignature,
        };
      })
      .filter(candidate => candidate.completeSignature)
      .sort((a, b) => a.score - b.score)[0];

    if (nearest && toleranceM !== null && nearest.delta <= toleranceM) {
      return {
        kind: 'window',
        presetId: nearest.preset.id,
        presetLabel: nearest.preset.label,
        subtype: nearest.preset.subtype,
        measuredValues,
        resolvedValues: {
          ...emptyValues(),
          widthM: nearest.preset.widthM,
          heightM: nearest.preset.heightM ?? measuredHeightM,
        },
        confidence: evidenceConfidence(evidence),
        provenance: 'measured-preset',
        matchDeltaM: nearest.delta,
        toleranceM,
        requiresReview: evidence === 'weak' || evidence === 'none',
        rationale: `Measured window dimensions are within ${toleranceM} m of the ${nearest.preset.label} catalog preset.`,
      };
    }

    return {
      kind: 'window',
      presetId: null,
      presetLabel: null,
      subtype: detectedSubtype || 'custom',
      measuredValues,
      resolvedValues: { ...emptyValues(), widthM: measuredWidthM, heightM: measuredHeightM },
      confidence: evidenceConfidence(evidence),
      provenance: 'measured-custom',
      matchDeltaM: nearest?.delta ?? null,
      toleranceM,
      requiresReview: evidence === 'weak' || evidence === 'none',
      rationale: toleranceM === null
        ? 'Measured window dimensions were preserved because no catalog-match tolerance was supplied.'
        : 'Measured window dimensions do not match a compatible catalog preset within tolerance and were preserved as custom.',
    };
  }

  if (measuredHeightM !== null) {
    return {
      kind: 'window',
      presetId: null,
      presetLabel: null,
      subtype: detectedSubtype || 'custom',
      measuredValues,
      resolvedValues: { ...emptyValues(), heightM: measuredHeightM },
      confidence: evidenceConfidence(evidence),
      provenance: 'measured-custom',
      matchDeltaM: null,
      toleranceM,
      requiresReview: true,
      rationale: 'Window height was preserved, but width is required before matching a catalog preset.',
    };
  }

  return {
    kind: 'window',
    presetId: null,
    presetLabel: null,
    subtype: detectedSubtype || 'unresolved',
    measuredValues,
    resolvedValues: emptyValues(),
    confidence: 'unresolved',
    provenance: 'unresolved',
    matchDeltaM: null,
    toleranceM,
    requiresReview: true,
    rationale: 'No reliable window dimensions are available; window presets are never selected from room role alone.',
  };
};
