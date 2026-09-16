# Chat and Architecture Handoff

Date: 2026-06-23

Workspace:

`C:\Users\Muhammad Naqi Ejaz\Documents\antigravity\Backup Codex - 23.06 0200 (DXF Improved 01)`

Verified local app:

`http://127.0.0.1:6062/`

## What This Chat Was About

We focused on the DXF export/import pipeline for the floorplan editor.

Main goals from the chat:

- Preserve canvas groups in DXF export so grouped items select as one object in AutoCAD.
- Fix DXF import scale issues, especially the `300m -> 0.30m` shrink and the imperial mismatch case.
- Keep the app architecture stable so canvas behavior, doors, walls, windows, and other editor tools do not break.
- Save the important decisions in markdown so another chat can continue cleanly.

## Key Decisions Made

### DXF Export

- The app does not rely on AutoCAD native `GROUP` metadata.
- Grouped canvas items are exported as DXF `BLOCK + INSERT`.
- This is easier for AutoCAD to treat as one selectable object.
- `groupId` is the safe trigger for grouping during export.
- Elevation markers were fixed so their text stays in the right place and does not collapse to the DXF origin.

### DXF Import

- We added a DXF import flow that parses raw DXF and imports geometry into the canvas.
- The import UI now opens a popup only when a DXF file is selected.
- The popup is AutoCAD-style and includes:
  - `Length - Type`
  - `Length - Precision`
  - `Drawing Coordinate Units - Used For Scale`
  - `Insertion Scale Units - AutoCAD Metadata`
  - `Lighting`
  - `Angle - Type`
  - `Angle - Precision`
- The important fix is that geometry scale now uses `Drawing Coordinate Units - Used For Scale`, not `$INSUNITS`.
- `$INSUNITS` is treated as metadata, not as the direct geometry scale.

### Why The Scale Bug Happened

The failed imports showed:

- A source line intended to be `300m` imported as `0.30m`.
- The same line in imperial view imported as `25ft`.

That means the importer was applying the DXF insertion unit header too aggressively. In practice, `$INSUNITS` can describe insertion scale, while the entity coordinates themselves may still be authored in a different real-world unit.

The fix is:

- Keep the metadata visible in the dialog.
- Use the explicit drawing coordinate unit for actual import scaling.
- Default that scale unit to `Meters` for this project.

## Current Architecture

### High-Level Flow

The app is a Vite + React floorplan editor with these main areas:

- 2D canvas editor
- 3D viewer
- vector PDF export
- DXF export
- DXF import
- procedural/generative layout tools
- site import tools

### Important Runtime Entry Points

- [App.tsx](C:/Users/Muhammad%20Naqi%20Ejaz/Documents/antigravity/Backup%20Codex%20-%2023.06%200200%20%28DXF%20Improved%2001%29/App.tsx)
- [components/Canvas.tsx](C:/Users/Muhammad%20Naqi%20Ejaz/Documents/antigravity/Backup%20Codex%20-%2023.06%200200%20%28DXF%20Improved%2001%29/components/Canvas.tsx)
- [services/vectorDxf.ts](C:/Users/Muhammad%20Naqi%20Ejaz/Documents/antigravity/Backup%20Codex%20-%2023.06%200200%20%28DXF%20Improved%2001%29/services/vectorDxf.ts)
- [services/dxfImportService.ts](C:/Users/Muhammad%20Naqi%20Ejaz/Documents/antigravity/Backup%20Codex%20-%2023.06%200200%20%28DXF%20Improved%2001%29/services/dxfImportService.ts)
- [components/Toolbar.tsx](C:/Users/Muhammad%20Naqi%20Ejaz/Documents/antigravity/Backup%20Codex%20-%2023.06%200200%20%28DXF%20Improved%2001%29/components/Toolbar.tsx)

### `App.tsx`

This is the main orchestrator.

Responsibilities:

- Loads the project.
- Manages editor state.
- Owns selection, levels, save, undo/redo, and global UI.
- Hosts the top toolbar.
- Launches import/export dialogs and wizards.
- Connects DXF import to the project lifecycle.

Important current DXF import state:

- `pendingDxfImport` stores selected DXF contents before import.
- `dxfUnitSettings` stores the popup selections.
- `detectDxfUnitSettings()` pre-fills the dialog from DXF header data.
- `importDxfToProject()` is only called after the popup Import button is clicked.

### `components/Canvas.tsx`

This is the 2D drawing source of truth.

Responsibilities:

- Renders all canvas geometry.
- Handles selection, editing, snapping, transforms, and tool behavior.
- Drives DXF export capture.

Important export behavior:

- `groupId` forces grouped export behavior.
- Smart block types like doors, windows, stair, railing, etc. remain block-capable.
- The canvas itself should not be changed casually because almost every tool depends on it.

### `services/vectorDxf.ts`

This is the DXF exporter.

Responsibilities:

- Captures rendered canvas commands.
- Writes DXF entities, blocks, inserts, layers, text, and geometry.
- Generates grouped blocks for app groups.

Important behavior:

- Grouped items become generated `GROUP_*` blocks.
- Model space gets a single `INSERT` for the group.
- Text is handled carefully so it only uses block-local coordinates when the block is actually a grouped block.

### `services/dxfImportService.ts`

This is the DXF importer.

Responsibilities:

- Parses DXF text.
- Reads header metadata.
- Detects units and pre-fills the import popup.
- Converts DXF entities into canvas elements.
- Tries to infer walls from pairs of parallel CAD lines.

Important behavior:

- Reads section pairs from `ENTITIES`.
- Imports lines, polylines, arcs, circles, text, and mtext.
- Converts likely wall-like line pairs into canvas walls.
- Limits loose line and text volume to avoid performance collapse.
- Uses `Drawing Coordinate Units - Used For Scale` for actual geometry scaling.

### `components/Toolbar.tsx`

This hosts the canvas toolbars and quick actions.

Important behavior:

- Grouping now works with a single selected item.
- The top bar now has permanent `Site`, `DXF Import`, `Vector DXF`, and `Vector PDF` actions.

## Current UI State

The verified running build at `http://127.0.0.1:6062/` has:

- `Site`
- `DXF Import`
- `Vector DXF`
- `Vector PDF`
- `Save`

The DXF import units popup appears only after the user chooses a DXF file.

## Known Good Behavior

- Canvas groups export as selectable DXF blocks.
- Elevation marker text no longer collapses to the center of the DXF.
- `lint` passes.
- `build` passes.

## What To Watch Out For

- Do not let `$INSUNITS` directly drive geometry scale again.
- Do not reintroduce the old span-based auto-scale heuristic.
- Do not make the DXF units popup permanent in the top bar.
- Do not change `Canvas.tsx` export transforms casually.
- Do not globally add more element types to block export without checking text/coordinate behavior.

## If We Continue In Another Chat

Best next step:

1. Re-test DXF import with the current popup using `Drawing Coordinate Units - Used For Scale = Meters`.
2. Confirm the 300m line imports as 300m.
3. Confirm the imperial test line imports at the expected scale when the drawing coordinate unit is set correctly.
4. If needed, improve `detectDxfUnitSettings()` so it better recognizes source drawings, but keep geometry scaling controlled by the explicit drawing unit field.

## Validation

Current status:

- `npm.cmd run lint` passes
- `npm.cmd run build` passes

