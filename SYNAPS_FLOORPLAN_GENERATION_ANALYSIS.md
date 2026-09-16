# Synaps.app Floorplan Generation Analysis

Date: 2026-07-08

## Scope

This report summarizes information recovered from the Synaps.app page loaded at:

`https://my.synaps.app/models/f35d23f1-7d26-4814-979a-fb2debbd5080/pages/407d7578-25d7-4650-99e6-6cae7c757669`

Inspection sources:

- Publicly delivered JavaScript/CSS bundles from the loaded Synaps web app.
- The authenticated live canvas opened in the in-app browser.
- Local readable excerpts extracted into `.synaps-analysis/`.

No live floorplan generation was triggered during this inspection, so no AI credits were spent and no live generation response was captured.

## High-Level Finding

The floorplan generation feature is not fully local to the browser. The browser-side code posts a floorplan request to a remote generator endpoint, then performs the canvas/object conversion locally after receiving the returned floorplan geometry.

The remote generation endpoint observed in the client bundle is:

`https://fpgen-v3.fly.dev/predictions/fpgen-v3`

The local browser bundle contains:

- The AI/floorplan UI.
- The request builder.
- The authenticated POST call.
- The success/error handling.
- Credit deduction trigger.
- Conversion of returned walls/zones/doors/windows into Synaps canvas shapes.
- Local polygon boolean logic used to infer room polygons from generated wall geometry.

The remote server-side generator internals were not present in the downloaded client bundle.

## Observed Application Stack

The loaded app is a React/Vite-style single page app with route-based JS chunks.

Relevant client technologies observed:

- React UI.
- Vite chunk loading.
- Supabase-style client usage for auth, storage, database resources, and edge functions.
- Liveblocks for collaborative canvas room/session storage.
- Pixi/canvas rendering for the drawing surface.
- XState-like state machine tooling for editor interaction.
- Clipper2 WASM for polygon boolean operations.
- PostHog/Userflow analytics and onboarding scripts.

The main canvas route chunk is:

`.synaps-analysis/_pageId-BBtXzEqX.js`

Readable excerpts created during inspection:

- `.synaps-analysis/fpgen-region.readable.js`
- `.synaps-analysis/ai-ui-region.readable.js`
- `.synaps-analysis/geometry-region.readable.js`

## Live Canvas Observations

After login, the authenticated canvas loaded successfully.

Observed visible canvas/project state:

- A basic apartment canvas was open.
- The visible text included room labels such as `BATHROOM`, `KITCHEN`, `BEDROOM`, and `BALCONY`.
- The bottom AI input was visible.
- The floorplan mode placeholder was: `Draw a boundary to generate a floor plan...`
- The account indicator showed `120 AI Credits` and `Pro`.
- The browser page contained one main canvas element, measured at approximately `1251 x 1191`.

Loaded assets on the authenticated canvas included:

- `index-BKV4Pnh3.js`
- `_pageId-BBtXzEqX.js`
- `TeamMembers-BsADyeEf.js`
- `_pageId-sz6HcxQH.css`
- `clipper2z.wasm`

## Feature Entry Point

The floorplan generator is controlled through the bottom AI input bar.

The AI bar reads editor state:

- Current AI prompt.
- Current AI mode.
- Selected canvas shape.
- Current team/project/page context.
- AI credit entitlement and feature availability.

The AI mode can switch between image generation and floorplan generation. In floorplan mode:

- Image references are rejected.
- The input placeholder changes to the floorplan-specific prompt.
- The submission path calls the floorplan mutation rather than the image generation mutation.

The floorplan mode UI recognizes selected boundary-like shapes for display:

- `rectangle`
- `circle`
- closed `polyline`

However, the actual request boundary extraction only serializes vertices for:

- `polyline`
- `rectangle`

If the selected shape is missing or is not one of those two types, the request boundary becomes an empty array.

Evidence:

- `.synaps-analysis/ai-ui-region.readable.js:57`
- `.synaps-analysis/ai-ui-region.readable.js:61`
- `.synaps-analysis/ai-ui-region.readable.js:67`
- `.synaps-analysis/ai-ui-region.readable.js:90`
- `.synaps-analysis/ai-ui-region.readable.js:92`
- `.synaps-analysis/ai-ui-region.readable.js:147`
- `.synaps-analysis/ai-ui-region.readable.js:150`

## Request Construction

The client has a hardcoded default floorplan request object.

Observed default fields:

```json
{
  "boundary": [[500,605],[100,605],[100,195],[410,195],[410,100],[980,100],[980,375],[1095,375],[1095,925],[700,925],[700,605],[500,605]],
  "entrance": [],
  "num_output_plans": 3,
  "num_bedrooms": 2,
  "num_bathrooms": 1
}
```

At submit time, the live request is built by merging the default object with:

- `prompt`: the current text prompt.
- `boundary`: vertices from the selected closed polyline or rectangle, normalized with `startAtZero`.

The selected boundary is collected with editor geometry functions that convert the shape into page-space vertices and then subtract the minimum x/y so the boundary starts near local coordinate zero.

If no supported selected boundary exists, the submitted boundary is `[]`, because the live boundary field overwrites the default boundary.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:15`
- `.synaps-analysis/ai-ui-region.readable.js:92`
- `.synaps-analysis/ai-ui-region.readable.js:93`
- `.synaps-analysis/ai-ui-region.readable.js:94`

## Remote Generation Call

The browser sends the request with:

- Method: `POST`
- Content type: `application/json`
- Authorization: bearer token from client auth state
- Body: JSON floorplan payload

Observed endpoint:

`https://fpgen-v3.fly.dev/predictions/fpgen-v3`

Error handling:

- If the HTTP response is not OK, the client reads response text.
- It attempts to parse an `error` field from JSON.
- If parsing fails, it uses the raw response text or a generic status error.
- If the parsed JSON response contains an `error` field, it throws that error.
- Otherwise, it returns the parsed JSON response.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:42`
- `.synaps-analysis/fpgen-region.readable.js:43`

## Expected Response Shape

The client-side post-processing expects the generator response to include:

```ts
{
  walls: Array<[number[], string]>,
  zones: Array<[number[], string]>,
  doors: number[][],
  entrance_doors: number[][],
  windows: number[][]
}
```

The exact server-side response schema was inferred from how the client consumes the fields.

Observed field usage:

- `walls`: used to create wall shapes.
- `zones`: used as room label/ref-point seeds.
- `doors`: used to place door opening blocks.
- `entrance_doors`: merged with `doors` and handled as door openings.
- `windows`: used to place window opening blocks.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:43`
- `.synaps-analysis/fpgen-region.readable.js:47`
- `.synaps-analysis/fpgen-region.readable.js:58`
- `.synaps-analysis/fpgen-region.readable.js:59`
- `.synaps-analysis/fpgen-region.readable.js:60`

## Credit Handling

The client defines the floorplan generation credit cost as:

`30`

After a successful generation response, the client triggers a Supabase edge function call:

`credits-reduce`

The body includes:

```json
{
  "teamId": "...",
  "credits": 30,
  "operation": "floor_plan_generation"
}
```

After credit mutation success, the client invalidates member usage queries.

The credit deduction is triggered after generation success, not before the remote generation request.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:17`
- `.synaps-analysis/fpgen-region.readable.js:83`
- `.synaps-analysis/fpgen-region.readable.js:101`

## Placement Behavior

After receiving a generation response, the client tries to place the floorplan automatically if the selected shape is a closed polyline or rectangle.

Placement path:

1. Check the currently selected shape.
2. If selected shape is a closed `polyline` or `rectangle`, get its page bounds.
3. Use the selected shape bounds point as origin.
4. Create the generated floorplan at that origin.
5. Delete the original boundary shape.
6. Show success notification.

If there is no selected closed boundary shape:

1. Show an instruction notification: click anywhere to place the floorplan.
2. Change cursor to crosshair.
3. Wait for a pointer down event.
4. Convert clicked screen point to page point.
5. Place the floorplan there.
6. Restore default cursor.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:85`
- `.synaps-analysis/fpgen-region.readable.js:88`
- `.synaps-analysis/fpgen-region.readable.js:101`
- `.synaps-analysis/fpgen-region.readable.js:105`
- `.synaps-analysis/fpgen-region.readable.js:107`
- `.synaps-analysis/fpgen-region.readable.js:109`

## Wall Creation

The local conversion function starts by checking `response.walls`.

If there are no walls, it exits.

Wall conversion logic:

1. Choose origin from placement options or viewport page center.
2. Read all wall segment coordinates.
3. Compute minimum x and minimum y across all wall endpoints.
4. Normalize wall endpoints by subtracting the minimum x/y.
5. For each wall segment, create a Synaps `wall` shape.

Each generated wall shape includes:

- `type: "wall"`
- local x/y origin
- two points: `a0` and `a1`
- stroke style
- wall height
- separator flag

Wall type handling:

- If returned wall type is `exterior`, wall height is `35`.
- Other wall types use height `15`.
- If returned wall type is `division`, `isSeparator` is set to true.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:43`
- `.synaps-analysis/fpgen-region.readable.js:44`
- `.synaps-analysis/fpgen-region.readable.js:46`
- `.synaps-analysis/fpgen-region.readable.js:47`

## Duplicate / Overlapping Wall Cleanup

After creating wall shapes, the client checks for redundant wall segments.

Observed cleanup behavior:

- Iterate over generated walls.
- Compare each wall to other walls.
- Skip comparison when the candidate is not sufficiently longer.
- Measure both endpoints of one wall against the other wall segment.
- If both endpoints are very close to the other segment and direction vectors are nearly parallel, mark the shorter wall for deletion.

Observed thresholds:

- Endpoint-to-segment distance: less than `5`.
- Direction dot product absolute value: greater than `.95`.
- Length comparison uses approximately an `80%` ratio check.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:49`
- `.synaps-analysis/fpgen-region.readable.js:79`
- `.synaps-analysis/fpgen-region.readable.js:80`
- `.synaps-analysis/fpgen-region.readable.js:81`
- `.synaps-analysis/fpgen-region.readable.js:82`

## Wall Binding

After wall cleanup, the client recomputes wall bindings.

This likely establishes wall-to-wall relationships for joins, intersections, rendering continuity, and subsequent opening placement.

The function used is:

`createWallBindings`

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:51`

## Room / Zone Creation

The generator returns `zones`.

Each zone is treated as:

- A reference point.
- A room type/name label.

Conversion behavior:

1. Convert each zone into `{ refPoint, type }`.
2. Lowercase the type label.
3. Add floorplan placement origin to the reference point.
4. Run a local geometry function to find the enclosed room polygon that contains the reference point.
5. If a polygon is found, create a `room` shape.

Room shape fields include:

- `id`
- `type: "room"`
- origin x/y
- `name`: zone type
- polygon points
- `refPoint`
- fill style
- `wallIds`

For some room types mapped to tile flooring, the client applies a hatch fill:

- type: `hatch`
- pattern: `cross`
- opacity: `.83`
- stroke: `#a1a1a1`

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:47`
- `.synaps-analysis/fpgen-region.readable.js:52`
- `.synaps-analysis/fpgen-region.readable.js:53`
- `.synaps-analysis/fpgen-region.readable.js:54`
- `.synaps-analysis/fpgen-region.readable.js:55`
- `.synaps-analysis/fpgen-region.readable.js:56`
- `.synaps-analysis/fpgen-region.readable.js:58`

## Door and Window Creation

Door and window placement is performed locally after wall and room creation.

Door handling:

- Combine `doors` and `entrance_doors`.
- Treat each returned item as a segment.
- Normalize segment coordinates using the same min x/y offset as walls.
- Compute the midpoint of the segment.
- Find a canvas asset whose payload name includes `default-door`.
- Create a block/opening at the midpoint.
- Attach the block to the nearest wall.

Window handling:

- Read `windows`.
- Treat each returned item as a segment.
- Normalize segment coordinates.
- Compute segment midpoint.
- Find a canvas asset whose payload name includes `default-window`.
- Create a block/opening at the midpoint.
- Attach the block to the nearest wall.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:59`
- `.synaps-analysis/fpgen-region.readable.js:60`
- `.synaps-analysis/fpgen-region.readable.js:61`
- `.synaps-analysis/fpgen-region.readable.js:62`
- `.synaps-analysis/fpgen-region.readable.js:63`
- `.synaps-analysis/fpgen-region.readable.js:66`

## Opening-to-Wall Attachment

Openings are attached to nearby walls by a helper that:

1. Computes the block reference line midpoint.
2. Searches nearest wall shapes around the opening point.
3. Filters candidate walls whose wall geometry contains the opening point inside an expanded wall polygon.
4. Picks the nearest/sorted wall candidate.
5. Updates the opening block with wall attachment metadata.
6. Updates the wall `openings` map.
7. Removes stale opening binding from the previous wall if needed.

The nearest wall search uses:

- `n: 4`
- `maxDistance: 100`

The wall attachment stores:

- wall id
- normalized distance parameter along wall
- offset value

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:20`
- `.synaps-analysis/fpgen-region.readable.js:21`
- `.synaps-analysis/fpgen-region.readable.js:22`
- `.synaps-analysis/fpgen-region.readable.js:24`
- `.synaps-analysis/fpgen-region.readable.js:25`
- `.synaps-analysis/fpgen-region.readable.js:42`

## Local Geometry Engine

The bundle includes and loads Clipper2 WASM:

`/assets/clipper2z.wasm`

The readable geometry excerpt shows the WASM module being loaded and exposed as a local geometry API.

Observed local geometry operations:

- Union
- Difference
- Simplify paths
- Orientation/positive polygon checks
- Area calculation

Evidence:

- `.synaps-analysis/geometry-region.readable.js:11`
- `.synaps-analysis/geometry-region.readable.js:15`
- `.synaps-analysis/geometry-region.readable.js:24`
- `.synaps-analysis/geometry-region.readable.js:36`
- `.synaps-analysis/geometry-region.readable.js:45`

## Room Polygon Reconstruction

Room polygons are inferred locally from wall geometry and zone reference points.

The room-finding function:

1. Collects wall shapes from generated shapes.
2. Collects separator shapes.
3. Converts wall shapes into wall body polygons using wall geometry utilities.
4. Converts separators into thin wall polygons.
5. Computes a common bounding rectangle around all wall bodies.
6. Uses Clipper2 difference to subtract wall bodies from the bounding rectangle.
7. Separates resulting polygons into inner and outer polygon groups.
8. Finds the inner polygon that contains the zone reference point.
9. Detects holes contained inside that polygon.
10. Finds nearby wall/separator IDs inside an expanded room polygon bounds.
11. Returns polygon, holes, and wall IDs.

Returned room geometry:

```ts
{
  polygon: Point[],
  holes: Point[][],
  wallIds: string[]
}
```

Evidence:

- `.synaps-analysis/geometry-region.readable.js:45`
- `.synaps-analysis/geometry-region.readable.js:58`
- `.synaps-analysis/geometry-region.readable.js:60`
- `.synaps-analysis/geometry-region.readable.js:62`
- `.synaps-analysis/geometry-region.readable.js:68`
- `.synaps-analysis/geometry-region.readable.js:71`
- `.synaps-analysis/geometry-region.readable.js:73`

## Shape Types Involved

Observed generated/editor shape types involved in this feature:

- `wall`
- `room`
- `block`
- `polyline`
- `rectangle`
- `separator`

Opening assets are inserted as `block` shapes and then associated with wall geometry.

Room labels and measurements are rendered from `room` shapes with `refPoint`.

## Data Persistence / Collaboration Path

The page uses Liveblocks for collaborative room storage.

Observed behavior:

- Canvas shapes are stored in a Liveblocks `LiveMap` named `shapes`.
- On remote Liveblocks updates, the local editor creates, updates, or deletes shapes.
- On local editor revisions, created/updated/deleted shapes are synchronized back into Liveblocks storage.
- Presence is updated with user data.

Evidence:

- `.synaps-analysis/_pageId-BBtXzEqX.js`
- The authenticated canvas route initializes Liveblocks room storage with `shapes`.

## Supabase / Resource Usage

The app uses Supabase-style APIs for:

- Resources/models/pages.
- Storage uploads.
- Public URLs.
- Edge function invocation.
- Credit deduction.

Observed tables/functions/storage areas from the bundles include:

- `resources`
- `credits-reduce`
- storage upload/list/remove/public URL calls
- AI folder path construction for page/model assets

Evidence:

- `.synaps-analysis/index-BKV4Pnh3.js`
- `.synaps-analysis/_pageId-BBtXzEqX.js`
- `.synaps-analysis/fpgen-region.readable.js:17`

## Error and Notification Behavior

Floorplan generation errors show a generic notification:

`Floorplan generation failed. Try again.`

On success:

`Floor plan generated!`

If the response succeeds but placement requires manual location, the client shows an instruction to click anywhere to place the generated floorplan.

Evidence:

- `.synaps-analysis/fpgen-region.readable.js:94`
- `.synaps-analysis/fpgen-region.readable.js:98`
- `.synaps-analysis/fpgen-region.readable.js:105`
- `.synaps-analysis/ai-ui-region.readable.js:67`

## Information Recovered

Recovered:

- The client route chunk containing floorplan generation behavior.
- The remote floorplan generation endpoint.
- The request-building logic.
- The default request fields.
- The bearer-token authenticated POST behavior.
- The expected response field names.
- The credit deduction amount and operation name.
- The local conversion from response data to Synaps canvas shapes.
- The wall creation logic.
- The room polygon reconstruction logic.
- The door/window placement logic.
- The opening-to-wall attachment behavior.
- The polygon boolean engine used locally.
- Live UI confirmation that the feature is exposed as the bottom AI floorplan mode.
- Live account/canvas confirmation after login.

Not recovered:

- The internal implementation of `fpgen-v3` on the remote server.
- The algorithm/model/rules used by the remote service to convert boundary/prompt into walls/zones/openings.
- A live sample generation response from the remote endpoint.
- Any server-side source code.
- Any source maps with original unminified application source.

## Evidence File Index

Primary downloaded bundle:

- `.synaps-analysis/_pageId-BBtXzEqX.js`

Main readable excerpts:

- `.synaps-analysis/fpgen-region.readable.js`
- `.synaps-analysis/ai-ui-region.readable.js`
- `.synaps-analysis/geometry-region.readable.js`

Other downloaded bundles/assets:

- `.synaps-analysis/index-BKV4Pnh3.js`
- `.synaps-analysis/TeamMembers-BsADyeEf.js`
- `.synaps-analysis/_pageId-sz6HcxQH.css`

Temporary formatter/scratch files:

- `.synaps-analysis/fpgen-region.min.js`
- `.synaps-analysis/ai-ui-region.readable.js`
- `.synaps-analysis/geometry-region.readable.js`
- `synaps_analysis_tmp/`
