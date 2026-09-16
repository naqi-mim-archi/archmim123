export type AiActionType = 
  | 'remove' 
  | 'replace' 
  | 'add' 
  | 'material' 
  | 'cutout' 
  | 'scribble' 
  | 'outpaint';

export interface ArchitecturalPreset {
  id: string;
  category: 'people' | 'vegetation' | 'furniture' | 'vehicles' | 'materials' | 'decor' | 'sky';
  label: string;
  promptSnippet: string;
  icon?: string;
}

export const ARCHITECTURAL_PRESETS: ArchitecturalPreset[] = [
  // People
  { id: 'p1', category: 'people', label: 'Scale Figures (Blurred)', promptSnippet: 'subtle blurred architectural scale figures walking naturally' },
  { id: 'p2', category: 'people', label: 'Contemporary Architect / Casual', promptSnippet: 'architect dressed in minimalist contemporary attire' },
  { id: 'p3', category: 'people', label: 'Dining Guests', promptSnippet: 'elegant guests seated and conversing at the table' },
  
  // Vegetation
  { id: 'v1', category: 'vegetation', label: 'Mature Olive Tree', promptSnippet: 'a gnarled mature Mediterranean olive tree in an architectural terracotta pot' },
  { id: 'v2', category: 'vegetation', label: 'Fiddle Leaf Fig', promptSnippet: 'lush indoor fiddle leaf fig plant in concrete planter' },
  { id: 'v3', category: 'vegetation', label: 'Japanese Maple', promptSnippet: 'delicate Japanese red maple bonsai tree' },
  { id: 'v4', category: 'vegetation', label: 'Lush Tropical Foliage', promptSnippet: 'monstera, palms, and bird of paradise tropical greenery' },

  // Furniture
  { id: 'f1', category: 'furniture', label: 'Bouclé Lounge Armchair', promptSnippet: 'curved minimalist off-white bouclé armchair with walnut legs' },
  { id: 'f2', category: 'furniture', label: 'Travertine Coffee Table', promptSnippet: 'organic monolithic honed travertine low coffee table' },
  { id: 'f3', category: 'furniture', label: 'Modern Dining Set', promptSnippet: 'solid white oak dining table with four Scandinavian wooden chairs' },
  { id: 'f4', category: 'furniture', label: 'Minimalist Modular Sofa', promptSnippet: 'low-profile modular linen sectional sofa in warm greige' },

  // Materials
  { id: 'm1', category: 'materials', label: 'Light Beige Travertine', promptSnippet: 'honed light beige Roman travertine stone with subtle natural veining' },
  { id: 'm2', category: 'materials', label: 'White Oak Wood Slat', promptSnippet: 'vertical acoustic white oak wood slat cladding' },
  { id: 'm3', category: 'materials', label: 'Fair-Faced Concrete', promptSnippet: 'smooth architectural fair-faced concrete with tie-rod holes' },
  { id: 'm4', category: 'materials', label: 'Fluted Reeded Glass', promptSnippet: 'translucent vertical fluted reeded glass with black metal frame' },
  { id: 'm5', category: 'materials', label: 'Smoked Walnut Timber', promptSnippet: 'rich deep-toned smoked American walnut timber paneling' },
  { id: 'm6', category: 'materials', label: 'Brushed Brass Metal', promptSnippet: 'refined satin brushed brass metal surface with subtle reflections' },

  // Sky
  { id: 's1', category: 'sky', label: 'Golden Hour Dusk', promptSnippet: 'golden hour sunset sky with soft warm glowing horizon and twilight gradient' },
  { id: 's2', category: 'sky', label: 'Clear Blue Daylight', promptSnippet: 'crisp clear blue sky with soft atmospheric horizon haze' },
  { id: 's3', category: 'sky', label: 'Moody Overcast', promptSnippet: 'soft diffuse overcast atmospheric sky with subtle cloud depth' },
];

export interface AiEditRequest {
  action: AiActionType;
  baseImageBase64: string;
  maskBase64?: string;
  userPrompt: string;
  model?: string;
  aspectRatio?: string;
  strength?: number;
  referenceImageBase64?: string;
  outpaintBounds?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export interface AiEditResult {
  imageUrl: string;
  base64: string;
  processingTimeMs: number;
  costEstimateUsd: number;
}
