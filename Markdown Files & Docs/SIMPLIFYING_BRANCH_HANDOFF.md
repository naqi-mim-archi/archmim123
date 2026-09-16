# Simplifying Branch - Developer Handoff

## Scope

- Branch: `Simplifying`
- Change range: `e655c5b..76c1196`
- Work is committed and the working tree was clean before this handoff document was added.
- Most removed UI is hidden or rerouted; the underlying feature code was intentionally retained unless noted otherwise.

## Global UI

- Reduced the app-wide design density to roughly 75% through root design sizing, not browser zoom or transform scaling.
- Converted Drawing Canvas, Render Canvas, Raster Canvas, dialogs, and panels to one light Apple-glass visual system using white, blue, black/slate, red for errors, and green for success.
- Tightened panel/tool sizes and added consistent screen-edge gaps. Long panels, expanded render nodes, and fork controls now scroll internally.
- Increased the default Render Canvas node scale/readability for laptop screens.
- Moved build/version information from the bottom overlay into the top app/menu area with subtle styling and hover detail.

## Home And Navigation

- App now remains on Home at startup until the user chooses a destination; it no longer opens Drawing Canvas automatically.
- Home now exposes four primary routes: `Drawing Canvas`, `Render Canvas`, `AutoPlan`, and `AutoScan`.
- Renamed `Blank Floorplan` to `Drawing Canvas`.
- Moved AI Rendering to Home and renamed it `Render Canvas`.
- Hid Home buttons for Floorplan Upload, Load Project JSON, CAD/DXF Import, and Blank Masterplan. Their retained import features remain available from the app menu where applicable.
- Added a dedicated Home action and centralized Back navigation. Back and `Esc` now move one step up through nested tools instead of jumping directly Home.
- Removed duplicate popup crosses/back buttons; full-screen and nested tools register with the universal app-bar Back action.

## Main Canvas And Import/Export

- Hid the legacy `AI Gen` menu and its subsidiaries from the main canvas.
- Hid `Urban Generation` and the bottom `Site Map Settings` button.
- Moved `3D Generator` from AI Rendering into the `Interior Elements` toolbar.
- Hid legacy toolbar entries for `Procedural Rect`, `Smart Procedural`, and `Auto Procedural`; implementations remain in code.
- Simplified Import/Export labels and visibility:
  - `Load JSON` -> `Load Project`, later refined to `Open Project`
  - `DXF Import` -> `CAD Import`
  - `APS Revit Import` -> `Revit Import`
  - `Export JSON` -> `Download Project`
  - `Vector DXF` -> `Export CAD`
  - `Vector PDF` -> `Export PDF`
  - Retained BIM Import, BIM/IFC Export, and Revit Export.
- Reorganized the app menu into Open, Import, Export, Save, Exit, and Build sections.

## Render Canvas And Raster Canvas

- Unified Render Canvas into one holistic workspace; removed visible `Image Studio`, `Raster Canvas`, and `Video` category tabs/tags.
- Video workflows now appear disabled in the workflow dropdown under `Video Workflows - Coming Soon`; execution is also guarded.
- Moved New Node, Undo, Redo, zoom, fit, and reset controls into a consistent bottom-right control cluster shared with Raster Canvas.
- Removed Raster Canvas `Fork Canvas` footer action. Back returns one step to Render Canvas.
- Raster Canvas creates a new fork only when the user actually edits the image; opening and closing without edits no longer forks.
- Improved Render Canvas performance by indexing graph connections, memoizing nodes, unmounting closed Raster sessions, and reducing workflow dropdown/render churn.
- Prevented node scrolling from simultaneously zooming the graph canvas.
- Expanded forks/nodes scroll internally so lower options remain reachable.

## AutoPlan

- Home `AutoPlan` opens the Text 4.0 H Design Copilot workspace.
- Renamed the former complex-plan route to `Flash`.
- Flash generates two independent floorplan variants, converts both through the local H Image-to-JSON path, and shows both side by side.
- User selects either `Generated Floorplan - Variant 1` or `Variant 2` for import.
- Gemini JSON and raw generated images are hidden by default. `Show Image` displays each generated raster as a registered 25%-opacity underlay behind its digitized plan; the underlay is never imported.
- Image-to-JSON logs/warnings are hidden behind a `Logs` button.
- Removed the Floorplan Image Model dropdown. H image generation is backend-controlled and uses Gemini; obsolete Imagen choices were removed from this route.
- Import remains enabled for a selected floorplan with usable geometry even when extraction reports advisory/low-confidence warnings.
- Processing indicators remain continuously animated until result geometry is actually shown.

## AutoPlan Instant

- Moved the old Smart Procedural workflow into AutoPlan and renamed it `Instant`.
- Instant runs inside the Design Copilot native canvas, where users can generate, edit, regenerate, and review before import.
- Added `Furnish Floorplan` inside Instant using the existing Smart Procedural furnishing engine and full floorplan context.
- Added explicit `Import to Canvas`.
- Instant imports are detached from procedural host metadata, so procedural/open/furnish action bars do not reappear on the main canvas.
- Main-canvas procedural and furnishing action blocks are hidden; those operations now belong to the Copilot stage.

## AutoScan

- Home `AutoScan` opens the H image-upload route.
- AutoScan now contains:
  - `Simple Plans - Flash`: upload image + provide dimensions, then run the simplified one-step pipeline.
  - `Pro`: the former Digitizer route, moved under AutoScan.
- Flash produces two side-by-side digitized outputs:
  - Direct local conversion of the uploaded image.
  - Gemini-standardized reproduction followed by the same local H extractor.
- The standardized result includes `Show Image`; users otherwise see only the final digitized floorplans.
- Users can select and import either result. Gemini JSON/intermediate generation details stay hidden.

## Drawing Views And 3D

- Consolidated 2D Plan and elevation navigation into the top-right compact compass/view widget.
- Removed the duplicate upper-left `2D Plan / N / S / E / W` strip.
- Moved `N`, `S`, `E`, and `W` elevation buttons below the compass angle controls and adjusted the settings panel offset to clear the taller widget.
- Added 3D `Walk` navigation and `Snap` capture tools.
- A 3D snap can be previewed, discarded, or imported directly into Render Canvas as an image node.
- 3D-only tools are disabled in 2D/elevation views; 2D-only tools remain disabled in 3D.

## Commit Map

- `7c51693` - initial simplification, density, light theme, Home/tool pruning
- `8aac289` - Render/Raster workspace simplification
- `d3acfe4` - universal Back/Escape navigation
- `012270f` - fork/workflow dropdown performance fixes
- `6436057` - AutoPlan and AutoScan Home/workspace routing
- `8d0de53` - AutoScan Flash/Pro restructuring
- `88a7e31` - AutoScan dual outputs and Gemini standardization route
- `d501974` - AutoPlan dual variants and Instant/Smart Procedural integration
- `30536b8` - consolidated elevation/view controls
- `76c1196` - 3D Walk/Snap and Render Canvas snapshot handoff
