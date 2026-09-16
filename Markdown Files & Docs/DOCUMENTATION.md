# ArchAI - Professional Floorplan Editor Documentation

## 1. Project Overview
ArchAI is a comprehensive, web-based architectural floorplan editor. It empowers users to meticulously draft in 2D using standardized architectural elements (walls, doors, windows, stairs, furniture, etc.), fine-tune properties, and simultaneously visualize the construction in 3D. A key feature of ArchAI is its seamless AI integration, yielding automatic generation and layout plotting driven by Google's Gemini models.

This documentation serves as a foundational guide for developers and technical leads to understand the project architecture, features, and precise technical processes occurring under the hood.

---

## 2. Architecture & Tech Stack

- **Framework:** React 19 (Hooks, Functional Components)
- **Language:** TypeScript (Strict typing for structural reliability)
- **Build System:** Vite
- **Styling:** Tailwind CSS
- **3D Engine:** Three.js (for high-performance WebGL 3D rendering)
- **AI Integration:** `@google/genai` (Official Google GenAI SDK to interface with Gemini models)

---

## 3. Directory & File Structure

An overview of purpose-driven separation across the application:

```text
/                      # Root: Environment config, dependency lists (package.json).
|-- App.tsx            # Main application layout, global state holder, history logic.
|-- index.tsx          # Application entry point for React.
|-- types.ts           # Central source of truth for TypeScript interfaces (Project, ArchElement).
|-- constants.tsx      # System-wide configuration (Walls sizes, standard dimensions, colors).
|-- /components/       # UI & Render Modules
|   |-- Canvas.tsx             # The complex 2D WebGL/Canvas drawing sandbox.
|   |-- Viewer3D.tsx           # The Three.js 3D rendering view context.
|   |-- Toolbar.tsx            # Drawing tools, Snapping toggles, Undo/redo actions.
|   |-- PropertiesPanel.tsx    # Context-aware right-panel to adjust selected element attributes.
|   |-- GenerativeWizard.tsx   # Modal flow for text-to-floorplan AI generation.
|-- /services/         # Core Logic & Remote Interfaces
    |-- aiClient.ts            # Initialize GenAI Client.
    |-- generationService.ts   # System prompts and strict AI structure payload logic.
    |-- schema.ts              # Define JSON schemas enforcing Gemini to return valid arrays.
    |-- redrawService.ts       # Service to digitize existing basic raster items.
```

---

## 4. Core Data Structures

All data manipulation strictly adheres to the core models defined in `types.ts`. 

### `Project`
The master state tree encapsulating everything.
- `name`: string
- `levels`: Array of `Level` objects (defining Z-elevation, ceiling heights).
- `elements`: Array of `ArchElement`.
- `viewBox`: Current physical dimension bound.
- `settings3D`: Default wall heights, slab thicknesses.

### `ArchElement`
The central polymorphic object representing *everything* on the canvas. Instead of subclassing, ArchAI uses an `ElementType` discriminator (e.g., `'line'`, `'wall'`, `'door'`, `'furniture'`).
- **Geometry Data:** `p1`, `p2` (for linear things like walls), `pos` (for point-based things like trees, furniture), `boundary` (Points array for floors/ceilings).
- **Physical Traits:** `thickness`, `width`, `height`, `depth`.
- **Architectural Details:** `subType` (e.g. `'sliding'` door vs `'single'`), `levelId` (associated floor in the building).
- **Relational Data:** `hostWallId`, `hostT` (to know if a window operates inside a specific wall).

### `EditorState`
Tracks user navigation and local interface data (Not saved structurally).
- `zoom`, `offset`: For 2D panning/magnifying context.
- `activeTool`: The current tool user holds (e.g., `'wall'`, `'dimension'`).
- `selectedIds`: Which elements are currently active.
- `isSnapEnabled`, `unitSystem` (Metric vs Imperial).

---

## 5. Main Features & Capabilities

### 5.1 The 2D Drawing Canvas (`components/Canvas.tsx`)

**Feature Description:**
A fully interactive, performant 2D drafting table. Users draw structural limits and insert fixtures with CAD-like precision.

**User Journey (e.g., Drawing a Wall):**
1. User selects the "Wall" tool from the Toolbar.
2. User clicks on the grid to establish the starting origin point (P1).
3. As the mouse moves, a ghost projection displays the incoming wall. Snapping behaviors (e.g. parallel locking or intersection snapping) assist alignment.
4. User optionally types a number (e.g. "5" + Enter) to explicitly shoot a wall 5 meters down the snapped axis.
5. User clicks again to commit the destination (P2).

**Technical Workflow:**
1. **Tool Switch:** `editorState.activeTool` transforms to `'wall'`. `Canvas.tsx` registers this change.
2. **Listen:** The `<canvas>` node utilizes synthetic React mouse events (`onPointerDown`, `onPointerMove`).
3. **Drafting (Move):** If `dragStart` is populated, `onPointerMove` dynamically updates a temporary `Segment` representation drawn straight onto the context using `ctx.stroke()`.
4. **Snapping Engine:** Evaluates distance between cursor and globally known structural paths. If `dist < threshold`, geometry forces the UI projection directly onto the target point.
5. **Commit:** `commitDrawing(point)` executes. It constructs a new `ArchElement`:
   ```javascript
   {
      id: crypto.randomUUID(), type: 'wall', 
      p1: dragStart, p2: point, thickness: 0.23, height: 3.0
   }
   ```
6. This object is pushed onto a cloned `project.elements` array and dispatched to the parent `App.tsx` state by triggering `onElementsChange`. 

### 5.2 Dynamic 3D Viewer (`components/Viewer3D.tsx`)

**Feature Description:**
Transforms orthogonal 2D layouts into 3D environments instantly for visualization and spatial validation.

**User Journey:**
A user hits the "3D" toggle mode in the interface. The canvas gracefully transitions to a rotating perspective view of their exact house configuration.

**Technical Workflow:**
1. Built exclusively using the `Three.js` primitive wrapper. 
2. Evaluates the `project.elements` array continuously.
3. Maps architectural items to geometric primitive meshes:
   - **Walls:** Uses `ExtrudeGeometry` or `BoxGeometry`. Calculating length via `Math.hypot(p2.x - p1.x, p2.y - p1.y)`. Rotation retrieved by `Math.atan2(dy, dx)`.
   - **Doors/Windows:** Uses subtraction mapping or negative scaling to simulate cutouts in the parent `hostWallId`. 
   - **Floors:** Maps `boundary` polygon arrays into flattened planar structures.
4. Includes realistic lighting (Directional, Ambient, Shadows) targeting the architectural layout to present shadows appropriately.

### 5.3 Generative Wizard AI Planner (`services/generationService.ts`)

**Feature Description:**
The defining feature. Users prompt the application with natural language specifications to automate layout drafting directly onto the canvas.

**User Journey:**
1. User opens the "Magic/Generative" popup.
2. Submits natural text: "A small studio apartment for a student, mostly modern layout".
3. A loading indicator verifies interaction while the engine runs, returning a fully plotted floorplan.

**Technical Workflow:**
1. `generationService.tsx` wraps the request into an architectural persona prompt. It forces scale validation (Meters) and real-world limits (e.g. "Do not create a giant stadium. Walls are roughly 0.15m to 0.23m thick").
2. Connects to `Gemini` API utilizing standard connection pools inside `services/aiClient.ts` passing the system instructional boundary.
3. Injects a hard JSON schema requirement leveraging `responseSchema` (see `schema.ts`). This ensures the AI model strictly formulates returns as a JSON array of predefined `ArchElement` models.
4. Parses the JSON stream, generating UI UUIDs, and instantly overwrites or appends the `project.elements` payload.

### 5.4 Editor Modifiers & State System (`App.tsx`)

**Feature Description:**
Undo/Redo stacking, tool tracking, and application-wide persistence control.

**Technical Workflow:**
- **History System:** Exists as an array of structured `Project` states `Project[]`. When `onElementsCommit` fires (after an action is finalized, like releasing the mouse), a deep clone of the new `Project` is pushed into the `history` trace array at the current `historyIndex`. Undo merely decrements the index array pointer and flushes that slice back into rendering.
- **Save/Load System:** Saves the `Project` node stringified to standard web `localStorage` allowing safe refreshes, or exports stringified JSON files locally.

### 5.5 Precise Component Adjustments (`components/PropertiesPanel.tsx`)

**Feature Description:**
Users modify specifications on the fly. Adjust a door from "Single Swing" to "Double Sliding", or make a wall 4 meters high instead of 3.

**Technical Workflow:**
Contextual React component listening for `selectedIds.length > 0`.
It renders specific `<input>` values corresponding to fields in the Element interface (`el.width` or `el.subType`).
Changes trigger an `onUpdate` dispatch -> finds element ID in `project.elements` -> mutates parameter -> triggers React rerender waterfall traversing down into WebGL & HTML Canvas.

## 6. Future CAD / DXF Export Note

The native vector PDF work established a useful thin-line profile for a future CAD/DXF exporter. Preserve the following decisions when that tool is introduced:

- Use the native canvas-command capture path as the starting point; do not derive CAD geometry from the PDF byte stream.
- Keep geometry scaling independent from stroke styling.
- Use the `0.25` stroke-width factor as the CAD/DXF thin-line baseline for doors, windows, stairs, columns, furniture, fixtures, counters, and similar secondary objects.
- Do not reuse the heavier PDF presentation profile for CAD output. PDF requires print-readable hierarchy; CAD should retain thin editable linework and assign final plotting weights through layers or plot styles.
- Treat CAD/DXF as a subset or next stage of the vector export pipeline, with semantic layers added without changing the existing canvas object renderers.

### PDF Lineweight Invariant

Vector PDF export must not apply category weights or a global stroke multiplier. The canvas is the source of truth: every explicit `lineWidth`, alpha, color, dash, fill, and nested symbol detail is preserved in its original ratio. The 1:200 reference is only a unit-conversion baseline that maps canvas styling to physical PDF units while the user's selected scale independently controls geometry placement and size.

Text is intentionally excluded from the fixed stroke-style reference. PDF text follows the same geometry transform as the canvas so room names, dimensions, and labels preserve their on-canvas size ratio to walls and objects at every selected export scale. Do not couple text scaling back to the 1:200 stroke conversion.

### DXF Export Implementation

The DXF exporter now uses the same `Canvas.render({ isExport: true })` command-capture path as vector PDF. It does not inspect `Project.elements` to redraw objects and does not parse PDF bytes. The alternate canvas context in `services/vectorDxf.ts` translates the existing renderer's vector commands into the strict AutoCAD R12 ASCII interchange profile for broad CAD compatibility.

- Geometry is written to model space at 1:1 in millimetres (`$INSUNITS = 4`). One project metre is exactly 1000 DXF units.
- The viewport zoom, pan, and canvas angle are cancelled at the capture boundary. Project origin and object placement are preserved, while the DXF Y axis is converted to conventional CAD orientation.
- Strokes become editable `POLYLINE`/`VERTEX` entities, closed fills are triangulated into `SOLID` entities, and canvas text becomes editable `TEXT` entities.
- Curves use dense editable polyline tessellation so bezier, quadratic, circular, and elliptical canvas paths retain their displayed shape in broadly compatible CAD entities.
- Canvas colors are mapped to the nearest AutoCAD indexed color.
- The AutoCAD-compatible envelope uses Autodesk-style padded group-code columns and CRLF line endings. Its only table is a strict R12 `LAYER` table generated from project layers; VPORT, LTYPE, and STYLE tables remain omitted. Composite objects use the standard R12 `BLOCKS` section.
- Each existing canvas element render sets a DXF layer metadata hint before issuing the same geometry commands. Strokes, fills, nested symbols, and text therefore inherit the source element's project layer without rebuilding geometry.
- Layer names are limited to the R12 31-character maximum and unsupported AutoCAD characters are replaced with underscores. Missing layers fall back to built-in layer `0`.
- Composite selectable objects are captured as R12 `BLOCK` definitions and represented in model space by one `INSERT`. Block geometry remains on layer `0`, while the `INSERT` uses the source project layer so AutoCAD layer controls apply to the whole object.
- Block-enabled types are doors, windows, wall openings, columns, floors, ceilings, stairs, railings, furniture, counters, fixtures, and assets. Walls, rooms, labels, dimensions, gridlines, elevation markers, and primitive line/arc/circle/ellipse/rectangle objects remain ordinary editable entities.
- Repeated renderer passes for one element ID accumulate into the same block. This keeps multi-pass geometry such as column outline/fill together without changing its existing drawing logic.
- Blocks are keyed by canonical family and geometry size rather than element ID. Identical objects therefore share one definition and use separate `INSERT` records for placement and rotation, so editing the definition in CAD updates every matching instance. Different sizes, door handing/facing, and host-wall thicknesses remain distinct definitions where their 2D geometry differs.
- Stairs remain ordinary model-space entities rather than blocks. Text and dimensions also remain directly editable entities and never become part of a block definition.
- Standard project and DXF categories are `0`, `WALLS`, `DOORS`, `WINDOWS`, `OPENINGS`, `COLUMNS`, `STAIRS`, `RAILINGS`, `FLOORS`, `CEILINGS`, `COUNTERS`, `FIXTURES`, `FURNITURE`, `GRIDLINES`, `DIMENSIONS`, `ROOMS`, `TEXT`, `SHAPES`, and `CONSTRUCTION`. Legacy staircase, railing, flooring, and ceiling layer names migrate automatically.
- Block identifiers are separate from visible object labels. They start with `B_`, contain only uppercase ASCII letters, numbers, and underscores, and remain below 24 characters for conservative R12/AutoCAD compatibility.
- Every canvas text draw bypasses active block capture at the serializer boundary. DXF `TEXT` therefore stays directly editable in model space on its source project layer even when nearby geometry belongs to a block.
- Custom dash linetypes and viewport tables remain disabled. They must be reintroduced incrementally against AutoCAD's own parser rather than only tolerant online viewers.
- Raster site-map imagery remains excluded, matching vector PDF behavior.
