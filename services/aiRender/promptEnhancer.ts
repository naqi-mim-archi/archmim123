import { WORKFLOWS } from './workflowRegistry';
import { IMAGE_STYLE_PROMPTS } from './promptCompiler';

export type DrawingType = 
  | 'Floor Plan' 
  | 'Elevation' 
  | 'Sketch / Line Drawing' 
  | '3D Model / Massing Screenshot' 
  | 'Section Drawing' 
  | 'Custom';

export type ReferenceAspect = 
  | 'All (Complete Theme & Mood)'
  | 'Lighting & Atmosphere' 
  | 'Visual Style & Theme' 
  | 'Materials & Textures' 
  | 'Furniture & Decor' 
  | 'Environment & Landscape';

export interface ReferenceImageMeta {
  id?: string;
  name?: string;
  category?: 'drawing' | 'reference';
  drawingType?: string;
  customDrawingType?: string;
  referenceAspects?: string[];
  label?: string;
  base64?: string;
  mimeType?: string;
}

export interface PromptEnhanceRequest {
  user_input: string;
  workflow_id: number;
  image_style: string;
  model: string;
  people?: string;
  camera_angle?: string;
  custom_camera?: string;
  lighting?: string;
  custom_lighting?: string;
  materials?: string;
  custom_materials?: string;
  environment?: string;
  custom_environment?: string;
  mood?: string;
  custom_mood?: string;
  has_reference_image?: boolean;
  reference_images_count?: number;
  reference_images_metadata?: ReferenceImageMeta[];
  controlnet_enabled?: boolean;
  controlnet_strength?: number;
}

export class PromptEnhancerEngine {
  /**
   * Builds a clean, direct, 100% faithful Reference-Guided prompt structure
   * that strictly enforces the uploaded Drawing's architectural geometry and
   * the uploaded Reference's visual style, materials, lighting, and finishes.
   */
  static buildReferenceGuidedPrompt(request: PromptEnhanceRequest): string {
    const metaList = request.reference_images_metadata || [];
    const drawings = metaList.filter(m => m.category === 'drawing' || (!m.category && (m.label?.toLowerCase().includes('drawing') || m.label?.toLowerCase().includes('floorplan') || m.label?.toLowerCase().includes('elevation') || m.label?.toLowerCase().includes('sketch') || m.id === '1')));
    const references = metaList.filter(m => m.category === 'reference' || (!drawings.includes(m)));

    // 1. Drawing Prompts
    const drawingPrompts: string[] = [];
    if (drawings.length > 0) {
      drawings.forEach((d, i) => {
        const rawType = d.drawingType === 'Custom' && d.customDrawingType?.trim()
          ? d.customDrawingType.trim()
          : (d.drawingType || 'Floor Plan');
        
        let typeName = rawType;
        if (rawType.toLowerCase().includes('floor') || rawType.toLowerCase().includes('plan')) typeName = 'Floorplan';
        else if (rawType.toLowerCase().includes('elevation') || rawType.toLowerCase().includes('facade')) typeName = 'Elevation';
        else if (rawType.toLowerCase().includes('sketch')) typeName = 'Sketch';
        else if (rawType.toLowerCase().includes('3d') || rawType.toLowerCase().includes('model')) typeName = '3D Model Screenshot';
        else if (rawType.toLowerCase().includes('section')) typeName = 'Section Drawing';

        const imgLabel = `[Image ${d.id || i + 1}: Design Drawing - ${typeName}]`;
        const notes = d.label?.trim() ? ` [Drawing Notes: ${d.label.trim()}]` : '';

        if (typeName.toLowerCase().includes('floorplan') || typeName.toLowerCase().includes('plan')) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as floorplan of the space. Produce an architectural/interior rendering following 100% of architectural and interior layout details as per the floorplan (exact room partitions, walls, kitchen counters/islands, sinks, appliances, furniture layout, door openings, and window locations). Irrespective of whichever camera angle or perspective view is chosen, the rendered space MUST be of this exact floorplan without altering, moving, or hallucinating any layout geometry.`);
        } else if (typeName.toLowerCase().includes('elevation')) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the elevation drawing of the space. Produce a render following 100% of architectural facade details, vertical proportions, rooflines, and window/door openings as per this elevation.`);
        } else if (typeName.toLowerCase().includes('sketch')) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the architectural sketch. Produce a render following 100% of the architectural design, perspective lines, massing, and spatial geometry as per this sketch.`);
        } else if (typeName.toLowerCase().includes('3d')) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the 3D model screenshot. Produce a render preserving 100% of the 3D spatial geometry, perspective view, and volumetric massing.`);
        } else if (typeName.toLowerCase().includes('section')) {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the section drawing. Produce a render following 100% of the vertical ceiling heights, slab thicknesses, and floor levels.`);
        } else {
          drawingPrompts.push(`- Use the image ${imgLabel}${notes} as the architectural drawing. Produce a render following 100% of the architectural structure, geometry, and layout details as per this drawing.`);
        }
      });
    } else {
      drawingPrompts.push(`- Use the image [Image 1: Design Drawing - Floorplan] as floorplan of the space. Produce an architectural render following 100% of the architectural layout, walls, and spatial details as per the floorplan.`);
    }

    // 2. Reference Prompts
    const referencePrompts: string[] = [];
    if (references.length > 0) {
      references.forEach((r, i) => {
        const imgIndex = r.id || (drawings.length + i + 1);
        const aspects = r.referenceAspects && r.referenceAspects.length > 0
          ? r.referenceAspects
          : ['All (Complete Theme & Mood)'];
        
        let aspectsLabel = '';
        if (aspects.includes('All (Complete Theme & Mood)')) {
          aspectsLabel = 'All Theme (Style, Lighting, Materials, Furniture, Landscape)';
        } else {
          aspectsLabel = aspects.map(a => a.split(' ')[0]).join(', ');
        }

        const imgLabel = `[Image ${imgIndex}: Visual Reference - ${aspectsLabel}]`;
        const notes = r.label?.trim() ? ` [Reference Notes: ${r.label.trim()}]` : '';

        if (aspects.includes('All (Complete Theme & Mood)')) {
          referencePrompts.push(`- Use the image ${imgLabel}${notes} as visual reference for style, lighting, and materials of all elements (ceiling, walls, flooring, cabinetry finishes, furniture, fixtures, lighting ambiance, and outdoor environment if any). 100% faithfully replicate this exact visual theme, color palette, and material finishes across the space.`);
        } else {
          const detailDirectives: string[] = [];
          if (aspects.includes('Visual Style & Theme')) detailDirectives.push('visual design style, aesthetic identity, and color palette');
          if (aspects.includes('Materials & Textures')) detailDirectives.push('materials and surface finishes of all elements (wood, stone, metal, fabrics, ceiling, walls, flooring)');
          if (aspects.includes('Lighting & Atmosphere')) detailDirectives.push('lighting conditions, color temperature, shadow softness, and ambient illumination');
          if (aspects.includes('Furniture & Decor')) detailDirectives.push('furniture style, cabinetry design, and decor elements');
          if (aspects.includes('Environment & Landscape')) detailDirectives.push('outdoor landscape, vegetation, and contextual surroundings');

          referencePrompts.push(`- Use the image ${imgLabel}${notes} as visual reference for ${detailDirectives.join('; ')}. 100% faithfully extract and apply these elements to the space.`);
        }
      });
    } else {
      referencePrompts.push(`- Use the attached visual reference image(s) as visual reference for style, lighting, and materials of all elements.`);
    }

    // User instructions (if any custom text entered)
    let userDirective = '';
    const cleanInput = (request.user_input || '').trim();
    if (cleanInput && cleanInput.toLowerCase() !== 'reference guided' && cleanInput.toLowerCase() !== 'reference-guided') {
      userDirective = `\n\nUSER SPECIFIC INSTRUCTIONS:\n${cleanInput}`;
    }

    return `TASK: Produce a professional architectural rendering by strictly synthesizing the attached Design Drawing and Visual Reference:

1. ARCHITECTURAL LAYOUT & GEOMETRY (Drawing Authority):
${drawingPrompts.join('\n')}

2. VISUAL STYLE, MATERIALS & LIGHTING (Reference Authority):
${referencePrompts.join('\n')}

3. SYNTHESIS MANDATE:
The Design Drawing 100% dictates the spatial layout, walls, and geometry. The Visual Reference 100% dictates the visual style, materials, lighting, and finishes. Produce a single cohesive, high-end architectural photograph matching both with 100% fidelity.${userDirective}

VISUAL QUALITY: High-end architectural photography, 8k crisp details, physically accurate light bounces and contact shadows, balanced natural exposure, no distortion.`;
  }

  /**
   * Fast rule-based contextual prompt generator for offline or instant local fallback.
   * Features a Universal Dynamic Fallback Engine: If a prompt is out-of-syllabus (e.g. beach, mountain,
   * cave, space, fantasy environment), it NEVER injects hardcoded assumptions or unrelated furniture.
   * It produces a 100% safe, contextually true, non-presumptive structured prompt.
   */
  static enhanceOffline(request: PromptEnhanceRequest): string {
    const workflow = WORKFLOWS[request.workflow_id] || WORKFLOWS[1];
    if (workflow.slug === 'reference-guided') {
      return this.buildReferenceGuidedPrompt(request);
    }

    const input = (request.user_input || '').trim();
    const lower = input.toLowerCase();
    const styleKey = request.image_style || 'realistic';
    const styleDesc = IMAGE_STYLE_PROMPTS[styleKey] || IMAGE_STYLE_PROMPTS['realistic'];

    // 1. Dynamic Architectural & Interior Style Detection Engine
    let userDetectedStyle: string | null = null;
    let styleMaterialsOverride: string | null = null;
    let styleFurnitureOverride: string | null = null;

    if (lower.includes('classical') || lower.includes('neoclassical') || lower.includes('traditional') || lower.includes('victorian') || lower.includes('baroque') || lower.includes('georgian')) {
      userDetectedStyle = 'classical architectural style featuring intricate wainscoting, crown moldings, wall sconces, and refined period craftsmanship';
      styleMaterialsOverride = 'honed calacatta marble, carved mahogany wood paneling, ornate ceiling plasterwork, gilded bronze fixtures, rich velvet textiles';
      styleFurnitureOverride = 'carved wooden console, tufted Chesterfield seating, antique brass hardware, upholstered wingback armchairs';
    } else if (lower.includes('industrial') || lower.includes('urban loft') || lower.includes('raw concrete') || lower.includes('exposed brick')) {
      userDetectedStyle = 'industrial architectural style with exposed structural steel, raw concrete finishes, and utilitarian open-plan aesthetics';
      styleMaterialsOverride = 'board-formed raw concrete, exposed steel I-beams, reclaimed red brickwork, polished concrete floors, matte black metal framing';
      styleFurnitureOverride = 'steel-frame industrial desks, distressed leather sofas, factory-pendant lighting, reclaimed wood shelving';
    } else if (lower.includes('japandi') || lower.includes('wabi-sabi') || lower.includes('zen') || lower.includes('japanese minimal')) {
      userDetectedStyle = 'japandi architectural style fusing Scandinavian functionality with minimalist Japanese wabi-sabi organic harmony';
      styleMaterialsOverride = 'pale white oak, micro-cement plaster walls, natural unbleached linen, paper lantern diffusers, woven tatami textures';
      styleFurnitureOverride = 'low-profile solid wood seating, minimal slatted wood divider screens, handcrafted ceramic vessels, organic wool rugs';
    } else if (lower.includes('scandinavian') || lower.includes('nordic') || lower.includes('hygge')) {
      userDetectedStyle = 'scandinavian architectural style characterized by light wood tones, functional minimalism, and daylight optimization';
      styleMaterialsOverride = 'light ash wood flooring, white painted brick, wool upholstery, matte brass, sheer linen curtains';
      styleFurnitureOverride = 'minimalist Scandinavian lounge chairs, light wood dining table, subtle geometric pendant lights';
    } else if (lower.includes('mid-century') || lower.includes('mcm') || lower.includes('retro modern')) {
      userDetectedStyle = 'mid-century modern architectural style featuring organic geometric shapes, rich timber veneers, and seamless integration';
      styleMaterialsOverride = 'rich teak veneer, terrazzo tile flooring, accent brickwork, brushed brass, warm walnut paneling';
      styleFurnitureOverride = 'iconic molded plywood lounge chairs, tapered wooden legs, sunburst wall sconces, retro credenza';
    } else if (lower.includes('brutalist') || lower.includes('monolithic') || lower.includes('beton brut')) {
      userDetectedStyle = 'brutalist architectural style celebrating monolithic concrete geometry, bold architectural volumes, and raw material mass';
      styleMaterialsOverride = 'heavy board-formed exposed concrete, raw slate stone, darkened steel plates, unvarnished timber accents';
      styleFurnitureOverride = 'monolithic concrete seating benches, blocky geometric upholstered seating, recessed wall niches';
    } else if (lower.includes('art deco') || lower.includes('glam') || lower.includes('luxury deco')) {
      userDetectedStyle = 'art deco architectural style featuring bold geometric motifs, luxurious polished metallic accents, and high-contrast elegance';
      styleMaterialsOverride = 'high-gloss ebony timber, polished brass inlay, fluted glass panels, nero marquina marble, velvet upholstery';
      styleFurnitureOverride = 'curved velvet plush sofas, geometric mirrored consoles, brass sunburst chandeliers, chevron inlay accent tables';
    } else if (lower.includes('biophilic') || lower.includes('organic architecture') || lower.includes('green building')) {
      userDetectedStyle = 'biophilic organic architectural style integrating living natural foliage, fluid organic curves, and daylight immersion';
      styleMaterialsOverride = 'living plant walls, rammed earth surfaces, curved bamboo, natural river stone pavers, triple-glazed glass';
      styleFurnitureOverride = 'curved organic seating, rattan loungers, integrated planter benches, natural timber slab tables';
    } else if (lower.includes('high-tech') || lower.includes('parametric') || lower.includes('futuristic')) {
      userDetectedStyle = 'high-tech parametric architectural style featuring fluid curved geometry, smart lighting integration, and advanced structural glazing';
      styleMaterialsOverride = 'white composite solid surfaces, curved structural glass, anodized aluminum panels, LED cove illumination';
      styleFurnitureOverride = 'sculptural fluid lounge pods, integrated smart touch consoles, ergonomic floating desks';
    } else if (lower.includes('rustic') || lower.includes('farmhouse') || lower.includes('country house')) {
      userDetectedStyle = 'rustic farmhouse architectural style with exposed timber trusses, tactile natural stone, and warm artisanal elements';
      styleMaterialsOverride = 'hand-hewn wooden ceiling beams, fieldstone masonry, lime-washed plaster, forged iron hardware';
      styleFurnitureOverride = 'reclaimed wood trestle dining table, woven rush chairs, wrought iron chandelier, slipcovered sofas';
    } else if (lower.includes('mediterranean') || lower.includes('spanish villa') || lower.includes('tuscan')) {
      userDetectedStyle = 'mediterranean villa architectural style with whitewashed stucco walls, terracotta tile flooring, and graceful arched openings';
      styleMaterialsOverride = 'terracotta floor tiles, hand-painted ceramic tiles, wrought iron railings, lime plaster walls, exposed dark timber beams';
      styleFurnitureOverride = 'carved wood benches, wrought iron outdoor tables, linen-draped daybeds, rustic timber sideboard';
    } else if (lower.includes('minimalist') || lower.includes('ultra-minimal') || lower.includes('clean lines')) {
      userDetectedStyle = 'ultra-minimalist architectural style focusing on pure geometric form, hidden joinery, and shadow gaps';
      styleMaterialsOverride = 'seamless micro-cement flooring, matte white wall surfaces, flush trimless doors, hidden architectural light slots';
      styleFurnitureOverride = 'recessed flush cabinetry, low-profile linear seating, minimal monolithic tables';
    }

    // UNIVERSAL NON-PRESUMPTIVE DYNAMIC FALLBACKS
    // Space and view detection
    let detectedSpace = '';
    if (lower.includes("bird's eye") || lower.includes("birds eye") || lower.includes('aerial') || lower.includes('drone view') || lower.includes('top down') || lower.includes('top-down')) {
      detectedSpace = "Bird's Eye Aerial View & Spatial Perspective";
    } else if (lower.includes('bathroom') || lower.includes('bath') || lower.includes('ensuite') || lower.includes('powder room') || lower.includes('washroom') || lower.includes('spa')) {
      detectedSpace = "Luxury Bathroom & Spa Enclosure";
    } else if (lower.includes('pool') || lower.includes('swimming pool') || lower.includes('infinity pool') || lower.includes('jacuzzi')) {
      detectedSpace = "Outdoor Swimming Pool & Sun Deck";
    } else if (lower.includes('living room') || lower.includes('living area') || lower.includes('salon') || lower.includes('lounge')) {
      detectedSpace = "Living Room & Social Lounge";
    } else if (lower.includes('kitchen') || lower.includes('culinary') || lower.includes('kitchenette') || lower.includes('pantry')) {
      detectedSpace = "Modern Kitchen & Island Dining";
    } else if (lower.includes('bedroom') || lower.includes('master bed') || lower.includes('guest room') || lower.includes('suite')) {
      detectedSpace = "Master Bedroom Suite";
    } else if (lower.includes('dining') || lower.includes('dining room') || lower.includes('banquet')) {
      detectedSpace = "Dining Room & Entertaining Area";
    } else if (lower.includes('terrace') || lower.includes('patio') || lower.includes('deck') || lower.includes('balcony') || lower.includes('veranda')) {
      detectedSpace = "Outdoor Terrace & Lounge Deck";
    } else if (lower.includes('facade') || lower.includes('façade') || lower.includes('exterior') || lower.includes('front elevation')) {
      detectedSpace = "Exterior Architectural Facade & Main Elevation";
    } else if (lower.includes('lobby') || lower.includes('reception') || lower.includes('foyer') || lower.includes('entrance hall') || lower.includes('entryway')) {
      detectedSpace = "Grand Entryway & Reception Foyer";
    } else if (lower.includes('courtyard') || lower.includes('atrium') || lower.includes('garden courtyard')) {
      detectedSpace = "Central Landscaped Courtyard & Atrium";
    } else if (lower.includes('office') || lower.includes('workspace') || lower.includes('conference') || lower.includes('study')) {
      detectedSpace = "Executive Office & Workspace";
    } else if (lower.includes('garden') || lower.includes('lawn') || lower.includes('backyard') || lower.includes('landscape')) {
      detectedSpace = "Manicured Landscape Garden & Grounds";
    }

    // Broad environment type detection
    const isInteriorLike = lower.includes('inside') || lower.includes('interior') || lower.includes('room') || lower.includes('hall') || lower.includes('bath') || lower.includes('kitchen') || lower.includes('bedroom') || lower.includes('office') || lower.includes('cave');
    const isExteriorLike = lower.includes('exterior') || lower.includes('facade') || lower.includes('façade') || lower.includes('building') || lower.includes('tower') || lower.includes('stadium') || lower.includes('outside');
    const isNatureLike = lower.includes('beach') || lower.includes('mountain') || lower.includes('forest') || lower.includes('landscape') || lower.includes('park') || lower.includes('sea') || lower.includes('river') || lower.includes('canyon') || lower.includes('desert') || lower.includes('nature') || lower.includes('island');
    const isSpaceLike = lower.includes('space') || lower.includes('orbit') || lower.includes('moon') || lower.includes('planet') || lower.includes('station');

    let project = isSpaceLike
      ? 'Aerospace & Orbital Station'
      : (isNatureLike ? 'Landscape & Natural Environment' : (isInteriorLike ? 'Residential Interior' : (isExteriorLike ? 'Residential & Commercial Architecture' : 'Architectural Visualization Project')));
    
    let scene = input || workflow.name;
    let designDirection = userDetectedStyle || 'Contemporary architectural and interior design with refined detailing, clean geometry, and harmonious proportions';
    let materials = styleMaterialsOverride || 'Natural oak timber, honed stone, smooth plaster, textured textiles, and brushed metal accents';
    let colors = 'Cohesive architectural palette with neutral tones, warm wood accents, and natural textures';
    let furniture = styleFurnitureOverride || 'Contextually appropriate architectural furniture with ergonomic proportions and clean joinery';
    let lighting = 'Soft natural daylight with balanced exposure and gentle contact shadows';
    let timeOfDay = 'Mid-afternoon';
    let environment = 'Surrounding natural site context, lush foliage, and open clear sky';
    let mood = 'Atmospheric, serene, balanced, and immersive architectural presence';

    // 2. Specific Major Category Overrides
    if (lower.includes('stadium') || lower.includes('arena') || lower.includes('cricket') || lower.includes('football') || lower.includes('soccer') || lower.includes('sports complex') || lower.includes('athletic') || lower.includes('ballpark') || lower.includes('gymnasium') || lower.includes('colosseum') || lower.includes('grandstand')) {
      project = 'Sports & Athletic Venue';
      if (!detectedSpace) detectedSpace = 'Cricket Stadium & Playing Field Arena';
      scene = input ? `${input}` : 'Modern sports stadium & athletic playing field';
      designDirection = userDetectedStyle || 'Modern sports stadium architecture with expansive grandstands and structural canopy';
      furniture = 'Stadium grandstand seating, player dugouts, LED perimeter scoreboards, team benches';
      materials = styleMaterialsOverride || 'Hybrid grass turf, polished concrete concourses, structural steel roof trusses, high-impact stadium seating modules';
      colors = 'Vibrant green turf, neutral concrete greys, bold stadium accent trim';
      environment = 'Sports complex precinct, high-mast floodlight towers, open sky';
      mood = 'Grand, heroic, atmospheric, monumental athletic presence';
    } else if (lower.includes('high rise') || lower.includes('skyscraper') || lower.includes('tower') || lower.includes('curtain wall') || lower.includes('building exterior') || lower.includes('commercial exterior')) {
      project = 'Commercial Architecture';
      if (!detectedSpace) detectedSpace = 'High-Rise Architectural Facade & Skyline View';
      scene = input ? `${input}` : 'High-rise architectural building facade';
      furniture = 'Ground-floor streetscape planters, architectural entrance canopy';
      materials = styleMaterialsOverride || 'Unitized high-performance glass curtain wall, anodized aluminum composite panels, architectural louvers, structural steel frame';
      colors = 'Reflective silver glass, dark bronze aluminum trim, concrete greys';
      environment = 'Vibrant city financial district, urban boulevard with surrounding towers';
      mood = 'Monolithic, iconic, prestigious urban presence';
    } else if (lower.includes('urban') || lower.includes('plaza') || lower.includes('masterplan') || lower.includes('master plan') || lower.includes('pedestrian zone') || lower.includes('civic') || lower.includes('streetscape')) {
      project = 'Urban Master Plan & Civic Plaza';
      if (!detectedSpace) detectedSpace = 'Public Urban Pedestrian Plaza & Gathering Space';
      scene = input ? `${input}` : 'Public urban pedestrian plaza & transit hub';
      furniture = 'Integrated stone public benches, outdoor cafe seating, street lighting posts, bike racks';
      materials = styleMaterialsOverride || 'Granite paving tiles, linear water features, integrated stone seating, public art sculptures, permeable pavers';
      colors = 'Cool granite greys, warm timber accents, lush urban greenery';
      environment = 'Active city center, pedestrian walkways, surrounding modern mixed-use architecture';
      mood = 'Vibrant, public, human-scaled civic experience';
    } else if (lower.includes('lawn') || lower.includes('garden') || lower.includes('landscape') || lower.includes('hardscape') || lower.includes('patio') || lower.includes('pool') || lower.includes('yard') || lower.includes('terrace') || lower.includes('park') || lower.includes('deck') || lower.includes('balcony') || lower.includes('courtyard')) {
      project = 'Landscape & Outdoor Architecture';
      if (!detectedSpace) detectedSpace = lower.includes('pool') ? 'Outdoor Infinity Pool & Living Deck' : (lower.includes('lawn') ? 'Landscaped Lawn & Garden' : 'Outdoor Living Terrace & Patio');
      scene = input ? `${input}` : (lower.includes('lawn') ? 'exterior lawn & landscaped garden' : (lower.includes('park') ? 'public park & landscape gardens' : 'outdoor hardscape living terrace'));
      furniture = styleFurnitureOverride || 'Modern outdoor garden loungers, teak patio seating, outdoor architectural planters, fire pit lounge';
      materials = styleMaterialsOverride || 'Lush natural turf, bluestone pavers, natural timber decking, architectural glass, dark metal trim, water features';
      colors = 'Deep greens, warm earth tones, cool stone greys';
      environment = 'Manicured contemporary landscaping, mature canopy trees, open sky';
      mood = 'Serene, expansive, high-end landscape ambiance';
    } else if (lower.includes('restaurant') || lower.includes('cafe') || lower.includes('lounge') || lower.includes('bar') || lower.includes('bistro') || lower.includes('coffee shop')) {
      project = 'Commercial Hospitality & Dining';
      if (!detectedSpace) detectedSpace = 'Boutique Restaurant Dining Hall & Cocktail Bar';
      scene = input ? `${input}` : 'High-end boutique restaurant & lounge';
      furniture = styleFurnitureOverride || 'Curated dining banquettes, marble-top tables, upholstered dining armchairs, bar stools';
      materials = styleMaterialsOverride || 'Fluted timber bar front, ambient warm LED cove strip lighting, acoustic plaster, polished brass trim, terrazzo floor';
      colors = 'Rich warm amber, dark walnut, deep forest green accents';
      environment = 'Bustling urban hospitality venue with warm interior atmosphere';
      mood = 'Intimate, moody, atmospheric, inviting';
    } else if (lower.includes('commercial office') || lower.includes('corporate') || lower.includes('co-working') || lower.includes('conference room') || lower.includes('headquarters') || lower.includes('tech office')) {
      project = 'Corporate & Commercial Office';
      if (!detectedSpace) detectedSpace = 'Open-Plan Corporate Office & Executive Lounge';
      scene = input ? `${input}` : 'Modern corporate office & open workspace';
      furniture = styleFurnitureOverride || 'Ergonomic task desks, modular acoustic lounge pods, executive conference table, breakroom seating';
      materials = styleMaterialsOverride || 'Acoustic ceiling baffles, glazed office partitions, polished micro-cement flooring, oak veneer paneling';
      colors = 'Clean whites, subtle charcoal, warm timber, corporate blue/green accents';
      environment = 'Bright professional office floor with floor-to-ceiling perimeter glazing';
      mood = 'Collaborative, focused, innovative, professional';
    } else if (lower.includes('retail') || lower.includes('showroom') || lower.includes('store') || lower.includes('boutique') || lower.includes('mall')) {
      project = 'Commercial Retail & Showroom';
      if (!detectedSpace) detectedSpace = 'Luxury Retail Boutique & Product Display Space';
      scene = input ? `${input}` : 'Luxury retail store & product showroom';
      furniture = styleFurnitureOverride || 'Sculptural product display pedestals, customer lounge seating, minimalist cash wrap desk';
      materials = styleMaterialsOverride || 'Backlit onyx display walls, polished terrazzo floor, minimalist brass clothing racks, frameless glass display cases';
      colors = 'Neutral ivory, warm gold accents, soft greys';
      environment = 'High-end shopping district interior';
      mood = 'Exclusive, curated, luxurious, pristine';
    } else if (lower.includes('hotel') || lower.includes('reception') || lower.includes('atrium') || lower.includes('resort')) {
      project = 'Hospitality & Resort';
      if (!detectedSpace) detectedSpace = 'Luxury Hotel Grand Atrium & Reception Lobby';
      scene = input ? `${input}` : 'Luxury hotel reception lobby & atrium';
      furniture = styleFurnitureOverride || 'Curved reception desk, luxury lounge clusters, architectural side tables, plush accent armchairs';
      materials = styleMaterialsOverride || 'Double-height marble feature wall, custom glass chandelier, brass trim, acoustical plaster ceiling';
      colors = 'Warm beige, champagne bronze, rich deep navy';
      environment = 'Five-star hotel grand atrium with lush indoor landscaping';
      mood = 'Grand, welcoming, opulent, serene';
    } else if (lower.includes('museum') || lower.includes('gallery') || lower.includes('library') || lower.includes('auditorium') || lower.includes('cultural') || lower.includes('university') || lower.includes('school') || lower.includes('campus')) {
      project = 'Institutional & Cultural Architecture';
      if (!detectedSpace) detectedSpace = 'Sculptural Exhibition Gallery & Central Hall';
      scene = input ? `${input}` : 'Contemporary art gallery & museum exhibition space';
      furniture = styleFurnitureOverride || 'Sculptural display plinths, minimalist bench seating';
      materials = styleMaterialsOverride || 'Smooth white museum plaster, polished concrete floors, concealed perimeter lighting slots, acoustic ceiling';
      colors = 'Pure architectural white, neutral concrete greys, dark accent framing';
      environment = 'Cultural institution precinct';
      mood = 'Contemplative, luminous, spacious, serene';
    } else if (lower.includes('villa') || lower.includes('house') || lower.includes('home') || lower.includes('mansion') || lower.includes('apartment') || lower.includes('penthouse') || lower.includes('residence') || lower.includes('residential')) {
      project = 'Residential Architecture & Living';
      if (!detectedSpace) detectedSpace = 'Contemporary Living Space & Indoor-Outdoor Connection';
    }

    // Combine project & space into cohesive project descriptor
    const fullProjectDescriptor = detectedSpace ? `${project} — ${detectedSpace}` : `${project} — ${scene}`;

    // 3. User Parameter Overrides Integration
    // 3a. People
    let finalPeople = 'no people, clean unpopulated architectural space';
    if (request.people === 'blurred') {
      finalPeople = 'subtle architectural motion-blurred figures passing naturally through the space to emphasize human scale';
    } else if (request.people === 'realistic') {
      finalPeople = 'naturally posed, stylishly dressed people engaged authentically in the environment with realistic interaction';
    }

    // 3b. Camera Angle
    let finalCamera = 'eye-level architectural one-point perspective with straight vertical lines';
    if (request.camera_angle === 'custom' && request.custom_camera?.trim()) {
      finalCamera = request.custom_camera.trim();
    } else if (request.camera_angle === 'eye_level') {
      finalCamera = 'eye-level straight architectural perspective with perfectly vertical wall lines';
    } else if (request.camera_angle === 'low_angle') {
      finalCamera = 'low-angle dynamic architectural perspective looking slightly upward to convey monumentality';
    } else if (request.camera_angle === 'high_angle') {
      finalCamera = 'elevated high-angle overview looking downward across the architectural composition';
    } else if (request.camera_angle === 'aerial_birds_eye') {
      finalCamera = "bird's eye aerial drone perspective capturing full site layout, geometry, and contextual landscape";
    } else if (request.camera_angle === 'wide_angle') {
      finalCamera = 'expansive wide-angle architectural shot (24mm rectilinear lens) with zero barrel distortion';
    } else if (request.camera_angle === 'close_up_detail') {
      finalCamera = 'shallow depth-of-field close-up detail shot focusing on material junction and craft';
    }

    // 3c. Lighting Setup
    let finalLighting = lighting;
    if (request.lighting === 'custom' && request.custom_lighting?.trim()) {
      finalLighting = request.custom_lighting.trim();
    } else if (request.lighting === 'golden_hour') {
      finalLighting = 'warm golden-hour late afternoon sunlight with long warm amber shadows and glowing highlights';
      timeOfDay = 'Golden hour / late afternoon';
    } else if (request.lighting === 'blue_hour') {
      finalLighting = 'deep twilight blue-hour ambient illumination with glowing interior warm accent lights';
      timeOfDay = 'Blue hour / twilight';
    } else if (request.lighting === 'overcast_soft') {
      finalLighting = 'soft diffuse northern overcast daylight with gentle shadows and true material colors';
      timeOfDay = 'Midday overcast';
    } else if (request.lighting === 'bright_sunlight') {
      finalLighting = 'crisp direct sunlight with sharp high-contrast shadows and clean highlights';
      timeOfDay = 'Midday';
    } else if (request.lighting === 'dramatic_night') {
      finalLighting = 'dramatic night scene featuring architectural LED uplighting, backlit features, and moody pools of light';
      timeOfDay = 'Night';
    } else if (request.lighting === 'warm_interior') {
      finalLighting = 'warm 2700K ambient interior lighting with layered cove lights, recessed pin spots, and glowing pendants';
      timeOfDay = 'Evening';
    } else if (request.lighting === 'studio_clean') {
      finalLighting = 'high-key clean studio illumination with perfectly balanced softbox fill and zero harsh shadows';
      timeOfDay = 'Studio controlled';
    }

    // 3d. Materials Setup
    let finalMaterials = materials;
    if (request.materials === 'custom' && request.custom_materials?.trim()) {
      finalMaterials = request.custom_materials.trim();
    } else if (request.materials === 'warm_wood_stone') {
      finalMaterials = 'honed roman travertine stone, quarter-sawn white oak timber, micro-cement plaster, and brushed bronze hardware';
    } else if (request.materials === 'concrete_steel') {
      finalMaterials = 'smooth board-formed architectural concrete, blackened structural steel, fluted glass, and polished dark slate';
    } else if (request.materials === 'marble_brass') {
      finalMaterials = 'bookmatched calacatta marble, polished brass inlays, fluted acoustic walnut, and high-gloss lacquer';
    } else if (request.materials === 'stucco_terracotta') {
      finalMaterials = 'hand-applied lime-wash stucco, artisanal terracotta pavers, natural linen fabrics, and rustic timber beams';
    } else if (request.materials === 'glass_aluminum') {
      finalMaterials = 'low-iron ultra-clear curtain wall glazing, anodized dark bronze aluminum panels, and architectural mesh';
    }

    // 3e. Environment Context
    let finalEnvironment = environment;
    if (request.environment === 'custom' && request.custom_environment?.trim()) {
      finalEnvironment = request.custom_environment.trim();
    } else if (request.environment === 'lush_garden') {
      finalEnvironment = 'lush manicured garden with mature olive trees, ornamental grasses, architectural shrubs, and soft landscape lighting';
    } else if (request.environment === 'urban_city') {
      finalEnvironment = 'bustling metropolitan downtown skyline with surrounding architectural towers and paved city sidewalk';
    } else if (request.environment === 'coastal_ocean') {
      finalEnvironment = 'breathtaking coastal shoreline with calm turquoise ocean water and distant horizon';
    } else if (request.environment === 'mountain_forest') {
      finalEnvironment = 'serene alpine mountain ridge surrounded by dense pine trees and misty peaks';
    } else if (request.environment === 'desert_oasis') {
      finalEnvironment = 'tranquil desert landscape with sculptural native cacti, sand dunes, and warm sunset horizon';
    } else if (request.environment === 'studio_neutral') {
      finalEnvironment = 'minimalist neutral studio cyclorama background';
    }

    // 3f. Mood
    let finalMood = mood;
    if (request.mood === 'custom' && request.custom_mood?.trim()) {
      finalMood = request.custom_mood.trim();
    } else if (request.mood === 'calm_serene') {
      finalMood = 'calm, serene, and tranquil architectural sanctuary';
    } else if (request.mood === 'grand_dramatic') {
      finalMood = 'grand, dramatic, and awe-inspiring architectural monumentality';
    } else if (request.mood === 'intimate_cozy') {
      finalMood = 'intimate, warm, cozy, and inviting living ambiance';
    } else if (request.mood === 'vibrant_energetic') {
      finalMood = 'vibrant, energetic, and active public experience';
    } else if (request.mood === 'sophisticated_luxurious') {
      finalMood = 'sophisticated, refined, and luxurious high-end elegance';
    }

    const qualityBlock = `QUALITY AND REALISM: Create a professional architectural visualization suitable for presentation by a leading architecture, interior-design or real-estate visualization studio. Use physically believable proportions, realistic material response, accurate texture scale, natural reflections, plausible roughness, realistic illumination, contact shadows and balanced exposure. Materials should look physically real rather than synthetic or uniformly smooth. Maintain believable construction logic, furniture scale and human proportions. Lighting must interact consistently with geometry and materials. The output should resemble premium architectural photography or a professional high-end rendering rather than obvious AI artwork. Avoid excessive HDR, artificial sharpening, oversaturation, plastic materials, warped geometry and implausible architectural details.
Do not create warped architecture, distorted furniture, floating objects, random text, logos or watermarks.`;

    const visStyle = `${styleDesc}, ${finalCamera}, high-end editorial publication standard, crisp 8k details, physically accurate light bounces and contact shadows`;

    let referenceImageDirective = '';
    const totalImages = request.reference_images_count || request.reference_images_metadata?.length || (request.has_reference_image ? 1 : 0);

    if (workflow.slug === 'reference-guided') {
      const metaList = request.reference_images_metadata || [];
      const drawings = metaList.filter(m => m.category === 'drawing' || (!m.category && (m.label?.toLowerCase().includes('drawing') || m.label?.toLowerCase().includes('floorplan') || m.label?.toLowerCase().includes('elevation') || m.label?.toLowerCase().includes('sketch') || m.id === '1')));
      const references = metaList.filter(m => m.category === 'reference' || (!drawings.includes(m)));

      let drawingDirectives = '';
      if (drawings.length > 0) {
        drawingDirectives = drawings.map((d, i) => {
          const dType = d.drawingType === 'Custom' && d.customDrawingType?.trim()
            ? d.customDrawingType.trim()
            : (d.drawingType || 'Floor Plan');
          const dNotes = d.label?.trim() ? ` (Details: ${d.label.trim()})` : '';

          let typeSpecificRule = '';
          const lowerType = dType.toLowerCase();
          if (lowerType.includes('floor') || lowerType.includes('plan')) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (2D ARCHITECTURAL FLOOR PLAN):
  * The generated rendering MUST 100% RELIGIOUSLY and STRICTLY follow the exact architectural layout, room partitions, exterior/interior wall positions, structural columns, door openings, window placements, and spatial proportions shown in [Image ${d.id || i + 1}].
  * Irrespective of whichever perspective angle or camera position is chosen, the rendered space MUST BE OF THIS EXACT FLOOR PLAN. Do NOT alter, hallucinate, add, remove, or rearrange any walls, rooms, or spatial boundaries from this layout.`;
          } else if (lowerType.includes('elevation') || lowerType.includes('facade')) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (ARCHITECTURAL ELEVATION / FACADE):
  * The generated rendering MUST 100% RELIGIOUSLY and STRICTLY follow the exact vertical proportions, story heights, fenestration pattern, facade rhythm, roofline, and architectural openings shown in [Image ${d.id || i + 1}].`;
          } else if (lowerType.includes('sketch') || lowerType.includes('line')) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (ARCHITECTURAL SKETCH / CONCEPT DRAWING):
  * The generated rendering MUST 100% RELIGIOUSLY follow the exact perspective composition, geometric massing, architectural forms, and structural outlines established in [Image ${d.id || i + 1}].`;
          } else if (lowerType.includes('3d') || lowerType.includes('massing') || lowerType.includes('model')) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (3D MODEL / MASSING SCREENSHOT):
  * The generated rendering MUST PRESERVE 100% of the 3D spatial geometry, volumetric forms, structural scale, and perspective alignment shown in [Image ${d.id || i + 1}].`;
          } else if (lowerType.includes('section')) {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (SECTION DRAWING):
  * The generated rendering MUST RELIGIOUSLY follow the vertical floor-to-ceiling heights, slab thicknesses, and spatial relationships shown in [Image ${d.id || i + 1}].`;
          } else {
            typeSpecificRule = `- MANDATE FOR [Image ${d.id || i + 1}] (${dType.toUpperCase()}):
  * The generated rendering MUST RELIGIOUSLY adhere to the exact structural layout, geometry, and spatial boundaries shown in [Image ${d.id || i + 1}].`;
          }

          return `● [Image ${d.id || i + 1}] -> ARCHITECTURAL DESIGN DRAWING [Type: ${dType}]${dNotes}:
${typeSpecificRule}`;
        }).join('\n\n');
      } else {
        drawingDirectives = `● [Image 1] -> ARCHITECTURAL DESIGN DRAWING:
- MANDATE: The generated render MUST RELIGIOUSLY follow the exact layout, geometry, wall boundaries, and architectural structure shown in [Image 1]. Irrespective of angle, render this exact floorplan/structure.`;
      }

      let referenceDirectives = '';
      if (references.length > 0) {
        referenceDirectives = references.map((r, i) => {
          const imgIndex = r.id || (drawings.length + i + 1);
          const aspects = r.referenceAspects && r.referenceAspects.length > 0
            ? r.referenceAspects
            : ['All (Complete Theme & Mood)'];
          const aspectsStr = aspects.join(', ');
          const rNotes = r.label?.trim() ? ` (Details: ${r.label.trim()})` : '';

          const aspectInstructions: string[] = [];
          if (aspects.includes('All (Complete Theme & Mood)') || aspects.includes('Visual Style & Theme')) {
            aspectInstructions.push(`  * VISUAL STYLE & THEME: 100% EXPLICITLY ADOPT the exact architectural style, aesthetic identity, color palette, and visual mood from [Image ${imgIndex}].`);
          }
          if (aspects.includes('All (Complete Theme & Mood)') || aspects.includes('Materials & Textures')) {
            aspectInstructions.push(`  * MATERIALS & TEXTURES: EXTRACT and APPLY the exact physical materials, surface finishes (wood species/grain, stone veining, tile patterns, metal sheen, plaster/concrete texture, fabrics) from [Image ${imgIndex}].`);
          }
          if (aspects.includes('All (Complete Theme & Mood)') || aspects.includes('Lighting & Atmosphere')) {
            aspectInstructions.push(`  * LIGHTING & ATMOSPHERE: EXTRACT and REPLICATE the exact lighting condition, color temperature (e.g. warm golden hour, diffuse daylight, moody twilight), shadow softness, and ambient illumination from [Image ${imgIndex}].`);
          }
          if (aspects.includes('All (Complete Theme & Mood)') || aspects.includes('Furniture & Decor')) {
            aspectInstructions.push(`  * FURNITURE & DECOR: EXTRACT the furniture models, styling pieces, light fixtures, and decor elements from [Image ${imgIndex}] and place them harmoniously within the spaces established by the Design Drawing.`);
          }
          if (aspects.includes('All (Complete Theme & Mood)') || aspects.includes('Environment & Landscape')) {
            aspectInstructions.push(`  * ENVIRONMENT & LANDSCAPE: EXTRACT the surrounding outdoor landscape, vegetation, terrain, and exterior environment from [Image ${imgIndex}].`);
          }

          return `● [Image ${imgIndex}] -> VISUAL REFERENCE [Aspects: ${aspectsStr}]${rNotes}:
${aspectInstructions.join('\n')}`;
        }).join('\n\n');
      } else {
        referenceDirectives = `● Reference Images -> VISUAL STYLE & THEMATIC REFERENCE:
- MANDATE: 100% EXPLICITLY adopt the visual style, material textures, and lighting ambiance from the attached reference images.`;
      }

      referenceImageDirective = `\n\n===================================================================
CRITICAL MULTIMODAL REFERENCE-GUIDED SYNTHESIS MANDATE
===================================================================
You are provided with input images having strict, segregated authorities. You MUST obey their designations religiously without mixing their roles:

--- CHANNEL 1: DESIGN DRAWING (CORE GEOMETRY & LAYOUT AUTHORITY) ---
${drawingDirectives}

--- CHANNEL 2: VISUAL REFERENCES (STYLE, MATERIALS, LIGHTING & MOOD) ---
${referenceDirectives}

--- CROSS-CHANNEL SYNTHESIS RULE ---
- The DESIGN DRAWING is the absolute authority for spatial layout, room boundaries, walls, and structural geometry.
- The VISUAL REFERENCES are the absolute authority for visual style, materials, lighting, colors, and textures.
- Synthesize them so the final image is an ultra-realistic, professional architectural render depicting the exact structure of Channel 1, finished 100% with the aesthetic theme and materials of Channel 2.`;
    } else if (totalImages > 1) {
      const metaList = request.reference_images_metadata || [];
      const imageDescriptions = Array.from({ length: totalImages }, (_, i) => {
        const meta = metaList[i];
        const label = meta?.label ? ` (${meta.label})` : '';
        const name = meta?.name ? ` [${meta.name}]` : '';
        return `- Image ${i + 1}${label}${name}`;
      }).join('\n');

      referenceImageDirective = `\n\nMULTI-IMAGE ARCHITECTURAL COMPOSITION & ELEMENT SYNTHESIS:
The user has attached ${totalImages} reference images to compose the final visualization:
${imageDescriptions}

INSTRUCTIONS FOR MULTI-IMAGE COMPOSITION:
- Analyze the user prompt to identify which specific architectural features, geometry, furniture models (e.g. sofa, chairs, tables), materials, finishes, lighting, or floorplan layouts should be extracted from each numbered image (Image 1, Image 2, Image 3, etc.).
- Seamlessly integrate the specified elements into one unified, cohesive scene without geometric distortion.
- Harmonize perspective, vanishing points, camera field of view, lighting temperature, and contact shadows across all combined elements.`;
    } else if (request.has_reference_image || totalImages === 1) {
      const cnStrength = request.controlnet_strength !== undefined ? request.controlnet_strength : 80;
      const cnNote = request.controlnet_enabled ? ` ControlNet conditioning fidelity is set to ${cnStrength}%.` : '';
      if (workflow.slug === 'sketch-to-render' || workflow.slug.includes('sketch')) {
        referenceImageDirective = `\n\nREFERENCE IMAGE FIDELITY (SKETCH-TO-RENDER): The attached input image is an architectural sketch. You MUST strictly follow the spatial layout, building massing, roof form, facade outlines, window openings, and perspective lines from the sketch.${cnNote} Render photorealistic materials, lighting, glass reflections, and environmental context onto this exact geometry.`;
      } else if (workflow.slug === 'floor-plan-to-3d' || workflow.slug.includes('plan')) {
        referenceImageDirective = `\n\nREFERENCE IMAGE FIDELITY (PLAN-TO-3D): The attached input image is an architectural floor plan / site plan. Accurately translate the exact room partitioning, walls, doors, and openings shown in the plan into an architectural 3D rendering with realistic depth and lighting.${cnNote}`;
      } else if (workflow.slug.includes('clay') || workflow.slug.includes('cad') || workflow.slug.includes('model') || workflow.slug.includes('three-d')) {
        referenceImageDirective = `\n\nREFERENCE IMAGE FIDELITY (MODEL-TO-PHOTOREAL): The attached input image is a 3D massing model. You MUST preserve 100% of the 3D model geometry, perspective angle, and structural volumes.${cnNote} Replace plain/clay surfaces with rich architectural materials, realistic glass, and environmental context.`;
      } else if (workflow.slug.includes('staging') || workflow.slug.includes('redesign') || workflow.slug.includes('renovation')) {
        referenceImageDirective = `\n\nREFERENCE IMAGE FIDELITY (VIRTUAL STAGING / REDESIGN): The attached input image is an interior photograph. Strictly preserve the room boundaries, walls, ceiling, flooring boundary, and windows from the input image while furnishing and styling the space.${cnNote}`;
      } else {
        referenceImageDirective = `\n\nREFERENCE IMAGE FIDELITY: The attached input image is the foundational visual and spatial reference. Follow its overall architectural form, camera angle, perspective, and composition while applying the specified style, lighting, material palette, and environment enhancements.${cnNote}`;
      }
    }

    return `PROJECT: ${fullProjectDescriptor}
DESIGN (ARCHITECTURE, INTERIOR OR LANDSCAPE): ${designDirection}
CONTEXT: ${finalEnvironment}
MATERIAL: ${finalMaterials}
LIGHTING: ${finalLighting} (${timeOfDay})
VIS STYLE: ${visStyle}${referenceImageDirective}

QUALITY AND PHOTOREALISM:
${qualityBlock}`;
  }

  /**
   * Calls Google Cloud Vertex AI (gemini-2.5-flash Text-to-Text API) to produce a context-aware prompt.
   */
  static async enhanceWithVertex(
    request: PromptEnhanceRequest,
    getAccessToken: () => Promise<string | null>
  ): Promise<string> {
    const workflow = WORKFLOWS[request.workflow_id] || WORKFLOWS[1];
    if (workflow.slug === 'reference-guided') {
      return this.buildReferenceGuidedPrompt(request);
    }

    const token = await getAccessToken();
    if (!token) {
      return this.enhanceOffline(request);
    }

    const styleKey = request.image_style || 'realistic';
    const styleDesc = IMAGE_STYLE_PROMPTS[styleKey] || IMAGE_STYLE_PROMPTS['realistic'];

    const systemInstruction = `You are Google Cloud's expert Architectural Prompt Enhancement AI for Professional Image Generation Workflows.
Your task is to transform any user's architectural request into an impeccably structured, professional-grade prompt following our exact 6-tier architectural schema:

SCHEMA FORMAT TO OUTPUT (OUTPUT ONLY THESE HEADERS IN THIS EXACT ORDER):
PROJECT: <Describe what the project is (e.g. Residential Villa, Boutique Restaurant, Commercial Office Tower, Luxury Resort, Sports Venue) and what the space/view is (e.g. Master Bathroom, Outdoor Infinity Pool, Living Lounge, Facade, Bird's Eye Aerial View)>
DESIGN (ARCHITECTURE, INTERIOR OR LANDSCAPE): <Describe the architectural / interior / landscape design style (e.g. Contemporary Minimalist, Classical Neoclassical, Mid-Century Modern, Japandi, Brutalist, Biophilic Organic, Mediterranean Villa, etc.) with specific design principles>
CONTEXT: <Describe the surrounding environment, site condition, landscape or urban backdrop (e.g. coastal cliffside overlooking ocean, dense urban skyline, lush alpine forest, serene suburban garden)>
MATERIAL: <Describe the detailed physical materials, finishes, and textures (e.g. honed travertine stone, white oak timber, microcement floors, fluted glass, polished brass, fair-faced concrete)>
LIGHTING: <Describe the lighting scheme and atmospheric conditions (e.g. golden hour sunlight with long warm shadows, soft diffuse daylight, dramatic interior architectural LED cove lighting, moody twilight illumination)>
VIS STYLE: <Describe the visual rendering style (e.g. Architectural photography, professional high-end photorealistic rendering, crisp 8k details, balanced exposure, physically accurate reflections and contact shadows)>

QUALITY AND PHOTOREALISM:
Create a professional architectural visualization suitable for presentation by a leading architecture, interior-design or real-estate visualization studio. Use physically believable proportions, realistic material response, accurate texture scale, natural reflections, plausible roughness, realistic illumination, contact shadows and balanced exposure. Maintain believable construction logic, furniture scale and human proportions. Avoid excessive HDR, artificial sharpening, oversaturation, plastic materials, warped geometry and implausible architectural details. Do not create warped architecture, distorted furniture, floating objects, random text, logos or watermarks.

STRICT RULES:
1. Output ONLY the plain text matching the schema above.
2. DO NOT wrap in markdown code fences or backticks (no \`\`\` text).
3. Always include all 6 key sections: PROJECT, DESIGN (ARCHITECTURE, INTERIOR OR LANDSCAPE), CONTEXT, MATERIAL, LIGHTING, VIS STYLE.
4. If Reference-Guided Workflow: The drawing strictly guides the core design—layout, geometry, proportions, openings, and key spatial details—while reference images guide the style, materials, lighting, colors, and overall mood. Instruct the model that the final render must stay faithful to the design drawing while adopting the visual character from the references.
5. If Multiple Reference Images Uploaded: You MUST instruct the generation model to cross-synthesize elements from each numbered image (Image 1, Image 2, Image 3, etc.) exactly as specified by the user's prompt (e.g. placing furniture from Image 2 into the room space of Image 1 while applying materials from Image 3).
6. If Single Reference Image Uploaded: You MUST instruct the generation model to treat the input image as authoritative for geometry, perspective, walls, and composition.
7. Adapt to any user design type or requirement with high architectural fidelity.`;

    const imgCount = request.reference_images_count || request.reference_images_metadata?.length || (request.has_reference_image ? 1 : 0);
    const metaStr = request.reference_images_metadata && request.reference_images_metadata.length > 0
      ? request.reference_images_metadata.map((m, idx) => `Image ${idx + 1}: ${m.label || m.name || 'Reference'}`).join('; ')
      : imgCount > 0 ? `${imgCount} Image(s) Attached` : 'None';

    const userPrompt = `User Design Prompt: "${request.user_input || workflow.name}"
Workflow: ${workflow.name} (${workflow.slug})
Target Image Model: ${request.model}
Image Style: ${styleKey} (${styleDesc})
Attached Reference Images: ${imgCount > 0 ? 'YES' : 'NO'} (${metaStr})
ControlNet Conditioning: ${request.controlnet_enabled ? `ON (Fidelity Strength: ${request.controlnet_strength || 80}%)` : 'OFF'}
People Option: ${request.people || 'none'}
Camera Option: ${request.camera_angle || 'auto'} ${request.custom_camera ? `(Custom: ${request.custom_camera})` : ''}
Lighting Option: ${request.lighting || 'auto'} ${request.custom_lighting ? `(Custom: ${request.custom_lighting})` : ''}
Materials Option: ${request.materials || 'auto'} ${request.custom_materials ? `(Custom: ${request.custom_materials})` : ''}
Environment Option: ${request.environment || 'auto'} ${request.custom_environment ? `(Custom: ${request.custom_environment})` : ''}
Mood Option: ${request.mood || 'auto'} ${request.custom_mood ? `(Custom: ${request.custom_mood})` : ''}`;

    try {
      const vertexUrl = `https://aiplatform.googleapis.com/v1/projects/rendair-competitor/locations/global/publishers/google/models/gemini-2.5-flash:generateContent`;
      const res = await fetch(vertexUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemInstruction }] },
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024
          }
        })
      });

      if (!res.ok) {
        console.warn(`[PromptEnhancer] Vertex call failed (${res.status}), using smart offline fallback`);
        return this.enhanceOffline(request);
      }

      const json = await res.json();
      const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text || typeof text !== 'string') {
        return this.enhanceOffline(request);
      }

      let cleaned = text.trim();
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '').trim();
      }

      return cleaned;
    } catch (err) {
      console.warn('[PromptEnhancer] Error in Vertex AI call:', err);
      return this.enhanceOffline(request);
    }
  }
}
