// Self-contained valid GLTF Binary (.glb) generator for Image-to-3D and TRELLIS 3D workflows

export function createArchitecturalChairGlbBuffer(): Uint8Array {
  // Helper to add a box to parts
  function addBox(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const p = [
      // Front (z1)
      x0, y0, z1,  x1, y0, z1,  x1, y1, z1,  x0, y1, z1,
      // Back (z0)
      x1, y0, z0,  x0, y0, z0,  x0, y1, z0,  x1, y1, z0,
      // Top (y1)
      x0, y1, z1,  x1, y1, z1,  x1, y1, z0,  x0, y1, z0,
      // Bottom (y0)
      x0, y0, z0,  x1, y0, z0,  x1, y0, z1,  x0, y0, z1,
      // Right (x1)
      x1, y0, z1,  x1, y0, z0,  x1, y1, z0,  x1, y1, z1,
      // Left (x0)
      x0, y0, z0,  x0, y0, z1,  x0, y1, z1,  x0, y1, z0,
    ];

    const n = [
      // Front
      0, 0, 1,  0, 0, 1,  0, 0, 1,  0, 0, 1,
      // Back
      0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1,
      // Top
      0, 1, 0,  0, 1, 0,  0, 1, 0,  0, 1, 0,
      // Bottom
      0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0,
      // Right
      1, 0, 0,  1, 0, 0,  1, 0, 0,  1, 0, 0,
      // Left
      -1, 0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0,
    ];

    return { positions: p, normals: n };
  }

  // Compose modern architectural lounge armchair:
  const boxes: [number, number, number, number, number, number][] = [
    // Seat cushion
    [-0.35, 0.35, -0.35, 0.35, 0.45, 0.35],
    // Backrest
    [-0.35, 0.45, -0.35, 0.35, 0.85, -0.25],
    // Left armrest
    [-0.42, 0.35, -0.35, -0.35, 0.60, 0.35],
    // Right armrest
    [0.35, 0.35, -0.35, 0.42, 0.60, 0.35],
    // 4 architectural frame legs
    [-0.35, 0.0, -0.35, -0.30, 0.35, -0.30],
    [0.30, 0.0, -0.35, 0.35, 0.35, -0.30],
    [-0.35, 0.0, 0.30, -0.30, 0.35, 0.35],
    [0.30, 0.0, 0.30, 0.35, 0.35, 0.35],
  ];

  const allPositions: number[] = [];
  const allNormals: number[] = [];
  const allIndices: number[] = [];
  let vertOffset = 0;

  boxes.forEach(([x0, y0, z0, x1, y1, z1]) => {
    const box = addBox(x0, y0, z0, x1, y1, z1);
    allPositions.push(...box.positions);
    allNormals.push(...box.normals);

    // 6 faces * 2 triangles
    for (let f = 0; f < 6; f++) {
      const base = vertOffset + f * 4;
      allIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    vertOffset += 24;
  });

  const positions = new Float32Array(allPositions);
  const normals = new Float32Array(allNormals);
  const indices = new Uint16Array(allIndices);

  const posByteLength = positions.byteLength;
  const normByteLength = normals.byteLength;
  const indByteLength = indices.byteLength;
  const totalBinLength = posByteLength + normByteLength + indByteLength;

  const binBuffer = new Uint8Array(totalBinLength);
  binBuffer.set(new Uint8Array(positions.buffer), 0);
  binBuffer.set(new Uint8Array(normals.buffer), posByteLength);
  binBuffer.set(new Uint8Array(indices.buffer), posByteLength + normByteLength);

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i+1]);
    minZ = Math.min(minZ, positions[i+2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i+1]);
    maxZ = Math.max(maxZ, positions[i+2]);
  }

  const gltfJson = {
    asset: { version: '2.0', generator: 'ArchitectAI-TRELLIS-3D' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'AI_Architectural_Armchair' }],
    meshes: [{
      name: 'Armchair_Mesh',
      primitives: [{
        attributes: { POSITION: 0, NORMAL: 1 },
        indices: 2,
        material: 0
      }]
    }],
    materials: [{
      name: 'Modern_Velvet_Indigo',
      pbrMetallicRoughness: {
        baseColorFactor: [0.28, 0.35, 0.95, 1.0],
        metallicFactor: 0.15,
        roughnessFactor: 0.35
      },
      doubleSided: true
    }],
    accessors: [
      {
        bufferView: 0,
        byteOffset: 0,
        componentType: 5126,
        count: positions.length / 3,
        type: 'VEC3',
        max: [maxX, maxY, maxZ],
        min: [minX, minY, minZ]
      },
      {
        bufferView: 1,
        byteOffset: 0,
        componentType: 5126,
        count: normals.length / 3,
        type: 'VEC3',
        max: [1, 1, 1],
        min: [-1, -1, -1]
      },
      {
        bufferView: 2,
        byteOffset: 0,
        componentType: 5123,
        count: indices.length,
        type: 'SCALAR',
        max: [vertOffset - 1],
        min: [0]
      }
    ],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: posByteLength, target: 34962 },
      { buffer: 0, byteOffset: posByteLength, byteLength: normByteLength, target: 34962 },
      { buffer: 0, byteOffset: posByteLength + normByteLength, byteLength: indByteLength, target: 34963 }
    ],
    buffers: [{ byteLength: totalBinLength }]
  };

  let jsonString = JSON.stringify(gltfJson);
  while (jsonString.length % 4 !== 0) jsonString += ' ';
  
  const encoder = new TextEncoder();
  const jsonBuffer = encoder.encode(jsonString);
  const jsonChunkLength = jsonBuffer.length;
  const binChunkLength = binBuffer.length;
  const totalLength = 12 + 8 + jsonChunkLength + 8 + binChunkLength;

  const glbBuffer = new Uint8Array(totalLength);
  const view = new DataView(glbBuffer.buffer);

  // GLB Header
  view.setUint32(0, 0x46546C67, true); // 'glTF'
  view.setUint32(4, 2, true);          // Version 2
  view.setUint32(8, totalLength, true);

  // Chunk 0 (JSON)
  view.setUint32(12, jsonChunkLength, true);
  view.setUint32(16, 0x4E4F534A, true); // 'JSON'
  glbBuffer.set(jsonBuffer, 20);

  // Chunk 1 (BIN)
  const binOffset = 20 + jsonChunkLength;
  view.setUint32(binOffset, binChunkLength, true);
  view.setUint32(binOffset + 4, 0x004E4942, true); // 'BIN\0'
  glbBuffer.set(binBuffer, binOffset + 8);

  return glbBuffer;
}

export function getSample3DModelBase64(): string {
  const buf = createArchitecturalChairGlbBuffer();
  let binary = '';
  const len = buf.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(buf[i]);
  }
  return typeof btoa === 'function' ? btoa(binary) : Buffer.from(buf).toString('base64');
}

export function getSample3DModelDataUri(): string {
  return `data:model/gltf-binary;base64,${getSample3DModelBase64()}`;
}
