# Project Architecture & Technical Reference Handbook

Welcome to the definitive architectural, data, and logic blueprint of the application. This document outlines the structural framework, rendering pipelines, algorithmic layout engines, custom coordinate systems, and newly expanded capabilities of the system. It serves as an exhaustive, self-contained reference for subsequent engineering and design iteration in **Antigravity**.

---

## 1. Directory Structure Overview

The project is structured as a modular React single-page application built on Vite and TypeScript, employing a canvas-based vector draft environment coupled with a Three.js 3D viewport.

```
/
├── App.tsx                     # Global layout orchestrator, state manager, and UI container.
├── index.tsx                   # Render entry-point mounting the App.
├── index.html                  # Webpage hosting context.
├── types.ts                    # Global TypeScript definitions, enums, and interfaces.
├── constants.tsx               # Theme definitions, tool configurations, and typographic templates.
├── metadata.json               # Application descriptor, capabilities list, and web sandbox permissions.
├── package.json                # Project dependencies, compile directives, and script triggers.
│
├── components/                 # React UI Components
│   ├── Canvas.tsx              # Core 2D interactive drafting canvas using HTML5 2D Context.
│   ├── Viewer3D.tsx            # Three.js-powered responsive webGL 3D architectural viewer.
│   ├── Toolbar.tsx             # Interactive action arrays and drawing toolbars.
│   ├── PropertiesPanel.tsx     # Context-aware geometric and procedural property inspector.
│   ├── ProceduralWizard.tsx    # Standard generative layout configuration modal.
│   ├── BlockEditor.tsx         # Custom vector boundary editor for urban blocks and zoning.
│   ├── UrbanWizard.tsx         # Generative massing, setback, and envelope generator.
│   └── GenerativeWizard.tsx    # Multi-step AI architectural prompt controller.
│
├── services/                   # Business Logic, Parsers, and Generators
│   ├── proceduralService.ts    # Standard layout, polygon-decomposition, and zoning logic.
│   ├── proceduralVariants.ts   # Layout definitions, typology sub-types, and constraints.
│   ├── furnishService.ts       # Floorplan furniture, fixture, and appliance distribution engine.
│   ├── vectorDxf.ts            # High-fidelity CAD exporter (Block, Insert, Layer, and Texts).
│   ├── dxfImportService.ts     # DXF Parser, unit metadata resolver, and parallel-wall detector.
│   ├── vectorPdf.ts            # Vector-based client-side PDF blueprint compiler.
│   ├── aiClient.ts             # Server-proxied LLM prompt client (Gemini-compliant).
│   ├── aiDxfService.ts         # LLM-assisted vector vectorization and design assistant.
│   ├── fusionService.ts        # Algorithmic merge layers for combining floorplan drafts.
│   ├── urbanService.ts         # Computational parceling, site planning, and road-grid solvers.
│   └── objParser.ts            # Client-side Wavefront .obj parser for 3D asset rendering.
│
└── smart-procedural/           # Advanced Procedural Architecture Engine (New Additions)
    ├── smartProceduralService.ts  # SmartProceduralLayoutEngine for multi-criterion generative layout.
    ├── smartProceduralVariants.ts # SMART_HANDBOOK_VARIANTS specifying high-density planning structures.
    ├── smartFurnishService.ts  # SmartProceduralFurnishEngine with customized orientation solvers.
    └── SmartProceduralWizard.tsx  # Dynamic configuration panel for complex layouts.
```

---

## 2. Core Architectural Design & State

### 2.1 State Management (Single Source of Truth)
The global state resides in `App.tsx` and is structured using the following main variables:
- **`project`**: Holds the document tree, including:
  - `elements`: A flat array of `ArchElement` models (walls, windows, doors, stairs, furniture, floors, ceilings, dimensions).
  - `levels`: Floor elevation list, heights, and visibility flags.
  - `settings3D`: 3D rendering profiles, grid overlays, shadows, and environment templates.
- **`editorState`**: Holds transient interactive UI state:
  - `activeTool`: Active tool pointer (e.g., `'wall'`, `'move'`, `'select'`, `'smart-procedural-boundary'`).
  - `selectedIds`: Selected element GUIDs.
  - `zoom` / `pan`: 2D viewport pan/zoom ratios.
  - `unitSystem`: `'imperial'` (Inches/Feet) or `'metric'` (Meters).
  - `multiPointBuffer`: Poly-line coordinate collection prior to commitment.

### 2.2 Undo / Redo Mechanism
Uses an immutable state stack (`history` / `future`) in `App.tsx`. State transitions are captured by `pushHistory(updatedProject)` to store snapshots of the core `project` structure, facilitating multi-step rollback.

---

## 3. Coordinate Systems & Math Operations

Drafting operates over three primary coordinate spaces:
1. **World Space**: Pure decimal coordinate vectors (`x`, `y`) representing real-world feet/inches or meters.
2. **Screen Space**: Target pixel space in the browser canvas. Uses linear transforms:
   $$\text{ScreenX} = (\text{WorldX} - \text{PanX}) \times \text{Zoom}$$
   $$\text{ScreenY} = (\text{WorldY} - \text{PanY}) \times \text{Zoom}$$
3. **Internal Block Space**: Relative to local anchors (`x0`, `y0`) and rotations ($\theta$) to permit modular object nesting during DXF/PDF compile passes.

### Vector Calculations
- **Advanced Snapping**: Managed in `Canvas.tsx` with high-performance proximity indices. Employs:
  - Orthogonal alignment constraints (locks mouse angles to $0^\circ, 45^\circ, 90^\circ$).
  - Element intersection and edge extension trackers (checks closest points to infinite lines defined by wall/grid segments).
- **Point-in-Polygon Tests**: Employs ray-casting crossings algorithms to identify space containment, crucial for assigning rooms to boundaries and generating furniture inside a procedural floorplan.

---

## 4. Key Subsystems and Engines

### 4.1 Interactive 2D Canvas Engine (`components/Canvas.tsx`)
A custom vector-graphics renderer leveraging HTML5 2D Canvas contexts. It handles complex continuous mouse interaction loops:
- **Draw Loops**: Renders dynamic grid overlays, dimensions, wall thicknesses, stair risers, and door swings.
- **Transform Overlays**: Computes bounding boxes for grouped elements, supporting live drag, copy, duplication, and precise alignment.
- **Ghost Preview Rendering**: While drawing (e.g., drag-sizing a wall or a procedural area), a virtual "ghost" representation is rendered in real-time, querying layout preview engines to display real-time feedback of interior floorplans before committing them.

### 4.2 Three.js 3D Viewer (`components/Viewer3D.tsx`)
Compiles flat vector models into rich 3D geometries in real-time.
- **Wall Extrusion**: Converts 2D wall lines with thickness and height properties into full 3.5D volumetric meshes with custom window and door cutouts.
- **Element Filtering**: A strict exclusion filter (`SKIP`) filters out non-physical drafting helper elements (`'dimension'`, `'line'`, `'gridline'`, `'elevation-marker'`, etc.) from standard 3D compilations to keep render passes clean.
- **Asset Instancing**: Maps furniture nodes into pre-loaded 3D meshes using local transform matrices ($T$, $R$, $S$).

### 4.3 Computational Layout & Procedural Engines

#### Procedural Layout Engine (`services/proceduralService.ts`)
Generates logical sub-rooms, partitions, hallways, and structural elements inside a closed bounding polygon.
- **Sub-Zoning Math**: Decomposes large shapes into spatial functional envelopes (`public`, `core`, `private`, `circulation`).
- **Door/Pathway Solver**: Identifies wall adjacency rules to automatically place open archways and doors.

#### Smart Procedural Layout Suite (`smart-procedural/`)
Introduces custom-isolated, hyper-robust spatial reasoning modules:
- **`smartProceduralService.ts`**: Implements `SmartProceduralLayoutEngine` using custom multi-criteria layouts, seed-based stability, and responsive area ratios.
- **`smartProceduralVariants.ts`**: Contains `SMART_HANDBOOK_VARIANTS` supporting high-density, multi-room programmatic compositions (studio, multi-bed, commercial complexes, and public hubs).
- **`smartFurnishService.ts`**: Employs oriented directional ray-solvers. It searches for adjacent wall vectors inside individual generated sub-zones to align furniture, desks, and kitchen blocks correctly, avoiding overlapping exits or windows.
- **`SmartProceduralWizard.tsx`**: A bespoke modal interface providing fine-grained planning sliders, flow controls, and priority selectors.

---

## 5. Export / Import Pipelines

### 5.1 DXF Exporter (`services/vectorDxf.ts`)
Converts 2D elements into standard DXF CAD formats.
- **Selectable AutoCAD Groups**: To prevent imported models from cluttering the AutoCAD viewport with disconnected lines, the engine outputs groups as discrete `BLOCK` and `INSERT` instructions. When the draftsman clicks any line of an imported group in AutoCAD, the entire structure selects as a single entity.
- **Text Placements**: Corrects world-space elevation text layouts to project smoothly relative to parent block frames, mitigating DXF displacement bugs.

### 5.2 DXF Importer (`services/dxfImportService.ts`)
Reads standard DXF formats back into clean, editable vector structures.
- **Unit Metadata Decoupling**: Employs a robust coordinate model where structural geometry scale uses the explicit `Drawing Coordinate Units - Used For Scale` (e.g., Meters, Feet) defined in the import UI. It ignores standard `$INSUNITS` overrides for coordinate scales, treating them strictly as documentation.
- **Parallel Wall Solver**: Recognizes double-line pairs and compiles them into solid editable 2D wall elements.

### 5.3 Vector PDF Compiler (`services/vectorPdf.ts`)
Outputs structured vectors to high-resolution vector PDF blueprints, maintaining high line-weights, colors, text alignment, and scale indicators.

---

## 6. How to Continue Editing in Antigravity

This workspace is primed for rapid development in Antigravity. When adding or revising logic:
1. **Adding New Tools**: Modify `DRAWING_TOOLS` in `App.tsx` and map them inside `components/Toolbar.tsx` and the draw loops of `components/Canvas.tsx`.
2. **Expanding Program Typologies**: Add schemas to `SMART_HANDBOOK_VARIANTS` inside `/smart-procedural/smartProceduralVariants.ts` to enrich the layout generator.
3. **Enhancing DXF/PDF Structuring**: Keep layers strictly categorized inside `services/vectorDxf.ts` to ensure clean importing and exporting.
