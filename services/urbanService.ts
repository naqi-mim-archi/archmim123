import { GoogleGenAI, Type } from "@google/genai";
import { Project, ArchElement, Point } from "../types";

// Define the Urban Parameters Schema for Gemini
export const UrbanParametersSchema = {
  type: Type.OBJECT,
  properties: {
    planningGoal: {
      type: Type.STRING,
      description: "Primary theme: Mixed-use, Residential district, Business center, Eco-village, etc.",
    },
    densityLevel: {
      type: Type.STRING,
      enum: ["high", "medium", "low"],
      description: "Overall density of the massing.",
    },
    programDistribution: {
      type: Type.OBJECT,
      properties: {
        residential: { type: Type.NUMBER, description: "Percentage (0-100)" },
        office: { type: Type.NUMBER, description: "Percentage (0-100)" },
        retail: { type: Type.NUMBER, description: "Percentage (0-100)" },
        institutional: { type: Type.NUMBER, description: "Percentage (0-100)" },
        park: { type: Type.NUMBER, description: "Percentage (0-100)" },
      },
      required: ["residential", "office", "retail", "park"],
    },
    heightStrategy: {
      type: Type.STRING,
      enum: ["waterfront-towers", "central-peak", "perimeter-block", "uniform", "scattered"],
      description: "Strategy for height distribution across the site.",
    },
    streetPattern: {
      type: Type.STRING,
      enum: ["grid", "organic", "radial", "spine", "cul-de-sac"],
      description: "Design pattern for the road network.",
    },
    greenSpacePercent: { type: Type.NUMBER, description: "Target percentage for landscape/parks." },
    publicSpaceStrategy: { type: Type.STRING, description: "Brief description of the public realm approach." },
  },
  required: ["planningGoal", "densityLevel", "programDistribution", "heightStrategy", "streetPattern", "greenSpacePercent"],
};

export interface UrbanPlanParams {
  planningGoal: string;
  densityLevel: 'high' | 'medium' | 'low';
  programDistribution: {
    residential: number;
    office: number;
    retail: number;
    institutional?: number;
    park: number;
  };
  heightStrategy: string;
  streetPattern: 'grid' | 'organic' | 'radial' | 'spine';
  greenSpacePercent: number;
  publicSpaceStrategy: string;
}

export class UrbanGeneratorService {
  private ai: GoogleGenAI;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || "";
    this.ai = apiKey ? new GoogleGenAI({ apiKey }) : null as any;
  }

  async analyzePrompt(prompt: string): Promise<UrbanPlanParams> {
    const systemPrompt = `You are a world-class Urban Planner. 
    Convert the user's masterplan request into a structured urban design brief.
    Focus on density, land-use percentages, and geometry patterns.`;

    const result = await this.ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: `${systemPrompt}\n\nUser Request: ${prompt}`,
      config: {
        responseMimeType: "application/json",
        responseSchema: UrbanParametersSchema,
      },
    });

    const text = result.text;
    if (!text) throw new Error("Empty response from Gemini");
    return JSON.parse(text) as UrbanPlanParams;
  }

  /**
   * Generates a full urban layout based on planning parameters
   */
  static generateUrbanLayout(params: UrbanPlanParams, siteBoundary: Point[], existingElements: ArchElement[] = []): ArchElement[] {
    const elements: ArchElement[] = existingElements.filter(el => el.type === 'zone');
    if (siteBoundary.length < 3) return [];

    // 1. Calculate Bounding Box
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    siteBoundary.forEach(p => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });

    const width = maxX - minX;
    const height = maxY - minY;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // 2. Generate Road Network (Patterned)
    const roadSpacing = params.densityLevel === 'high' ? 80 : 120;
    const roads: { p1: Point, p2: Point, type: 'primary' | 'secondary' | 'pedestrian' }[] = [];

    // SITE SUBDIVISION ENGINE
    const grids: { x: number, y: number, w: number, h: number }[] = [];
    
    if (params.streetPattern === 'organic') {
        // Spine + Ribs organic pattern
        const segments = 8;
        const spine: Point[] = [];
        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const offset = Math.sin(t * Math.PI) * (width * 0.15);
          spine.push({ x: minX + width * t, y: centerY + offset });
        }
        for (let i = 0; i < spine.length - 1; i++) {
          roads.push({ p1: spine[i], p2: spine[i+1], type: 'primary' });
          if (i % 2 === 0) {
            roads.push({ p1: spine[i], p2: { x: spine[i].x, y: minY }, type: 'secondary' });
            roads.push({ p1: spine[i], p2: { x: spine[i].x, y: maxY }, type: 'secondary' });
          }
        }
    } else if (params.streetPattern === 'radial') {
        const center = { x: centerX, y: centerY };
        const rings = 3;
        const petals = 8;
        for (let r = 1; r <= rings; r++) {
            const radius = (width / 2) * (r / rings);
            const pts: Point[] = [];
            for (let p = 0; p < petals; p++) {
                const angle = (p / petals) * Math.PI * 2;
                pts.push({ x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius });
            }
            for (let p = 0; p < petals; p++) {
                roads.push({ p1: pts[p], p2: pts[(p+1)%petals], type: r === rings ? 'primary' : 'secondary' });
                if (r === 1) roads.push({ p1: center, p2: pts[p], type: 'primary' });
                else {
                    const prevRadius = (width / 2) * ((r-1) / rings);
                    const prevPt = { x: center.x + Math.cos((p/petals)*Math.PI*2) * prevRadius, y: center.y + Math.sin((p/petals)*Math.PI*2) * prevRadius };
                    roads.push({ p1: prevPt, p2: pts[p], type: 'secondary' });
                }
            }
        }
    } else {
        // Standard Grid with Hierarchy
        for (let x = minX + roadSpacing; x < maxX; x += roadSpacing) {
          const isMajor = Math.abs(x - centerX) < roadSpacing;
          roads.push({ p1: { x, y: minY }, p2: { x, y: maxY }, type: isMajor ? 'primary' : 'secondary' });
        }
        for (let y = minY + roadSpacing; y < maxY; y += roadSpacing) {
          const isMajor = Math.abs(y - centerY) < roadSpacing;
          roads.push({ p1: { x: minX, y }, p2: { x: maxX, y }, type: isMajor ? 'primary' : 'secondary' });
        }
    }

    // Add Roads to elements
    roads.forEach(r => {
      elements.push({
        id: crypto.randomUUID(),
        type: 'road',
        p1: r.p1, p2: r.p2,
        thickness: r.type === 'primary' ? 18 : (r.type === 'secondary' ? 12 : 6),
        usageType: 'road'
      });
    });

    // 3. Generate Blocks / Parcels (Enhanced Subdivision)
    const blocks: { boundary: Point[], center: Point, area: number }[] = [];
    const padding = 10; 

    if (params.streetPattern === 'grid' || params.streetPattern === 'spine') {
        const cellW = roadSpacing;
        const cellH = roadSpacing;
        for (let x = minX; x < maxX; x += cellW) {
          for (let y = minY; y < maxY; y += cellH) {
            const bc = { x: x + cellW/2, y: y + cellH/2 };
            if (this.isPointInPoly(bc, siteBoundary)) {
                // Subdivide large blocks into 2 or 4 parcels
                const subdivide = params.densityLevel === 'high' && Math.random() > 0.5;
                if (subdivide) {
                    const halfW = cellW / 2;
                    const subblocks = [
                        {x: x, y: y, w: halfW, h: cellH},
                        {x: x + halfW, y: y, w: halfW, h: cellH}
                    ];
                    subblocks.forEach(sb => {
                        const boundary = [
                            {x: sb.x + padding, y: sb.y + padding},
                            {x: sb.x + sb.w - padding, y: sb.y + padding},
                            {x: sb.x + sb.w - padding, y: sb.y + sb.h - padding},
                            {x: sb.x + padding, y: sb.y + sb.h - padding}
                        ];
                        blocks.push({ 
                            boundary, 
                            center: { x: sb.x + sb.w/2, y: sb.y + sb.h/2 },
                            area: sb.w * sb.h
                        });
                    });
                } else {
                    const boundary = [
                        { x: x + padding, y: y + padding },
                        { x: x + cellW - padding, y: y + padding },
                        { x: x + cellW - padding, y: y + cellH - padding },
                        { x: x + padding, y: y + cellH - padding }
                    ];
                    blocks.push({ boundary, center: bc, area: cellW * cellH });
                }
            }
          }
        }
    } else {
        // Fallback for organic/radial: create simple blocks near intersections
        roads.forEach((r, i) => {
            if (i % 3 === 0) {
                 const mid = { x: (r.p1.x + r.p2.x)/2, y: (r.p1.y + r.p2.y)/2 };
                 const angle = Math.atan2(r.p2.y - r.p1.y, r.p2.x - r.p1.x) + Math.PI/2;
                 const offX = Math.cos(angle) * 40;
                 const offY = Math.sin(angle) * 40;
                 const bc = { x: mid.x + offX, y: mid.y + offY };
                 if (this.isPointInPoly(bc, siteBoundary)) {
                    blocks.push({
                        boundary: this.createRect(bc, 50, 70, angle - Math.PI/2),
                        center: bc,
                        area: 3500
                    });
                 }
            }
        });
    }

    // 4. Distribute Building Typologies
    const sortedBlocks = [...blocks].sort((a, b) => {
      const distA = Math.hypot(a.center.x - centerX, a.center.y - centerY);
      const distB = Math.hypot(b.center.x - centerX, b.center.y - centerY);
      if (params.heightStrategy === 'central-peak') return distA - distB;
      return 0.5 - Math.random();
    });

    sortedBlocks.forEach((block, index) => {
      // Find if block is in a zone
      const zone = elements.find(el => el.type === 'zone' && el.boundary && this.isPointInPoly(block.center, el.boundary));
      
      let type: any = 'building-mass';
      let usage: any = zone?.zoneType || 'residential';
      let floors = 5;
      let typology: 'perimeter' | 'tower' | 'slab' | 'landscape' = 'slab';

      const totalBlocks = sortedBlocks.length;
      
      if (zone) {
        // Zone Overrides
        if (zone.zoneType === 'park') {
            type = 'landscape'; usage = 'park'; floors = 0; typology = 'landscape';
        } else {
            const densityMap = { 'low': 6, 'medium': 12, 'high': 25 };
            const baseFloors = densityMap[zone.preferDensity || 'medium'];
            floors = Math.floor(baseFloors * (0.8 + Math.random() * 0.4));
            
            if (zone.preferTypology && zone.preferTypology !== 'any') {
                typology = zone.preferTypology as any;
            } else {
                typology = floors > 15 ? 'tower' : (Math.random() > 0.5 ? 'perimeter' : 'slab');
            }
        }
      } else {
        // Global logic
        const parkThreshold = totalBlocks * (params.greenSpacePercent / 100);
        const officeThreshold = parkThreshold + totalBlocks * (params.programDistribution.office / 100);
        const retailThreshold = officeThreshold + totalBlocks * (params.programDistribution.retail / 100);

        if (index < parkThreshold) {
          type = 'landscape'; usage = 'park'; floors = 0; typology = 'landscape';
        } else if (index < officeThreshold) {
          usage = 'office'; 
          floors = params.densityLevel === 'high' ? 25 : 12;
          typology = Math.random() > 0.4 ? 'tower' : 'slab';
        } else if (index < retailThreshold) {
          usage = 'retail';
          floors = 2;
          typology = 'perimeter';
        } else {
          usage = 'residential';
          const distFromCenter = Math.hypot(block.center.x - centerX, block.center.y - centerY);
          const maxDist = Math.hypot(width/2, height/2) || 1;
          const normalizedDist = distFromCenter / maxDist;
          
          let multiplier = 1.0;
          if (params.heightStrategy === 'central-peak') multiplier = 1.3 - normalizedDist;
          if (params.heightStrategy === 'waterfront-towers') multiplier = 0.5 + normalizedDist;
          
          floors = Math.max(3, Math.floor(multiplier * (params.densityLevel === 'high' ? 35 : 12)));
          typology = floors > 15 ? 'tower' : (Math.random() > 0.5 ? 'perimeter' : 'slab');
        }
      }

      // Generate actual geometry based on typology
      if (typology === 'perimeter') {
        // Create a courtyard block
        elements.push({
            id: crypto.randomUUID(),
            type: 'building-mass',
            boundary: block.boundary,
            usageType: usage,
            subType: 'perimeter-block',
            floors,
            height: floors * 3.5,
            footprintAreaM2: block.area * 0.6, // Approximate coverage
            gfaM2: block.area * 0.6 * floors
        });
      } else if (typology === 'tower') {
        const towerW = Math.min(30, Math.sqrt(block.area) * 0.5);
        const towerBoundary = this.createRect(block.center, towerW, towerW, 0);
        elements.push({
            id: crypto.randomUUID(),
            type: 'building-mass',
            boundary: towerBoundary,
            usageType: usage,
            subType: 'tower',
            floors: floors * 1.5,
            height: floors * 1.5 * 3.5,
            footprintAreaM2: towerW * towerW,
            gfaM2: towerW * towerW * floors * 1.5
        });
      } else if (typology === 'slab') {
        const slabW = Math.min(60, Math.sqrt(block.area) * 0.8);
        const slabD = 18;
        const slabBoundary = this.createRect(block.center, slabW, slabD, Math.random() * Math.PI);
        elements.push({
            id: crypto.randomUUID(),
            type: 'building-mass',
            boundary: slabBoundary,
            usageType: usage,
            subType: 'slab',
            floors,
            height: floors * 3.5,
            footprintAreaM2: slabW * slabD,
            gfaM2: slabW * slabD * floors
        });
      } else {
        // Landscape
        elements.push({
            id: crypto.randomUUID(),
            type: 'landscape',
            boundary: block.boundary,
            usageType: 'park',
            footprintAreaM2: block.area
        });
      }

      // SCATTER ASSETS
      if (usage === 'park' || (usage === 'residential' && Math.random() > 0.7)) {
          // Calculate block dimensions
          const bMinX = Math.min(...block.boundary.map(p => p.x));
          const bMaxX = Math.max(...block.boundary.map(p => p.x));
          const bMinY = Math.min(...block.boundary.map(p => p.y));
          const bMaxY = Math.max(...block.boundary.map(p => p.y));
          const bWidth = bMaxX - bMinX;
          const bHeight = bMaxY - bMinY;

          // Add trees to parks and residential gardens
          const numTrees = usage === 'park' ? 5 : 2;
          for(let i=0; i<numTrees; i++) {
              const tx = block.center.x + (Math.random() - 0.5) * bWidth * 0.7;
              const ty = block.center.y + (Math.random() - 0.5) * bHeight * 0.7;
              if (this.isPointInPoly({x: tx, y: ty}, block.boundary)) {
                elements.push({
                    id: crypto.randomUUID(),
                    type: 'asset',
                    assetType: 'tree',
                    pos: { x: tx, y: ty },
                    rotation: Math.random() * 360,
                    scale: 0.8 + Math.random() * 0.4,
                    levelId: 'ground'
                } as any);
              }
          }
      }
    });

    // 6. AD-HOC STREET FURNITURE (Along roads)
    elements.filter(el => el.type === 'road' && el.p1 && el.p2).forEach(road => {
        const p1 = road.p1!;
        const p2 = road.p2!;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);
        const ux = dx / len;
        const uy = dy / len;
        const nx = -uy;
        const ny = ux;

        const streetLightSpacing = 15;
        const numLights = Math.floor(len / streetLightSpacing);
        for(let i=1; i<numLights; i++) {
            const t = i / numLights;
            const px = p1.x + dx * t;
            const py = p1.y + dy * t;
            
            // Place on both sides
            [5, -5].forEach(offset => {
                elements.push({
                    id: crypto.randomUUID(),
                    type: 'asset',
                    assetType: 'streetlight',
                    pos: { x: px + nx * offset, y: py + ny * offset },
                    rotation: Math.atan2(ny, nx) * 180 / Math.PI,
                    levelId: 'ground'
                } as any);
            });
        }
    });

    return elements;
  }

  /**
   * Subdivides a boundary into parcels
   */
  static generateParcels(siteBoundary: Point[], parcelWidth: number = 20, parcelDepth: number = 40): ArchElement[] {
    const elements: ArchElement[] = [];
    if (siteBoundary.length < 3) return [];

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    siteBoundary.forEach(p => {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });

    for (let x = minX; x < maxX; x += parcelWidth) {
      for (let y = minY; y < maxY; y += parcelDepth) {
        const center = { x: x + parcelWidth/2, y: y + parcelDepth/2 };
        if (this.isPointInPoly(center, siteBoundary)) {
          const boundary = [
            { x: x + 2, y: y + 2 },
            { x: x + parcelWidth - 2, y: y + 2 },
            { x: x + parcelWidth - 2, y: y + parcelDepth - 2 },
            { x: x + 2, y: y + parcelDepth - 2 }
          ];
          elements.push({
            id: crypto.randomUUID(),
            type: 'parcel',
            boundary,
            levelId: 'site',
            usageType: 'residential'
          });
        }
      }
    }
    return elements;
  }

  private static createRect(center: Point, w: number, h: number, angle: number): Point[] {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const hw = w/2;
    const hh = h/2;
    const pts = [
        { x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }
    ];
    return pts.map(p => ({
        x: center.x + p.x * cos - p.y * sin,
        y: center.y + p.x * sin + p.y * cos
    }));
  }

  private static isPointInPoly(pt: Point, poly: Point[]) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
}
