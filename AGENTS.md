# AI Change Contract: Text 4.0 D

This file is a mandatory regression contract for every human or AI agent changing Text 4.0 D. Read it before editing any `text4d`, `4d`, or shared Generative Wizard code. Do not weaken an invariant merely to solve the newest example.

## Scope isolation

- Text 4.0 D is an independent experiment. D-specific behavior belongs in D-specific services and D-gated UI.
- Do not change Text 4.0 C, other generation modes, or Image-to-JSON behavior unless the user explicitly includes them in scope.
- Keep the stages distinct: Design Brief refinement -> confirmed canonical brief -> floorplan image generation -> local Image-to-JSON extraction.

## Confirmed invariants

1. The generated image canvas is always square (`1:1`). The floorplan inside it is not assumed to be square.
2. Confirmed width and depth describe the fixed-property bounding box. Its drawn width:depth ratio must match the numeric width:depth ratio within 2%; dimension text alone is not proof.
3. Fixed-property bounds include walls and permanent open projections such as balconies, terraces, porches, decks, steps, and railings. Dimension annotations and door leaves/swing arcs never expand the bounds.
4. Enclosed area and fixed-property bounds are separate constraints. Open projections are outside enclosed area.
5. `Rectangular Boundary` is eligible only when total confirmed area is within 95-105% of width x depth x floor count.
6. An eligible rectangular boundary auto-locks, may be manually unlocked, and locks from an explicit rectangular request. An incompatible brief cannot be locked.
7. `RECTANGLE LOCKED` requires a full rectangular exterior shell. `CREATIVE UNLOCKED` must preserve architectural freedom for compact, L/U-shaped, stepped, offset, or other coherent footprints.
8. Creativity never overrides confirmed area, fixed-property dimensions, room program, adjacency, privacy, circulation, daylight, entrances, or wet-core logic.
9. A prompt-only aspect-ratio instruction is not a sufficient enforcement mechanism. Gemini can reproduce correct labels while drawing the wrong proportions.
10. The D-only generated-image aspect guard may correct the global axis of a reliably detected `RECTANGLE LOCKED` frame before preview/digitization. It must not run for `CREATIVE UNLOCKED`, call Gemini again, or modify Image-to-JSON algorithms.
11. Every named room/space shown in the generated preview must have exactly one full Design Brief room name, rendered in thin text at 0.33 times normal room-label height. Do not abbreviate room names or render room dimensions/areas. Labels must fit wholly inside clear floor space and never touch, cross, obscure, or replace architectural geometry. Keep the deterministic cross-dimension presentation fallback disabled for the normal D-generated-image path.
12. The D-only direct-upload test route must bypass Gemini image generation, require at least one explicit upload-specific dimension (area is optional), and call the same `convertFloorplanImage4d` and local Image-to-JSON extractor used by Gemini-created images. One supplied dimension establishes uniform scale and the missing axis is inferred from the traced wall-face aspect ratio without stretching. It must not inherit unstated scale values from the normal Design Brief, run generated-image aspect correction, or add generated-image presentation annotations to the uploaded raster.
13. Text 4.0 D has one universal Image-to-JSON implementation. Extraction improvements apply equally to manually uploaded and Gemini-created rasters; do not fork conversion algorithms by image source. Property extents are measured between the extreme exterior wall faces, never wall centerlines, annotations, door leaves, or swing arcs.
14. Text 4.0 D must show raster architectural geometry before OCR completes, label provisional enclosures `Space 01`, `Space 02`, and so on, and keep Import actions locked until final digitization finishes. A short OCR preview budget must not discard labels from the final result.
15. Door swing hand/facing and visually evidenced door subtypes must survive the shared Image-to-JSON path. Do not infer folding, glass, bay-window, column, stair, or similar presets from dimensions alone; add a matched raster/JSON fixture before enabling each detector. Track coverage in `TEXT_4_0_D_IMAGE_TO_JSON_COVERAGE.md`.
16. The finalized Text 4.0 D Design Copilot preview is the authoritative import payload. Main-canvas placement may translate the group and remap IDs/levels, but must not re-host, rotate, resize, add, remove, or reclassify any preview element.
17. A disconnected interior wall component may survive clutter rejection only when four raster-evidenced orthogonal sides coherently enclose a reliable OCR room tag. OCR may select observed walls; it must never invent a wall edge from the label or Design Brief.

## Permanent regression examples

| Brief | Boundary state | Required generated-image behavior |
| --- | --- | --- |
| 1000 sq ft, 25 ft x 40 ft, 1 floor | Auto rectangle lock | Full rectangle; drawn exterior ratio `25/40 = 0.625` within 2% |
| 900 sq ft, 25 ft x 40 ft, 1 floor | Ineligible/unlocked | 90% enclosed coverage; intelligent non-rectangular form allowed |
| 950 sq ft, 25 ft x 40 ft, 1 floor | Eligible | May lock; ratio still `0.625` when locked |
| 949 sq ft, 25 ft x 40 ft, 1 floor | Ineligible | Cannot be manually locked |
| Any plan with an outward-swinging door | Either | Door leaf and arc excluded from property dimensions |

## Required change procedure

1. Inspect the current diff and relevant git history before editing; preserve unrelated user changes.
2. Identify which single stage owns the defect. Do not compensate in a later stage unless explicitly requested.
3. Add or update a deterministic regression test for the reported example before declaring success.
4. Run at minimum:
   - `npm run test:text4d-prompt`
   - `npm run test:text4d-local`
   - `npm run test:text4d-presets`
   - `npm run test:text4c-prompt`
   - `npm run build`
5. Manually verify any changed confirmation UI. Do not make a Gemini generation call merely to test local code.
6. Report whether changes are local, committed, or pushed. Never silently broaden scope.

## Ownership map

- Canonical brief and rectangle eligibility: `services/text4dBrief.ts`
- Image prompt: `services/text4dPromptBuilder.ts`
- D image model configuration/system instruction: `services/text4dImageConfig.ts`
- D image proxy: `services/text4dBackend.ts`
- Post-generation locked-frame aspect guard: `services/text4dGeneratedImageAspectGuard.ts`
- Post-extraction preview room labels: `services/text4dGeneratedImageRoomLabels.ts`
- Browser image-generation client: `services/imageGenService4d.ts`
- Local Image-to-JSON (protected unless explicitly requested): `services/localImageToJSON4d.ts`
- Design Brief Confirmation UI: `components/generative-wizard/GenerativeWizardCore.tsx`
- Direct-upload validation and scale context: `services/text4dDirectUpload.ts`
- Authoritative D preview-to-canvas handoff: `services/text4dImportHandoff.ts`
- Regression tests: `scripts/testText4dPrompt.mjs`, `scripts/testLocalImageToJSON4d.mjs`

## Repository recovery baseline and Git workflow

- The verified recovered application baseline is commit `11a2b4034455b30d25ac46813e0496ce01c6cd49` (`Recover latest Img23D working state`). It represents the complete working source recovered to 2026-09-14 12:20 PM Pakistan time.
- `master` and `Img23D` were synchronized to that baseline on GitHub. Do not repeat, undo, reconstruct, or move the recovery unless the user explicitly requests another recovery.
- Preserve other feature and experiment branches. Their history was pushed to GitHub for safekeeping; do not delete, force-update, or merge them merely to make branch pointers identical.
- Start ordinary development from the latest `origin/master` in a new feature branch or Codex worktree. Keep each distinct outcome on its own branch.
- Before manual work, run `git fetch origin`, switch to `master`, update with `git pull --ff-only origin master`, then create a branch with `git switch -c feature/<short-name>`.
- Commit only reviewed files, push with `git push -u origin <branch>`, and merge into `master` through a pull request after validation. After merge, update other checkouts with `git switch master` followed by `git pull --ff-only origin master`.
- Check `git status` and `git branch --show-current` before every pull, commit, or push. Do not use a normal merge pull or force-push `master` during routine development.
- Never commit `.env` files, private keys, service-account JSON, generated build output, or recovery archives. In particular, keep `All files 01.09.26.zip` and `ml/auto_plan/rendair_gcp_key.json` local and ignored.
- A new Git worktree does not inherit ignored runtime files. Before starting its local server, provision `.env`, `.env.local`, `ml/auto_plan/rendair_gcp_key.json`, and the recovered `revit-export/RevitExportAddin/Assets` from the verified local checkout or secret store, then install dependencies. Keep these files ignored.
- After provisioning a worktree, verify `POST /api/ai-render/auth/warm` returns `ready: true`. If `rendair_gcp_key.json` is absent, AI Render intentionally uses its local source/mock-image fallback even when every tracked branch and commit is correct.
