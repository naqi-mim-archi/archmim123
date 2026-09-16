import assert from 'node:assert/strict';
import { build } from 'esbuild';

const buildModule = async entryPoint => {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    platform: 'node',
    write: false,
    logLevel: 'silent',
  });
  const url = `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`;
  return import(url);
};

const resolver = await buildModule('services/text4fPresetResolver.ts');
const constants = await buildModule('constants.tsx');
const {
  TEXT4F_DOOR_PRESETS,
  TEXT4F_WALL_PRESETS,
  TEXT4F_WINDOW_PRESETS,
  resolveText4fDoorPreset,
  resolveText4fWallPreset,
  resolveText4fWindowPreset,
} = resolver;

// Keep the pure service catalog locked to the application's existing editor catalog.
assert.deepEqual(
  TEXT4F_WALL_PRESETS.map(({ id, label, thicknessM }) => ({ id, label, thickness: thicknessM })),
  constants.WALL_PRESETS,
);
assert.deepEqual(
  TEXT4F_DOOR_PRESETS.map(({ id, label, widthM, subtype }) => ({ id, label, width: widthM, subType: subtype })),
  constants.DOOR_PRESETS,
);
assert.deepEqual(
  TEXT4F_WINDOW_PRESETS.map(({ id, label, widthM, heightM, subtype }) => ({
    id,
    label,
    width: widthM,
    ...(heightM === null ? {} : { height: heightM }),
    ...(subtype === 'regular' ? {} : { subType: subtype }),
  })),
  constants.WINDOW_PRESETS,
);

const residentialExterior = resolveText4fWallPreset({
  semanticRole: 'exterior',
  projectClass: 'residential apartment',
});
assert.equal(residentialExterior.presetId, 'wall_ext_res');
assert.equal(residentialExterior.resolvedValues.thicknessM, 0.230);
assert.equal(residentialExterior.provenance, 'semantic-default');

const residentialInterior = resolveText4fWallPreset({
  semanticRole: 'interior',
  projectClass: 'residential',
});
assert.equal(residentialInterior.presetId, 'wall_int_res');
assert.equal(residentialInterior.resolvedValues.thicknessM, 0.115);

const commercialExterior = resolveText4fWallPreset({
  semanticRole: 'exterior',
  projectClass: 'commercial office',
});
assert.equal(commercialExterior.presetId, 'wall_ext_comm');
assert.equal(commercialExterior.resolvedValues.thicknessM, 0.300);

const measuredCustomWall = resolveText4fWallPreset({
  semanticRole: 'exterior',
  projectClass: 'residential',
  measuredThicknessM: 0.19,
  toleranceM: 0.01,
  evidenceStrength: 'strong',
});
assert.equal(measuredCustomWall.presetId, null);
assert.equal(measuredCustomWall.resolvedValues.thicknessM, 0.19);
assert.equal(measuredCustomWall.provenance, 'measured-custom');

const bathroomDoor = resolveText4fDoorPreset({ roomRole: 'common bathroom', evidenceStrength: 'weak' });
assert.equal(bathroomDoor.presetId, 'door_single_sm');
assert.equal(bathroomDoor.resolvedValues.widthM, 0.686);
assert.equal(bathroomDoor.provenance, 'role-default');
assert.equal(bathroomDoor.confidence, 'low');

const bedroomDoor = resolveText4fDoorPreset({ roomRole: 'master bedroom', evidenceStrength: 'none' });
assert.equal(bedroomDoor.presetId, 'door_single_md');
assert.equal(bedroomDoor.resolvedValues.widthM, 0.838);

const mainDoor = resolveText4fDoorPreset({ roomRole: 'main entrance', evidenceStrength: 'weak' });
assert.equal(mainDoor.presetId, 'door_main');
assert.equal(mainDoor.resolvedValues.widthM, 1.219);

// Strong measured geometry wins over a contradictory role.
const measuredBathSizedMainDoor = resolveText4fDoorPreset({
  measuredWidthM: 0.69,
  roomRole: 'main entrance',
  detectedSubtype: 'single',
  evidenceStrength: 'strong',
  toleranceM: 0.01,
});
assert.equal(measuredBathSizedMainDoor.presetId, 'door_single_sm');
assert.equal(measuredBathSizedMainDoor.provenance, 'measured-preset');
assert.equal(measuredBathSizedMainDoor.confidence, 'high');

// Arbitrary measured sizes remain custom, including when role evidence is weak.
const arbitraryDoor = resolveText4fDoorPreset({
  measuredWidthM: 0.77,
  measuredHeightM: 2.04,
  roomRole: 'bedroom',
  evidenceStrength: 'weak',
  toleranceM: 0.02,
});
assert.equal(arbitraryDoor.presetId, null);
assert.equal(arbitraryDoor.resolvedValues.widthM, 0.77);
assert.equal(arbitraryDoor.resolvedValues.heightM, 2.04);
assert.equal(arbitraryDoor.provenance, 'measured-custom');

// Even an exact dimension is not snapped when the caller did not define tolerance.
const noImplicitDoorTolerance = resolveText4fDoorPreset({
  measuredWidthM: 0.838,
  evidenceStrength: 'strong',
});
assert.equal(noImplicitDoorTolerance.presetId, null);
assert.equal(noImplicitDoorTolerance.resolvedValues.widthM, 0.838);
assert.equal(noImplicitDoorTolerance.toleranceM, null);

// Role inference is forbidden when evidence is stronger than weak.
const noStrongRoleFallback = resolveText4fDoorPreset({
  roomRole: 'bathroom',
  evidenceStrength: 'strong',
});
assert.equal(noStrongRoleFallback.presetId, null);
assert.equal(noStrongRoleFallback.provenance, 'unresolved');

const regularWindow = resolveText4fWindowPreset({
  measuredWidthM: 1.22,
  measuredHeightM: 1.22,
  detectedSubtype: 'regular',
  evidenceStrength: 'strong',
  toleranceM: 0.01,
});
assert.equal(regularWindow.presetId, 'win_reg_md');
assert.equal(regularWindow.resolvedValues.widthM, 1.219);
assert.equal(regularWindow.resolvedValues.heightM, 1.219);
assert.equal(regularWindow.provenance, 'measured-preset');

const arbitraryWindow = resolveText4fWindowPreset({
  measuredWidthM: 1.08,
  measuredHeightM: 1.07,
  evidenceStrength: 'strong',
  toleranceM: 0.02,
});
assert.equal(arbitraryWindow.presetId, null);
assert.equal(arbitraryWindow.resolvedValues.widthM, 1.08);
assert.equal(arbitraryWindow.resolvedValues.heightM, 1.07);
assert.equal(arbitraryWindow.provenance, 'measured-custom');

// A wide regular opening does not become a bay window without bay-symbol evidence.
const wideRegularWindow = resolveText4fWindowPreset({
  measuredWidthM: 2.0,
  evidenceStrength: 'strong',
  toleranceM: 0.01,
});
assert.equal(wideRegularWindow.presetId, null);
assert.equal(wideRegularWindow.subtype, 'custom');

console.log('Text 4.0 F conservative preset resolver tests passed.');
