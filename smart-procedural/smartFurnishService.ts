import { Point, ArchElement } from '../types';

export class SmartProceduralFurnishEngine {
  private static pointInPolygon(p: Point, poly: Point[]): boolean {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const xi = poly[i].x, yi = poly[i].y;
      const xj = poly[j].x, yj = poly[j].y;
      const intersect = ((yi > p.y) !== (yj > p.y))
          && (p.x < (xj - xi) * (p.y - yi) / (yj - yi + 1e-9) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  
  private static getRoomType(label: string): string {
    const firstLine = (label || '').split('\n')[0].toUpperCase();
    if (firstLine.includes('BEDROOM') || firstLine.includes('MASTER') || firstLine.includes('SLEEP')) return 'bedroom';
    if (firstLine.includes('LIVING') || firstLine.includes('LOUNGE') || firstLine.includes('FAMILY')) return 'living';
    if (firstLine.includes('KITCHEN') || firstLine.includes('PANTRY')) return 'kitchen';
    if (firstLine.includes('BATH') || firstLine.includes('ENSUITE') || firstLine.includes('POWDER') || firstLine.includes('TOILET')) return 'bathroom';
    if (firstLine.includes('DINING')) return 'dining';
    if (firstLine.includes('OFFICE') || firstLine.includes('CABIN') || firstLine.includes('WORKSPACE') || firstLine.includes('STUDY') || firstLine.includes('DESK')) return 'office';
    if (firstLine.includes('MEETING') || firstLine.includes('CONFERENCE')) return 'meeting';
    if (firstLine.includes('RECEPTION') || firstLine.includes('LOBBY')) return 'reception';
    if (firstLine.includes('CAFE') || firstLine.includes('SEATING') || firstLine.includes('RESTAURANT')) return 'cafe';
    if (firstLine.includes('WARD') || firstLine.includes('CLINIC') || firstLine.includes('EXAM')) return 'healthcare';
    if (firstLine.includes('CLASS') || firstLine.includes('TRAINING')) return 'education';
    if (firstLine.includes('STORAGE') || firstLine.includes('WAREHOUSE') || firstLine.includes('FACTORY')) return 'industrial';
    return 'generic';
  }

  static furnishFloor(hostFloor: ArchElement, allElements: ArchElement[]): ArchElement[] {
    const pId = hostFloor.proceduralId || hostFloor.id;
    
    // 1. Gather all rooms
    // We check either matching proceduralId, or centroid inside the floor boundary
    const rooms = allElements.filter(el => {
      if (el.type !== 'room') return false;
      if (el.proceduralId === pId) return true;
      if (hostFloor.boundary && el.pos && this.pointInPolygon(el.pos, hostFloor.boundary)) return true;
      return false;
    });

    const newFurniture: ArchElement[] = [];

    rooms.forEach(room => {
      if (!room.pos || !room.width || !room.depth) return;

      const cx = room.pos.x;
      const cy = room.pos.y;
      const rw = room.width;
      const rd = room.depth;
      const rType = this.getRoomType(room.label || '');

      switch (rType) {
        case 'bedroom': {
          const isMaster = (room.label || '').toUpperCase().includes('MASTER');
          const bedId = isMaster ? 'bed_queen' : 'bed_single';
          const bedWidth = isMaster ? 1.5 : 0.9;
          const bedDepth = 2.0;

          if (rw > rd) {
            if (rd >= bedDepth + 0.8) {
              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: bedId,
                label: isMaster ? 'Bed Queen' : 'Bed Single',
                pos: { x: cx, y: cy - rd / 2 + bedDepth / 2 },
                width: bedWidth,
                depth: bedDepth,
                rotation: 180,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });

              const bedsideW = 0.5;
              const bedsideD = 0.45;
              if (rw >= bedWidth + bedsideW * 2 + 0.2) {
                newFurniture.push({
                  id: crypto.randomUUID(),
                  type: 'furniture',
                  subType: 'bedside',
                  label: 'Bedside',
                  pos: { x: cx - bedWidth / 2 - bedsideW / 2, y: cy - rd / 2 + bedsideD / 2 },
                  width: bedsideW,
                  depth: bedsideD,
                  rotation: 180,
                  proceduralId: pId,
                  levelId: hostFloor.levelId
                });
                newFurniture.push({
                  id: crypto.randomUUID(),
                  type: 'furniture',
                  subType: 'bedside',
                  label: 'Bedside',
                  pos: { x: cx + bedWidth / 2 + bedsideW / 2, y: cy - rd / 2 + bedsideD / 2 },
                  width: bedsideW,
                  depth: bedsideD,
                  rotation: 180,
                  proceduralId: pId,
                  levelId: hostFloor.levelId
                });
              }

              const wardW = Math.min(rw * 0.6, 1.8);
              const wardD = 0.6;
              if (rd >= bedDepth + wardD + 0.6) {
                newFurniture.push({
                  id: crypto.randomUUID(),
                  type: 'furniture',
                  subType: 'wardrobe',
                  label: 'Wardrobe',
                  pos: { x: cx, y: cy + rd / 2 - wardD / 2 },
                  width: wardW,
                  depth: wardD,
                  rotation: 0,
                  proceduralId: pId,
                  levelId: hostFloor.levelId
                });
              }
            }
          } else {
            if (rw >= bedDepth + 0.8) {
              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: bedId,
                label: isMaster ? 'Bed Queen' : 'Bed Single',
                pos: { x: cx - rw / 2 + bedDepth / 2, y: cy },
                width: bedWidth,
                depth: bedDepth,
                rotation: 90,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });

              const bedsideW = 0.5;
              const bedsideD = 0.45;
              if (rd >= bedWidth + bedsideW * 2 + 0.2) {
                newFurniture.push({
                  id: crypto.randomUUID(),
                  type: 'furniture',
                  subType: 'bedside',
                  label: 'Bedside',
                  pos: { x: cx - rw / 2 + bedsideD / 2, y: cy - bedWidth / 2 - bedsideW / 2 },
                  width: bedsideW,
                  depth: bedsideD,
                  rotation: 90,
                  proceduralId: pId,
                  levelId: hostFloor.levelId
                });
                newFurniture.push({
                  id: crypto.randomUUID(),
                  type: 'furniture',
                  subType: 'bedside',
                  label: 'Bedside',
                  pos: { x: cx - rw / 2 + bedsideD / 2, y: cy + bedWidth / 2 + bedsideW / 2 },
                  width: bedsideW,
                  depth: bedsideD,
                  rotation: 90,
                  proceduralId: pId,
                  levelId: hostFloor.levelId
                });
              }

              const wardW = Math.min(rd * 0.6, 1.8);
              const wardD = 0.6;
              if (rw >= bedDepth + wardD + 0.6) {
                newFurniture.push({
                  id: crypto.randomUUID(),
                  type: 'furniture',
                  subType: 'wardrobe',
                  label: 'Wardrobe',
                  pos: { x: cx + rw / 2 - wardD / 2, y: cy },
                  width: wardW,
                  depth: wardD,
                  rotation: 270,
                  proceduralId: pId,
                  levelId: hostFloor.levelId
                });
              }
            }
          }
          break;
        }

        case 'living': {
          const sofaW = Math.min(rw * 0.7, 2.1);
          const sofaD = 0.9;
          const tvW = Math.min(rw * 0.5, 1.6);
          const tvD = 0.4;

          if (rw > rd) {
            if (rd >= sofaD + tvD + 1.2) {
              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: 'sofa',
                label: 'Sofa 3-Seater',
                pos: { x: cx, y: cy - rd / 2 + sofaD / 2 + 0.2 },
                width: sofaW,
                depth: sofaD,
                rotation: 180,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });

              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: 'coffee',
                label: 'Coffee Table',
                pos: { x: cx, y: cy },
                width: 0.9,
                depth: 0.6,
                rotation: 0,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });

              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: 'tv_console',
                label: 'TV console',
                pos: { x: cx, y: cy + rd / 2 - tvD / 2 - 0.2 },
                width: tvW,
                depth: tvD,
                rotation: 0,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });
            }
          } else {
            if (rw >= sofaD + tvD + 1.2) {
              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: 'sofa',
                label: 'Sofa 3-Seater',
                pos: { x: cx - rw / 2 + sofaD / 2 + 0.2, y: cy },
                width: sofaW,
                depth: sofaD,
                rotation: 90,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });

              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: 'coffee',
                label: 'Coffee Table',
                pos: { x: cx, y: cy },
                width: 0.9,
                depth: 0.6,
                rotation: 90,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });

              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: 'tv_console',
                label: 'TV console',
                pos: { x: cx + rw / 2 - tvD / 2 - 0.2, y: cy },
                width: tvW,
                depth: tvD,
                rotation: 270,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });
            }
          }
          break;
        }

        case 'kitchen': {
          const cntrW = Math.min(rw - 0.4, 3.2);
          const cntrD = 0.6;

          if (rw > rd) {
            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'counter',
              subType: 'standard',
              label: 'Kitchen Counter',
              pos: { x: cx, y: cy - rd / 2 + cntrD / 2 },
              width: cntrW,
              depth: cntrD,
              rotation: 180,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });

            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'fixture',
              subType: 'sink',
              label: 'Kitchen Sink',
              pos: { x: cx - cntrW * 0.25, y: cy - rd / 2 + cntrD / 2 },
              width: 0.8,
              depth: 0.5,
              rotation: 180,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });

            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'fixture',
              subType: 'stove',
              label: 'Kitchen Stove',
              pos: { x: cx + cntrW * 0.25, y: cy - rd / 2 + cntrD / 2 },
              width: 0.75,
              depth: 0.6,
              rotation: 180,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });

            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'fixture',
              subType: 'fridge',
              label: 'Refrigerator',
              pos: { x: cx - rw / 2 + 0.4, y: cy + rd / 2 - 0.4 },
              width: 0.8,
              depth: 0.75,
              rotation: 0,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });
          } else {
            const counterH = Math.min(rd - 0.4, 3.2);
            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'counter',
              subType: 'standard',
              label: 'Kitchen Counter',
              pos: { x: cx - rw / 2 + cntrD / 2, y: cy },
              width: counterH,
              depth: cntrD,
              rotation: 90,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });

            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'fixture',
              subType: 'sink',
              label: 'Kitchen Sink',
              pos: { x: cx - rw / 2 + cntrD / 2, y: cy - counterH * 0.25 },
              width: 0.8,
              depth: 0.5,
              rotation: 90,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });

            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'fixture',
              subType: 'stove',
              label: 'Kitchen Stove',
              pos: { x: cx - rw / 2 + cntrD / 2, y: cy + counterH * 0.25 },
              width: 0.75,
              depth: 0.6,
              rotation: 90,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });

            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'fixture',
              subType: 'fridge',
              label: 'Refrigerator',
              pos: { x: cx + rw / 2 - 0.4, y: cy - rd / 2 + 0.45 },
              width: 0.8,
              depth: 0.75,
              rotation: 180,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });
          }
          break;
        }

        case 'bathroom': {
          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'fixture',
            subType: 'wc',
            label: 'Toilet (WC)',
            pos: { x: cx - rw / 2 + 0.35, y: cy - rd / 2 + 0.45 },
            width: 0.5,
            depth: 0.7,
            rotation: 180,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });

          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'fixture',
            subType: 'basin',
            label: 'Wash Basin',
            pos: { x: cx - rw / 2 + 0.95, y: cy - rd / 2 + 0.35 },
            width: 0.6,
            depth: 0.5,
            rotation: 180,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });

          const useTub = rw * rd > 4.5;
          if (useTub) {
            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'fixture',
              subType: 'bath',
              label: 'Bath Tub',
              pos: { x: cx + rw / 2 - 0.9, y: cy + rd / 2 - 0.5 },
              width: 1.7,
              depth: 0.8,
              rotation: 0,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });
          } else {
            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'fixture',
              subType: 'shower',
              label: 'Shower',
              pos: { x: cx + rw / 2 - 0.55, y: cy + rd / 2 - 0.55 },
              width: 0.9,
              depth: 0.9,
              rotation: 0,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });
          }
          break;
        }

        case 'dining': {
          const isLarge = rw * rd > 12;
          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: isLarge ? 'table_6' : 'table_4',
            label: isLarge ? 'Dining Table (6)' : 'Dining Table (4)',
            pos: { x: cx, y: cy },
            width: isLarge ? 1.8 : 1.2,
            depth: isLarge ? 1.0 : 1.2,
            rotation: (rw < rd) ? 90 : 0,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });
          break;
        }

        case 'meeting': {
          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: 'conference',
            label: 'Conference Table',
            pos: { x: cx, y: cy },
            width: 2.8,
            depth: 1.2,
            rotation: (rw < rd) ? 90 : 0,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });
          break;
        }

        case 'office': {
          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: 'desk',
            label: 'Office Desk',
            pos: { x: cx, y: cy - 0.1 },
            width: 1.2,
            depth: 0.6,
            rotation: 180,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });

          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: 'office_chair',
            label: 'Office Chair',
            pos: { x: cx, y: cy + 0.45 },
            width: 0.6,
            depth: 0.6,
            rotation: 0,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });

          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: 'filing',
            label: 'Filing Cabinet',
            pos: { x: cx - rw / 2 + 0.45, y: cy + rd / 2 - 0.35 },
            width: 0.8,
            depth: 0.5,
            rotation: 0,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });
          break;
        }

        case 'reception': {
          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: 'reception',
            label: 'Reception Counter',
            pos: { x: cx, y: cy - rd / 4 },
            width: 1.8,
            depth: 0.7,
            rotation: 180,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });

          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: 'sofa',
            label: 'Sofa 2-Seater',
            pos: { x: cx, y: cy + rd / 4 },
            width: 1.5,
            depth: 0.9,
            rotation: 0,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });
          break;
        }

        case 'cafe': {
          const cols = Math.max(1, Math.floor(rw / 1.6));
          const rows = Math.max(1, Math.floor(rd / 1.6));
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              const x = cx - (cols - 1) * 0.8 + c * 1.6;
              const y = cy - (rows - 1) * 0.8 + r * 1.6;
              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: 'table_cafe',
                label: 'Cafe Table',
                pos: { x, y },
                width: 0.7,
                depth: 0.7,
                rotation: 0,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });
            }
          }
          break;
        }

        case 'healthcare': {
          const bedSpacing = 1.6;
          const bedCount = Math.max(1, Math.floor(rw / bedSpacing));
          for (let i = 0; i < bedCount; i++) {
            const x = cx - (bedCount - 1) * 0.8 + i * bedSpacing;
            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'furniture',
              subType: 'hospital_bed',
              label: 'Hospital Bed',
              pos: { x, y: cy - rd / 2 + 1.15 },
              width: 1.0,
              depth: 2.1,
              rotation: 180,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });
          }
          break;
        }

        case 'education': {
          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: 'whiteboard',
            label: 'Whiteboard',
            pos: { x: cx, y: cy - rd / 2 + 0.1 },
            width: 1.8,
            depth: 0.1,
            rotation: 180,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });

          newFurniture.push({
            id: crypto.randomUUID(),
            type: 'furniture',
            subType: 'desk',
            label: 'Teacher Desk',
            pos: { x: cx, y: cy - rd / 4 },
            width: 1.2,
            depth: 0.6,
            rotation: 0,
            proceduralId: pId,
            levelId: hostFloor.levelId
          });

          const deskCols = 2;
          const deskRows = Math.max(1, Math.floor((rd * 0.6) / 1.2));
          for (let r = 0; r < deskRows; r++) {
            for (let c = 0; c < deskCols; c++) {
              const x = cx - 0.8 + c * 1.6;
              const y = cy + r * 1.2;
              newFurniture.push({
                id: crypto.randomUUID(),
                type: 'furniture',
                subType: 'desk',
                label: 'Student Desk',
                pos: { x, y },
                width: 1.2,
                depth: 0.6,
                rotation: 0,
                proceduralId: pId,
                levelId: hostFloor.levelId
              });
            }
          }
          break;
        }

        case 'industrial': {
          const rackCols = Math.max(1, Math.floor(rw / 1.5));
          for (let i = 0; i < rackCols; i++) {
            const x = cx - (rackCols - 1) * 0.75 + i * 1.5;
            newFurniture.push({
              id: crypto.randomUUID(),
              type: 'furniture',
              subType: 'shelf',
              label: 'Rack',
              pos: { x, y: cy },
              width: 1.2,
              depth: 0.45,
              rotation: 90,
              proceduralId: pId,
              levelId: hostFloor.levelId
            });
          }
          break;
        }

        default:
          break;
      }
    });

    return newFurniture;
  }
}
