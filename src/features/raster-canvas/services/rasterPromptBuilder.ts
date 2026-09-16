import { AiActionType } from '../types/aiEdit';

export class RasterPromptBuilder {
  /**
   * Constructs the precision internal prompt combining user intent, operation rules,
   * and architectural preservation instructions.
   */
  static buildPrompt(action: AiActionType, userPrompt: string, styleDesc = 'photorealistic architectural rendering'): string {
    const cleanUserPrompt = userPrompt.trim();

    switch (action) {
      case 'remove':
        return `TASK: Precision Architectural Object Removal & Background Inpainting.
TARGET OBJECT: ${cleanUserPrompt ? `Remove the specific "${cleanUserPrompt}" located inside the designated mask area.` : 'Remove the object/fixture located inside the designated mask area.'}
INSTRUCTION: Seamlessly erase ONLY the target object inside the mask and realistically reconstruct what naturally exists behind it (e.g. continuous ceiling, wall finish, flooring, or architectural surface).
PRESERVATION MANDATE: Perfectly match the surrounding texture, lighting angle, and shadow gradations. DO NOT remove, modify, or smudge any objects, fixtures, or lights outside the masked region. All other scene elements must remain 100% intact.
STYLE: ${styleDesc}, 8k sharp architectural photography, zero distortion.`;

      case 'replace':
        return `TASK: Precision Architectural Element Replacement.
USER DIRECTIVE: In the masked region only, replace the selected element with: "${cleanUserPrompt || 'modern architectural element'}".
PRESERVATION MANDATE: Preserve the exact surrounding architectural geometry, frame openings, perspective lines, environmental lighting direction, and contact shadows. Seamlessly integrate the replacement. Do not modify any areas or other objects outside the mask.
STYLE: ${styleDesc}, high-end professional visualization, crisp physical materials.`;

      case 'add':
        return `TASK: Architectural Element Insertion.
USER DIRECTIVE: In the designated masked area, insert: "${cleanUserPrompt || 'architectural element'}".
INTEGRATION MANDATE: Naturally ground the added element in perspective, casting accurate contact shadows on the floor/ground matching the primary scene light source. Replicate the color temperature, exposure, and focal depth of the surrounding render. Do not modify anything outside the mask.
STYLE: ${styleDesc}, physically accurate scale and human/furniture proportions.`;

      case 'material':
        return `TASK: Precision Architectural Material & Surface Finish Replacement.
MATERIAL DIRECTIVE: Change only the selected surface material to: "${cleanUserPrompt || 'natural architectural finish'}".
PRESERVATION MANDATE: Strictly preserve the underlying geometry, surface planar orientation, perspective grid, architectural edges, window/door openings, shadow maps, and directional highlights. Only swap the surface texture, diffuse albedo, and material roughness. Do not modify areas outside the mask.
STYLE: ${styleDesc}, realistic material response, physically believable texture scale.`;

      case 'scribble':
        return `TASK: Scribble-to-Render Architectural Synthesis.
USER DIRECTIVE: ${cleanUserPrompt
  ? `Transform every colored scribble/guide in the marked area into this photorealistic content: "${cleanUserPrompt}".`
  : 'No text description was intentionally provided. Visually interpret every distinct form in the Scribble Guide and convert each one into a plausible photorealistic object appropriate to its silhouette, placement, support surface, scale, and surrounding architectural scene.'}
GEOMETRY AUTHORITY: The separately supplied Scribble Guide is authoritative. Preserve its outer silhouette, height-to-width ratio, taper, orientation, major contour breaks, branch/part count, and placement. Do not substitute a conventionally shaped object merely because it better matches the text label.
MULTI-ITEM MANDATE: Treat spatially distinct scribbled forms as separate requested items. Render every drawn form exactly once; do not omit, merge, duplicate, or leave any guide unchanged. A text description, when present, may clarify identity but never overrides drawn count, shape, scale, or placement.
SYNTHESIS MANDATE: Follow the rough volumetric massing, proportions, and placement indicated by the user's scribble. Replace all visible guide strokes with realistic content that conforms to the drawn geometry while matching the host image's perspective, scale, materials, lighting, contact shadows, and depth. Returning the clean scene unchanged is invalid. Modify only the masked region.
INFLUENCE ENVELOPE: The mask is deliberately larger than the drawn object. Use that surrounding allowance only for physically caused effects from the rendered forms, including complete cast/contact shadows, reflections, bounced light, soft occlusion, and surface interaction. Never clip these effects at the Scribble outline or create a rectangular tonal patch. Preserve unrelated content within the allowance wherever it is not physically affected by the new forms.
STYLE: ${styleDesc}, high-definition architectural photography, seamless integration.`;

      case 'outpaint':
        return `TASK: Seamless Architectural Outpainting & Canvas Extension.
INSTRUCTION: Seamlessly extend the architectural image outward into the expanded blank border regions.
USER DIRECTIVE: ${cleanUserPrompt || 'Continue the existing scene naturally into the expanded area.'}
CONTINUATION MANDATE: Naturally continue the architectural facade, horizon, sky, landscape, ground plane, road, or interior walls. Maintain the identical camera perspective, focal length, time of day, lighting atmosphere, and stylistic identity of the central image.
STYLE: ${styleDesc}, seamless edge blending, zero seam lines.`;

      case 'cutout':
        return `TASK: Subject Segmentation & Background Removal.
INSTRUCTION: Precisely isolate the primary architectural subject/building/furniture item, creating a clean cutout with transparent background.
STYLE: Clean anti-aliased edges, preserved fine details and glass transparency.`;

      default:
        return cleanUserPrompt;
    }
  }
}
