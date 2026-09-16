import { Workflow } from './workflowRegistry';

export interface ArchitecturalIntent {
  project_type: string | null;
  space_type: string | null;
  architectural_style: string | null;
  interior_style: string | null;
  design_intent: string | null;
  materials: string[];
  colors: string[];
  furniture: string[];
  lighting: string | null;
  time_of_day: string | null;
  weather: string | null;
  season: string | null;
  camera_angle: string | null;
  lens: string | null;
  composition: string | null;
  location_context: string | null;
  landscape: string | null;
  people: string | null;
  mood: string | null;
  elements_to_change: string[];
  elements_to_preserve: string[];
  custom_instruction: string | null;
  image_style: string | null;
}

export const IMAGE_STYLE_PROMPTS: Record<string, string> = {
  realistic: 'high-end photorealistic architectural photography, realistic materials, balanced exposure, physically accurate lighting',
  artistic_sketch: 'artistic hand-drawn architectural sketch, black and white pencil linework, artistic paper texture, clean hand-drawn strokes',
  architectural_drawing: 'professional architectural drawing, clean precise ink lines, fine detailing, orthographic or perspective projection sketch, white background',
  oil_painting: 'rich impasto oil painting, textured canvas, visible thick brushstrokes, artistic painterly style, classical oil colors',
  watercolor: 'soft watercolor painting, bleeding pigments, artistic paper texture, delicate hand-painted washes, light artistic splashes',
  marker_drawing: 'marker sketch, vibrant alcohol marker coloring, clean architectural outline, hand-colored architectural rendering',
  charcoal_drawing: 'textured charcoal drawing, smudged dark shading, high contrast graphite and carbon strokes, artistic sketch paper',
  retro_comic: 'retro comic book style, bold black outlines, halftone dot shading, vintage pop-art colors, stylized graphic illustration',
  illustration: 'digital architectural illustration, clean vector shapes, stylized flat shading, modern artistic graphic design',
  dynamic_blur: 'architectural rendering with dynamic motion blur, long exposure effects, light trails, sense of speed and movement, blurred figures and cars'
};

export const UNIVERSAL_SOURCE_PRESERVATION_BLOCK = 
`SOURCE IMAGE AUTHORITY: Treat the supplied source image as authoritative for geometry, perspective and spatial composition. Unless explicitly requested otherwise, preserve: - camera position - camera direction - perspective - wall positions - floor geometry - ceiling geometry - structural openings - windows - doors - major architectural proportions - major object positions outside the requested edit Change only elements explicitly requested. Do not redesign unrelated portions of the scene.`;

export const UNIVERSAL_QUALITY_BLOCK = 
`QUALITY AND REALISM: Create a professional architectural visualization suitable for presentation by a leading architecture, interior-design or real-estate visualization studio. Use physically believable proportions, realistic material response, accurate texture scale, natural reflections, plausible roughness, realistic illumination, contact shadows and balanced exposure. Materials should look physically real rather than synthetic or uniformly smooth. Maintain believable construction logic, furniture scale and human proportions. Lighting must interact consistently with geometry and materials. The output should resemble premium architectural photography or a professional high-end architectural rendering rather than obvious AI artwork. Avoid excessive HDR, artificial sharpening, oversaturation, plastic materials, warped geometry and implausible architectural details.`;

export class IntentNormalizer {
  static parseFromText(text: string): ArchitecturalIntent {
    // Basic heuristics-based parsing to act as a structured intent normalizer
    const lower = text.toLowerCase();
    const intent: ArchitecturalIntent = {
      project_type: null,
      space_type: null,
      architectural_style: null,
      interior_style: null,
      design_intent: text,
      materials: [],
      colors: [],
      furniture: [],
      lighting: null,
      time_of_day: null,
      weather: null,
      season: null,
      camera_angle: null,
      lens: null,
      composition: null,
      location_context: null,
      landscape: null,
      people: null,
      mood: null,
      elements_to_change: [],
      elements_to_preserve: [],
      custom_instruction: text,
      image_style: null
    };

    // Style heuristics
    if (lower.includes('luxurious') || lower.includes('luxury')) intent.interior_style = 'luxurious contemporary';
    if (lower.includes('minimal') || lower.includes('minimalist')) intent.interior_style = 'contemporary minimal';
    if (lower.includes('warm')) intent.interior_style = (intent.interior_style ? 'warm ' + intent.interior_style : 'warm contemporary minimal');

    // Space heuristics
    if (lower.includes('living room') || lower.includes('living')) {
      intent.space_type = 'living room';
      intent.project_type = 'residential interior';
    } else if (lower.includes('façade') || lower.includes('facade') || lower.includes('exterior') || lower.includes('building')) {
      intent.project_type = 'residential exterior';
      intent.space_type = 'exterior facade';
    }

    // Material heuristics
    if (lower.includes('oak') || lower.includes('wood')) intent.materials.push('natural oak');
    if (lower.includes('marble') || lower.includes('stone')) intent.materials.push('natural marble');
    if (lower.includes('boucle')) intent.materials.push('cream boucle fabric');

    // Lighting heuristics
    if (lower.includes('daylight') || lower.includes('sun')) intent.lighting = 'soft natural daylight';
    if (lower.includes('night') || lower.includes('evening')) intent.lighting = 'warm twilight illumination';

    // Season heuristics
    if (lower.includes('winter') || lower.includes('snow')) intent.season = 'winter';
    if (lower.includes('summer')) intent.season = 'summer';

    return intent;
  }
}

export class DefaultResolver {
  static resolve(intent: ArchitecturalIntent): ArchitecturalIntent {
    return {
      project_type: intent.project_type || 'residential interior',
      space_type: intent.space_type || 'contemporary living room',
      architectural_style: intent.architectural_style || 'contemporary architectural style',
      interior_style: intent.interior_style || 'warm contemporary minimal',
      design_intent: intent.design_intent || 'modern spacious layout',
      materials: intent.materials.length > 0 ? intent.materials : ['natural oak', 'warm off-white plaster', 'subtle natural stone', 'textured neutral fabrics'],
      colors: intent.colors.length > 0 ? intent.colors : ['warm neutrals', 'off-whites', 'earth tones'],
      furniture: intent.furniture.length > 0 ? intent.furniture : ['curated contemporary designer furniture'],
      lighting: intent.lighting || 'soft natural daylight',
      time_of_day: intent.time_of_day || 'mid-afternoon',
      weather: intent.weather || 'clear sky',
      season: intent.season || 'spring/summer',
      camera_angle: intent.camera_angle || 'eye-level architectural photography',
      lens: intent.lens || '26mm full-frame equivalent',
      composition: intent.composition || 'balanced editorial composition',
      location_context: intent.location_context || 'urban neighborhood',
      landscape: intent.landscape || 'manicured contemporary landscaping',
      people: intent.people || 'minimal blurred figures for scale, avoiding distraction',
      mood: intent.mood || 'calm, sophisticated and inviting',
      elements_to_change: intent.elements_to_change,
      elements_to_preserve: intent.elements_to_preserve,
      custom_instruction: intent.custom_instruction,
      image_style: intent.image_style || 'realistic'
    };
  }
}

export class PromptCompiler {
  static compile(workflow: Workflow, resolved: ArchitecturalIntent): string {
    let template = workflow.prompt_template;
    if (!template) return resolved.custom_instruction || '';

    // Replace variables
    template = template.replace('{{project_type}}', resolved.project_type || '');
    template = template.replace('{{space_type}}', resolved.space_type || '');
    template = template.replace('{{architectural_style}}', resolved.architectural_style || '');
    template = template.replace('{{interior_style}}', resolved.interior_style || '');
    template = template.replace('{{design_intent}}', resolved.design_intent || '');
    template = template.replace('{{materials}}', (resolved.materials || []).join(', '));
    template = template.replace('{{colors}}', (resolved.colors || []).join(', '));
    template = template.replace('{{furniture}}', (resolved.furniture || []).join(', '));
    template = template.replace('{{lighting}}', resolved.lighting || '');
    template = template.replace('{{time_of_day}}', resolved.time_of_day || '');
    template = template.replace('{{camera_angle}}', resolved.camera_angle || '');
    template = template.replace('{{lens}}', resolved.lens || '');
    template = template.replace('{{composition}}', resolved.composition || '');
    template = template.replace('{{location_context}}', resolved.location_context || '');
    template = template.replace('{{landscape}}', resolved.landscape || '');
    template = template.replace('{{people}}', resolved.people || '');
    template = template.replace('{{mood}}', resolved.mood || '');
    template = template.replace('{{custom_instruction}}', resolved.custom_instruction || '');
    template = template.replace('{{style}}', resolved.interior_style || resolved.architectural_style || '');
    template = template.replace('{{environment}}', resolved.location_context || '');
    template = template.replace('{{glazing}}', 'clear double-glazed low-E glass with thin black frames');
    template = template.replace('{{floor_materials}}', 'polished microcement or light oak timber flooring');
    template = template.replace('{{room_labels}}', resolved.space_type || '');
    
    // Virtual staging elements
    template = template.replace('{{room_type}}', resolved.space_type || '');
    
    // Canvas edits
    template = template.replace('{{edit_instruction}}', resolved.custom_instruction || '');
    template = template.replace('{{identified_object}}', resolved.elements_to_change[0] || 'selected element');
    template = template.replace('{{modification}}', resolved.custom_instruction || '');
    template = template.replace('{{target_object}}', resolved.elements_to_change[0] || 'selected element');
    template = template.replace('{{target_surface}}', resolved.elements_to_change[0] || 'selected surface');
    template = template.replace('{{new_material}}', resolved.materials[0] || 'new material');
    template = template.replace('{{color}}', resolved.colors[0] || 'natural');
    template = template.replace('{{texture}}', 'realistic texture');
    template = template.replace('{{finish}}', 'matte');
    template = template.replace('{{roughness}}', 'slight roughness');
    template = template.replace('{{pattern}}', 'subtle organic variation');
    template = template.replace('{{joints}}', 'minimal flush joints');

    // Camera angle/motion placeholders
    template = template.replace('{{angle_change}}', '15 degrees');
    template = template.replace('{{direction}}', 'right');
    template = template.replace('{{camera_motion}}', 'slow horizontal pan');
    template = template.replace('{{speed}}', 'slow and stable');
    template = template.replace('{{shot_type}}', 'eye-level wide architectural shot');

    // Adjust quality block based on style
    let qualityBlock = UNIVERSAL_QUALITY_BLOCK;
    if (resolved.image_style && resolved.image_style !== 'default' && resolved.image_style !== 'realistic') {
      const styleInstruction = IMAGE_STYLE_PROMPTS[resolved.image_style];
      if (styleInstruction) {
        qualityBlock = `QUALITY AND STYLE: Render the output strictly in the style of: ${styleInstruction}. Create a professional architectural visualization in this style. Maintain physical proportions, accurate perspective, and balanced composition. The output must showcase high artistic craft in this medium, avoiding messy lines, artifacts, or digital glitches. Do not force photorealism.`;
      }
    } else if (resolved.image_style === 'realistic') {
      const styleInstruction = IMAGE_STYLE_PROMPTS[resolved.image_style];
      qualityBlock = `QUALITY AND PHOTOREALISM: Render the output strictly in the style of: ${styleInstruction}. ${UNIVERSAL_QUALITY_BLOCK}`;
    }

    // Inject blocks
    template = template.replace('{{SOURCE_IMAGE_AUTHORITY}}', UNIVERSAL_SOURCE_PRESERVATION_BLOCK);
    template = template.replace('{{UNIVERSAL_QUALITY_BLOCK}}', qualityBlock);

    // If style override is active, prepend it as a high-priority instruction block
    if (resolved.image_style && resolved.image_style !== 'default') {
      const styleDesc = IMAGE_STYLE_PROMPTS[resolved.image_style];
      if (styleDesc) {
        const styleBlock = `IMAGE RENDERING STYLE: Render the output strictly as a ${styleDesc}.`;
        template = `${styleBlock}\n\n${template}`;
      }
    }

    // Deterministically merge user custom directives if provided and not explicitly handled by template variables
    if (resolved.custom_instruction && resolved.custom_instruction.trim() && 
        !workflow.prompt_template.includes('{{custom_instruction}}') && 
        !workflow.prompt_template.includes('{{edit_instruction}}') &&
        !workflow.prompt_template.includes('{{design_intent}}')) {
      const userBlock = `USER CUSTOM DIRECTIVES (HIGH PRIORITY): ${resolved.custom_instruction.trim()}`;
      if (template.includes(qualityBlock)) {
        template = template.replace(qualityBlock, `${userBlock}\n\n${qualityBlock}`);
      } else {
        template = `${template}\n\n${userBlock}`;
      }
    }

    return template.trim();
  }
}
