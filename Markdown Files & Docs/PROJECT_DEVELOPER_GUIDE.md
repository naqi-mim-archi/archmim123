# Project Developer Guide

This document is the short-but-complete handoff for this codebase. It describes what the project is, how it is structured, which files own the major behaviors, and what another developer or AI agent should know before changing any part of it.

## 1. Project Summary

This is a Vite + React + TypeScript single-page architectural design application. It combines:

- 2D canvas drafting for architectural elements.
- 3D visualization through Three.js.
- Procedural and smart-procedural floorplan generation.
- Urban/site planning tools.
- DXF, PDF, IFC/BIM, Revit export, and APS Revit import/export workflows.
- Gemini-powered generation, redraw, tracing, DXF conversion, and chat/refinement services.

The app is mostly client-side, but `vite.config.js` also installs development API middleware for APS Revit import/export endpoints.

## 2. Tech Stack

- Runtime/build: Vite, ES modules, TypeScript, React 19.
- UI: React components, inline/tailwind-like utility classes, Lucide icons.
- 2D graphics: HTML canvas via `components/Canvas.tsx`.
- 3D graphics: Three.js via `components/Viewer3D.tsx`.
- Mapping: `@vis.gl/react-google-maps`, Google Maps types.
- Charts/data viz: D3, Recharts.
- Animation: `motion`.
- AI: `@google/genai`, with API key injection through Vite.
- BIM/CAD: custom TypeScript exporters/importers plus C# Revit add-ins for APS Design Automation.
- Tests/scripts: Node scripts with esbuild bundling for selected service-level checks.

## 3. Run, Build, Test

Prerequisites:

- Node.js and npm.
- `.env.local` with `GEMINI_API_KEY` for AI features.
- APS credentials only if using direct Revit import/export automation.

Commands:

```bash
npm install
npm run dev
npm run build
npm run lint
npm run test:revit-export
npm run test:aps-revit-import
npm run aps:revit-export
npm run aps:revit-import
```

Notes:

- `npm run dev` serves on port `3000` by default and host `0.0.0.0`.
- `npm run lint` is actually `tsc --noEmit`.
- The test scripts write bundled artifacts under `dist/`.
- `dist/`, `node_modules/`, and log files are generated artifacts, not source.

## 4. Environment Variables

Browser-facing variables are injected in `vite.config.js`:

- `GEMINI_API_KEY`
- `GOOGLE_MAPS_PLATFORM_KEY`

APS/Revit server-side variables are read by backend route modules and should not be exposed to the browser:

- `APS_CLIENT_ID`
- `APS_CLIENT_SECRET`
- `APS_BUCKET_KEY`
- `APS_REGION`
- `APS_REVIT_ENGINE`
- `APS_REVIT_APPBUNDLE_ID`
- `APS_REVIT_ACTIVITY_ID`
- `APS_REVIT_ACTIVITY_ALIAS`
- `APS_REVIT_ACTIVITY_ALIAS_2026`
- `APS_REVIT_ACTIVITY_ID_2026`
- `APS_REVIT_APPBUNDLE_ID_2026`
- `APS_REVIT_ENGINE_2026`
- `APS_REVIT_IMPORT_ENGINE`
- `APS_REVIT_IMPORT_APPBUNDLE_ID`
- `APS_REVIT_IMPORT_ACTIVITY_ID`
- `APS_REVIT_IMPORT_ACTIVITY_ALIAS`
- `APS_REVIT_EXPORT_CALLBACK_URL` optional, documented in `revit-export/README.md`.

Do not commit secret values.

## 5. High-Level Directory Map

```text
/
  App.tsx                         Main app shell, state owner, workflow coordinator.
  index.tsx                       React mount entry.
  index.html                      Vite HTML shell.
  types.ts                        Core domain model and editor types.
  constants.tsx                   Defaults, presets, colors, tool icons, typology lists.
  vite.config.js                  Vite config plus dev API middleware for APS/Revit routes.
  package.json                    Scripts and JS dependencies.

  components/                     React UI and rendering components.
  services/                       Domain services, importers, exporters, AI clients, geometry.
  smart-procedural/               Advanced procedural layout/furnishing engine and wizard.
  revit-export/                   C# Revit export AppBundle scaffold and shared params.
  aps-revit-import/               C# Revit import/extraction AppBundle scaffold.
  scripts/                        Node scripts for export/import tests and APS pipelines.
  Markdown Files & Docs/          Project docs and handoff notes.
  test-artifacts/                 Sample generated manifests/projects for stress testing.
```

## 6. Core Domain Model

The most important file is `types.ts`.

Key types:

- `Project`: full document state, including `elements`, `levels`, `layers`, `settings3D`, optional `siteMap`, and metadata.
- `ArchElement`: the universal element record for walls, doors, windows, rooms, stairs, furniture, BIM objects, labels, dimensions, floors, ceilings, curves, parcels, groups, and procedural hosts.
- `Level`: multi-floor support with elevation, height, order, and visibility.
- `EditorState`: transient UI state such as active tool, selected IDs, pan/zoom, active level, snap state, view mode, and drawing view.
- `EditorTool`: all supported interactive tools.
- `DrawingViewId`: plan plus elevation views.
- `ProceduralConfig`: procedural generation options.

Coordinate convention:

- App geometry is in meters.
- Canvas/project coordinates are effectively 2D `x/y`.
- The app uses a canvas-style `y` direction for authoring.
- Revit import/export converts between app meters and Revit feet, including Y-axis inversion where required.

Element convention:

- Most drawable things are `ArchElement` with optional fields depending on `type`.
- Hosted wall openings use `hostWallId` and often `hostT`.
- Curves use `wallSource`, `isCurved`, arc angles, radii, and helpers from `services/geometry/curveGeometry.ts`.
- Generated elements often share a `proceduralId`.
- BIM/Revit-related elements carry metadata namespaces such as `bimMetadata`, `metadata.apsRevitImport`, or Revit export metadata.

## 7. Application Architecture

### `App.tsx`

`App.tsx` is the central coordinator. It owns:

- `project` and project normalization.
- Undo/redo history.
- `editorState`.
- tool selection and keyboard shortcuts.
- active level and drawing view.
- import/export menus and dialogs.
- DXF review and conversion flows.
- BIM import/export review flows.
- Revit import/export dialogs.
- procedural and smart-procedural generation/furnishing.
- urban/site workflows.
- elevation-view projection back into project elements.

When adding a feature, first check whether it needs project state, selected IDs, active level, view mode, or import/export wiring. If yes, `App.tsx` probably needs at least a small integration point.

### `components/Canvas.tsx`

This is the custom 2D drafting engine. It handles:

- drawing grid, elements, labels, dimensions, rooms, hosted openings, curves, and previews.
- pointer interaction for draw/move/copy/rotate/split/select tools.
- snapping, orthogonal constraints, wall/opening interaction, and selection overlays.
- external import previews for DXF/BIM.
- vector PDF/DXF-oriented rendering adapters.

This file is large and central. Keep edits focused and verify affected tools manually where possible.

### `components/Viewer3D.tsx`

This compiles project elements into Three.js geometry:

- wall/floor/ceiling/room/column/stair/railing/furniture meshes.
- camera framing and 3D navigation.
- material and visibility handling.
- filtering of non-physical drafting helpers.

If an element type should appear in 3D, update both its geometry conversion and any skip/filter logic.

### `components/Toolbar.tsx` and `constants.tsx`

Tool availability and visual definitions are split between:

- `constants.tsx`: defaults, presets, icons, typology metadata, inventory catalogs.
- `components/Toolbar.tsx`: visual toolbars and snap controls.
- `App.tsx`: `DRAWING_TOOLS`, view restrictions, and tool behavior.

Adding a tool usually touches all three, plus `Canvas.tsx`.

### `components/PropertiesPanel.tsx`

The contextual inspector for selected elements, project settings, layers, 3D settings, and element-specific editing. Add property controls here when a new field needs user editing.

## 8. Major Feature Areas

### Drafting

Important files:

- `App.tsx`
- `components/Canvas.tsx`
- `components/PropertiesPanel.tsx`
- `components/Toolbar.tsx`
- `services/geometry/curveGeometry.ts`
- `constants.tsx`
- `types.ts`

Common flow:

1. User selects a tool in `Toolbar`.
2. `App.tsx` stores tool in `editorState`.
3. `Canvas.tsx` interprets pointer events and emits updated level elements.
4. `App.tsx` validates hosted openings and commits updated `project.elements`.
5. `PropertiesPanel` edits selected element fields.

### Procedural Floorplans

Standard engine:

- `services/proceduralService.ts`
- `services/proceduralVariants.ts`
- `services/furnishService.ts`
- `components/ProceduralWizard.tsx`

Smart engine:

- `smart-procedural/smartProceduralService.ts`
- `smart-procedural/smartProceduralVariants.ts`
- `smart-procedural/smartFurnishService.ts`
- `smart-procedural/SmartProceduralWizard.tsx`

Flow:

1. A procedural boundary host is drawn.
2. Wizard collects typology/style/geometry/config.
3. Engine generates walls, rooms, openings, labels, fixtures, and warnings.
4. Generated elements are linked with `proceduralId`.
5. Furnishing can regenerate only furniture/fixture/counter elements for that procedural group.

### Urban/Site Planning

Important files:

- `services/urbanService.ts`
- `components/UrbanWizard.tsx`
- `components/UrbanDashboard.tsx`
- `components/BlockEditor.tsx`
- `components/SiteMapPanel.tsx`
- `components/SiteImportWizard.tsx`

This subsystem generates parcels, roads, site/block elements, zoning-style layouts, and stores optional `siteMap`, `SiteLocation`, and `TerrainSettings` data on the project.

### AI/Gemini Features

Important files:

- `services/aiClient.ts`
- `services/generationService.ts`
- `services/redrawService.ts`
- `services/tracerService.ts`
- `services/fusionService.ts`
- `services/chatService.ts`
- `services/aiDxfService.ts`
- `services/interiorImportService.ts`
- `services/schema.ts`
- `components/GenerativeWizard.tsx`

`aiClient.ts` creates the Gemini client from the injected key. Schema files define structured outputs. Any AI-generated project data should be normalized before entering `project`.

### DXF Import/Export

Important files:

- `services/dxfImportService.ts`
- `services/vectorDxf.ts`
- `services/aiDxfService.ts`
- `App.tsx`

Import flow:

1. DXF text is loaded in `App.tsx`.
2. `detectDxfUnitSettings` proposes units.
3. `importDxfToProject` creates CAD/native elements.
4. User can apply as underlay, smart 2D, deterministic 3D, AI conversion, or BIM-interactive review.
5. `pairLinesToWalls` can convert parallel line pairs to wall elements.

Export flow:

- `Canvas.tsx` and `vectorDxf.ts` render/export active 2D plans into DXF.
- DXF export is intentionally restricted to 2D plan context.

### Vector PDF

Important files:

- `components/PdfExportDialog.tsx`
- `services/vectorPdf.ts`
- `components/Canvas.tsx`
- `App.tsx`

PDF export uses a vector canvas context to produce blueprint-style PDF bytes. It is restricted to 2D drawing views.

### Generic BIM IFC Import/Export

Important files:

- `services/bimImportService.ts`
- `services/bimExportService.ts`
- `services/bimService.ts`
- `components/BimImporterWizard.tsx`
- `components/BimExporterDialog.tsx`

These are separate from the direct Revit APS workflows. Keep IFC/BIM code independent from the direct Revit export/import modules unless a deliberate shared utility is introduced.

### Direct Revit Export Through APS

Important files:

- `components/RevitExporterDialog.tsx`
- `services/revitExport/revitExportManifest.ts`
- `services/revitExport/revitExportTypes.ts`
- `services/revitExport/revitExportClient.ts`
- `services/revitExport/backend/revitExportApiRoutes.ts`
- `services/revitExport/backend/apsRevitExportBackend.ts`
- `services/sharedBim/projectExportUtils.ts`
- `revit-export/RevitExportAddin/*.cs`
- `revit-export/RevitExportAddin/ElementExporters/*.cs`

Runtime architecture:

1. Browser creates a `revit-export-v1` manifest from native project data.
2. Vite dev API route receives `/api/exports/revit/*`.
3. `ApsRevitExportBackend` uploads manifest to APS Object Storage.
4. APS Design Automation runs the Revit AppBundle.
5. The C# add-in creates native Revit elements where possible.
6. The add-in saves an RVT and writes a JSON report.
7. Browser polls job status and retrieves download URLs.

Important boundary:

- This direct Revit export workflow should not depend on IFC export, DXF export, Revit import, or `BimExporterDialog`.
- `scripts/testRevitExport.mjs` explicitly checks for forbidden cross-dependencies.

### APS Revit Import Through APS

Important files:

- `components/ApsRevitImporterDialog.tsx`
- `services/apsRevitImport/apsRevitImportTypes.ts`
- `services/apsRevitImport/apsRevitImportClient.ts`
- `services/apsRevitImport/apsRevitImportConverter.ts`
- `services/apsRevitImport/apsRevitImportCoordinateService.ts`
- `services/apsRevitImport/backend/apsRevitImportApiRoutes.ts`
- `services/apsRevitImport/backend/apsRevitImportBackend.ts`
- `aps-revit-import/RevitImportExtractorAddin/*.cs`

Runtime architecture:

1. Browser uploads an RVT/RFA-like file payload to `/api/imports/aps-revit/*`.
2. Backend uploads it to APS Object Storage.
3. APS Design Automation runs the extractor add-in.
4. C# add-in emits an `aps-revit-import-v1` extraction manifest.
5. TypeScript converter maps Revit feet/internal coordinates to app meters/canvas coordinates.
6. Converter outputs native `Project`, `Level`, `Layer`, and `ArchElement` objects plus an import report.

Important boundary:

- APS Revit import is intentionally separate from legacy Revit import, DXF, DWG, IFC export, and `bimService`.
- `scripts/testApsRevitImport.mjs` checks conversion behavior and forbidden cross-dependencies.

## 9. Vite Development API Middleware

`vite.config.js` installs a plugin named `archai-revit-export-dev-api`.

It intercepts:

- `/api/exports/revit...`
- `/api/imports/aps-revit...`

For these routes it dynamically loads backend modules with `server.ssrLoadModule`, creates in-memory backend instances, parses JSON POST bodies, and returns JSON responses. This is a development server bridge, not a production server implementation.

## 10. C# Revit Add-ins

### `revit-export/RevitExportAddin`

Purpose: create an RVT from a direct app manifest.

Key files:

- `App.cs`: Revit add-in entry.
- `RevitExportRunner.cs`: main automation runner.
- `ManifestReader.cs`: reads manifest input.
- `RevitExportContext.cs`: shared execution context.
- `RevitExportReportWriter.cs`: output report.
- `RevitValidationService.cs`: validation.
- `RevitFamilyResolver.cs`, `RevitTypeResolver.cs`, `RevitParameterWriter.cs`: Revit family/type/parameter helpers.
- `ElementExporters/*`: category-specific exporters.

Required real Revit assets are documented in `revit-export/README.md`; do not upload text placeholders as AppBundle assets.

### `aps-revit-import/RevitImportExtractorAddin`

Purpose: extract Revit model data into a neutral manifest that the TypeScript converter can import.

Key files:

- `App.cs`: Revit add-in entry.
- `RevitImportExtractionRunner.cs`: extraction logic.
- `.addin`, `.csproj`, and `PackageContents.xml`: Revit/APS packaging.

## 11. Data and Coordinate Rules

- Native app length unit is meters.
- Revit internal length unit is feet.
- `services/apsRevitImport/apsRevitImportCoordinateService.ts` centralizes feet/meters and Y inversion for import.
- Direct Revit export manifests declare `sourceLinearUnit: 'meters'` and `coordinateSystem: 'canvas-y-down'`.
- Curved walls and curves should use `services/geometry/curveGeometry.ts`; avoid ad hoc curve math in new modules.
- Level filtering and visible-layer filtering for exports should go through `services/sharedBim/projectExportUtils.ts`.

## 12. Layers, Levels, and Views

- `App.tsx` normalizes project layers using default layer names.
- Most elements have `levelId`; missing level IDs usually imply the first level.
- Active 2D drawing view can be `plan` or an elevation view.
- Some actions are restricted to 2D plan or 2D views. These restrictions are centralized in `App.tsx`.
- Elevation views are projected editing surfaces; changes are mapped back to source project elements in `App.tsx`.

## 13. Local Persistence

The app uses browser `localStorage` for some UI/project-adjacent data, including imported/custom Revit presets. Check `App.tsx` around custom preset initialization before changing imported asset behavior.

## 14. Generated or Non-Source Files

Usually do not edit manually:

- `node_modules/`
- `dist/`
- `vite-*.log`
- `test-artifacts/` unless updating fixtures deliberately.

Generated docs already exist under `Markdown Files & Docs/`; confirm whether a change should update old docs or this guide.

## 15. Change Recipes

### Add a New Drawing Tool

Check and likely update:

- `types.ts`: add to `EditorTool` if needed.
- `App.tsx`: add to `DRAWING_TOOLS`, view restrictions, command behavior.
- `constants.tsx`: icon/default/preset if needed.
- `components/Toolbar.tsx`: expose the tool.
- `components/Canvas.tsx`: pointer behavior, preview drawing, final element creation.
- `components/PropertiesPanel.tsx`: property editing.
- `components/Viewer3D.tsx`: 3D representation if physical.
- Export/import services if the new element must round-trip.

### Add or Change an Element Type

Check:

- `types.ts` `ElementType` and `ArchElement`.
- `constants.tsx` defaults and presets.
- `Canvas.tsx` rendering and hit testing.
- `Viewer3D.tsx` mesh generation or skip rules.
- `PropertiesPanel.tsx` inspector controls.
- `vectorDxf.ts`, `vectorPdf.ts`, `bimExportService.ts`, `revitExportManifest.ts`, and `apsRevitImportConverter.ts` if it should import/export.

### Add a Procedural Typology

Check:

- `constants.tsx` `PROCEDURAL_TYPOLOGIES`.
- `services/proceduralVariants.ts` for standard variants.
- `smart-procedural/smartProceduralVariants.ts` for smart variants.
- Wizard UI if new config fields are needed.
- Furnishing engines if generated spaces need custom furnishing.

### Change Revit Export

Check:

- `services/revitExport/revitExportTypes.ts`
- `services/revitExport/revitExportManifest.ts`
- `services/revitExport/backend/apsRevitExportBackend.ts`
- `revit-export/RevitExportAddin/ElementExporters/*`
- `scripts/testRevitExport.mjs`

Keep direct Revit export independent from IFC/DXF/import workflows.

### Change APS Revit Import

Check:

- `services/apsRevitImport/apsRevitImportTypes.ts`
- `services/apsRevitImport/apsRevitImportConverter.ts`
- `services/apsRevitImport/apsRevitImportCoordinateService.ts`
- `services/apsRevitImport/backend/apsRevitImportBackend.ts`
- `aps-revit-import/RevitImportExtractorAddin/RevitImportExtractionRunner.cs`
- `scripts/testApsRevitImport.mjs`

Keep APS Revit import independent from legacy Revit import, DXF/DWG, and IFC export.

## 16. Verification Checklist

For most changes:

```bash
npm run lint
npm run build
```

For Revit export changes:

```bash
npm run test:revit-export
```

For APS Revit import changes:

```bash
npm run test:aps-revit-import
```

For UI/canvas/3D changes:

- Run `npm run dev`.
- Manually test the affected tool or workflow.
- Check both 2D and 3D if the change touches physical geometry.
- Check active level behavior if the change touches elements.
- Check export/import round-trip if the change touches serialized element fields.

## 17. Current Architectural Risks

- `App.tsx`, `Canvas.tsx`, `Viewer3D.tsx`, `PropertiesPanel.tsx`, and BIM import/export services are large files with many responsibilities. Prefer small, behavior-preserving edits.
- There are multiple similar but intentionally separate workflows: legacy BIM/IFC, direct Revit export, APS Revit import, DXF import/export, and AI conversion. Do not merge dependencies casually.
- Many element fields are optional and type-dependent. New code should guard missing `p1`, `p2`, `pos`, `boundary`, `levelId`, and curve metadata.
- Coordinate conversion bugs are easy. Use existing helpers for feet/meters, curve sampling, host-wall matching, and export slicing.
- Some existing docs may be stale. Treat code and tests as authoritative.

## 18. Best Starting Points

- Need app state or workflow wiring: start in `App.tsx`.
- Need 2D drawing behavior: start in `components/Canvas.tsx`.
- Need 3D rendering: start in `components/Viewer3D.tsx`.
- Need data shape: start in `types.ts`.
- Need defaults/presets/tools: start in `constants.tsx`.
- Need inspector UI: start in `components/PropertiesPanel.tsx`.
- Need procedural generation: start in `services/proceduralService.ts` or `smart-procedural/`.
- Need import/export: start in the specific service folder, then trace to the matching dialog component.
- Need Revit/APS backend behavior: start in `vite.config.js`, then route modules under `services/*/backend/`.

