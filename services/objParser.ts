export class ObjParser {
  /**
   * Parses an uploaded Wavefront .obj file content string into an element shape descriptor
   */
  static parseOBJ(text: string): { vertices: number[]; faces: number[] } | null {
    const vertices: number[] = [];
    const faces: number[] = [];
    
    const lines = text.split('\n');
    for (let line of lines) {
      line = line.trim();
      if (line.startsWith('v ')) {
        const parts = line.split(/\s+/).slice(1).map(Number);
        if (parts.length >= 3) {
          vertices.push(parts[0], parts[1], parts[2]);
        }
      } else if (line.startsWith('f ')) {
        const parts = line.split(/\s+/).slice(1);
        const indices = parts.map(p => {
          const idx = parseInt(p.split('/')[0]);
          return idx > 0 ? idx - 1 : idx;
        });
        if (indices.length >= 3) {
          // Triangulate if face is quad or polygon
          for (let i = 1; i < indices.length - 1; i++) {
            faces.push(indices[0], indices[i], indices[i + 1]);
          }
        }
      }
    }

    if (vertices.length === 0) return null;
    return { vertices, faces };
  }
}
