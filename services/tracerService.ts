export const traceFloorplanTracer = async (
  imageFile: File,
  overlapThreshold: number,
  confidenceThreshold: number // We accept this but API call uses min confidence to allow client filtering
): Promise<any> => {
  // 1. Convert File to Base64 (Data URL)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(imageFile);
  });

  // Strip prefix to get raw base64
  const base64Raw = dataUrl.split(',')[1]; 

  // Roboflow Configuration
  // Matches Python: rf.workspace().project("mimexaadetecrtaod-1vjzv").version(1).model
  const API_KEY = "yOHuWFKdG7mkMXUiZYkG"; 
  const MODEL_ENDPOINT = "mimexaadetecrtaod-1vjzv/1";
  
  // Construct URL with Query Params
  // Note: We use a low confidence (1) for the API fetch so we get ALL candidates.
  // Filtering happens client-side in \`mapTracerDataToArchElements\`.
  const FETCH_CONFIDENCE = 1; 
  const url = `https://detect.roboflow.com/${MODEL_ENDPOINT}?api_key=${API_KEY}&confidence=${FETCH_CONFIDENCE}&overlap=${overlapThreshold}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: base64Raw // Send raw base64 string as body
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error("Roboflow Error Body:", errorText);
        
        if (response.status === 403) throw new Error("Roboflow API Error: 403 Forbidden. Check API Key permissions.");
        if (response.status === 401) throw new Error("Roboflow API Error: 401 Unauthorized. Check API Key.");
        throw new Error(`Roboflow API Error (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    console.log("Tracer Inference Raw Result:", result);

    // Return the RAW result. Mapping happens in the UI component now to support real-time filtering.
    return result;

  } catch (error: any) {
    console.error("Tracer API call failed:", error);
    if (error.message && error.message.includes('Failed to fetch')) {
        throw new Error("Connection failed. Check your internet or CORS settings.");
    }
    throw error;
  }
};

export const mapTracerDataToArchElements = (
    data: any, 
    confidenceThreshold: number, 
    originalFile?: File
): any => {
    // 1. FILTER & BOUNDS
    // Filter raw predictions based on confidence (Client Side)
    const rawPreds = (data.predictions || []).filter((p: any) => p.confidence >= confidenceThreshold / 100);

    if (rawPreds.length === 0) {
        return { walls: [], doors: [], windows: [], rooms: [], columns: [], stairs: [], slabs: [] };
    }

    // Calculate Bounds for Normalization and Scaling
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    rawPreds.forEach((p: any) => {
        const x = p.x, y = p.y, w = p.width, h = p.height;
        minX = Math.min(minX, x - w/2);
        maxX = Math.max(maxX, x + w/2);
        minY = Math.min(minY, y - h/2);
        maxY = Math.max(maxY, y + h/2);
    });

    const contentW = maxX - minX;
    const contentH = maxY - minY;
    
    // SCALE STRATEGY: Map the largest dimension to ~20 meters (standard residential width)
    // This ensures consistent editing regardless of image resolution
    const TARGET_SIZE_METERS = 20; 
    const scale = TARGET_SIZE_METERS / Math.max(contentW, contentH);
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    const transformLen = (val: number) => val * scale;
    const transformPt = (x: number, y: number) => ({ x: (x - centerX) * scale, y: (y - centerY) * scale });

    // 2. WALL SEGMENTATION & MERGING
    // We separate walls into Horizontal and Vertical buckets to stitch them.
    
    // Thresholds for merging (in scaled meters)
    const MERGE_GAP = 0.6; // Max gap to bridge between collinear walls
    const ALIGN_TOLERANCE = 0.4; // Max offset to consider walls "collinear"

    const horizSegments: { y: number, x1: number, x2: number, thickness: number }[] = [];
    const vertSegments: { x: number, y1: number, y2: number, thickness: number }[] = [];

    rawPreds.forEach((p: any) => {
        const cls = (p.class || '').toLowerCase();
        if (cls.includes('wall')) {
            const w = transformLen(p.width);
            const h = transformLen(p.height);
            const pt = transformPt(p.x, p.y);
            const isHoriz = w > h;

            if (isHoriz) {
                horizSegments.push({ y: pt.y, x1: pt.x - w/2, x2: pt.x + w/2, thickness: h });
            } else {
                vertSegments.push({ x: pt.x, y1: pt.y - h/2, y2: pt.y + h/2, thickness: w });
            }
        }
    });

    // Universal Merge Function for 1D Intervals
    const mergeIntervals = (items: { pos: number, start: number, end: number, thick: number }[]) => {
        // 1. Sort by position (e.g., Y for horizontal lines)
        items.sort((a, b) => a.pos - b.pos);

        const merged: { pos: number, start: number, end: number, thick: number }[] = [];
        let currentGroup: typeof items = [];
        let currentPosSum = 0;

        const processGroup = () => {
            if (currentGroup.length === 0) return;
            
            // Calculate average position (e.g. average Y line) for alignment
            const avgPos = currentPosSum / currentGroup.length;
            const avgThick = currentGroup.reduce((s, i) => s + i.thick, 0) / currentGroup.length;
            
            // 2. Sort segments within the group by start coordinate
            currentGroup.sort((a, b) => a.start - b.start);

            // 3. Merge overlapping or close segments
            let currStart = currentGroup[0].start;
            let currEnd = currentGroup[0].end;

            for (let i = 1; i < currentGroup.length; i++) {
                const seg = currentGroup[i];
                if (seg.start < currEnd + MERGE_GAP) {
                    // Overlap or gap is small -> Merge
                    currEnd = Math.max(currEnd, seg.end);
                } else {
                    // Gap is large -> Push and start new segment
                    merged.push({ pos: avgPos, start: currStart, end: currEnd, thick: avgThick });
                    currStart = seg.start;
                    currEnd = currEnd;
                }
            }
            // Push final segment of the group
            merged.push({ pos: avgPos, start: currStart, end: currEnd, thick: avgThick });
        };

        items.forEach(item => {
            if (currentGroup.length === 0) {
                currentGroup.push(item);
                currentPosSum = item.pos;
            } else {
                const lastPos = currentPosSum / currentGroup.length;
                // If this segment is roughly on the same line as the group
                if (Math.abs(item.pos - lastPos) < ALIGN_TOLERANCE) {
                    currentGroup.push(item);
                    currentPosSum += item.pos;
                } else {
                    // End of collinear group, process it
                    processGroup();
                    currentGroup = [item];
                    currentPosSum = item.pos;
                }
            }
        });
        processGroup();
        return merged;
    };

    // Perform Merges
    const finalHoriz = mergeIntervals(horizSegments.map(s => ({ pos: s.y, start: s.x1, end: s.x2, thick: s.thickness })));
    const finalVert = mergeIntervals(vertSegments.map(s => ({ pos: s.x, start: s.y1, end: s.y2, thick: s.thickness })));

    // Convert merged segments to Walls
    const walls: any[] = [];
    finalHoriz.forEach(w => {
        walls.push({
            p1: [w.start, w.pos],
            p2: [w.end, w.pos],
            type: 'interior',
            thickness: Math.min(0.3, Math.max(0.1, w.thick)), // Clamp thickness
            levelIndex: 0
        });
    });
    finalVert.forEach(w => {
        walls.push({
            p1: [w.pos, w.start],
            p2: [w.pos, w.end],
            type: 'interior',
            thickness: Math.min(0.3, Math.max(0.1, w.thick)),
            levelIndex: 0
        });
    });

    // 3. OPENING SNAPPING
    // Snap doors/windows to the nearest wall centerline
    const doors: any[] = [];
    const windows: any[] = [];

    const snapToWall = (pt: {x: number, y: number}) => {
        let bestDist = Infinity;
        let bestWall = null;
        let isHorizWall = true;

        // Check against merged horizontal walls
        for (const w of finalHoriz) {
            // Check if point is within the X-span of the wall (with buffer)
            if (pt.x >= w.start - 0.5 && pt.x <= w.end + 0.5) {
                const d = Math.abs(pt.y - w.pos);
                if (d < bestDist) {
                    bestDist = d;
                    bestWall = w;
                    isHorizWall = true;
                }
            }
        }
        // Check against merged vertical walls
        for (const w of finalVert) {
            // Check if point is within the Y-span of the wall
            if (pt.y >= w.start - 0.5 && pt.y <= w.end + 0.5) {
                const d = Math.abs(pt.x - w.pos);
                if (d < bestDist) {
                    bestDist = d;
                    bestWall = w;
                    isHorizWall = false;
                }
            }
        }

        // If close enough to a wall, snap coordinates and rotation
        const SNAP_DIST = 1.2; // meters
        if (bestDist < SNAP_DIST && bestWall) {
            return {
                x: isHorizWall ? pt.x : bestWall.pos,
                y: isHorizWall ? bestWall.pos : pt.y,
                rotation: isHorizWall ? 0 : 90
            };
        }
        return { x: pt.x, y: pt.y, rotation: 0 }; // Return original if no snap
    };

    rawPreds.forEach((p: any) => {
        const cls = (p.class || '').toLowerCase();
        if (cls.includes('wall')) return; // handled above

        const w = transformLen(p.width);
        const h = transformLen(p.height);
        const pt = transformPt(p.x, p.y);
        
        const snapped = snapToWall(pt);
        const maxDim = Math.max(w, h);

        if (cls.includes('door')) {
            doors.push({
                pos: [snapped.x, snapped.y],
                rotation: snapped.rotation,
                width: maxDim, 
                type: 'single',
                levelIndex: 0
            });
        } else if (cls.includes('window')) {
            windows.push({
                pos: [snapped.x, snapped.y],
                rotation: snapped.rotation,
                width: maxDim,
                type: 'standard',
                levelIndex: 0
            });
        }
    });

    return {
        walls,
        doors,
        windows,
        rooms: [], 
        columns: [],
        stairs: [],
        slabs: []
    };
};
