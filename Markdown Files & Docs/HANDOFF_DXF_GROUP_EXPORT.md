# Handoff: DXF Group Export and Project State

Date: 2026-06-23

Workspace:

`C:\Users\Muhammad Naqi Ejaz\Documents\antigravity\Backup Codex - 23.06 0200 (DXF Improved 01)`

Current local app URL:

`http://127.0.0.1:6060/`

Latest verified fresh dev server after DXF import unit popup:

`http://127.0.0.1:6062/`

Reason:

- `http://127.0.0.1:6061/` was still serving an older running bundle without the new `DXF Units` dropdown.
- Fresh server `6062` was restarted from this workspace after replacing the persistent top-bar unit dropdown with a popup.
- Browser verification after restart: top bar shows `DXF Import`, `Vector DXF`, and `Vector PDF`; it does not show a persistent `DXF Units` selector.

## Project Overview

This is a Vite + React floorplan editor app with 2D canvas drawing, 3D viewing, vector PDF export, and DXF export.

Important scripts from `package.json`:

```bash
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

Current dev server used for testing:

```bash
npm.cmd run dev -- --host 127.0.0.1
```

Validation status at handoff:

```text
npm.cmd run lint  -> passes
npm.cmd run build -> passes
http://127.0.0.1:6060/ -> running
```

## User Goal

The app already had working canvas groups and a functional DXF exporter with CAD layers and CAD blocks for items like doors/windows.

The requested DXF behavior:

- When an item/group is grouped in the app and exported to DXF, AutoCAD should allow it to be selected as one object.
- The user does not strictly require AutoCAD's native `GROUP` object if another AutoCAD-friendly mechanism achieves one-click selection.
- A manually grouped rectangle from the app should behave similarly to the user's observed elevation marker behavior, where the triangle marker appears/selects as one item in AutoCAD.

## Files Provided During Debugging

User comparison/sample DXFs:

```text
C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\AutoArchi\Codex 26\Plotting\COdex Plotting\for CAD Plotting\Sample_DXF_from_AutoCAD.dxf
C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\AutoArchi\Codex 26\Plotting\COdex Plotting\for CAD Plotting\New-Floorplan (22).dxf
C:\Users\Muhammad Naqi Ejaz\Documents\Temp 23\AutoArchi\Codex 26\Plotting\COdex Plotting\for CAD Plotting\Group DXF Sample from AutoCAD.dxf
C:\Users\Muhammad Naqi Ejaz\Downloads\New-Floorplan (2).dxf
C:\Users\Muhammad Naqi Ejaz\Downloads\New-Floorplan (5).dxf
```

Project documentation mentioned by user:

```text
C:\Users\Muhammad Naqi Ejaz\Documents\antigravity\Backup Codex - 23.06 0200 (DXF Improved 01)\DOCUMENTATION.md
```

## Investigation Summary

### Attempted Direction: AutoCAD Native GROUP

The AutoCAD sample contained native group-related structures such as:

- `OBJECTS` section
- `ACAD_GROUP`
- `GROUP`
- `ACAD_REACTORS`
- entity handles and dictionary references

This approach was unreliable in the app export and did not solve the user's issue in AutoCAD.

### Working Direction: DXF BLOCK + INSERT

The approach was changed to export each app canvas group as:

- one generated DXF block definition named like `GROUP_<id>`
- one model-space `INSERT` referencing that block

AutoCAD selects an `INSERT` as one object, which matches the requested behavior.

This is intentionally different from AutoCAD native `GROUP` metadata and is simpler/more robust for the user's desired selection behavior.

## Important Current Code Changes

### `services/vectorDxf.ts`

Purpose: DXF exporter, canvas-like context that records model-space entities, block definitions, layer data, text, hatches, polylines, inserts, etc.

Key current behavior:

- Tracks pending app group block inserts with `pendingGroupInserts`.
- If `setDxfElement()` receives `capture.groupId`, it captures the rendered geometry into a generated `GROUP_*` block.
- Group blocks are inserted once in `toDxfString()` via `insertPendingGroups()`.
- Non-group smart blocks such as doors/windows/furniture retain their existing block behavior.
- Text coordinate handling was corrected so text only uses block-local coordinates when it is truly inside a grouped block.

Important code anchors:

```text
services/vectorDxf.ts:275
private pendingGroupInserts = new Map<string, DxfBlockInstance>();

services/vectorDxf.ts:316
setDxfElement(capture: DxfElementCapture): void

services/vectorDxf.ts:326
name: this.createBlockName(`GROUP_${capture.groupId}`)

services/vectorDxf.ts:634
const isGroupBlockText = !!this.activeBlock?.isGroup;

services/vectorDxf.ts:815
private insertPendingGroups(): void
```

Critical detail:

Text was briefly broken for elevation markers because ungrouped elevation marker text got emitted as model-space text with block-local coordinates. The fix was to make text use block-local coordinates only when `activeBlock.isGroup` is true.

### `components/Canvas.tsx`

Purpose: primary 2D canvas rendering and export rendering pipeline.

Key current behavior:

- Existing smart block types remain in `DXF_BLOCK_ELEMENT_TYPES`.
- Manual drawing/annotation types are not globally block-capable anymore.
- However, any element with `groupId` is forced into the group block path.

Important code anchors:

```text
components/Canvas.tsx:114
const DXF_BLOCK_ELEMENT_TYPES = new Set<ElementType>([
  'door', 'window', 'wall-opening', 'column', 'floor', 'ceiling',
  'stair', 'railing', 'furniture', 'counter', 'fixture', 'asset',
]);

components/Canvas.tsx:3700
createBlock: !!element.groupId || DXF_BLOCK_ELEMENT_TYPES.has(element.type),
```

The group anchor is computed during export so all entities inside a group block are positioned relative to a shared base, and the single `INSERT` places the whole group in model space.

Important code anchors:

```text
components/Canvas.tsx:3673
let exportGroupAnchors = new Map<string, Point>();

components/Canvas.tsx:3695-3699
groupId / groupBaseX / groupBaseY passed to setDxfElement()

components/Canvas.tsx:3800-3828
group bounds and group anchor calculation
```

### `App.tsx`

Purpose: top-level app state and group/ungroup operations.

Change:

- Grouping now allows a single selected item.
- This was important because the user tested with one rectangle grouped using the app group tool.

Important code anchor:

```text
App.tsx:523
if (!project || editorState.selectedIds.length < 1) return;
```

### `components/Toolbar.tsx`

Purpose: toolbar UI actions.

Change:

- Group button now enables with one selected item.

Important code anchor:

```text
components/Toolbar.tsx:442
<ToolbarButton disabled={selectedCount < 1} ... label="Group (Ctrl+G)" />
```

## Current Expected Behavior

### Grouped App Items

When a rectangle or other manual canvas item has `groupId`:

- DXF export should include a generated `GROUP_*` block.
- Model space should contain one `INSERT` for the group.
- AutoCAD should select the grouped object as one item.

### Elevation Markers

Ungrouped elevation markers should export as they did before the grouping fix:

- Geometry stays in the correct position.
- `N/S/E/W` direction text should stay with each marker, not collapse to the center/origin.

### Architectural Elements

Walls, doors, windows, openings, furniture, fixtures, counters, columns, floors, ceilings, etc. should not have changed position as part of the latest safe fix.

The final safety adjustment restored the original global block whitelist to smart-block architectural objects only:

```ts
const DXF_BLOCK_ELEMENT_TYPES = new Set<ElementType>([
  'door', 'window', 'wall-opening', 'column', 'floor', 'ceiling',
  'stair', 'railing', 'furniture', 'counter', 'fixture', 'asset',
]);
```

Manual items still get block behavior only when actually grouped:

```ts
createBlock: !!element.groupId || DXF_BLOCK_ELEMENT_TYPES.has(element.type)
```

Latest DXF export-only category update:

- `stair` is now included in `DXF_BLOCK_ELEMENT_TYPES`.
- `railing` was already included, so individual railing line elements continue to export as DXF blocks.
- Stair block identity uses a per-element geometry key because stairs can have arbitrary drawn geometry and should not reuse another stair's block shape.
- This affects DXF export block behavior only; it does not change canvas grouping, canvas categories, selection, or rendering behavior.

## Recent Bug and Fix

Bug after first grouping fix:

- User exported DXF and saw the elevation marker `N/S/E/W` text at the center of the AutoCAD view.
- Marker triangles/circles were at correct edges.
- Cause: elevation markers had been added to global DXF block eligibility, making their geometry enter block capture while their text was emitted as direct model-space text using block-local coordinates.

Fix:

- Removed manual/annotation/elevation marker types from global `DXF_BLOCK_ELEMENT_TYPES`.
- Kept `!!element.groupId` forcing grouped manual items into group blocks.
- Updated text entity generation in `services/vectorDxf.ts` so block-local text coordinates are used only for actual grouped-block text.

## How To Continue Testing

Use the live app:

```text
http://127.0.0.1:6060/
```

Recommended manual test:

1. Open app at `http://127.0.0.1:6060/`.
2. Draw a manual rectangle.
3. Select rectangle.
4. Click Group.
5. Export DXF.
6. Open DXF in AutoCAD.
7. Confirm the grouped rectangle selects as one object.
8. Confirm elevation marker `N/S/E/W` text stays with each marker.
9. Confirm walls/doors/windows still export in correct positions.

Optional quick DXF text check:

```powershell
Select-String -LiteralPath "C:\Users\Muhammad Naqi Ejaz\Downloads\<exported-file>.dxf" -Pattern "GROUP_|INSERT|BLOCK|TEXT" -Context 0,4
```

Expected if a grouped item exists:

- There should be at least one `GROUP_...` block name.
- There should be at least one `INSERT`.
- The `BLOCKS` section should not be empty for grouped exports.

## Do Not Accidentally Regress

Be careful with these areas:

- Do not globally add `elevation-marker`, `rectangle`, `line`, `arc`, `circle`, `ellipse`, `dimension`, or `room` to `DXF_BLOCK_ELEMENT_TYPES` unless you also audit text and coordinate behavior for each.
- The safe mechanism is `!!element.groupId`, which only uses group blocks for actual app groups.
- Do not remove the `insertPendingGroups()` call from `toDxfString()`.
- Do not change the DXF transform in `Canvas.tsx` export unless explicitly debugging model-space scale/position.

## Useful Commands

Run app:

```powershell
npm.cmd run dev -- --host 127.0.0.1
```

Check TypeScript:

```powershell
npm.cmd run lint
```

Build:

```powershell
npm.cmd run build
```

Check local server:

```powershell
try {
  $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:6060' -TimeoutSec 3
  Write-Output "6060 RUNNING $($r.StatusCode)"
} catch {
  Write-Output '6060 NOT_RUNNING'
}
```

## Current Open Question

The user supplied `New-Floorplan (5).dxf` after the latest test. It was inspected in the current chat before handoff.

Finding:

- `New-Floorplan (5).dxf` contains the old text failure signature.
- The elevation marker geometry appears as `INSERT ELEVATION_MARKER`, followed by direct `TEXT` records with local coordinates such as `N` at `10=180`, `20=-141.333333`.
- Room labels also appear near local coordinates such as `ENTRY` at `10=-342`, `20=189.866667`.
- This explains why text appears merged near the DXF center/origin even though it is correct on canvas.
- The current source code in `services/vectorDxf.ts` already contains the targeted fix: text only uses block-local coordinates when `activeBlock?.isGroup` is true; otherwise it emits direct model-space coordinates.
- `npm.cmd run lint` and `npm.cmd run build` both pass after confirming this source state.

Relevant current source:

```ts
const isGroupBlockText = !!this.activeBlock?.isGroup;
const entity = this.textEntity(text, origin, height, rotation, widthFactor, color, isGroupBlockText);
```

```ts
const local = blockSpace ? this.entityPoint(origin) : origin;
const layer = blockSpace ? '0' : this.currentLayer;
```

Next test:

- Reload the app at `http://127.0.0.1:6060/`.
- Export a new DXF after reload.
- Inspect the new DXF text records. Elevation marker text and room labels should have real model-space coordinates, not small local values around the origin.
- Grouped rectangle should still use `GROUP_*` block + `INSERT`.
- Confirm architectural elements are not displaced.

File:

```text
C:\Users\Muhammad Naqi Ejaz\Downloads\New-Floorplan (5).dxf
```

## CAD DXF Import Tool

Date: 2026-06-23

Implemented first-pass CAD DXF import as a two-stage, code-first pipeline:

- New service: `services/dxfImportService.ts`.
- Stage 1 parses DXF into Canvas geometry at model scale.
- Stage 2 detects close parallel CAD line pairs and converts them into Canvas `wall` elements.
- Unmatched CAD linework remains as Canvas `line` elements.
- Basic DXF layers are imported into app layers when found.

Currently supported import entities:

- `LINE`
- `LWPOLYLINE`
- `ARC`
- `CIRCLE`
- `TEXT`
- `MTEXT`

Current unit handling:

- Reads AutoCAD-style DXF unit header variables when available: `$LUNITS`, `$LUPREC`, `$INSUNITS`, `$LIGHTINGUNITS`, `$AUNITS`, and `$AUPREC`.
- Supports inches, feet, millimeters, centimeters, and meters.
- The import UI now opens a full `DXF Import Units` popup after the user selects a DXF file.
- The popup is prefilled from the DXF header where available.
- The popup contains: Length Type, Length Precision, Insertion Scale Units, Lighting, Angle Type, and Angle Precision.
- The popup also contains `Drawing Coordinate Units - Used For Scale`.
- Important fix: geometry scale uses `Drawing Coordinate Units`, not AutoCAD `$INSUNITS`.
- Reason: `$INSUNITS` is insertion metadata and can be millimeters/inches even when the DXF entity coordinates represent meters. Applying `$INSUNITS` directly caused `300` to import as `0.30m` for millimeters and `25ft` for inches.
- The popup note says: "Select units consistent with the source drawing. AutoCAD metadata is shown below, but geometry is scaled using Drawing Coordinate Units."
- Default/fallback drawing coordinate unit is `Meters`, because the app canvas is meter-based and the user's architectural CAD test files have entity coordinates intended as meters.
- Manual insertion unit choices cover AutoCAD insertion scale units from the supplied `AutoCAD Units Table.txt`: Unitless, Inches, Feet, US Survey Feet, Miles, Millimeters, Centimeters, Meters, Kilometers, Microinches, Mils, Yards, Angstroms, Nanometers, Microns, Decimeters, Decameters, Hectometers, Gigameters, Astronomical, Light Years, and Parsecs.
- The previous span-based millimeter/centimeter heuristic was removed because real CAD files with large meter coordinates could be shrunk by 1000x, e.g. a 300m line importing as 0.30m.

Current scale test note:

- For the user's failing file where a 300m CAD line imported as 0.30m, select the file, then keep `Drawing Coordinate Units - Used For Scale` as `Meters` before clicking `Import DXF`.
- The same fix applies to the imperial display case where a 984.252ft source line imported as 25ft; that happened because entity coordinate `300` was being treated as inches.
- If the user intentionally imports a CAD file drawn in millimeters, choose `Millimeters`.
- The popup is intentionally shown only at import time, not persistently on the top bar.

Current DXF geometry parsing scope:

- Canvas geometry is created from the DXF `ENTITIES` section only.
- Header/tables are still read for `$INSUNITS` and layer definitions.
- This prevents `BLOCKS`, symbol definitions, and other non-model definitions from being imported as hidden/extra canvas elements, which was contributing to severe lag after import.

Current UI entry points:

- Home screen: `Import CAD DXF`.
- 2D canvas floating controls: `Import DXF`, next to `Vector DXF`.

Known first-pass limitations:

- Block inserts are not expanded yet.
- `POLYLINE`/`VERTEX` legacy entities are not expanded yet.
- Door/window semantic detection from CAD blocks or layer names is not implemented yet.
- Wall conversion is conservative: it only converts likely parallel line pairs on the same layer and leaves uncertain geometry as regular lines.

Validation after this import pass:

```text
npm.cmd run lint  -> passes
npm.cmd run build -> passes
```
