/**
 * BIM Service for parsing Revit files (RFA / RVT)
 * and validating companion 3D meshes (OBJ)
 */

export interface BimMetadata {
  fileName: string;
  fileSize: number;
  type: 'RFA' | 'RVT';
  category: string;
  description: string;
  revitVersion?: string;
  rawBmData?: string; // Base64 encoded raw RFA/RVT binary
  previewUrl?: string; // Extracted PNG preview URL (data URI)
  assetId?: string;
  sourceType?: 'revit_import';
  sourceFileType?: 'rfa' | 'rvt';
  sourceFileName?: string;
  revitFamilyName?: string;
  revitTypeName?: string;
  classname?: string;
  displayName?: string;
  userCategory?: string;
  isImportedAsset?: boolean;
  nativeCatalogAsset?: boolean;
  model3D?: ImportedRevitModel3D;
  planView2D?: ImportedRevitPlanView2D;
  elevationViews?: ImportedRevitElevationViews;
  thumbnail?: string;
  dimensions?: ImportedRevitDimensions;
  materials?: ImportedRevitMaterial[];
  metadata?: Record<string, any>;
  importTimestamp?: string;
  importVersion?: string;
  originalFileStored?: boolean;
}

export interface ImportedRevitDimensions {
  width: number;
  depth: number;
  height: number;
  unit: 'm';
}

export interface ImportedRevitMaterial {
  name: string;
  color?: string;
  source: 'revit' | 'generated';
}

export interface ImportedRevitModel3D {
  kind: 'companion_obj' | 'generated_proxy' | 'rvt_layout_proxy';
  source: 'imported_geometry' | 'generated_from_dimensions';
  customMeshData?: { vertices: number[]; faces: number[] };
  dimensions: ImportedRevitDimensions;
  materials: ImportedRevitMaterial[];
}

export interface ImportedRevitPlanView2D {
  kind: 'extracted' | 'generated_silhouette';
  source: 'revit_file' | 'companion_geometry' | 'dimensions';
  boundary: Array<{ x: number; y: number }>;
  detailLines: Array<{ p1: { x: number; y: number }; p2: { x: number; y: number } }>;
  label?: string;
}

export interface ImportedRevitElevationViews {
  north: ImportedRevitPlanView2D;
  south: ImportedRevitPlanView2D;
  east: ImportedRevitPlanView2D;
  west: ImportedRevitPlanView2D;
}

export interface MeshBudgetReport {
  verticesCount: number;
  facesCount: number;
  isWithinBudget: boolean;
  warningMessage?: string;
}

export const BimService = {
  /**
   * Scan raw file ArrayBuffer for PNG magic bytes and extract the first/largest PNG
   */
  extractPngPreview(buffer: ArrayBuffer): string | null {
    const bytes = new Uint8Array(buffer);
    const pngHeader = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
    const pngFooter = [0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82]; // IEND + CRC

    let pngStart = -1;
    let pngEnd = -1;

    // Scan for header
    for (let i = 0; i < bytes.length - 8; i++) {
      let match = true;
      for (let j = 0; j < 8; j++) {
        if (bytes[i + j] !== pngHeader[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        pngStart = i;
        break; // Find the first PNG
      }
    }

    if (pngStart === -1) {
      return null;
    }

    // Scan for footer starting from pngStart
    for (let i = pngStart; i < bytes.length - 8; i++) {
      let match = true;
      for (let j = 0; j < 8; j++) {
        if (bytes[i + j] !== pngFooter[j]) {
          match = false;
          break;
        }
      }
      if (match) {
        pngEnd = i + 8; // Include the footer bytes
        break;
      }
    }

    if (pngEnd === -1) {
      return null;
    }

    // Extract the PNG slice
    const pngBytes = bytes.slice(pngStart, pngEnd);
    let binary = '';
    for (let i = 0; i < pngBytes.length; i++) {
      binary += String.fromCharCode(pngBytes[i]);
    }
    return `data:image/png;base64,${window.btoa(binary)}`;
  },

  sanitizeImportedClassName(sourceName?: string): string {
    const withoutExtension = (sourceName || 'Imported_Revit_Asset').replace(/\.[^/.]+$/, '');
    const sanitized = withoutExtension
      .trim()
      .replace(/[^A-Za-z0-9_]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
    const validStart = /^[A-Za-z_]/.test(sanitized) ? sanitized : `Asset_${sanitized}`;
    return `${validStart || 'Imported_Revit_Asset'}_rfa`;
  },

  makeUniqueClassName(baseClassName: string, existingClassNames: Iterable<string>): string {
    const existing = new Set(Array.from(existingClassNames).map(name => name.toLowerCase()));
    if (!existing.has(baseClassName.toLowerCase())) return baseClassName;
    let index = 2;
    let candidate = `${baseClassName}_${index}`;
    while (existing.has(candidate.toLowerCase())) {
      index += 1;
      candidate = `${baseClassName}_${index}`;
    }
    return candidate;
  },

  createGeneratedPlanView(width: number, depth: number, label?: string): ImportedRevitPlanView2D {
    const w = Math.max(0.05, width);
    const d = Math.max(0.05, depth);
    const insetX = w * 0.16;
    const insetY = d * 0.16;
    return {
      kind: 'generated_silhouette',
      source: 'dimensions',
      boundary: [
        { x: -w / 2, y: -d / 2 },
        { x: w / 2, y: -d / 2 },
        { x: w / 2, y: d / 2 },
        { x: -w / 2, y: d / 2 },
      ],
      detailLines: [
        { p1: { x: -w / 2 + insetX, y: -d / 2 + insetY }, p2: { x: w / 2 - insetX, y: d / 2 - insetY } },
        { p1: { x: -w / 2 + insetX, y: d / 2 - insetY }, p2: { x: w / 2 - insetX, y: -d / 2 + insetY } },
        { p1: { x: -w / 2, y: 0 }, p2: { x: w / 2, y: 0 } },
      ],
      label,
    };
  },

  createGeneratedElevationView(width: number, height: number, label?: string): ImportedRevitPlanView2D {
    const w = Math.max(0.05, width);
    const h = Math.max(0.05, height);
    return {
      kind: 'generated_silhouette',
      source: 'dimensions',
      boundary: [
        { x: -w / 2, y: 0 },
        { x: w / 2, y: 0 },
        { x: w / 2, y: -h },
        { x: -w / 2, y: -h },
      ],
      detailLines: [
        { p1: { x: -w / 2, y: -h * 0.25 }, p2: { x: w / 2, y: -h * 0.25 } },
        { p1: { x: 0, y: 0 }, p2: { x: 0, y: -h } },
      ],
      label,
    };
  },

  createElevationViews(width: number, depth: number, height: number, label?: string): ImportedRevitElevationViews {
    return {
      north: this.createGeneratedElevationView(width, height, label),
      south: this.createGeneratedElevationView(width, height, label),
      east: this.createGeneratedElevationView(depth, height, label),
      west: this.createGeneratedElevationView(depth, height, label),
    };
  },

  createImportedAssetMetadata(params: {
    fileName: string;
    fileSize: number;
    fileType: 'RFA' | 'RVT';
    displayName: string;
    classname: string;
    userCategory: string;
    width: number;
    depth: number;
    height: number;
    revitVersion?: string;
    rawBmData?: string;
    previewUrl?: string;
    customMeshData?: { vertices: number[]; faces: number[] };
    description?: string;
  }): BimMetadata {
    const sourceFileType = params.fileType.toLowerCase() as 'rfa' | 'rvt';
    const assetId = `revit_${params.classname}_${Date.now()}`;
    const dimensions = { width: params.width, depth: params.depth, height: params.height, unit: 'm' as const };
    const materials: ImportedRevitMaterial[] = [{ name: 'Imported Revit Material', color: '#5b5f58', source: 'generated' }];
    const planView2D = this.createGeneratedPlanView(params.width, params.depth, params.classname);
    return {
      fileName: params.fileName,
      fileSize: params.fileSize,
      type: params.fileType,
      category: params.userCategory,
      description: params.description || `Imported Revit ${params.fileType} asset package`,
      revitVersion: params.revitVersion,
      rawBmData: params.rawBmData,
      previewUrl: params.previewUrl,
      assetId,
      sourceType: 'revit_import',
      sourceFileType,
      sourceFileName: params.fileName,
      revitFamilyName: params.displayName,
      revitTypeName: params.displayName,
      classname: params.classname,
      displayName: params.displayName,
      userCategory: params.userCategory,
      isImportedAsset: true,
      nativeCatalogAsset: false,
      model3D: {
        kind: params.customMeshData ? 'companion_obj' : (params.fileType === 'RVT' ? 'rvt_layout_proxy' : 'generated_proxy'),
        source: params.customMeshData ? 'imported_geometry' : 'generated_from_dimensions',
        customMeshData: params.customMeshData,
        dimensions,
        materials,
      },
      planView2D,
      elevationViews: this.createElevationViews(params.width, params.depth, params.height, params.classname),
      thumbnail: params.previewUrl,
      dimensions,
      materials,
      metadata: {
        parser: 'client-side-revit-package',
        geometryStatus: params.customMeshData ? 'companion_obj_loaded' : 'revit_binary_geometry_unavailable_client_side',
      },
      importTimestamp: new Date().toISOString(),
      importVersion: 'revit-import-v2',
    };
  },

  getPersistentMetadata(metadata: BimMetadata): BimMetadata {
    const { rawBmData, ...persistent } = metadata;
    return {
      ...persistent,
      originalFileStored: Boolean(rawBmData && rawBmData.length < 500_000),
      ...(rawBmData && rawBmData.length < 500_000 ? { rawBmData } : {})
    };
  },

  /**
   * Scans binary stream to read basic text string segments for metadata (e.g. "Revit Build" or "Format:")
   */
  parseRevitBuildVersion(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let text = '';
    // Look for unicode/ASCII characters of "Revit" or version numbers
    // We will scan a portion of the file for Revit strings
    const limit = Math.min(bytes.length, 1024 * 100); // Check first 100KB
    let foundIndex = -1;

    for (let i = 0; i < limit - 10; i++) {
      // Look for "Autodesk Revit"
      if (
        bytes[i] === 0x41 && // A
        bytes[i + 1] === 0x75 && // u
        bytes[i + 2] === 0x74 && // t
        bytes[i + 3] === 0x6F // o
      ) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== -1) {
      // Read next 100 characters, ignoring non-ASCII characters
      for (let j = 0; j < 120; j++) {
        const charCode = bytes[foundIndex + j];
        if (charCode >= 32 && charCode <= 126) {
          text += String.fromCharCode(charCode);
        }
      }
      const match = text.match(/Revit \d{4}/i);
      if (match) return match[0];
    }

    return 'Revit 2025 (Detected)';
  },

  /**
   * Helper to convert ArrayBuffer to Base64
   */
  arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  },

  /**
   * Helper to convert Base64 back to ArrayBuffer/Blob
   */
  base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  },

  /**
   * Checks the budget limit of vertices/faces for companion 3D model
   */
  validateMeshBudget(objContent: string): MeshBudgetReport {
    let verticesCount = 0;
    let facesCount = 0;

    const lines = objContent.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('v ')) {
        verticesCount++;
      } else if (line.startsWith('f ')) {
        facesCount++;
      }
    }

    const polygonLimit = 50000;
    const isWithinBudget = facesCount <= polygonLimit;
    let warningMessage;

    if (!isWithinBudget) {
      warningMessage = `Mesh exceeds performance budget! Polycount: ${facesCount.toLocaleString()} faces (Limit: ${polygonLimit.toLocaleString()}). The editor viewport performance might drop.`;
    }

    return {
      verticesCount,
      facesCount,
      isWithinBudget,
      warningMessage,
    };
  },
};
