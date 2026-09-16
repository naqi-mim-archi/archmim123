import { ArchElement, Point, ElementType, LayoutTypology, LayoutGeometry, SpatialZone, SpatialProgram, PlanningStyle, GeometryStyle } from '../types';

const SQFT_TO_M2 = 0.092903;

/**
 * Procedural Area Requirements (converted from sqft to m2)
 * min = hard limit, target = soft comfort, max = luxury limit
 */
const AREA_SPECS: Record<string, { minAreaM2: number, targetAreaM2: number, maxAreaM2: number }> = {
  // Residential (Core)
  'res.living': { minAreaM2: 15.0, targetAreaM2: 24.0, maxAreaM2: 45.0 },
  'res.living-large': { minAreaM2: 30.0, targetAreaM2: 45.0, maxAreaM2: 80.0 },
  'res.living-suite': { minAreaM2: 40.0, targetAreaM2: 60.0, maxAreaM2: 120.0 },
  'res.dining': { minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0 },
  'res.kitchen': { minAreaM2: 6.0, targetAreaM2: 9.0, maxAreaM2: 15.0 },
  'res.kitchen-large': { minAreaM2: 12.0, targetAreaM2: 18.0, maxAreaM2: 30.0 },
  'res.kitchenette': { minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0 },
  
  // Residential (Sleeping)
  'res.bedroom-master': { minAreaM2: 14.0, targetAreaM2: 18.0, maxAreaM2: 30.0 },
  'res.bedroom': { minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0 },
  'res.bedroom-small': { minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0 },
  
  // Residential (Support)
  'res.bathroom': { minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0 },
  'res.ensuite': { minAreaM2: 4.5, targetAreaM2: 6.5, maxAreaM2: 10.0 },
  'res.powder': { minAreaM2: 2.0, targetAreaM2: 3.0, maxAreaM2: 4.5 },
  'res.entry': { minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0 },
  'res.foyer': { minAreaM2: 5.0, targetAreaM2: 10.0, maxAreaM2: 20.0 },
  'res.utility': { minAreaM2: 3.0, targetAreaM2: 5.0, maxAreaM2: 10.0 },
  'res.store': { minAreaM2: 2.0, targetAreaM2: 4.0, maxAreaM2: 8.0 },
  'res.laundry': { minAreaM2: 2.5, targetAreaM2: 4.0, maxAreaM2: 6.0 },
  'res.closet': { minAreaM2: 2.5, targetAreaM2: 5.0, maxAreaM2: 10.0 },
  
  // Residential (Auxiliary)
  'res.study': { minAreaM2: 9.0, targetAreaM2: 13.0, maxAreaM2: 20.0 },
  'res.family-lounge': { minAreaM2: 15.0, targetAreaM2: 22.0, maxAreaM2: 40.0 },
  'res.maid': { minAreaM2: 6.0, targetAreaM2: 8.5, maxAreaM2: 12.0 },
  'res.driver': { minAreaM2: 6.0, targetAreaM2: 8.5, maxAreaM2: 12.0 },
  'res.garage': { minAreaM2: 18.0, targetAreaM2: 22.0, maxAreaM2: 45.0 },
  'res.gym': { minAreaM2: 15.0, targetAreaM2: 25.0, maxAreaM2: 50.0 },
  'res.cinema': { minAreaM2: 20.0, targetAreaM2: 35.0, maxAreaM2: 60.0 },
  
  // Residential (Outdoor)
  'res.balcony': { minAreaM2: 3.0, targetAreaM2: 6.0, maxAreaM2: 15.0 },
  'res.terrace': { minAreaM2: 15.0, targetAreaM2: 30.0, maxAreaM2: 100.0 },
  'res.veranda': { minAreaM2: 8.0, targetAreaM2: 15.0, maxAreaM2: 30.0 },
  'res.patio': { minAreaM2: 10.0, targetAreaM2: 20.0, maxAreaM2: 50.0 },
  'res.pool-deck': { minAreaM2: 20.0, targetAreaM2: 40.0, maxAreaM2: 100.0 },
  'ext.lawn': { minAreaM2: 20.0, targetAreaM2: 80.0, maxAreaM2: 500.0 },
  'ext.yard': { minAreaM2: 10.0, targetAreaM2: 30.0, maxAreaM2: 100.0 },
  'ext.courtyard': { minAreaM2: 12.0, targetAreaM2: 25.0, maxAreaM2: 80.0 },

  // Office
  'off.reception': { minAreaM2: 120 * SQFT_TO_M2, targetAreaM2: 260 * SQFT_TO_M2, maxAreaM2: 400 * SQFT_TO_M2 },
  'off.waiting': { minAreaM2: 80 * SQFT_TO_M2, targetAreaM2: 190 * SQFT_TO_M2, maxAreaM2: 300 * SQFT_TO_M2 },
  'off.workspace': { minAreaM2: 300 * SQFT_TO_M2, targetAreaM2: 1500 * SQFT_TO_M2, maxAreaM2: 5000 * SQFT_TO_M2 },
  'off.workstation': { minAreaM2: 45 * SQFT_TO_M2, targetAreaM2: 72 * SQFT_TO_M2, maxAreaM2: 100 * SQFT_TO_M2 },
  'off.exec-office': { minAreaM2: 120 * SQFT_TO_M2, targetAreaM2: 185 * SQFT_TO_M2, maxAreaM2: 250 * SQFT_TO_M2 },
  'off.private-office': { minAreaM2: 90 * SQFT_TO_M2, targetAreaM2: 135 * SQFT_TO_M2, maxAreaM2: 180 * SQFT_TO_M2 },
  'off.meeting-sm': { minAreaM2: 100 * SQFT_TO_M2, targetAreaM2: 125 * SQFT_TO_M2, maxAreaM2: 150 * SQFT_TO_M2 },
  'off.meeting-md': { minAreaM2: 150 * SQFT_TO_M2, targetAreaM2: 225 * SQFT_TO_M2, maxAreaM2: 300 * SQFT_TO_M2 },
  'off.boardroom': { minAreaM2: 250 * SQFT_TO_M2, targetAreaM2: 425 * SQFT_TO_M2, maxAreaM2: 600 * SQFT_TO_M2 },
  'off.pantry': { minAreaM2: 100 * SQFT_TO_M2, targetAreaM2: 250 * SQFT_TO_M2, maxAreaM2: 400 * SQFT_TO_M2 },
  
  // Retail / F&B
  'ret.sales': { minAreaM2: 300 * SQFT_TO_M2, targetAreaM2: 2000 * SQFT_TO_M2, maxAreaM2: 10000 * SQFT_TO_M2 },
  'fb.dining': { minAreaM2: 400 * SQFT_TO_M2, targetAreaM2: 2000 * SQFT_TO_M2, maxAreaM2: 5000 * SQFT_TO_M2 },
  'fb.kitchen': { minAreaM2: 150 * SQFT_TO_M2, targetAreaM2: 1000 * SQFT_TO_M2, maxAreaM2: 2000 * SQFT_TO_M2 },
  
  // Healthcare
  'hc.reception': { minAreaM2: 100 * SQFT_TO_M2, targetAreaM2: 200 * SQFT_TO_M2, maxAreaM2: 300 * SQFT_TO_M2 },
  'hc.consultation': { minAreaM2: 100 * SQFT_TO_M2, targetAreaM2: 140 * SQFT_TO_M2, maxAreaM2: 180 * SQFT_TO_M2 },
  'hc.exam': { minAreaM2: 100 * SQFT_TO_M2, targetAreaM2: 140 * SQFT_TO_M2, maxAreaM2: 180 * SQFT_TO_M2 },

  // Large Areas (Halls/Warehouses)
  'edu.classroom': { minAreaM2: 400 * SQFT_TO_M2, targetAreaM2: 650 * SQFT_TO_M2, maxAreaM2: 900 * SQFT_TO_M2 },
  'ind.warehouse': { minAreaM2: 1000 * SQFT_TO_M2, targetAreaM2: 5000 * SQFT_TO_M2, maxAreaM2: 100000 * SQFT_TO_M2 },
};


/**
 * Procedural Knowledge Base for diverse typologies
 */
export const SPATIAL_PROGRAMS: Record<string, SpatialProgram> = {
  'domestic-studio': {
    id: 'domestic-studio',
    name: 'Studio Apartment',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Entry', zone: 'public', weight: 0.1, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f8fafc' },
      { id: 'res.living', type: 'living', label: 'Living/Sleeping', zone: 'public', weight: 1.0, minAreaM2: 15.0, targetAreaM2: 35.0, maxAreaM2: 45.0, minWidthM: 3.8, daylight: 'required', exteriorContact: 'required', adjacency: [{ to: 'res.entry', kind: 'must_touch', weight: 1.0 }], color: '#fef3c7' },
      { id: 'res.kitchenette', type: 'kitchen', label: 'Kitchenette', zone: 'service', weight: 0.3, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.bath', type: 'bath', label: 'Bathroom', zone: 'service', weight: 0.4, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'res.balcony', type: 'balcony', label: 'Balcony', zone: 'public', weight: 0.2, minAreaM2: 3.0, targetAreaM2: 6.0, maxAreaM2: 15.0, color: '#f0fdf4' }
    ]
  },
  'domestic-1br': {
    id: 'domestic-1br',
    name: '1 Bedroom Apartment',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Entry', zone: 'public', weight: 0.15, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f8fafc' },
      { id: 'res.living', type: 'living', label: 'Living Room', zone: 'public', weight: 1.0, minAreaM2: 15.0, targetAreaM2: 24.0, maxAreaM2: 45.0, minWidthM: 3.5, daylight: 'required', exteriorContact: 'required', adjacency: [{ to: 'res.entry', kind: 'must_touch', weight: 1.0 }, { to: 'res.dining', kind: 'must_touch', weight: 0.8 }], color: '#fef3c7' },
      { id: 'res.dining', type: 'dining', label: 'Dining Area', zone: 'public', weight: 0.5, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.kitchen', type: 'kitchen', label: 'Kitchen', zone: 'service', weight: 0.6, minAreaM2: 6.0, targetAreaM2: 9.0, maxAreaM2: 15.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.bedroom', type: 'bedroom', label: 'Master Bedroom', zone: 'private', weight: 0.8, minAreaM2: 14.0, targetAreaM2: 18.0, maxAreaM2: 30.0, minWidthM: 3.2, daylight: 'required', exteriorContact: 'required', adjacency: [{ to: 'res.living', kind: 'near', weight: 0.5 }], color: '#e0f2fe' },
      { id: 'res.bath', type: 'bath', label: 'Bathroom', zone: 'service', weight: 0.4, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'res.balcony', type: 'balcony', label: 'Balcony', zone: 'public', weight: 0.2, minAreaM2: 3.0, targetAreaM2: 6.0, maxAreaM2: 15.0, color: '#f0fdf4' }
    ]
  },
  'domestic-standard': {
    id: 'domestic-standard',
    name: '2 Bedroom Apartment',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Entry', zone: 'public', weight: 0.2, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f8fafc' },
      { id: 'res.living', type: 'living', label: 'Living Room', zone: 'public', weight: 1.0, minAreaM2: 15.0, targetAreaM2: 24.0, maxAreaM2: 45.0, minWidthM: 4.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.dining', type: 'dining', label: 'Dining', zone: 'public', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.kitchen', type: 'kitchen', label: 'Kitchen', zone: 'service', weight: 0.7, minAreaM2: 6.0, targetAreaM2: 9.0, maxAreaM2: 15.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.master', type: 'bedroom', label: 'Master Bedroom', zone: 'private', weight: 0.9, minAreaM2: 14.0, targetAreaM2: 18.0, maxAreaM2: 30.0, minWidthM: 3.5, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-2', type: 'bedroom', label: 'Bedroom 2', zone: 'private', weight: 0.7, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, minWidthM: 3.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bath', type: 'bath', label: 'Common Bath', zone: 'service', weight: 0.4, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'res.ensuite', type: 'bath', label: 'Ensuite', zone: 'service', weight: 0.3, minAreaM2: 4.5, targetAreaM2: 6.5, maxAreaM2: 10.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.balcony', type: 'balcony', label: 'Balcony', zone: 'public', weight: 0.2, minAreaM2: 3.0, targetAreaM2: 6.0, maxAreaM2: 15.0, color: '#f0fdf4' }
    ]
  },
  'domestic-3br': {
    id: 'domestic-3br',
    name: '3 Bedroom Apartment',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Entry', zone: 'public', weight: 0.2, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f8fafc' },
      { id: 'res.living', type: 'living', label: 'Living Room', zone: 'public', weight: 1.0, minAreaM2: 30.0, targetAreaM2: 45.0, maxAreaM2: 80.0, minWidthM: 4.2, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.dining', type: 'dining', label: 'Dining Area', zone: 'public', weight: 0.7, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.kitchen', type: 'kitchen', label: 'Kitchen', zone: 'service', weight: 0.8, minAreaM2: 6.0, targetAreaM2: 9.0, maxAreaM2: 15.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.master', type: 'bedroom', label: 'Master Bedroom', zone: 'private', weight: 0.9, minAreaM2: 14.0, targetAreaM2: 18.0, maxAreaM2: 30.0, minWidthM: 3.6, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-2', type: 'bedroom', label: 'Bedroom 2', zone: 'private', weight: 0.7, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-3', type: 'bedroom', label: 'Third Bedroom', zone: 'private', weight: 0.7, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bath', type: 'bath', label: 'Common Bath', zone: 'service', weight: 0.5, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'res.ensuite', type: 'bath', label: 'Ensuite', zone: 'service', weight: 0.3, minAreaM2: 4.5, targetAreaM2: 6.5, maxAreaM2: 10.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.utility', type: 'laundry', label: 'Utility', zone: 'service', weight: 0.2, minAreaM2: 3.0, targetAreaM2: 5.0, maxAreaM2: 10.0, color: '#f8fafc' },
      { id: 'res.balcony', type: 'balcony', label: 'Main Balcony', zone: 'public', weight: 0.3, minAreaM2: 3.0, targetAreaM2: 6.0, maxAreaM2: 15.0, color: '#f0fdf4' }
    ]
  },
  'domestic-4br': {
    id: 'domestic-4br',
    name: '4 Bedroom Apartment',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Entry Foyer', zone: 'public', weight: 0.3, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f8fafc' },
      { id: 'res.living', type: 'living', label: 'Grand Living', zone: 'public', weight: 1.2, minAreaM2: 30.0, targetAreaM2: 45.0, maxAreaM2: 80.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.dining', type: 'dining', label: 'Formal Dining', zone: 'public', weight: 0.8, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.family', type: 'living', label: 'Family Lounge', zone: 'core', weight: 0.7, minAreaM2: 15.0, targetAreaM2: 22.0, maxAreaM2: 40.0, daylight: 'required', exteriorContact: 'required', color: '#fffbeb' },
      { id: 'res.kitchen', type: 'kitchen', label: 'Large Kitchen', zone: 'service', weight: 0.9, minAreaM2: 12.0, targetAreaM2: 18.0, maxAreaM2: 30.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.master', type: 'bedroom', label: 'Master Suite', zone: 'private', weight: 1.0, minAreaM2: 14.0, targetAreaM2: 18.0, maxAreaM2: 30.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-2', type: 'bedroom', label: 'Bedroom 2', zone: 'private', weight: 0.7, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-3', type: 'bedroom', label: 'Bedroom 3', zone: 'private', weight: 0.7, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-4', type: 'bedroom', label: 'Bedroom 4', zone: 'private', weight: 0.7, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.powder', type: 'bath', label: 'Powder Room', zone: 'service', weight: 0.2, minAreaM2: 2.0, targetAreaM2: 3.0, maxAreaM2: 4.5, wetCore: true, color: '#f1f5f9' },
      { id: 'res.bath-shared', type: 'bath', label: 'Shared Bath', zone: 'service', weight: 0.4, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'res.ensuite-1', type: 'bath', label: 'Ensuite 1', zone: 'service', weight: 0.3, minAreaM2: 4.5, targetAreaM2: 6.5, maxAreaM2: 10.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.ensuite-2', type: 'bath', label: 'Ensuite 2', zone: 'service', weight: 0.3, minAreaM2: 4.5, targetAreaM2: 6.5, maxAreaM2: 10.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.utility', type: 'laundry', label: 'Utility/Service', zone: 'service', weight: 0.3, minAreaM2: 3.0, targetAreaM2: 5.0, maxAreaM2: 10.0, color: '#f8fafc' },
      { id: 'res.terrace', type: 'balcony', label: 'Private Terrace', zone: 'public', weight: 0.5, minAreaM2: 15.0, targetAreaM2: 30.0, maxAreaM2: 100.0, color: '#f0fdf4' }
    ]
  },
  'domestic-duplex': {
    id: 'domestic-duplex',
    name: 'Duplex Penthouse',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Reception Hall', zone: 'public', weight: 0.4, minAreaM2: 5.0, targetAreaM2: 10.0, maxAreaM2: 20.0, color: '#f1f5f9' },
      { id: 'res.living', type: 'living', label: 'Double Height Living', zone: 'public', weight: 1.5, minAreaM2: 40.0, targetAreaM2: 60.0, maxAreaM2: 120.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.formal-dining', type: 'dining', label: 'Formal Dining', zone: 'public', weight: 0.9, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.family-den', type: 'living', label: 'Family Den', zone: 'core', weight: 0.8, minAreaM2: 15.0, targetAreaM2: 22.0, maxAreaM2: 40.0, daylight: 'required', exteriorContact: 'required', color: '#fffbeb' },
      { id: 'res.kitchen', type: 'kitchen', label: 'Gourmet Kitchen', zone: 'service', weight: 1.0, minAreaM2: 12.0, targetAreaM2: 18.0, maxAreaM2: 30.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.master-level1', type: 'bedroom', label: 'Grand Master Suite', zone: 'private', weight: 1.4, minAreaM2: 40.0, targetAreaM2: 60.0, maxAreaM2: 120.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-upper1', type: 'bedroom', label: 'Upper Bedroom 1', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-upper2', type: 'bedroom', label: 'Upper Bedroom 2', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.study-library', type: 'office', label: 'Study / Library', zone: 'private', weight: 0.6, minAreaM2: 9.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#f0fdf4' },
      { id: 'res.gym', type: 'room', label: 'Private Gym', zone: 'service', weight: 0.5, minAreaM2: 15.0, targetAreaM2: 25.0, maxAreaM2: 50.0, color: '#f0f9ff' },
      { id: 'res.roof-pool', type: 'balcony', label: 'Rooftop Pool & Deck', zone: 'public', weight: 1.8, minAreaM2: 20.0, targetAreaM2: 40.0, maxAreaM2: 100.0, color: '#f0fdf4' }
    ]
  },
  'house-single': {
    id: 'house-single',
    name: 'Single Story House',
    zones: [
      { id: 'res.foyer', type: 'entry', label: 'Entrance Foyer', zone: 'public', weight: 0.3, minAreaM2: 5.0, targetAreaM2: 10.0, maxAreaM2: 20.0, color: '#f1f5f9' },
      { id: 'res.living', type: 'living', label: 'Great Room', zone: 'public', weight: 1.2, minAreaM2: 30.0, targetAreaM2: 45.0, maxAreaM2: 80.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.dining', type: 'dining', label: 'Dining Area', zone: 'public', weight: 0.8, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.kitchen', type: 'kitchen', label: 'Kitchen', zone: 'service', weight: 0.8, minAreaM2: 12.0, targetAreaM2: 18.0, maxAreaM2: 30.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.master', type: 'bedroom', label: 'Master Bedroom', zone: 'private', weight: 1.0, minAreaM2: 14.0, targetAreaM2: 18.0, maxAreaM2: 30.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-2', type: 'bedroom', label: 'Bedroom 2', zone: 'private', weight: 0.7, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bath', type: 'bath', label: 'Garden Bath', zone: 'service', weight: 0.5, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'ext.lawn', type: 'garden', label: 'Backyard Garden', zone: 'public', weight: 1.2, minAreaM2: 20.0, targetAreaM2: 80.0, maxAreaM2: 500.0, exteriorContact: 'required', color: '#f0fdf4' }
    ]
  },
  'house-villa': {
    id: 'house-villa',
    name: 'Exclusive Villa',
    zones: [
      { id: 'res.foyer', type: 'entry', label: 'Main Entrance', zone: 'public', weight: 0.5, minAreaM2: 5.0, targetAreaM2: 10.0, maxAreaM2: 20.0, color: '#f1f5f9' },
      { id: 'res.formal-living', type: 'living', label: 'Reception Hall', zone: 'public', weight: 1.2, minAreaM2: 30.0, targetAreaM2: 45.0, maxAreaM2: 80.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.family-lounge', type: 'living', label: 'Private Family Area', zone: 'core', weight: 0.9, minAreaM2: 15.0, targetAreaM2: 22.0, maxAreaM2: 40.0, daylight: 'required', exteriorContact: 'required', color: '#fffbeb' },
      { id: 'res.formal-dining', type: 'dining', label: 'Double Dining Room', zone: 'public', weight: 0.9, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.kitchen', type: 'kitchen', label: 'Chef Kitchen', zone: 'service', weight: 1.0, minAreaM2: 12.0, targetAreaM2: 18.0, maxAreaM2: 30.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.master-suite', type: 'bedroom', label: 'Master Suite', zone: 'private', weight: 1.3, minAreaM2: 40.0, targetAreaM2: 60.0, maxAreaM2: 120.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-2', type: 'bedroom', label: 'Guest Room 1', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-3', type: 'bedroom', label: 'Guest Room 2', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.study', type: 'office', label: 'Study / Office', zone: 'private', weight: 0.5, minAreaM2: 9.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#f0fdf4' },
      { id: 'res.powder', type: 'bath', label: 'Powder Room', zone: 'service', weight: 0.3, minAreaM2: 2.0, targetAreaM2: 3.0, maxAreaM2: 4.5, wetCore: true, color: '#f1f5f9' },
      { id: 'res.ensuite-1', type: 'bath', label: 'Ensuite 1', zone: 'service', weight: 0.4, minAreaM2: 4.5, targetAreaM2: 6.5, maxAreaM2: 10.0, wetCore: true, color: '#f0f9ff' },
      { id: 'res.utility', type: 'laundry', label: 'Laundry/Service', zone: 'service', weight: 0.4, minAreaM2: 3.0, targetAreaM2: 5.0, maxAreaM2: 10.0, color: '#f8fafc' },
      { id: 'ext.lawn', type: 'garden', label: 'Manicured Lawn & Pool', zone: 'public', weight: 2.5, minAreaM2: 20.0, targetAreaM2: 80.0, maxAreaM2: 500.0, color: '#f0fdf4' }
    ]
  },
  'house-row': {
    id: 'house-row',
    name: 'Row House',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Porch', zone: 'public', weight: 0.2, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f1f5f9' },
      { id: 'res.living', type: 'living', label: 'Open Living', zone: 'public', weight: 1.0, minAreaM2: 30.0, targetAreaM2: 45.0, maxAreaM2: 80.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.dining', type: 'dining', label: 'Dining Area', zone: 'public', weight: 0.7, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.kitchen', type: 'kitchen', label: 'Kitchen', zone: 'service', weight: 0.8, minAreaM2: 6.0, targetAreaM2: 9.0, maxAreaM2: 15.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.master', type: 'bedroom', label: 'Master Bedroom', zone: 'private', weight: 1.0, minAreaM2: 14.0, targetAreaM2: 18.0, maxAreaM2: 30.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-2', type: 'bedroom', label: 'Rear Bedroom', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bath', type: 'bath', label: 'Shared Bathroom', zone: 'service', weight: 0.5, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'ext.yard', type: 'garden', label: 'Compact Backyard', zone: 'public', weight: 0.6, minAreaM2: 10.0, targetAreaM2: 30.0, maxAreaM2: 100.0, color: '#f0fdf4' }
    ]
  },
  'house-farmhouse': {
    id: 'house-farmhouse',
    name: 'Country Farmhouse',
    zones: [
      { id: 'res.veranda', type: 'balcony', label: 'Wraparound Veranda', zone: 'public', weight: 1.2, minAreaM2: 8.0, targetAreaM2: 15.0, maxAreaM2: 30.0, color: '#f0fdf4' },
      { id: 'res.living', type: 'living', label: 'Vaulted Living', zone: 'public', weight: 1.5, minAreaM2: 30.0, targetAreaM2: 45.0, maxAreaM2: 80.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.farm-kitchen', type: 'kitchen', label: 'Farm Kitchen & Dining', zone: 'service', weight: 1.5, minAreaM2: 12.0, targetAreaM2: 18.0, maxAreaM2: 30.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.master-wing', type: 'bedroom', label: 'Master Wing', zone: 'private', weight: 1.2, minAreaM2: 14.0, targetAreaM2: 18.0, maxAreaM2: 30.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.guest-1', type: 'bedroom', label: 'Guest Room 1', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.guest-2', type: 'bedroom', label: 'Guest Room 2', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.mudroom', type: 'entry', label: 'Mudroom', zone: 'service', weight: 0.4, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f1f5f9' },
      { id: 'ext.estate', type: 'garden', label: 'Open Estate Grounds', zone: 'public', weight: 3.0, minAreaM2: 20.0, targetAreaM2: 80.0, maxAreaM2: 500.0, color: '#f0fdf4' }
    ]
  },
  'res-coliving': {
    id: 'res-coliving',
    name: 'Co-Living Collective',
    zones: [
      { id: 'res.hub', type: 'living', label: 'Community Hub', zone: 'public', weight: 1.5, minAreaM2: 30.0, targetAreaM2: 45.0, maxAreaM2: 80.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.shared-chef', type: 'kitchen', label: 'Professional Shared Kitchen', zone: 'service', weight: 1.2, minAreaM2: 12.0, targetAreaM2: 18.0, maxAreaM2: 30.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.group-dining', type: 'dining', label: 'Communal Dining', zone: 'public', weight: 1.0, minAreaM2: 8.0, targetAreaM2: 12.0, maxAreaM2: 20.0, color: '#fffbeb' },
      { id: 'res.pod-unit-1', type: 'bedroom', label: 'Private Pod 1', zone: 'private', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.pod-unit-2', type: 'bedroom', label: 'Private Pod 2', zone: 'private', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.pod-unit-3', type: 'bedroom', label: 'Private Pod 3', zone: 'private', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.pod-unit-4', type: 'bedroom', label: 'Private Pod 4', zone: 'private', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.zen-garden', type: 'garden', label: 'Shared Zen Courtyard', zone: 'public', weight: 1.0, minAreaM2: 12.0, targetAreaM2: 25.0, maxAreaM2: 80.0, color: '#f0fdf4' }
    ]
  },
  'res-student': {
    id: 'res-student',
    name: 'Student Housing',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Entry Lobby', zone: 'public', weight: 0.3, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f8fafc' },
      { id: 'res.lounge', type: 'living', label: 'Common Study Lounge', zone: 'public', weight: 1.2, minAreaM2: 15.0, targetAreaM2: 22.0, maxAreaM2: 40.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.kitchenette', type: 'kitchen', label: 'Shared Kitchenette', zone: 'service', weight: 0.5, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f1f5f9' },
      { id: 'res.pod-1', type: 'bedroom', label: 'Student Pod 1', zone: 'private', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.pod-2', type: 'bedroom', label: 'Student Pod 2', zone: 'private', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.pod-3', type: 'bedroom', label: 'Student Pod 3', zone: 'private', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.pod-4', type: 'bedroom', label: 'Student Pod 4', zone: 'private', weight: 0.6, minAreaM2: 8.0, targetAreaM2: 10.5, maxAreaM2: 14.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bath-shared', type: 'bath', label: 'Shared Bath Block', zone: 'service', weight: 0.6, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' }
    ]
  },
  'res-senior': {
    id: 'res-senior',
    name: 'Senior Living Complex',
    zones: [
      { id: 'res.entry', type: 'entry', label: 'Accessible Entrance', zone: 'public', weight: 0.3, minAreaM2: 2.5, targetAreaM2: 4.5, maxAreaM2: 8.0, color: '#f8fafc' },
      { id: 'res.lounge', type: 'living', label: 'Shared Common Lounge', zone: 'public', weight: 1.2, minAreaM2: 15.0, targetAreaM2: 22.0, maxAreaM2: 40.0, daylight: 'required', exteriorContact: 'required', color: '#fef3c7' },
      { id: 'res.bedroom-1', type: 'bedroom', label: 'Senior Room 1', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bedroom-2', type: 'bedroom', label: 'Senior Room 2', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 13.0, maxAreaM2: 20.0, daylight: 'required', exteriorContact: 'required', color: '#e0f2fe' },
      { id: 'res.bath-1', type: 'bath', label: 'Accessible Bathroom 1', zone: 'service', weight: 0.5, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'res.bath-2', type: 'bath', label: 'Accessible Bathroom 2', zone: 'service', weight: 0.5, minAreaM2: 3.5, targetAreaM2: 5.0, maxAreaM2: 8.0, wetCore: true, color: '#f0f9ff' },
      { id: 'res.support', type: 'office', label: 'Staff / Care Support', zone: 'service', weight: 0.4, minAreaM2: 9.0, targetAreaM2: 13.0, maxAreaM2: 20.0, color: '#f1f5f9' },
      { id: 'res.garden', type: 'garden', label: 'Sensory Garden', zone: 'public', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 20.0, maxAreaM2: 50.0, color: '#f0fdf4' }
    ]
  },
  'office-corporate': {
    id: 'office-corporate',
    name: 'Corporate HQ',
    zones: [
      { id: 'off.recep', type: 'entry', label: 'Main Lobby / Reception', zone: 'public', weight: 0.4, minAreaM2: 12.0, targetAreaM2: 26.0, maxAreaM2: 40.0, color: '#f3f4f6' },
      { id: 'off.open-plan', type: 'office', label: 'Flexible Workspace', zone: 'public', weight: 1.2, minAreaM2: 30.0, targetAreaM2: 150.0, maxAreaM2: 500.0, daylight: 'required', color: '#e0e7ff' },
      { id: 'off.conference', type: 'meeting', label: 'Boardroom', zone: 'core', weight: 0.6, minAreaM2: 25.0, targetAreaM2: 42.5, maxAreaM2: 60.0, color: '#fef3f2' },
      { id: 'off.huddle-1', type: 'meeting', label: 'Huddle 1', zone: 'core', weight: 0.3, minAreaM2: 10.0, targetAreaM2: 12.5, maxAreaM2: 15.0, color: '#fef3f2' },
      { id: 'off.exec-wing', type: 'office', label: 'Executive Suites', zone: 'private', weight: 0.8, minAreaM2: 40, daylight: 'required', color: '#e0f2fe' },
      { id: 'off.cafe-break', type: 'pantry', label: 'Social Cafe & Pantry', zone: 'service', weight: 0.5, minAreaM2: 10.0, targetAreaM2: 25.0, maxAreaM2: 40.0, color: '#ecfdf5' },
      { id: 'off.it-server', type: 'storage', label: 'IT / Server Hub', zone: 'service', weight: 0.2, minAreaM2: 12, color: '#f8fafc' },
      { id: 'off.wc-block', type: 'bath', label: 'Toilet Block', zone: 'service', weight: 0.4, minAreaM2: 15, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'retail-shop': {
    id: 'retail-shop',
    name: 'Retail Storefront',
    zones: [
      { id: 'ret.branding', type: 'retail', label: 'Display Windows', zone: 'public', weight: 0.3, minAreaM2: 8, daylight: 'required', color: '#fffbeb' },
      { id: 'ret.main-sales', type: 'retail', label: 'Main Sales Floor', zone: 'public', weight: 1.5, minAreaM2: 30.0, targetAreaM2: 200.0, maxAreaM2: 1000.0, daylight: 'required', color: '#fffbeb' },
      { id: 'ret.fitting', type: 'room', label: 'Fitting Rooms', zone: 'core', weight: 0.3, minAreaM2: 10, color: '#f8fafc' },
      { id: 'ret.secure-storage', type: 'storage', label: 'Secure Inventory', zone: 'service', weight: 0.8, minAreaM2: 25, color: '#f8fafc' },
      { id: 'ret.manager-office', type: 'office', label: 'Manager Office', zone: 'service', weight: 0.2, minAreaM2: 8, color: '#f1f5f9' },
      { id: 'ret.staff-wc', type: 'bath', label: 'Staff Comfort', zone: 'service', weight: 0.1, minAreaM2: 4, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'food-restaurant': {
    id: 'food-restaurant',
    name: 'Signature Restaurant',
    zones: [
      { id: 'fb.bar-lounge', type: 'entry', label: 'Bar / Waiting Lounge', zone: 'public', weight: 0.5, minAreaM2: 15, color: '#fffbeb' },
      { id: 'fb.main-dining', type: 'dining', label: 'Principal Dining Floor', zone: 'public', weight: 1.8, minAreaM2: 40.0, targetAreaM2: 200.0, maxAreaM2: 500.0, daylight: 'required', color: '#fef3c7' },
      { id: 'fb.prod-kitchen', type: 'kitchen', label: 'Production Kitchen', zone: 'service', weight: 1.2, minAreaM2: 15.0, targetAreaM2: 100.0, maxAreaM2: 200.0, wetCore: true, color: '#f1f5f9' },
      { id: 'fb.prep-area', type: 'kitchen', label: 'Dry Prep & Cold Storage', zone: 'service', weight: 0.6, minAreaM2: 15, color: '#f8fafc' },
      { id: 'fb.premium-wc', type: 'bath', label: 'Designer Restrooms', zone: 'service', weight: 0.4, minAreaM2: 12, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'healthcare-clinic': {
    id: 'healthcare-clinic',
    name: 'Advanced Healthcare Clinic',
    zones: [
      { id: 'hc.patient-lounge', type: 'waiting', label: 'Patient Reception Lounge', zone: 'public', weight: 0.6, minAreaM2: 10.0, targetAreaM2: 20.0, maxAreaM2: 30.0, color: '#f0f9ff' },
      { id: 'hc.consult-1', type: 'exam', label: 'Consultation Wing A', zone: 'private', weight: 1.0, minAreaM2: 10.0, targetAreaM2: 14.0, maxAreaM2: 18.0, daylight: 'required', color: '#f0fdf4' },
      { id: 'hc.consult-2', type: 'exam', label: 'Consultation Wing B', zone: 'private', weight: 1.0, minAreaM2: 10.0, targetAreaM2: 14.0, maxAreaM2: 18.0, daylight: 'required', color: '#f0fdf4' },
      { id: 'hc.procedure', type: 'exam', label: 'Specialized Procedure Room', zone: 'private', weight: 0.8, minAreaM2: 25, daylight: 'required', color: '#f0fdf4' },
      { id: 'hc.lab-sample', type: 'exam', label: 'Lab & Sample Prep', zone: 'service', weight: 0.4, minAreaM2: 12, color: '#f1f5f9' },
      { id: 'hc.admin-office', type: 'office', label: 'Clinical Admin', zone: 'service', weight: 0.3, minAreaM2: 10, color: '#f1f5f9' },
      { id: 'hc.medical-wc', type: 'bath', label: 'Accessible WC', zone: 'service', weight: 0.2, minAreaM2: 6, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'educational-center': {
    id: 'educational-center',
    name: 'Modern Educational Academy',
    zones: [
      { id: 'edu.gateway', type: 'entry', label: 'Learning Gateway / Info', zone: 'public', weight: 0.4, minAreaM2: 20, color: '#f0f9ff' },
      { id: 'edu.lecture-hall', type: 'classroom', label: 'Digital Lecture Hall', zone: 'public', weight: 1.5, minAreaM2: 40.0, targetAreaM2: 65.0, maxAreaM2: 90.0, daylight: 'required', color: '#fefce8' },
      { id: 'edu.workshop-1', type: 'classroom', label: 'Creative Workshop A', zone: 'public', weight: 1.0, minAreaM2: 40.0, targetAreaM2: 65.0, maxAreaM2: 90.0, daylight: 'required', color: '#fefce8' },
      { id: 'edu.innovation-lab', type: 'office', label: 'Innovation & Research Lab', zone: 'core', weight: 0.8, minAreaM2: 35, daylight: 'required', color: '#e0f2fe' },
      { id: 'edu.educators-hub', type: 'office', label: 'Educators Collaboration Hub', zone: 'service', weight: 0.5, minAreaM2: 20, color: '#ecfdf5' },
      { id: 'edu.student-rest', type: 'bath', label: 'Student Amenities Block', zone: 'service', weight: 0.4, minAreaM2: 15, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'industrial-warehouse': {
    id: 'industrial-warehouse',
    name: 'Industrial Logistics Hub',
    zones: [
      { id: 'ind.docking-bay', type: 'entry', label: 'High-Volume Loading Docks', zone: 'service', weight: 1.2, minAreaM2: 60, color: '#f3f4f6' },
      { id: 'ind.main-floor', type: 'storage', label: 'Primary Distribution Floor', zone: 'public', weight: 3.0, minAreaM2: 100.0, targetAreaM2: 500.0, maxAreaM2: 10000.0, color: '#f8fafc' },
      { id: 'ind.mezzanine-off', type: 'office', label: 'Logistics Control Office', zone: 'service', weight: 0.4, minAreaM2: 25, color: '#e0e7ff' },
      { id: 'ind.maintenance', type: 'storage', label: 'Equipment Maintenance', zone: 'service', weight: 0.5, minAreaM2: 30, color: '#f8fafc' },
      { id: 'ind.industrial-rest', type: 'bath', label: 'Staff Locker & Restroom', zone: 'service', weight: 0.3, minAreaM2: 15, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'office-open': {
    id: 'office-open',
    name: 'Open Plan Office',
    zones: [
      { id: 'off.recep', type: 'entry', label: 'Reception Lobby', zone: 'public', weight: 0.2, minAreaM2: 12.0, targetAreaM2: 26.0, maxAreaM2: 40.0, color: '#f3f4f6' },
      { id: 'off.open-plan', type: 'office', label: 'Open Workspace', zone: 'public', weight: 1.0, minAreaM2: 30.0, targetAreaM2: 150.0, maxAreaM2: 500.0, minWidthM: 4.0, daylight: 'required', color: '#e0e7ff' },
      { id: 'off.pods', type: 'office', label: 'Quiet Focus Pods', zone: 'private', weight: 0.3, minAreaM2: 15, color: '#e0f2fe', adjacency: [{ to: 'off.open-plan', kind: 'near', weight: 0.8 }] },
      { id: 'off.meeting', type: 'meeting', label: 'Meeting Room', zone: 'core', weight: 0.4, minAreaM2: 15.0, targetAreaM2: 22.5, maxAreaM2: 30.0, color: '#fef3f2' },
      { id: 'off.pantry', type: 'pantry', label: 'Break Cafe & Pantry', zone: 'service', weight: 0.4, minAreaM2: 10.0, targetAreaM2: 25.0, maxAreaM2: 40.0, wetCore: true, color: '#ecfdf5' },
      { id: 'off.wc', type: 'bath', label: 'Toilet Block', zone: 'service', weight: 0.3, minAreaM2: 12, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'office-coworking': {
    id: 'office-coworking',
    name: 'Co-Working Space',
    zones: [
      { id: 'off.welcome', type: 'entry', label: 'Welcome & Coffee Bar', zone: 'public', weight: 0.4, minAreaM2: 12.0, targetAreaM2: 26.0, maxAreaM2: 40.0, wetCore: true, color: '#f3f4f6' },
      { id: 'off.hot-desking', type: 'office', label: 'Dedicated Hot Desks', zone: 'public', weight: 1.0, minAreaM2: 30.0, targetAreaM2: 150.0, maxAreaM2: 500.0, minWidthM: 4.0, daylight: 'required', color: '#e0e7ff' },
      { id: 'off.suites', type: 'office', label: 'Private Office Suites', zone: 'private', weight: 0.8, minAreaM2: 50, daylight: 'required', color: '#e0f2fe' },
      { id: 'off.boardroom', type: 'meeting', label: 'Executive Boardroom', zone: 'core', weight: 0.5, minAreaM2: 25.0, targetAreaM2: 42.5, maxAreaM2: 60.0, color: '#fef3f2' },
      { id: 'off.phone-booth', type: 'meeting', label: 'Soundproof Phone Booths', zone: 'core', weight: 0.2, minAreaM2: 6, color: '#f8fafc' },
      { id: 'off.wc', type: 'bath', label: 'Restrooms', zone: 'service', weight: 0.35, minAreaM2: 15, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'retail-showroom': {
    id: 'retail-showroom',
    name: 'Product Showroom',
    zones: [
      { id: 'ret.branding', type: 'retail', label: 'Glazed Window Display', zone: 'public', weight: 0.3, minAreaM2: 8, daylight: 'required', color: '#fffbeb' },
      { id: 'ret.main-sales', type: 'retail', label: 'Main Showroom Floor', zone: 'public', weight: 1.5, minAreaM2: 30.0, targetAreaM2: 200.0, maxAreaM2: 1000.0, minWidthM: 5.0, daylight: 'required', color: '#fffbeb' },
      { id: 'ret.lounge', type: 'room', label: 'Consultation Lounge', zone: 'core', weight: 0.4, minAreaM2: 15, color: '#f8fafc' },
      { id: 'ret.stock', type: 'storage', label: 'Inventory Stockroom', zone: 'service', weight: 0.6, minAreaM2: 25, color: '#f8fafc' },
      { id: 'ret.wc', type: 'bath', label: 'Restroom', zone: 'service', weight: 0.15, minAreaM2: 4, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'retail-grocery': {
    id: 'retail-grocery',
    name: 'Grocery Store',
    zones: [
      { id: 'ret.checkout', type: 'entry', label: 'Checkouts & Foyer', zone: 'public', weight: 0.5, minAreaM2: 20, minWidthM: 4.0, color: '#f3f4f6' },
      { id: 'ret.aisles', type: 'retail', label: 'Grocery Display Aisles', zone: 'public', weight: 1.5, minAreaM2: 30.0, targetAreaM2: 200.0, maxAreaM2: 1000.0, minWidthM: 5.0, daylight: 'required', color: '#fffbeb' },
      { id: 'ret.cold', type: 'storage', label: 'Fresh & Cold Produce', zone: 'service', weight: 0.8, minAreaM2: 30, wetCore: true, color: '#ecfdf5' },
      { id: 'ret.receiving', type: 'storage', label: 'Stock Receiving Yard', zone: 'service', weight: 0.8, minAreaM2: 30, color: '#f8fafc' },
      { id: 'ret.wc', type: 'bath', label: 'Restroom', zone: 'service', weight: 0.15, minAreaM2: 4, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'food-cafe': {
    id: 'food-cafe',
    name: 'Cozy Cafe',
    zones: [
      { id: 'fb.counter', type: 'entry', label: 'Order Counter & POS', zone: 'public', weight: 0.4, minAreaM2: 12, color: '#fffbeb' },
      { id: 'fb.dining', type: 'dining', label: 'Cafe Seating Area', zone: 'public', weight: 1.0, minAreaM2: 40.0, targetAreaM2: 200.0, maxAreaM2: 500.0, daylight: 'required', color: '#fef3c7' },
      { id: 'fb.bar', type: 'kitchen', label: 'Espresso Bar & Prep', zone: 'service', weight: 0.6, minAreaM2: 15, wetCore: true, color: '#f1f5f9' },
      { id: 'fb.prep', type: 'storage', label: 'Dishwashing & Storage', zone: 'service', weight: 0.45, minAreaM2: 10, wetCore: true, color: '#f8fafc' },
      { id: 'fb.wc', type: 'bath', label: 'Restroom', zone: 'service', weight: 0.2, minAreaM2: 5, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'food-qsr': {
    id: 'food-qsr',
    name: 'Quick Service Restaurant',
    zones: [
      { id: 'fb.counter', type: 'entry', label: 'Pick-up Counter', zone: 'public', weight: 0.35, minAreaM2: 10, color: '#fffbeb' },
      { id: 'fb.dining', type: 'dining', label: 'Dining Space', zone: 'public', weight: 0.5, minAreaM2: 20, daylight: 'required', color: '#fef3c7' },
      { id: 'fb.kitchen', type: 'kitchen', label: 'Commercial Kitchen', zone: 'service', weight: 1.2, minAreaM2: 15.0, targetAreaM2: 100.0, maxAreaM2: 200.0, minWidthM: 3.5, wetCore: true, color: '#f1f5f9' },
      { id: 'fb.prep', type: 'storage', label: 'Cold Storage Vault', zone: 'service', weight: 0.4, minAreaM2: 12, color: '#f8fafc' },
      { id: 'fb.wc', type: 'bath', label: 'Restroom', zone: 'service', weight: 0.2, minAreaM2: 5, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'healthcare-ward': {
    id: 'healthcare-ward',
    name: 'In-Patient Ward',
    zones: [
      { id: 'hc.nursing', type: 'waiting', label: 'Central Nursing Station', zone: 'core', weight: 0.5, minAreaM2: 15, color: '#f0f9ff' },
      { id: 'hc.ward-a', type: 'exam', label: 'Patient Ward Room A', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 14.0, maxAreaM2: 18.0, minWidthM: 3.2, daylight: 'required', color: '#f0fdf4' },
      { id: 'hc.ward-b', type: 'exam', label: 'Patient Ward Room B', zone: 'private', weight: 0.8, minAreaM2: 10.0, targetAreaM2: 14.0, maxAreaM2: 18.0, minWidthM: 3.2, daylight: 'required', color: '#f0fdf4' },
      { id: 'hc.exam', type: 'exam', label: 'Doctor Consult Room', zone: 'private', weight: 0.4, minAreaM2: 10.0, targetAreaM2: 14.0, maxAreaM2: 18.0, daylight: 'required', color: '#f0fdf4' },
      { id: 'hc.utility', type: 'storage', label: 'Med Storage & Clean Utility', zone: 'service', weight: 0.3, minAreaM2: 10, color: '#f1f5f9' },
      { id: 'hc.medical-wc', type: 'bath', label: 'Accessible WC Block', zone: 'service', weight: 0.4, minAreaM2: 10, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'educational-training': {
    id: 'educational-training',
    name: 'Professional Training Center',
    zones: [
      { id: 'edu.recep', type: 'entry', label: 'Reception Foyer', zone: 'public', weight: 0.3, minAreaM2: 12, color: '#f0f9ff' },
      { id: 'edu.lecture-hall', type: 'classroom', label: 'Seminar Classroom', zone: 'public', weight: 1.0, minAreaM2: 40.0, targetAreaM2: 65.0, maxAreaM2: 90.0, minWidthM: 4.5, daylight: 'required', color: '#fefce8' },
      { id: 'edu.lab', type: 'classroom', label: 'Computer IT Lab', zone: 'public', weight: 1.0, minAreaM2: 40.0, targetAreaM2: 65.0, maxAreaM2: 90.0, minWidthM: 4.5, color: '#fefce8' },
      { id: 'edu.prep', type: 'office', label: 'Trainer Lounge & Prep', zone: 'private', weight: 0.4, minAreaM2: 12, daylight: 'required', color: '#e0f2fe' },
      { id: 'edu.lounge', type: 'entry', label: 'Student Lounge Area', zone: 'public', weight: 0.4, minAreaM2: 15, color: '#f0f9ff' },
      { id: 'edu.wc', type: 'bath', label: 'Restrooms', zone: 'service', weight: 0.35, minAreaM2: 15, wetCore: true, color: '#f1f5f9' }
    ]
  },
  'industrial-factory': {
    id: 'industrial-factory',
    name: 'Industrial Assembly Plant',
    zones: [
      { id: 'ind.assembly', type: 'storage', label: 'Assembly & Production Floor', zone: 'public', weight: 3.0, minAreaM2: 100.0, targetAreaM2: 500.0, maxAreaM2: 10000.0, minWidthM: 8.0, color: '#f8fafc' },
      { id: 'ind.processing', type: 'storage', label: 'Material Processing Zone', zone: 'core', weight: 1.0, minAreaM2: 40, color: '#f8fafc' },
      { id: 'ind.storage', type: 'storage', label: 'Finished Goods Inventory', zone: 'service', weight: 1.0, minAreaM2: 50, color: '#f8fafc' },
      { id: 'ind.office', type: 'office', label: 'Supervisor Control Room', zone: 'service', weight: 0.3, minAreaM2: 12, color: '#e0e7ff' },
      { id: 'ind.lockers', type: 'bath', label: 'Lockers & Showers', zone: 'service', weight: 0.6, minAreaM2: 20, wetCore: true, color: '#f1f5f9' },
      { id: 'ind.bay', type: 'entry', label: 'Loading Docking Area', zone: 'service', weight: 0.8, minAreaM2: 40, color: '#f3f4f6' }
    ]
  },
  'industrial-storage': {
    id: 'industrial-storage',
    name: 'Self-Storage Complex',
    zones: [
      { id: 'ind.security', type: 'entry', label: 'Security & Front Office', zone: 'public', weight: 0.25, minAreaM2: 10, color: '#f3f4f6' },
      { id: 'ind.lockers', type: 'storage', label: 'Storage Locker Aisles', zone: 'public', weight: 3.0, minAreaM2: 100.0, targetAreaM2: 500.0, maxAreaM2: 10000.0, minWidthM: 4.0, color: '#f8fafc' },
      { id: 'ind.bay', type: 'entry', label: 'Covered Loading Zone', zone: 'service', weight: 0.6, minAreaM2: 25, color: '#f3f4f6' },
      { id: 'ind.wc', type: 'bath', label: 'Restroom', zone: 'service', weight: 0.15, minAreaM2: 4, wetCore: true, color: '#f1f5f9' }
    ]
  }
};

/**
 * Geometric types for processing
 */
interface Polygon {
    points: Point[];
}

interface PartitionNode {
  id: string;
  polygon: Polygon;
  zone?: SpatialZone;
  children?: PartitionNode[];
  splitLine?: { p1: Point; p2: Point };
}

interface ResidentialRectRoom {
  id: string;
  label: string;
  kind:
    | 'entry'
    | 'living'
    | 'dining'
    | 'kitchen'
    | 'bedroom'
    | 'bath'
    | 'corridor'
    | 'balcony'
    | 'terrace'
    | 'garden'
    | 'courtyard'
    | 'veranda'
    | 'family'
    | 'study'
    | 'store'
    | 'garage'
    | 'stair'
    | 'utility';
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  daylight?: 'required' | 'preferred' | 'optional';
  exteriorContact?: boolean;
  openTo?: string[];
  isOpenPlan?: boolean;
  accessRole?: 'main' | 'secondary' | 'private' | 'service';
}

interface ResidentialLayoutOptions {
  seed?: number;
  typology?: LayoutTypology;
  geometry?: LayoutGeometry;
  unitSystem?: 'metric' | 'imperial';
  requirements?: ArchElement['proceduralRequirements'];
  entryPoint?: Point;
}

type ResidentialCategoryId = 'apartments' | 'houses' | 'shared-special';

type ResidentialLogicId =
  // Apartment logics
  | 'apt_living_hub'
  | 'apt_open_public'
  | 'apt_side_wing'
  | 'apt_compact_core'
  | 'apt_split_bedrooms'
  | 'apt_gallery_entry'
  | 'apt_service_spine'
  | 'apt_corner_public'
  | 'apt_no_corridor'
  | 'apt_balcony_front'

  // House logics
  | 'house_formal_front'
  | 'house_courtyard'
  | 'house_veranda'
  | 'house_side_service'
  | 'house_family_core'
  | 'house_two_wing'
  | 'house_linear_row'
  | 'house_garden_corner'
  | 'house_dual_anchor'
  | 'house_service_yard'

  // Shared / special residential logics
  | 'shared_common_hub'
  | 'shared_module_spine'
  | 'shared_cluster_courtyard'
  | 'shared_double_loaded'
  | 'shared_kitchen_core'
  | 'shared_study_bar'
  | 'shared_pod_cluster'
  | 'shared_short_access'
  | 'shared_service_spine'
  | 'shared_front_common';

interface ResidentialLogicDefinition {
  id: ResidentialLogicId;
  name: string;
  description: string;
  allowedCategories: ResidentialCategoryId[];
  allowedSubtypes?: string[];
  avoidSubtypes?: string[];
  minBedrooms?: number;
  maxBedrooms?: number;
  needsLargePlan?: boolean;

  /**
   * This is the important part.
   * family controls actual geometry, not only room labels.
   */
  family:
    | 'PUBLIC_PRIVATE_BAR'
    | 'OPEN_PUBLIC_CORE'
    | 'SIDE_WING'
    | 'COMPACT_WET_CORE'
    | 'SPLIT_BEDROOMS'
    | 'GALLERY_RAIL'
    | 'SERVICE_SPINE'
    | 'CORNER_ANCHOR'
    | 'NO_CORRIDOR'
    | 'BALCONY_FRONT'
    | 'COURTYARD_RING'
    | 'VERANDA_BAR'
    | 'SIDE_SERVICE'
    | 'FAMILY_CORE'
    | 'TWO_WING'
    | 'LINEAR_ROW'
    | 'GARDEN_CORNER'
    | 'DUAL_ANCHOR'
    | 'SERVICE_YARD'
    | 'SHARED_HUB'
    | 'MODULE_SPINE'
    | 'CLUSTER_COURTYARD'
    | 'DOUBLE_LOADED'
    | 'KITCHEN_CORE'
    | 'STUDY_BAR'
    | 'POD_CLUSTER'
    | 'SHORT_ACCESS'
    | 'FRONT_COMMON'
    | 'CENTRAL_HUB'
    | 'LINEAR_PASSAGE'
    | 'DUAL_ASPECT';

  corridorMode: 'none' | 'short' | 'required' | 'optional';
}

type ResidentialEntryMode = 'enclosed' | 'niche' | 'direct';
type ResidentialKitchenMode = 'open' | 'semiOpen' | 'closed';
type ResidentialDiningMode = 'separate' | 'merged' | 'none';
type ResidentialBedroomAccessMode = 'corridor' | 'lobby' | 'livingDistributor';
type ResidentialWetCoreMode = 'compact' | 'spine' | 'split';
type ResidentialOutdoorMode = 'none' | 'balcony' | 'terrace' | 'courtyard' | 'garden' | 'veranda';
type ResidentialPlanPlacement = 'center' | 'left' | 'right' | 'top' | 'bottom' | 'corner';

type ResidentialPlanningStyleId = PlanningStyle;
type ResidentialGeometryStandardId = GeometryStyle;

interface ResidentialDesignDNA {
  entryMode: ResidentialEntryMode;
  kitchenMode: ResidentialKitchenMode;
  diningMode: ResidentialDiningMode;
  bedroomAccessMode: ResidentialBedroomAccessMode;
  wetCoreMode: ResidentialWetCoreMode;
  outdoorMode: ResidentialOutdoorMode;
  planPlacement: ResidentialPlanPlacement;
  compactness: number;
  publicShare: number;
  privateShare: number;
  serviceShare: number;
  logicPreferenceSalt: number;
  planningStyle: ResidentialPlanningStyleId;
  layoutGeometry: ResidentialGeometryStandardId;
  geometryStrength: number;
  angularity: number;
  curvature: number;
  openness: number;
}

interface ResidentialSchemeCandidate {
  logic: ResidentialLogicDefinition;
  rooms: ResidentialRectRoom[];
  score: number;
  warnings: string[];
  dna: ResidentialDesignDNA;
}

interface ResidentialFunctionalValidation {
  hardErrors: string[];
  warnings: string[];
  penalty: number;
}

const RESIDENTIAL_LOGICS: ResidentialLogicDefinition[] = [
  // ------------------------------------------------------------
  // APARTMENTS — 10 topology families
  // ------------------------------------------------------------
  {
    id: 'apt_living_hub',
    name: 'Apartment Living Hub',
    description: 'Living is the central distributor; bedrooms and service attach around it.',
    allowedCategories: ['apartments'],
    family: 'PUBLIC_PRIVATE_BAR',
    corridorMode: 'optional'
  },
  {
    id: 'apt_open_public',
    name: 'Open Public Core',
    description: 'Living and dining merge into a large public core; kitchen is attached to its edge.',
    allowedCategories: ['apartments'],
    family: 'OPEN_PUBLIC_CORE',
    corridorMode: 'optional'
  },
  {
    id: 'apt_side_wing',
    name: 'Side Bedroom Wing',
    description: 'Public zone occupies one side; bedrooms and baths form a side wing.',
    allowedCategories: ['apartments'],
    minBedrooms: 1,
    family: 'SIDE_WING',
    corridorMode: 'short'
  },
  {
    id: 'apt_compact_core',
    name: 'Compact Wet Core',
    description: 'Kitchen and bathrooms form a compact wet core; rooms wrap around it.',
    allowedCategories: ['apartments'],
    family: 'COMPACT_WET_CORE',
    corridorMode: 'none'
  },
  {
    id: 'apt_split_bedrooms',
    name: 'Split Bedroom Layout',
    description: 'Master and secondary bedrooms are separated by public/service spaces.',
    allowedCategories: ['apartments'],
    minBedrooms: 2,
    family: 'SPLIT_BEDROOMS',
    corridorMode: 'optional'
  },
  {
    id: 'apt_gallery_entry',
    name: 'Gallery Entry Apartment',
    description: 'Entry creates a gallery edge before opening into public and private zones.',
    allowedCategories: ['apartments'],
    family: 'GALLERY_RAIL',
    corridorMode: 'short'
  },
  {
    id: 'apt_service_spine',
    name: 'Service Spine Apartment',
    description: 'Kitchen, utility and baths create a service spine with rooms on both sides.',
    allowedCategories: ['apartments'],
    family: 'SERVICE_SPINE',
    corridorMode: 'short'
  },
  {
    id: 'apt_corner_public',
    name: 'Corner Public Apartment',
    description: 'Living/dining occupy a corner; private zone is pulled away from entry.',
    allowedCategories: ['apartments'],
    family: 'CORNER_ANCHOR',
    corridorMode: 'optional'
  },
  {
    id: 'apt_no_corridor',
    name: 'No-Corridor Compact Apartment',
    description: 'Living directly distributes to bedroom and service spaces; no separate corridor.',
    allowedCategories: ['apartments'],
    maxBedrooms: 2,
    family: 'NO_CORRIDOR',
    corridorMode: 'none'
  },
  {
    id: 'apt_balcony_front',
    name: 'Balcony-Front Apartment',
    description: 'Public spaces stretch along balcony/terrace edge; private rooms sit behind.',
    allowedCategories: ['apartments'],
    family: 'BALCONY_FRONT',
    corridorMode: 'short'
  },

  // ------------------------------------------------------------
  // HOUSES / VILLAS — 10 topology families
  // ------------------------------------------------------------
  {
    id: 'house_formal_front',
    name: 'Formal Front / Private Rear',
    description: 'Entry and formal public zone at front; bedrooms form rear private zone.',
    allowedCategories: ['houses'],
    family: 'PUBLIC_PRIVATE_BAR',
    corridorMode: 'optional'
  },
  {
    id: 'house_courtyard',
    name: 'Courtyard House',
    description: 'Rooms are organized around a courtyard.',
    allowedCategories: ['houses'],
    needsLargePlan: true,
    family: 'COURTYARD_RING',
    corridorMode: 'none'
  },
  {
    id: 'house_veranda',
    name: 'Veranda House',
    description: 'Veranda/outdoor edge leads into living and dining.',
    allowedCategories: ['houses'],
    family: 'VERANDA_BAR',
    corridorMode: 'optional'
  },
  {
    id: 'house_side_service',
    name: 'Side Service House',
    description: 'Kitchen, utility, bath and service spaces form a side service band.',
    allowedCategories: ['houses'],
    family: 'SIDE_SERVICE',
    corridorMode: 'short'
  },
  {
    id: 'house_family_core',
    name: 'Family Lounge Core',
    description: 'Formal living near entry, family lounge acts as internal private anchor.',
    allowedCategories: ['houses'],
    minBedrooms: 3,
    family: 'FAMILY_CORE',
    corridorMode: 'optional'
  },
  {
    id: 'house_two_wing',
    name: 'Two-Wing House',
    description: 'Public wing and bedroom wing are separated by foyer/service core.',
    allowedCategories: ['houses'],
    minBedrooms: 2,
    family: 'TWO_WING',
    corridorMode: 'short'
  },
  {
    id: 'house_linear_row',
    name: 'Linear Row House',
    description: 'Front-to-back sequence for row house or narrow plot.',
    allowedCategories: ['houses'],
    allowedSubtypes: ['row-house', 'house'],
    family: 'LINEAR_ROW',
    corridorMode: 'required'
  },
  {
    id: 'house_garden_corner',
    name: 'Garden-Corner Living',
    description: 'Living/dining sit on garden corner; bedrooms line the quieter side.',
    allowedCategories: ['houses'],
    family: 'GARDEN_CORNER',
    corridorMode: 'optional'
  },
  {
    id: 'house_dual_anchor',
    name: 'Dual Anchor House',
    description: 'Formal living and family lounge act as two different anchors.',
    allowedCategories: ['houses'],
    minBedrooms: 3,
    family: 'DUAL_ANCHOR',
    corridorMode: 'optional'
  },
  {
    id: 'house_service_yard',
    name: 'Service Yard House',
    description: 'Kitchen and utility open to a service yard; public zone opens to garden.',
    allowedCategories: ['houses'],
    family: 'SERVICE_YARD',
    corridorMode: 'short'
  },

  // ------------------------------------------------------------
  // SHARED / SPECIAL — 10 topology families
  // ------------------------------------------------------------
  {
    id: 'shared_common_hub',
    name: 'Shared Common Hub',
    description: 'Shared living is central; bedrooms branch from it.',
    allowedCategories: ['shared-special'],
    family: 'SHARED_HUB',
    corridorMode: 'required'
  },
  {
    id: 'shared_module_spine',
    name: 'Bedroom Module Spine',
    description: 'Repeated bedroom modules attach to a shared spine.',
    allowedCategories: ['shared-special'],
    family: 'MODULE_SPINE',
    corridorMode: 'required'
  },
  {
    id: 'shared_cluster_courtyard',
    name: 'Shared Courtyard Cluster',
    description: 'Common area and rooms are organized around a courtyard.',
    allowedCategories: ['shared-special'],
    needsLargePlan: true,
    family: 'CLUSTER_COURTYARD',
    corridorMode: 'optional'
  },
  {
    id: 'shared_double_loaded',
    name: 'Double Loaded Residential Bar',
    description: 'Bedrooms on two sides of a central corridor; common space near entry.',
    allowedCategories: ['shared-special'],
    minBedrooms: 4,
    family: 'DOUBLE_LOADED',
    corridorMode: 'required'
  },
  {
    id: 'shared_kitchen_core',
    name: 'Shared Kitchen Core',
    description: 'Kitchen/dining form the central social core.',
    allowedCategories: ['shared-special'],
    family: 'KITCHEN_CORE',
    corridorMode: 'required'
  },
  {
    id: 'shared_study_bar',
    name: 'Study-Bar Housing',
    description: 'Study/common bar sits between bedroom modules and services.',
    allowedCategories: ['shared-special'],
    family: 'STUDY_BAR',
    corridorMode: 'required'
  },
  {
    id: 'shared_pod_cluster',
    name: 'Pod Cluster',
    description: 'Bedroom pods cluster around shared bath/service nodes.',
    allowedCategories: ['shared-special'],
    family: 'POD_CLUSTER',
    corridorMode: 'required'
  },
  {
    id: 'shared_short_access',
    name: 'Short Access Senior Plan',
    description: 'Minimal travel between living, bedroom and bathroom.',
    allowedCategories: ['shared-special'],
    allowedSubtypes: ['senior-living'],
    family: 'SHORT_ACCESS',
    corridorMode: 'none'
  },
  {
    id: 'shared_service_spine',
    name: 'Shared Service Spine',
    description: 'Bathrooms, laundry and kitchen form one service spine.',
    allowedCategories: ['shared-special'],
    family: 'SERVICE_SPINE',
    corridorMode: 'required'
  },
  {
    id: 'shared_front_common',
    name: 'Front Common / Rear Rooms',
    description: 'Common zone at entry; rooms placed deeper inside.',
    allowedCategories: ['shared-special'],
    family: 'FRONT_COMMON',
    corridorMode: 'required'
  }
];

export class SmartProceduralLayoutEngine {
  private static applyLayoutArchetype(zones: SpatialZone[], archetypeIndex: number, programId: string): SpatialZone[] {
    const defaultDepth = { 'public': 0, 'core': 1, 'service': 2, 'private': 3, 'hazard': 4 };
    const idx = Math.abs(archetypeIndex);

    // Refined Variation Formulae for each space type logic
    if (programId === 'domestic-studio') {
      const vIdx = idx % 4;
      if (vIdx === 0) {
        // Direct-entry studio: entry and living merge
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'entry' || z.type === 'living') depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Niche-entry studio: buffer wall
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'entry') depth = 0;
          else if (z.type === 'living') depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Hotel-style studio: bath near entry, bedroom/living near window
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'entry' || z.type === 'bath') depth = 0;
          else if (z.type === 'living' || z.type === 'balcony') depth = 1;
          return { ...z, depth };
        });
      } else {
        // Balcony-front studio: main room fully faces balcony
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'living' || z.type === 'balcony') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'domestic-1br') {
      const vIdx = idx % 5;
      if (vIdx === 0) {
        // Open kitchen living layout
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'kitchen' || z.type === 'living' || z.type === 'dining') depth = 0;
          else if (z.type === 'bedroom' || z.type === 'bath') depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Closed kitchen off dining
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'entry' || z.type === 'kitchen') depth = 0;
          else if (z.type === 'dining' || z.type === 'living') depth = 1;
          else depth = 2;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Compact no-corridor layout (living as distributor)
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'living') depth = 0;
          else if (z.type === 'bedroom' || z.type === 'bath') depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 3) {
        // Bedroom-suite layout (bathroom near bedroom)
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'bedroom' || z.type === 'bath') depth = 2;
          else depth = 0;
          return { ...z, depth };
        });
      } else {
        // Balcony-front living
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'living' || z.type === 'balcony') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'domestic-standard') {
      const vIdx = idx % 5;
      if (vIdx === 0) {
        // Open Public Core
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'entry' || z.type === 'living' || z.type === 'dining' || z.type === 'kitchen') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Side Bedroom Wing
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'bedroom') depth = 1;
          else if (z.type === 'bath') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Central Living Hub
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'living') depth = 1;
          else if (z.type === 'bedroom' || z.type === 'bath') depth = 2;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 3) {
        // Split Bedroom
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id === 'res.master') depth = 0;
          else if (z.type === 'living' || z.type === 'kitchen') depth = 1;
          else depth = 2;
          return { ...z, depth };
        });
      } else {
        // Service Spine (kitchen, common bath, ensuite align)
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.wetCore || z.type === 'kitchen' || z.type === 'bath') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'domestic-3br') {
      const vIdx = idx % 5;
      if (vIdx === 0) {
        // Master-suite wing + children wing
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id === 'res.master' || z.id === 'res.ensuite') depth = 1;
          else if (z.id.includes('bedroom-2') || z.id.includes('bedroom-3') || z.id === 'res.bath') depth = 2;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // All-bedroom wing
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'bedroom' || z.id === 'res.bath' || z.id === 'res.ensuite') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Central family lounge distributor
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'living') depth = 1;
          else if (z.type === 'bedroom' || z.type === 'bath') depth = 2;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 3) {
        // Service spine
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.wetCore || z.type === 'kitchen' || z.type === 'bath' || z.type === 'laundry') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else {
        // Split wings
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id === 'res.master') depth = 0;
          else if (z.type === 'living') depth = 1;
          else depth = 2;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'domestic-4br') {
      const vIdx = idx % 5;
      if (vIdx === 0) {
        // Formal front / private rear
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id === 'res.entry' || z.id === 'res.living' || z.id === 'res.dining' || z.id === 'res.powder') depth = 0;
          else if (z.id === 'res.family' || z.type === 'bedroom' || z.type === 'bath') depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Dual living
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id === 'res.living') depth = 0;
          else if (z.id === 'res.family') depth = 1;
          else if (z.type === 'bedroom') depth = 2;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Split bedroom wings
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id === 'res.master') depth = 1;
          else if (z.type === 'bedroom') depth = 2;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 3) {
        // Central family lounge core
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id === 'res.family') depth = 1;
          else if (z.type === 'bedroom') depth = 2;
          else depth = 0;
          return { ...z, depth };
        });
      } else {
        // Service spine on one side
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.wetCore || z.type === 'kitchen' || z.type === 'bath' || z.type === 'laundry') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'domestic-duplex') {
      const vIdx = idx % 4;
      if (vIdx === 0) {
        // Public lower / private upper
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.zone === 'public' || z.zone === 'service') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Master lower / family upper
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('master') || z.zone === 'public') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Double-height living as central anchor
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id === 'res.living') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else {
        // Roof-deck destination sequence
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('roof') || z.id.includes('pool')) depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'house-single') {
      const vIdx = idx % 4;
      if (vIdx === 0) {
        // Formal front / private rear
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.zone === 'public') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Side service house
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'kitchen' || z.type === 'bath' || z.type === 'laundry') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Garden-corner living
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'living' || z.type === 'garden') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else {
        // Bedroom wing on one side
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'bedroom') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'house-villa') {
      const vIdx = idx % 5;
      if (vIdx === 0) {
        // Formal front / private rear
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('formal') || z.id.includes('foyer')) depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Two-wing house
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'bedroom') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Dual-anchor house
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('formal-living')) depth = 0;
          else if (z.id.includes('family-lounge')) depth = 1;
          else depth = 2;
          return { ...z, depth };
        });
      } else if (vIdx === 3) {
        // Courtyard villa
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('lawn') || z.id.includes('courtyard')) depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else {
        // Service yard house
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'kitchen' || z.type === 'laundry' || z.type === 'utility') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'house-row') {
      const vIdx = idx % 4;
      if (vIdx === 0) {
        // Front living / rear kitchen-dining
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'living') depth = 0;
          else if (z.type === 'kitchen' || z.type === 'dining') depth = 1;
          else depth = 2;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Rear living opening to garden
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'kitchen' || z.type === 'entry') depth = 0;
          else if (z.type === 'living' || z.type === 'garden') depth = 1;
          else depth = 2;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Service spine along one side
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.wetCore || z.type === 'kitchen' || z.type === 'bath') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else {
        // Compact open plan
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.zone === 'public') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'house-farmhouse') {
      const vIdx = idx % 4;
      if (vIdx === 0) {
        // Wraparound veranda
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'balcony') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Central hearth/living core
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'living') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Master wing + guest wing
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('master')) depth = 0;
          else if (z.id.includes('guest')) depth = 2;
          else depth = 1;
          return { ...z, depth };
        });
      } else {
        // Mudroom service entry sequence
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('mudroom')) depth = 0;
          else if (z.id.includes('kitchen')) depth = 1;
          else depth = 2;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'res-coliving') {
      const vIdx = idx % 4;
      if (vIdx === 0) {
        // Shared common hub
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('hub') || z.id.includes('kitchen') || z.id.includes('dining')) depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Pod cluster
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'bedroom') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 2) {
        // Shared courtyard cluster
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'garden') depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else {
        // Shared service spine
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.wetCore || z.type === 'kitchen' || z.type === 'bath') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'res-student') {
      const vIdx = idx % 3;
      if (vIdx === 0) {
        // Study-bar housing
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('lounge')) depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Cluster pods around lounge
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('lounge')) depth = 1;
          else if (z.type === 'bedroom') depth = 2;
          else depth = 0;
          return { ...z, depth };
        });
      } else {
        // Shared kitchen/lounge entry
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('lounge') || z.id.includes('kitchenette')) depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      }
    }

    if (programId === 'res-senior') {
      const vIdx = idx % 3;
      if (vIdx === 0) {
        // Short access senior plan
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.type === 'bedroom' || z.type === 'bath') depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else if (vIdx === 1) {
        // Shared service spine
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.wetCore || z.type === 'bath' || z.id.includes('support')) depth = 1;
          else depth = 0;
          return { ...z, depth };
        });
      } else {
        // Central common hub
        return zones.map(z => {
          let depth = defaultDepth[z.zone] || 0;
          if (z.id.includes('lounge')) depth = 0;
          else depth = 1;
          return { ...z, depth };
        });
      }
    }

    // Default Fallback
    return zones.map(z => ({ ...z, depth: defaultDepth[z.zone] || 0 }));
  }

  private static calculatePlanMetrics(program: SpatialProgram, programId: string) {
    let minSum = 0;
    let targetSum = 0;
    let maxSum = 0;

    program.zones.forEach(z => {
      minSum += z.minAreaM2 || 0;
      targetSum += z.targetAreaM2 || z.minAreaM2 || 0;
      maxSum += z.maxAreaM2 || z.targetAreaM2 || z.minAreaM2 || 0;
      if (z.subSpaces) {
        z.subSpaces.forEach(s => {
          // Subspaces are usually part of the parent zone's area in this implementation, 
          // but we should check if they add up.
        });
      }
    });

    // Circulation allowance factors
    let circFactor = 0.15; // default 15%
    if (programId.startsWith('residential')) circFactor = 0.14;
    else if (programId.startsWith('office')) circFactor = 0.20;
    else if (programId.startsWith('retail') || programId.startsWith('food')) circFactor = 0.15;
    else if (programId.startsWith('healthcare')) circFactor = 0.28;
    else if (programId.startsWith('educational')) circFactor = 0.24;
    else if (programId.startsWith('industrial')) circFactor = 0.12;

    return {
      minRequiredArea: minSum * (1 + circFactor),
      targetRequiredArea: targetSum * (1 + circFactor),
      maxUsefulArea: maxSum * (1 + circFactor)
    };
  }

  private static isResidentialProgramId(programId: string): boolean {
    return (
      programId.startsWith('domestic-') ||
      programId.startsWith('house-') ||
      programId.startsWith('res-')
    );
  }

  public static getProgramMinLayoutDim(programId: string): number {
    const dims: Record<string, number> = {
      // Residential
      'domestic-studio': 3.6,
      'domestic-1br': 4.8,
      'domestic-standard': 5.8,
      'domestic-3br': 6.8,
      'domestic-4br': 8.0,
      'domestic-duplex': 8.0,
      'house-single': 6.8,
      'house-villa': 8.5,
      'house-row': 4.8,
      'house-farmhouse': 8.0,
      'res-coliving': 7.5,
      'res-student': 6.8,
      'res-senior': 6.8,
      
      // Office
      'office-corporate': 7.5,
      'office-open': 7.5,
      'office-coworking': 7.5,
      
      // Retail
      'retail-shop': 6.0,
      'retail-showroom': 6.0,
      'retail-grocery': 6.0,
      
      // Food
      'food-restaurant': 6.0,
      'food-cafe': 6.0,
      'food-qsr': 6.0,
      
      // Healthcare
      'healthcare-clinic': 7.5,
      'healthcare-ward': 7.5,
      
      // Education
      'educational-center': 7.5,
      'educational-training': 7.5,
      
      // Industrial
      'industrial-warehouse': 10.0,
      'industrial-factory': 10.0,
      'industrial-storage': 10.0,
    };
    return dims[programId] || 3.2; // default fallback 3.2m
  }

  private static clampNumber(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private static rectToPolygon(r: ResidentialRectRoom): Polygon {
    return {
      points: [
        { x: r.x, y: r.y },
        { x: r.x + r.w, y: r.y },
        { x: r.x + r.w, y: r.y + r.h },
        { x: r.x, y: r.y + r.h },
      ]
    };
  }

  private static addResidentialRoom(
    rooms: ResidentialRectRoom[],
    room: Omit<ResidentialRectRoom, 'id'>
  ) {
    if (room.w <= 0.4 || room.h <= 0.4) return;

    rooms.push({
      id: crypto.randomUUID(),
      ...room
    });
  }

  private static residentialRoomRules(kind: ResidentialRectRoom['kind']) {
    switch (kind) {
      case 'living':
        return { minShort: 3.0, optimalRatio: 1.45, maxRatio: 2.0 };
      case 'dining':
        return { minShort: 2.0, optimalRatio: 1.45, maxRatio: 2.0 };
      case 'kitchen':
        return { minShort: 1.55, optimalRatio: 1.8, maxRatio: 2.5 };
      case 'bedroom':
        return { minShort: 3.0, optimalRatio: 1.35, maxRatio: 1.8 };
      case 'bath':
        return { minShort: 0.95, optimalRatio: 2.0, maxRatio: 3.0 };
      case 'corridor':
        return { minShort: 0.95, optimalRatio: 6.0, maxRatio: 99 };
      case 'balcony':
      case 'terrace':
      case 'veranda':
        return { minShort: 0.9, optimalRatio: 4.0, maxRatio: 99 };
      case 'courtyard':
        return { minShort: 3.0, optimalRatio: 1.2, maxRatio: 2.0 };
      case 'entry':
        return { minShort: 1.2, optimalRatio: 1.5, maxRatio: 2.5 };
      case 'family':
      case 'study':
        return { minShort: 2.5, optimalRatio: 1.5, maxRatio: 2.0 };
      case 'garage':
        return { minShort: 2.7, optimalRatio: 2.0, maxRatio: 3.0 };
      default:
        return { minShort: 1.0, optimalRatio: 2.0, maxRatio: 3.0 };
    }
  }

  private static validateResidentialRoomShapes(rooms: ResidentialRectRoom[], warnings: string[]) {
    rooms.forEach(room => {
      if (room.kind === 'garden') return;

      const shortSide = Math.min(room.w, room.h);
      const longSide = Math.max(room.w, room.h);
      const ratio = longSide / Math.max(shortSide, 0.01);
      const rule = this.residentialRoomRules(room.kind);

      if (shortSide < rule.minShort) {
        warnings.push(`${room.label} is too narrow. Short side is ${shortSide.toFixed(1)}m.`);
      }

      if (ratio > rule.maxRatio) {
        warnings.push(`${room.label} is too elongated. Ratio is ${ratio.toFixed(1)}.`);
      }
    });
  }

  private static residentialRandom(seed: number, salt: number = 0): number {
    const x = Math.sin(seed * 9999 + salt * 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  private static residentialVariant(seed: number) {
    const a = this.residentialRandom(seed, 1);
    const b = this.residentialRandom(seed, 2);

    return {
      mirrorX: a > 0.5,
      mirrorY: b > 0.5,
      publicOnRight: this.residentialRandom(seed, 3) > 0.5,
      serviceOnRight: this.residentialRandom(seed, 4) > 0.5,
    };
  }

  private static rectRatio(w: number, h: number): number {
    const shortSide = Math.max(0.01, Math.min(w, h));
    const longSide = Math.max(w, h);
    return longSide / shortSide;
  }

  private static maxRoomWidthForRatio(height: number, maxRatio: number): number {
    return height * maxRatio;
  }

  private static maxRoomHeightForRatio(width: number, maxRatio: number): number {
    return width * maxRatio;
  }

  private static mirrorResidentialRooms(
    rooms: ResidentialRectRoom[],
    plan: { x: number; y: number; w: number; h: number },
    mirrorX: boolean,
    mirrorY: boolean
  ) {
    rooms.forEach(room => {
      if (room.label.includes('Unassigned')) return;

      if (mirrorX) {
        room.x = plan.x + plan.w - (room.x - plan.x) - room.w;
      }

      if (mirrorY) {
        room.y = plan.y + plan.h - (room.y - plan.y) - room.h;
      }
    });
  }

  private static addUnassignedMargins(
    rooms: ResidentialRectRoom[],
    shell: { x: number; y: number; w: number; h: number },
    plan: { x: number; y: number; w: number; h: number }
  ) {
    const left = plan.x - shell.x;
    const right = shell.x + shell.w - (plan.x + plan.w);
    const top = plan.y - shell.y;
    const bottom = shell.y + shell.h - (plan.y + plan.h);

    if (left > 1.0) {
      this.addResidentialRoom(rooms, {
        label: 'Unassigned Space',
        kind: 'garden',
        x: shell.x,
        y: shell.y,
        w: left,
        h: shell.h,
        color: '#f8fafc'
      });
    }

    if (right > 1.0) {
      this.addResidentialRoom(rooms, {
        label: 'Unassigned Space',
        kind: 'garden',
        x: plan.x + plan.w,
        y: shell.y,
        w: right,
        h: shell.h,
        color: '#f8fafc'
      });
    }

    if (top > 1.0) {
      this.addResidentialRoom(rooms, {
        label: 'Unassigned Space',
        kind: 'garden',
        x: plan.x,
        y: shell.y,
        w: plan.w,
        h: top,
        color: '#f8fafc'
      });
    }

    if (bottom > 1.0) {
      this.addResidentialRoom(rooms, {
        label: 'Unassigned Space',
        kind: 'garden',
        x: plan.x,
        y: plan.y + plan.h,
        w: plan.w,
        h: bottom,
        color: '#f8fafc'
      });
    }
  }

  private static fitResidentialPlanInsideShell(
    shell: { x: number; y: number; w: number; h: number },
    targetArea: number,
    seed: number,
    dna?: ResidentialDesignDNA
  ) {
    const shellArea = shell.w * shell.h;

    // Use a slightly more aggressive compactness for weird shapes
    const compactness = dna?.compactness ?? 0.95;
    const usefulArea = Math.min(shellArea * 0.98, targetArea * compactness);

    const shellRatio = shell.w / Math.max(shell.h, 0.01);

    // Ratio bias based on DNA, but more constrained.
    // 1.0 is square, > 1.0 is horizontal, < 1.0 is vertical.
    const ratioBias =
      this.residentialRandom(seed, 41) < 0.33 ? 0.85 :
      this.residentialRandom(seed, 42) < 0.66 ? 1.05 :
      1.35;

    // Preferred ratio should be a mix of the shell's natural ratio and a standard architectural ratio (Golden ratio is ~1.6 or ~0.6)
    let preferredRatio = this.clampNumber(shellRatio * ratioBias, 0.6, 1.6);

    let w = Math.sqrt(usefulArea * preferredRatio);
    let h = usefulArea / Math.max(w, 0.01);

    // Constraint 1: Must fit in shell
    if (w > shell.w) {
      w = shell.w;
      h = usefulArea / w;
    }
    if (h > shell.h) {
      h = shell.h;
      w = usefulArea / h;
    }

    // Constraint 2: Stricter Max Aspect Ratio for the Unit itself
    const MAX_UNIT_RATIO = 2.1; 
    const currentRatio = Math.max(w, h) / Math.max(0.1, Math.min(w, h));
    if (currentRatio > MAX_UNIT_RATIO) {
      if (w > h) {
        w = h * MAX_UNIT_RATIO;
      } else {
        h = w * MAX_UNIT_RATIO;
      }
    }

    // Constraint 3: Minimum functional dimension for any unit
    const MIN_UNIT_DIM = 3.6;
    if (w < MIN_UNIT_DIM) w = MIN_UNIT_DIM;
    if (h < MIN_UNIT_DIM) h = MIN_UNIT_DIM;

    // Constraint 4: Cap absolute dimensions for deep plans
    const MAX_DIM = 16.0;
    if (w > MAX_DIM) w = MAX_DIM;
    if (h > MAX_DIM) h = MAX_DIM;

    // Final result x, y positioning
    let x = shell.x + (shell.w - w) / 2;
    let y = shell.y + (shell.h - h) / 2;

    const placement = dna?.planPlacement ?? 'center';
    if (placement === 'left') x = shell.x;
    else if (placement === 'right') x = shell.x + shell.w - w;
    else if (placement === 'top') y = shell.y;
    else if (placement === 'bottom') y = shell.y + shell.h - h;
    else if (placement === 'corner') {
      x = this.residentialRandom(seed, 43) > 0.5 ? shell.x : shell.x + shell.w - w;
      y = this.residentialRandom(seed, 44) > 0.5 ? shell.y : shell.y + shell.h - h;
    }

    return { x, y, w, h };
  }

  private static getResidentialCategory(subtype: string): ResidentialCategoryId {
    if (['studio', '1br', '2br', '3br', '4br', 'duplex', 'penthouse', 'serviced-apartment', 'apartment'].includes(subtype)) {
      return 'apartments';
    }

    if (['house', 'villa', 'row-house', 'farmhouse', 'mansion'].includes(subtype)) {
      return 'houses';
    }

    return 'shared-special';
  }

  private static getAllowedResidentialLogics(
    subtype: string,
    bedroomCount: number,
    totalAreaM2: number
  ): ResidentialLogicDefinition[] {
    const category = this.getResidentialCategory(subtype);

    const allowed = RESIDENTIAL_LOGICS.filter(logic => {
      if (!logic.allowedCategories.includes(category)) return false;
      if (logic.allowedSubtypes && !logic.allowedSubtypes.includes(subtype)) return false;
      if (logic.avoidSubtypes && logic.avoidSubtypes.includes(subtype)) return false;
      if (logic.minBedrooms !== undefined && bedroomCount < logic.minBedrooms) return false;
      if (logic.maxBedrooms !== undefined && bedroomCount > logic.maxBedrooms) return false;
      if (logic.needsLargePlan && totalAreaM2 < 120) return false;
      return true;
    });

    return allowed.length ? allowed : RESIDENTIAL_LOGICS.filter(l => l.allowedCategories.includes(category));
  }

  private static roomRatioPenalty(room: ResidentialRectRoom): number {
    if (room.kind === 'garden') return 0;

    const rule = this.residentialRoomRules(room.kind);
    const shortSide = Math.max(0.01, Math.min(room.w, room.h));
    const longSide = Math.max(room.w, room.h);
    const ratio = longSide / shortSide;

    let penalty = 0;

    if (shortSide < rule.minShort) {
      penalty += 2000 + (rule.minShort - shortSide) * 1000;
    }

    if (ratio > rule.maxRatio) {
      penalty += 5000 + (ratio - rule.maxRatio) * 1500;
    }

    penalty += Math.abs(ratio - rule.optimalRatio) * 80;

    return penalty;
  }


  private static nearlyEqual(a: number, b: number, epsilon = 0.05): boolean {
    return Math.abs(a - b) < epsilon;
  }

  private static isOutdoorRoom(room: ResidentialRectRoom): boolean {
    const kind = room.kind as string;
    const label = room.label.toLowerCase();
    return ['balcony', 'terrace', 'garden', 'courtyard', 'patio', 'deck', 'porch', 'garage'].includes(kind) || 
           label.includes('unassigned') || 
           label.includes('outdoor');
  }

  private static shouldBeOpenBetween(a: ResidentialRectRoom, b: ResidentialRectRoom): boolean {
    if (a.isOpenPlan || b.isOpenPlan) return true;
    const aLabel = a.label.toLowerCase();
    const bLabel = b.label.toLowerCase();
    
    // Living/Dining/Kitchen triplets often open to each other
    const isPublic = (l: string) => l.includes('living') || l.includes('dining') || l.includes('kitchen') || l.includes('family') || l.includes('lounge');
    if (isPublic(aLabel) && isPublic(bLabel)) {
       if (aLabel.includes('kitchen') || bLabel.includes('kitchen')) {
          return aLabel.includes('open') || bLabel.includes('open');
       }
       return true; 
    }
    return false;
  }

  private static sanitizeResidentialRoomsInPlace(rooms: ResidentialRectRoom[], plan: { x: number; y: number; w: number; h: number }, warnings: string[]) {
    rooms.forEach(room => {
      if (Math.abs(room.x - plan.x) < 0.1) room.x = plan.x;
      if (Math.abs(room.y - plan.y) < 0.1) room.y = plan.y;
      if (Math.abs((room.x + room.w) - (plan.x + plan.w)) < 0.1) room.w = (plan.x + plan.w) - room.x;
      if (Math.abs((room.y + room.h) - (plan.y + plan.h)) < 0.1) room.h = (plan.y + plan.h) - room.y;
    });
  }

  private static getSharedRoomEdge(a: ResidentialRectRoom, b: ResidentialRectRoom) {
    const overlap = (s1: number, e1: number, s2: number, e2: number) => {
      const start = Math.max(s1, s2);
      const end = Math.min(e1, e2);
      return end > start ? { start, end, length: end - start } : null;
    };

    if (this.nearlyEqual(a.x + a.w, b.x)) {
      const v = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
      if (v) return { p1: { x: b.x, y: v.start }, p2: { x: b.x, y: v.end }, length: v.length, orientation: 'vertical' as const };
    }
    if (this.nearlyEqual(a.x, b.x + b.w)) {
      const v = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
      if (v) return { p1: { x: a.x, y: v.start }, p2: { x: a.x, y: v.end }, length: v.length, orientation: 'vertical' as const };
    }
    if (this.nearlyEqual(a.y + a.h, b.y)) {
      const h = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
      if (h) return { p1: { x: h.start, y: b.y }, p2: { x: h.end, y: b.y }, length: h.length, orientation: 'horizontal' as const };
    }
    if (this.nearlyEqual(a.y, b.y + b.h)) {
      const h = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
      if (h) return { p1: { x: h.start, y: a.y }, p2: { x: h.end, y: a.y }, length: h.length, orientation: 'horizontal' as const };
    }
    return null;
  }

  private static roomCenter(room: ResidentialRectRoom): Point {
    return { x: room.x + room.w / 2, y: room.y + room.h / 2 };
  }

  private static roomDistance(a: ResidentialRectRoom, b: ResidentialRectRoom): number {
    const ac = this.roomCenter(a);
    const bc = this.roomCenter(b);
    return Math.hypot(ac.x - bc.x, ac.y - bc.y);
  }

  private static roomTouchesPlanExterior(room: ResidentialRectRoom, plan: { x: number; y: number; w: number; h: number }): boolean {
    return this.nearlyEqual(room.x, plan.x) || this.nearlyEqual(room.y, plan.y) || this.nearlyEqual(room.x + room.w, plan.x + plan.w) || this.nearlyEqual(room.y + room.h, plan.y + plan.h);
  }

  private static roomsShareAccessEdge(a: ResidentialRectRoom, b: ResidentialRectRoom, minLength = 0.75): boolean {
    const shared = this.getSharedRoomEdge(a, b);
    return !!shared && shared.length >= minLength;
  }

  private static findConnectedRooms(room: ResidentialRectRoom, rooms: ResidentialRectRoom[], minLength = 0.75): ResidentialRectRoom[] {
    return rooms.filter(other => other.id !== room.id && !this.isOutdoorRoom(other) && this.roomsShareAccessEdge(room, other, minLength));
  }

  private static isEntryLike(room: ResidentialRectRoom): boolean {
    return room.kind === 'entry' || room.label.toLowerCase().includes('entry') || room.label.toLowerCase().includes('foyer');
  }

  private static isLivingLike(room: ResidentialRectRoom): boolean {
    return room.kind === 'living' || room.kind === 'family' || room.label.toLowerCase().includes('living') || room.label.toLowerCase().includes('lounge');
  }

  private static isKitchenLike(room: ResidentialRectRoom): boolean {
    return room.kind === 'kitchen' || room.label.toLowerCase().includes('kitchen');
  }

  private static isBathroomLike(room: ResidentialRectRoom): boolean {
    return room.kind === 'bath' || room.label.toLowerCase().includes('bath');
  }

  private static isEnsuite(room: ResidentialRectRoom): boolean {
    return room.label.toLowerCase().includes('ensuite');
  }

  private static isMasterBedroom(room: ResidentialRectRoom): boolean {
    return room.label.toLowerCase().includes('master');
  }

  private static validateResidentialFunctionalLogic(rooms: ResidentialRectRoom[], subtype: string, requestedBedrooms: number, requestedBaths: number, plan: { x: number; y: number; w: number; h: number }): ResidentialFunctionalValidation {
    const hardErrors: string[] = [];
    const warnings: string[] = [];
    let penalty = 0;
    const category = this.getResidentialCategory(subtype);
    const internalRooms = rooms.filter(r => !this.isOutdoorRoom(r));
    const livingRooms = internalRooms.filter(r => this.isLivingLike(r));
    const kitchens = internalRooms.filter(r => this.isKitchenLike(r));
    const bedrooms = internalRooms.filter(r => r.kind === 'bedroom');
    const bathrooms = internalRooms.filter(r => this.isBathroomLike(r));
    const corridors = internalRooms.filter(r => r.kind === 'corridor');
    const entries = internalRooms.filter(r => this.isEntryLike(r));
    const outdoorRooms = rooms.filter(r => this.isOutdoorRoom(r));
    const mainLiving = livingRooms[0];

    if (!mainLiving) { hardErrors.push('Missing living anchor.'); penalty += 10000; }
    if (kitchens.length === 0 && subtype !== 'student-housing') { hardErrors.push('Missing kitchen / kitchenette.'); penalty += 8000; }
    if (bedrooms.length !== requestedBedrooms) { hardErrors.push(`Bedroom count mismatch. Requested ${requestedBedrooms}, generated ${bedrooms.length}.`); penalty += 9000; }
    if (bathrooms.length < Math.min(1, requestedBaths)) { hardErrors.push('Missing bathroom.'); penalty += 9000; }

    if (mainLiving && !this.roomTouchesPlanExterior(mainLiving, plan)) { hardErrors.push('Living room must touch exterior boundary.'); penalty += 7000; }
    bedrooms.forEach(bedroom => { if (!this.roomTouchesPlanExterior(bedroom, plan)) { hardErrors.push(`${bedroom.label} must touch exterior boundary for daylight/ventilation.`); penalty += 7000; } });
    kitchens.forEach(kitchen => { if (!this.roomTouchesPlanExterior(kitchen, plan)) { warnings.push(`${kitchen.label} does not touch exterior boundary. Kitchen exterior contact is preferred.`); penalty += 1200; } });
    outdoorRooms.forEach(outdoor => { if ((outdoor.kind === 'balcony' || outdoor.kind === 'terrace') && !this.roomTouchesPlanExterior(outdoor, plan)) { hardErrors.push(`${outdoor.label} must be on exterior edge.`); penalty += 8000; } });

    if (category === 'apartments') {
      outdoorRooms.filter(r => r.kind === 'garden' || r.kind === 'courtyard' || r.kind === 'garage' || r.label.toLowerCase().includes('lawn')).forEach(r => { hardErrors.push(`Apartment must not contain ${r.label}. Use balcony/terrace only.`); penalty += 9000; });
    }
    if (category === 'houses') {
      outdoorRooms.filter(r => r.label.toLowerCase().includes('unassigned')).forEach(r => { warnings.push(`House outdoor should be named/treated as lawn, patio, courtyard, or yard instead of ${r.label}.`); penalty += 1000; });
    }

    entries.forEach(entry => { if (mainLiving && !this.roomsShareAccessEdge(entry, mainLiving, 0.75)) { warnings.push(`${entry.label} should open into living / foyer sequence.`); penalty += 1500; } });
    if (mainLiving) {
      const livingConnections = this.findConnectedRooms(mainLiving, internalRooms);
      if (!livingConnections.some(r => this.isKitchenLike(r)) && kitchens.length > 0) { warnings.push('Living should connect directly or indirectly to kitchen/dining.'); penalty += 2500; }
      if (!livingConnections.some(r => r.kind === 'bedroom' || r.kind === 'corridor' || r.label.toLowerCase().includes('lobby') || r.label.toLowerCase().includes('passage')) && bedrooms.length > 0) { hardErrors.push('Living anchor must connect to bedroom zone or passage.'); penalty += 7000; }
    }

    bedrooms.forEach(bedroom => {
      const connected = this.findConnectedRooms(bedroom, internalRooms);
      if (connected.some(r => this.isEntryLike(r))) { hardErrors.push(`${bedroom.label} must not open directly from entry.`); penalty += 8000; }
      if (connected.some(r => this.isKitchenLike(r))) { hardErrors.push(`${bedroom.label} must not be accessed through kitchen.`); penalty += 9000; }
      if (!connected.some(r => this.isLivingLike(r) || r.kind === 'corridor' || r.label.toLowerCase().includes('passage') || r.label.toLowerCase().includes('lobby'))) { hardErrors.push(`${bedroom.label} needs access from living, corridor, lobby, or passage.`); penalty += 8000; }
    });

    bathrooms.forEach(bath => {
      const connected = this.findConnectedRooms(bath, internalRooms);
      const connectedToKitchen = connected.some(r => this.isKitchenLike(r));
      const connectedToBedroom = connected.some(r => r.kind === 'bedroom');
      const connectedToCorridorOrLiving = connected.some(r => r.kind === 'corridor' || this.isLivingLike(r) || r.label.toLowerCase().includes('lobby') || r.label.toLowerCase().includes('passage'));
      if (connectedToKitchen) { hardErrors.push(`${bath.label} must not open from kitchen.`); penalty += 9000; }
      if (this.isEnsuite(bath)) {
        if (!connected.some(r => r.kind === 'bedroom' && this.isMasterBedroom(r))) { hardErrors.push(`${bath.label} should attach to master bedroom only.`); penalty += 7000; }
      } else {
        if (connectedToBedroom && !connectedToCorridorOrLiving) { hardErrors.push(`${bath.label} should not be accessible only through a bedroom.`); penalty += 8000; }
        if (!connectedToCorridorOrLiving) { hardErrors.push(`${bath.label} needs common access from corridor/lobby/living.`); penalty += 8000; }
      }
    });

    if (subtype === 'studio') {
      if (bedrooms.length > 0) { hardErrors.push('Studio must not generate a separate bedroom.'); penalty += 10000; }
      if (corridors.length > 0) { hardErrors.push('Studio must not generate internal corridor.'); penalty += 9000; }
    }
    if (['2br', '3br', '4br'].includes(subtype)) {
      const bedroomClusterOk = bedrooms.every(bedroom => bedrooms.length <= 1 || bedrooms.some(other => other.id !== bedroom.id && this.roomDistance(bedroom, other) <= Math.max(plan.w, plan.h) * 0.55));
      if (!bedroomClusterOk) { hardErrors.push('Bedrooms must be grouped into a private cluster, not scattered.'); penalty += 8000; }
    }
    if (['3br', '4br'].includes(subtype) && corridors.length === 0) { hardErrors.push('3–4 bedroom apartment requires private corridor/passage logic.'); penalty += 8000; }
    if (subtype === 'penthouse' && !outdoorRooms.some(r => r.kind === 'terrace' || r.label.toLowerCase().includes('terrace'))) { hardErrors.push('Penthouse should include terrace logic.'); penalty += 7000; }
    if (subtype === 'senior-living') corridors.forEach(c => { const ratio = Math.max(c.w, c.h) / Math.max(0.01, Math.min(c.w, c.h)); if (ratio > 6) { hardErrors.push('Senior living must avoid long corridors.'); penalty += 8000; } });
    if (subtype === 'coliving' && !livingRooms.some(r => r.label.toLowerCase().includes('shared') || r.label.toLowerCase().includes('common'))) { hardErrors.push('Co-living requires shared living/common area.'); penalty += 8000; }
    if (subtype === 'student-housing' && !internalRooms.some(r => r.label.toLowerCase().includes('common') || r.label.toLowerCase().includes('study') || r.kind === 'study')) { hardErrors.push('Student housing requires common lounge or study logic.'); penalty += 8000; }

    return { hardErrors, warnings, penalty };
  }

  private static scoreResidentialCandidate(
    logic: ResidentialLogicDefinition,
    rooms: ResidentialRectRoom[],
    requestedBedrooms: number,
    requestedBaths: number,
    subtype: string,
    plan: { x: number; y: number; w: number; h: number }
  ): { score: number; warnings: string[]; hardErrors: string[] } {
    let score = 0;
    const warnings: string[] = [];
    const bedrooms = rooms.filter(r => r.kind === 'bedroom');
    const baths = rooms.filter(r => r.kind === 'bath');
    const living = rooms.find(r => r.kind === 'living');
    const kitchen = rooms.find(r => r.kind === 'kitchen');
    const dining = rooms.find(r => r.kind === 'dining');

    if (bedrooms.length !== requestedBedrooms) { score += 8000; warnings.push(`${logic.name}: bedroom count mismatch.`); }
    if (baths.length !== requestedBaths) { score += 5000; warnings.push(`${logic.name}: bathroom count mismatch.`); }

    rooms.forEach(room => {
      const p = this.roomRatioPenalty(room);
      score += p;
      const rule = this.residentialRoomRules(room.kind);
      const ratio = Math.max(room.w, room.h) / Math.max(0.01, Math.min(room.w, room.h));
      if (p > 0 && ratio > rule.maxRatio) warnings.push(`${room.label} ratio ${ratio.toFixed(1)} exceeds max ${rule.maxRatio}.`);
    });

    if (!living) { score += 6000; warnings.push(`${logic.name}: missing living anchor.`); }
    if (kitchen && dining) {
      const dist = Math.hypot((kitchen.x + kitchen.w / 2) - (dining.x + dining.w / 2), (kitchen.y + kitchen.h / 2) - (dining.y + dining.h / 2));
      if (dist > 5.0) { score += 900; warnings.push(`${logic.name}: dining too far from kitchen.`); }
    }
    baths.forEach(bath => {
      const bx = bath.x + bath.w / 2, by = bath.y + bath.h / 2;
      const nearestBed = bedrooms.reduce((best, b) => Math.min(best, Math.hypot(bx - (b.x + b.w / 2), by - (b.y + b.h / 2))), Infinity);
      if (nearestBed > 6.5) { score += 1200; warnings.push(`${bath.label} too far from bedroom zone.`); }
    });

    const uniqueX = new Set(rooms.map(r => Math.round(r.x * 10) / 10)).size;
    const uniqueY = new Set(rooms.map(r => Math.round(r.y * 10) / 10)).size;
    if (uniqueX <= 3 && uniqueY <= 3) { score += 1800; warnings.push(`${logic.name}: layout may be too grid-simple.`); }
    if (logic.corridorMode === 'none' && rooms.some(r => r.kind === 'corridor')) { score += 1200; warnings.push(`${logic.name}: corridor generated despite no-corridor logic.`); }

    const functional = this.validateResidentialFunctionalLogic(rooms, subtype, requestedBedrooms, requestedBaths, plan);
    score += functional.penalty;
    functional.warnings.forEach(w => warnings.push(w));
    functional.hardErrors.forEach(e => warnings.push(`HARD RULE: ${e}`));

    return { score, warnings, hardErrors: functional.hardErrors };
  }

  private static chooseResidentialLogicCandidate(
    candidates: ResidentialSchemeCandidate[],
    seed: number
  ): ResidentialSchemeCandidate {
    const valid = candidates.filter(c => c.rooms.length > 0);

    if (!valid.length) {
      return candidates[0];
    }

    const sorted = [...valid].sort((a, b) => a.score - b.score);
    const bestScore = sorted[0].score;

    // Keep only candidates that are acceptable, but do not always select the single best.
    const acceptable = sorted.filter(c => c.score <= bestScore + 4200);

    // Prefer a different topology family based on seed.
    const families = [...new Set(acceptable.map(c => c.logic.family))];
    const targetFamily = families[Math.floor(this.residentialRandom(seed, 77) * families.length)];

    const familyBand = acceptable.filter(c => c.logic.family === targetFamily);
    const choiceBand = familyBand.length ? familyBand : acceptable;

    const index = Math.floor(this.residentialRandom(seed, 78) * choiceBand.length);

    return choiceBand[Math.max(0, Math.min(index, choiceBand.length - 1))];
  }

  private static addRoomSafe(
    rooms: ResidentialRectRoom[],
    room: Omit<ResidentialRectRoom, 'id'>
  ) {
    if (room.w <= 0.45 || room.h <= 0.45) return;

    rooms.push({
      id: crypto.randomUUID(),
      ...room
    });
  }

  private static addBathsHorizontal(
    rooms: ResidentialRectRoom[],
    x: number,
    y: number,
    w: number,
    h: number,
    count: number
  ) {
    const bathW = w / Math.max(1, count);

    for (let i = 0; i < count; i++) {
      this.addRoomSafe(rooms, {
        label: i === 0 ? 'Common Bath' : i === 1 ? 'Ensuite Bath' : `Bath ${i + 1}`,
        kind: 'bath',
        x: x + bathW * i,
        y,
        w: bathW,
        h,
        color: i === 1 ? '#f1f5f9' : '#f0f9ff'
      });
    }
  }

  private static addBathsVertical(
    rooms: ResidentialRectRoom[],
    x: number,
    y: number,
    w: number,
    h: number,
    count: number
  ) {
    const bathH = h / Math.max(1, count);

    for (let i = 0; i < count; i++) {
      this.addRoomSafe(rooms, {
        label: i === 0 ? 'Common Bath' : i === 1 ? 'Ensuite Bath' : `Bath ${i + 1}`,
        kind: 'bath',
        x,
        y: y + bathH * i,
        w,
        h: bathH,
        color: i === 1 ? '#f1f5f9' : '#f0f9ff'
      });
    }
  }

  private static addBedroomsHorizontal(
    rooms: ResidentialRectRoom[],
    x: number,
    y: number,
    w: number,
    h: number,
    count: number
  ) {
    const weights = Array.from({ length: count }, (_, i) => i === 0 ? 1.18 : 1);
    const total = weights.reduce((s, v) => s + v, 0);

    let cx = x;

    for (let i = 0; i < count; i++) {
      const bw = i === count - 1 ? x + w - cx : w * weights[i] / total;

      this.addRoomSafe(rooms, {
        label: i === 0 ? 'Master Bedroom' : `Bedroom ${i + 1}`,
        kind: 'bedroom',
        x: cx,
        y,
        w: bw,
        h,
        color: '#e0f2fe',
        daylight: 'required',
        exteriorContact: true
      });

      cx += bw;
    }
  }

  private static addBedroomsVertical(
    rooms: ResidentialRectRoom[],
    x: number,
    y: number,
    w: number,
    h: number,
    count: number
  ) {
    const weights = Array.from({ length: count }, (_, i) => i === 0 ? 1.18 : 1);
    const total = weights.reduce((s, v) => s + v, 0);

    let cy = y;

    for (let i = 0; i < count; i++) {
      const bh = i === count - 1 ? y + h - cy : h * weights[i] / total;

      this.addRoomSafe(rooms, {
        label: i === 0 ? 'Master Bedroom' : `Bedroom ${i + 1}`,
        kind: 'bedroom',
        x,
        y: cy,
        w,
        h: bh,
        color: '#e0f2fe',
        daylight: 'required',
        exteriorContact: true
      });

      cy += bh;
    }
  }

  private static planAspect(plan: { w: number; h: number }) {
    return plan.w / Math.max(0.01, plan.h);
  }

  private static generateRoomsForResidentialLogic(
    logic: ResidentialLogicDefinition,
    plan: { x: number; y: number; w: number; h: number },
    requestedBedrooms: number,
    requestedBaths: number,
    subtype: string,
    seed: number,
    dna: ResidentialDesignDNA
  ): ResidentialRectRoom[] {
    const rooms: ResidentialRectRoom[] = [];
    const beds = Math.max(1, requestedBedrooms);
    const baths = Math.max(1, requestedBaths);
    const aspect = this.planAspect(plan);

    const add = (room: Omit<ResidentialRectRoom, 'id'>) => this.addRoomSafe(rooms, room);

    const entryW = this.clampNumber(plan.w * 0.16, 1.5, 2.8);
    const entryH = this.clampNumber(plan.h * 0.14, 1.3, 2.2);

    const shouldMakeEntryRoom = dna.entryMode === 'enclosed';
    const shouldMakeEntryNiche = dna.entryMode === 'niche';

    const addEntry = (x: number, y: number, w: number, h: number) => {
      if (shouldMakeEntryRoom) {
        add({
          label: 'Entry',
          kind: 'entry',
          x,
          y,
          w,
          h,
          color: '#f8fafc'
        });
        return { usedW: w, usedH: h };
      }

      if (shouldMakeEntryNiche) {
        // Fill the height to avoid gaps, but keep it narrow
        const nicheW = Math.min(w, 1.4);
        add({
          label: 'Entry Niche',
          kind: 'entry',
          x,
          y,
          w: nicheW,
          h: h,
          color: '#f8fafc'
        });
        return { usedW: nicheW, usedH: h };
      }

      return { usedW: 0, usedH: 0 };
    };

    const kitchenLabel =
      dna.kitchenMode === 'open'
        ? 'Open Kitchen'
        : dna.kitchenMode === 'semiOpen'
          ? 'Semi-Open Kitchen'
          : 'Closed Kitchen';

    const livingLabel =
      dna.diningMode === 'merged'
        ? 'Living / Dining'
        : dna.diningMode === 'none'
          ? 'Living Room'
          : 'Living Room';

    const needsSeparateDining = dna.diningMode === 'separate';

    // ------------------------------------------------------------
    // 1. PUBLIC FRONT / PRIVATE REAR
    // ------------------------------------------------------------
    if (logic.family === 'PUBLIC_PRIVATE_BAR') {
      const publicH = this.clampNumber(plan.h * 0.42, 4.0, plan.h * 0.52);
      const serviceH = this.clampNumber(plan.h * 0.20, 2.1, 3.2);
      const privateH = plan.h - publicH - serviceH;

      const kitchenW = this.clampNumber(plan.w * 0.32, 3.0, plan.w * 0.42);

      const entryUsed = addEntry(plan.x, plan.y, entryW, entryH);
      const publicStartX = plan.x + entryUsed.usedW;
      const publicW = plan.w - entryUsed.usedW - kitchenW;

      if (needsSeparateDining && publicW > 5.8) {
        add({
          label: 'Living Room',
          kind: 'living',
          x: publicStartX,
          y: plan.y,
          w: publicW,
          h: publicH * 0.62,
          color: '#fef3c7',
          daylight: 'required',
          exteriorContact: true
        });

        add({
          label: 'Dining',
          kind: 'dining',
          x: publicStartX,
          y: plan.y + publicH * 0.62,
          w: publicW,
          h: publicH * 0.38,
          color: '#fffbeb',
          daylight: 'preferred'
        });
      } else {
        add({
          label: livingLabel,
          kind: 'living',
          x: publicStartX,
          y: plan.y,
          w: publicW,
          h: publicH,
          color: '#fef3c7',
          daylight: 'required',
          exteriorContact: true
        });
      }

      add({
        label: kitchenLabel,
        kind: 'kitchen',
        x: plan.x + plan.w - kitchenW,
        y: plan.y,
        w: kitchenW,
        h: dna.kitchenMode === 'open' ? publicH * 0.72 : publicH,
        color: '#f1f5f9',
        daylight: 'preferred'
      });

      add({ label: beds > 1 ? 'Bedroom Lobby' : 'Private Lobby', kind: 'corridor', x: plan.x, y: plan.y + publicH, w: plan.w * 0.52, h: serviceH, color: '#f8fafc' });
      this.addBathsHorizontal(rooms, plan.x + plan.w * 0.52, plan.y + publicH, plan.w * 0.48, serviceH, baths);
      this.addBedroomsHorizontal(rooms, plan.x, plan.y + publicH + serviceH, plan.w, privateH, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 2. OPEN PUBLIC CORE
    // ------------------------------------------------------------
    if (logic.family === 'OPEN_PUBLIC_CORE') {
      const publicW = this.clampNumber(plan.w * 0.62, 4.4, plan.w * 0.72);
      const serviceW = plan.w - publicW;
      const bathH = this.clampNumber(plan.h * 0.26, 2.2, 3.6);
      const kitchenH = this.clampNumber(plan.h * 0.32, 2.8, 4.6);

      const entryUsed = addEntry(plan.x, plan.y, entryW, entryH);
      const publicTopY = plan.y + entryUsed.usedH;

      add({
        label: dna.diningMode === 'merged' ? 'Open Living / Dining' : 'Open Living',
        kind: 'living',
        x: plan.x,
        y: publicTopY,
        w: publicW,
        h: plan.h - entryUsed.usedH,
        color: '#fef3c7',
        daylight: 'required',
        exteriorContact: true
      });

      if (needsSeparateDining) {
        add({
          label: 'Dining',
          kind: 'dining',
          x: plan.x + publicW,
          y: plan.y,
          w: serviceW,
          h: kitchenH * 0.42,
          color: '#fffbeb',
          daylight: 'preferred'
        });

        add({
          label: kitchenLabel,
          kind: 'kitchen',
          x: plan.x + publicW,
          y: plan.y + kitchenH * 0.42,
          w: serviceW,
          h: kitchenH * 0.58,
          color: '#f1f5f9',
          daylight: 'preferred'
        });
      } else {
        add({
          label: kitchenLabel,
          kind: 'kitchen',
          x: plan.x + publicW,
          y: plan.y,
          w: serviceW,
          h: kitchenH,
          color: '#f1f5f9',
          daylight: 'preferred'
        });
      }

      this.addBathsVertical(rooms, plan.x + publicW, plan.y + kitchenH, serviceW, bathH, baths);

      const bedZoneY = plan.y + kitchenH + bathH;
      this.addBedroomsVertical(rooms, plan.x + publicW, bedZoneY, serviceW, plan.y + plan.h - bedZoneY, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 3. SIDE WING
    // ------------------------------------------------------------
    if (logic.family === 'SIDE_WING') {
      const publicW = this.clampNumber(plan.w * 0.50, 4.0, plan.w * 0.60);
      const wingW = plan.w - publicW;
      const serviceH = this.clampNumber(plan.h * 0.28, 2.3, 3.7);

      const entryUsed = addEntry(plan.x, plan.y, publicW, entryH);
      add({ 
        label: livingLabel, 
        kind: 'living', 
        x: plan.x, 
        y: plan.y + entryUsed.usedH, 
        w: publicW, 
        h: plan.h - entryUsed.usedH, 
        color: '#fef3c7', 
        daylight: 'required', 
        exteriorContact: true 
      });

      add({ 
        label: kitchenLabel, 
        kind: 'kitchen', 
        x: plan.x + publicW, 
        y: plan.y, 
        w: wingW, 
        h: serviceH * 0.55, 
        color: '#f1f5f9', 
        daylight: 'preferred' 
      });
      this.addBathsHorizontal(rooms, plan.x + publicW, plan.y + serviceH * 0.55, wingW, serviceH * 0.45, baths);
      this.addBedroomsVertical(rooms, plan.x + publicW, plan.y + serviceH, wingW, plan.h - serviceH, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 4. COMPACT WET CORE
    // ------------------------------------------------------------
    if (logic.family === 'COMPACT_WET_CORE') {
      const coreW = this.clampNumber(plan.w * 0.34, 3.0, 4.8);
      const coreH = this.clampNumber(plan.h * 0.48, 4.0, 5.8);

      const coreX = plan.x + plan.w - coreW;
      const publicH = this.clampNumber(plan.h * 0.52, 4.2, plan.h * 0.62);

      const entryUsed = addEntry(plan.x, plan.y, entryW, entryH);
      add({ 
        label: livingLabel, 
        kind: 'living', 
        x: plan.x + entryUsed.usedW, 
        y: plan.y, 
        w: plan.w - entryUsed.usedW - coreW, 
        h: publicH, 
        color: '#fef3c7', 
        daylight: 'required', 
        exteriorContact: true 
      });

      add({ label: 'Kitchen Core', kind: 'kitchen', x: coreX, y: plan.y, w: coreW, h: coreH * 0.46, color: '#f1f5f9' });
      this.addBathsVertical(rooms, coreX, plan.y + coreH * 0.46, coreW, coreH * 0.54, baths);

      this.addBedroomsHorizontal(rooms, plan.x, plan.y + publicH, plan.w, plan.h - publicH, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 5. SPLIT BEDROOMS
    // ------------------------------------------------------------
    if (logic.family === 'SPLIT_BEDROOMS') {
      const leftW = this.clampNumber(plan.w * 0.32, 3.2, plan.w * 0.42);
      const rightW = leftW;
      const centerW = plan.w - leftW - rightW;
      const serviceH = this.clampNumber(plan.h * 0.30, 2.5, 4.0);

      const entryUsed = addEntry(plan.x + leftW, plan.y, centerW, entryH);
      add({ 
        label: livingLabel, 
        kind: 'living', 
        x: plan.x + leftW, 
        y: plan.y + entryUsed.usedH, 
        w: centerW, 
        h: plan.h - entryUsed.usedH, 
        color: '#fef3c7', 
        daylight: 'required', 
        exteriorContact: true 
      });

      add({ label: 'Master Bedroom', kind: 'bedroom', x: plan.x, y: plan.y, w: leftW, h: plan.h, color: '#e0f2fe', daylight: 'required', exteriorContact: true });

      const remainingBeds = Math.max(1, beds - 1);
      this.addBedroomsVertical(rooms, plan.x + leftW + centerW, plan.y + serviceH, rightW, plan.h - serviceH, remainingBeds);
      this.addBathsHorizontal(rooms, plan.x + leftW + centerW, plan.y, rightW, serviceH, baths);

      return rooms;
    }

    // ------------------------------------------------------------
    // 6. GALLERY RAIL
    // ------------------------------------------------------------
    if (logic.family === 'GALLERY_RAIL') {
      const galleryW = this.clampNumber(plan.w * 0.20, 1.6, 2.8);
      const serviceW = this.clampNumber(plan.w * 0.30, 3.0, 4.8);
      const privateH = this.clampNumber(plan.h * 0.42, 3.4, plan.h * 0.50);

      add({ label: 'Gallery Entry', kind: 'entry', x: plan.x, y: plan.y, w: galleryW, h: plan.h, color: '#f8fafc' });
      add({ label: 'Living / Dining', kind: 'living', x: plan.x + galleryW, y: plan.y, w: plan.w - galleryW - serviceW, h: plan.h - privateH, color: '#fef3c7', daylight: 'required', exteriorContact: true });

      add({ label: 'Kitchen', kind: 'kitchen', x: plan.x + plan.w - serviceW, y: plan.y, w: serviceW, h: (plan.h - privateH) * 0.48, color: '#f1f5f9' });
      this.addBathsVertical(rooms, plan.x + plan.w - serviceW, plan.y + (plan.h - privateH) * 0.48, serviceW, (plan.h - privateH) * 0.52, baths);

      this.addBedroomsHorizontal(rooms, plan.x + galleryW, plan.y + plan.h - privateH, plan.w - galleryW, privateH, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 7. SERVICE SPINE
    // ------------------------------------------------------------
    if (logic.family === 'SERVICE_SPINE') {
      const spineW = this.clampNumber(plan.w * 0.24, 2.4, 3.8);
      const leftW = (plan.w - spineW) * 0.52;
      const rightW = plan.w - spineW - leftW;

      const entryUsed = addEntry(plan.x, plan.y, leftW, entryH);
      add({ 
        label: livingLabel, 
        kind: 'living', 
        x: plan.x, 
        y: plan.y + entryUsed.usedH, 
        w: leftW, 
        h: plan.h - entryUsed.usedH, 
        color: '#fef3c7', 
        daylight: 'required', 
        exteriorContact: true 
      });

      add({ label: 'Kitchen Spine', kind: 'kitchen', x: plan.x + leftW, y: plan.y, w: spineW, h: plan.h * 0.42, color: '#f1f5f9' });
      add({ label: 'Utility Spine', kind: 'utility', x: plan.x + leftW, y: plan.y + plan.h * 0.42, w: spineW, h: plan.h * 0.18, color: '#f8fafc' });
      this.addBathsVertical(rooms, plan.x + leftW, plan.y + plan.h * 0.60, spineW, plan.h * 0.40, baths);

      this.addBedroomsVertical(rooms, plan.x + leftW + spineW, plan.y, rightW, plan.h, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 8. CORNER ANCHOR
    // ------------------------------------------------------------
    if (logic.family === 'CORNER_ANCHOR') {
      const publicW = this.clampNumber(plan.w * 0.58, 4.4, plan.w * 0.68);
      const publicH = this.clampNumber(plan.h * 0.58, 4.4, plan.h * 0.68);
      const sideW = plan.w - publicW;
      const bottomH = plan.h - publicH;

      const entryUsed = addEntry(plan.x, plan.y, entryW, entryH);
      add({ 
        label: 'Corner ' + livingLabel, 
        kind: 'living', 
        x: plan.x, 
        y: plan.y + entryUsed.usedH, 
        w: publicW, 
        h: publicH - entryUsed.usedH, 
        color: '#fef3c7', 
        daylight: 'required', 
        exteriorContact: true 
      });

      add({ label: 'Kitchen', kind: 'kitchen', x: plan.x + publicW, y: plan.y, w: sideW, h: publicH * 0.48, color: '#f1f5f9', daylight: 'preferred' });
      this.addBathsVertical(rooms, plan.x + publicW, plan.y + publicH * 0.48, sideW, publicH * 0.52, baths);

      this.addBedroomsHorizontal(rooms, plan.x, plan.y + publicH, plan.w, bottomH, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 9. NO CORRIDOR
    // ------------------------------------------------------------
    if (logic.family === 'NO_CORRIDOR') {
      const publicH = this.clampNumber(plan.h * 0.56, 4.2, plan.h * 0.66);
      const kitchenW = this.clampNumber(plan.w * 0.32, 2.8, 4.4);

      const entryUsed = addEntry(plan.x, plan.y, entryW, entryH);

      add({
        label: dna.entryMode === 'direct' ? 'Living Distributor' : 'Living Room',
        kind: 'living',
        x: plan.x + entryUsed.usedW,
        y: plan.y,
        w: plan.w - entryUsed.usedW - kitchenW,
        h: publicH,
        color: '#fef3c7',
        daylight: 'required',
        exteriorContact: true
      });

      add({
        label: dna.kitchenMode === 'open' ? 'Open Kitchen / Dining' : kitchenLabel,
        kind: 'kitchen',
        x: plan.x + plan.w - kitchenW,
        y: plan.y,
        w: kitchenW,
        h: dna.kitchenMode === 'closed' ? publicH * 0.62 : publicH * 0.50,
        color: '#f1f5f9'
      });
      this.addBathsHorizontal(rooms, plan.x + plan.w - kitchenW, plan.y + publicH * 0.55, kitchenW, publicH * 0.45, baths);
      this.addBedroomsHorizontal(rooms, plan.x, plan.y + publicH, plan.w, plan.h - publicH, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 10. BALCONY FRONT
    // ------------------------------------------------------------
    if (logic.family === 'BALCONY_FRONT') {
      const balconyH = this.clampNumber(plan.h * 0.14, 1.2, 2.4);
      const publicH = this.clampNumber(plan.h * 0.38, 3.8, plan.h * 0.48);
      const serviceW = this.clampNumber(plan.w * 0.32, 3.0, 4.8);

      add({ label: 'Balcony / Terrace Edge', kind: 'balcony', x: plan.x, y: plan.y, w: plan.w, h: balconyH, color: '#f0fdf4', daylight: 'required', exteriorContact: true });
      
      const entryUsed = addEntry(plan.x, plan.y + balconyH, entryW, entryH);
      add({ 
        label: livingLabel + ' to Balcony', 
        kind: 'living', 
        x: plan.x + entryUsed.usedW, 
        y: plan.y + balconyH, 
        w: plan.w - entryUsed.usedW - serviceW, 
        h: publicH, 
        color: '#fef3c7', 
        daylight: 'required', 
        exteriorContact: true 
      });
      add({ label: 'Kitchen', kind: 'kitchen', x: plan.x + plan.w - serviceW, y: plan.y + balconyH, w: serviceW, h: publicH, color: '#f1f5f9' });

      this.addBathsHorizontal(rooms, plan.x + plan.w - serviceW, plan.y + balconyH + publicH, serviceW, 2.4, baths);
      this.addBedroomsHorizontal(rooms, plan.x, plan.y + balconyH + publicH + 2.4, plan.w, plan.h - balconyH - publicH - 2.4, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 11. CENTRAL HUB
    // ------------------------------------------------------------
    if (logic.family === 'CENTRAL_HUB') {
      const hubW = this.clampNumber(plan.w * 0.46, 4.0, plan.w * 0.56);
      const hubH = this.clampNumber(plan.h * 0.46, 4.0, plan.h * 0.56);
      const hubX = plan.x + (plan.w - hubW) / 2;
      const hubY = plan.y + (plan.h - hubH) / 2;

      add({ label: 'Living Hub (Central)', kind: 'living', x: hubX, y: hubY, w: hubW, h: hubH, color: '#fef3c7', daylight: 'preferred' });

      // Entry
      add({ label: 'Entry Foyer', kind: 'entry', x: plan.x, y: hubY, w: hubX - plan.x, h: hubH * 0.5, color: '#f8fafc' });

      // Kitchen
      add({ label: 'Hub Kitchen', kind: 'kitchen', x: plan.x, y: hubY + hubH * 0.5, w: hubX - plan.x, h: hubH * 0.5, color: '#f1f5f9' });

      // Bedrooms & Baths
      this.addBedroomsHorizontal(rooms, plan.x, plan.y + hubY + hubH, plan.w, plan.y + plan.h - (hubY + hubH), beds);
      this.addBathsHorizontal(rooms, plan.x, plan.y, plan.w, hubY, baths);

      return rooms;
    }

    // ------------------------------------------------------------
    // 12. COURTYARD RING
    // ------------------------------------------------------------
    if (logic.family === 'COURTYARD_RING') {
      const courtW = this.clampNumber(plan.w * 0.30, 3.0, 5.5);
      const courtH = this.clampNumber(plan.h * 0.30, 3.0, 5.5);
      const cx = plan.x + (plan.w - courtW) / 2;
      const cy = plan.y + (plan.h - courtH) / 2;

      add({ label: 'Inner Courtyard', kind: 'courtyard', x: cx, y: cy, w: courtW, h: courtH, color: '#f0fdf4', daylight: 'required', exteriorContact: true });

      // Public top
      add({ label: 'Living / Dining Ring', kind: 'living', x: plan.x, y: plan.y, w: plan.w, h: cy - plan.y, color: '#fef3c7', daylight: 'required', exteriorContact: true });

      // Service left
      add({ label: 'Kitchen / Entrance', kind: 'kitchen', x: plan.x, y: cy, w: cx - plan.x, h: courtH, color: '#f1f5f9' });

      // Baths right
      this.addBathsVertical(rooms, cx + courtW, cy, plan.x + plan.w - (cx + courtW), courtH, baths);

      // Bedrooms bottom
      this.addBedroomsHorizontal(rooms, plan.x, cy + courtH, plan.w, plan.y + plan.h - (cy + courtH), beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 13. LINEAR PASSAGE
    // ------------------------------------------------------------
    if (logic.family === 'LINEAR_PASSAGE') {
      const passageH = 1.35;
      const publicW = this.clampNumber(plan.w * 0.44, 4.0, plan.w * 0.54);
      const detailW = plan.w - publicW;

      add({ label: 'Linear Entry / Corridor', kind: 'corridor', x: plan.x, y: plan.y, w: plan.w, h: passageH, color: '#f8fafc' });

      add({ label: 'Living Room', kind: 'living', x: plan.x, y: plan.y + passageH, w: publicW, h: plan.h - passageH, color: '#fef3c7', daylight: 'required', exteriorContact: true });

      add({ label: 'Kitchen', kind: 'kitchen', x: plan.x + publicW, y: plan.y + passageH, w: detailW, h: (plan.h - passageH) * 0.35, color: '#f1f5f9' });
      this.addBathsHorizontal(rooms, plan.x + publicW, plan.y + passageH + (plan.h - passageH) * 0.35, detailW, 2.2, baths);

      const bedY = plan.y + passageH + (plan.h - passageH) * 0.35 + 2.2;
      this.addBedroomsVertical(rooms, plan.x + publicW, bedY, detailW, plan.y + plan.h - bedY, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 14. DUAL ASPECT
    // ------------------------------------------------------------
    if (logic.family === 'DUAL_ASPECT') {
      const publicW = this.clampNumber(plan.w * 0.50, 4.5, plan.w * 0.60);
      const serviceW = 2.4;
      const bedW = plan.w - publicW - serviceW;

      add({ label: 'Entry Passage', kind: 'entry', x: plan.x, y: plan.y, w: publicW, h: entryH, color: '#f8fafc' });
      add({ label: 'Through Living / Dining', kind: 'living', x: plan.x, y: plan.y + entryH, w: publicW, h: plan.h - entryH, color: '#fef3c7', daylight: 'required', exteriorContact: true });

      add({ label: 'Kitchen Center', kind: 'kitchen', x: plan.x + publicW, y: plan.y, w: serviceW, h: plan.h * 0.5, color: '#f1f5f9' });
      this.addBathsVertical(rooms, plan.x + publicW, plan.y + plan.h * 0.5, serviceW, plan.h * 0.5, baths);

      this.addBedroomsVertical(rooms, plan.x + publicW + serviceW, plan.y, bedW, plan.h, beds);

      return rooms;
    }

    // ------------------------------------------------------------
    // 15. SHARED HUB
    // ------------------------------------------------------------
    if (logic.family === 'SHARED_HUB') {
      const commonW = this.clampNumber(plan.w * 0.44, 4.0, plan.w * 0.54);
      const moduleW = plan.w - commonW;
      const kitchenH = this.clampNumber(plan.h * 0.32, 2.8, 4.5);

      add({ label: 'Entry', kind: 'entry', x: plan.x, y: plan.y, w: entryW, h: entryH, color: '#f8fafc' });
      add({ label: 'Shared / Community Lounge', kind: 'living', x: plan.x, y: plan.y + entryH, w: commonW, h: plan.h - entryH, color: '#fef3c7', daylight: 'required', exteriorContact: true });

      add({ label: 'Common Kitchen', kind: 'kitchen', x: plan.x + commonW, y: plan.y, w: moduleW, h: kitchenH, color: '#f1f5f9' });
      this.addBathsVertical(rooms, plan.x + commonW, plan.y + kitchenH, moduleW * 0.4, plan.h - kitchenH, baths);
      this.addBedroomsVertical(rooms, plan.x + commonW + moduleW * 0.4, plan.y + kitchenH, moduleW * 0.6, plan.h - kitchenH, beds);

      return rooms;
    }

    // Fallback if family not handled or unknown
    const fallbackPublicH = plan.h * 0.5;
    add({ label: 'Entry', kind: 'entry', x: plan.x, y: plan.y, w: entryW, h: entryH, color: '#f8fafc' });
    add({ label: 'Living', kind: 'living', x: plan.x + entryW, y: plan.y, w: plan.w - entryW, h: fallbackPublicH, color: '#fef3c7', daylight: 'required' });
    this.addBedroomsHorizontal(rooms, plan.x, plan.y + fallbackPublicH, plan.w, plan.h - fallbackPublicH, beds);

    return rooms;
  }

  private static addResidentialWalls(
    rooms: ResidentialRectRoom[],
    elements: ArchElement[],
    shell: { x: number; y: number; w: number; h: number },
    plan: { x: number; y: number; w: number; h: number },
    geometry: LayoutGeometry
  ) {
    type WallRecord = { p1: Point; p2: Point; type: 'building-exterior' | 'building-interior' | 'site-boundary' | 'garden-boundary'; owners: ResidentialRectRoom[] };
    const wallMap = new Map<string, WallRecord>();
    const snap = (n: number) => Math.round(n * 1000) / 1000;
    const pointKey = (p: Point) => `${snap(p.x)},${snap(p.y)}`;
    const edgeKey = (a: Point, b: Point) => { const ak = pointKey(a), bk = pointKey(b); return ak < bk ? `${ak}|${bk}` : `${bk}|${ak}`; };
    const isOnPlan = (a: Point, b: Point) => (this.nearlyEqual(a.y, plan.y) && this.nearlyEqual(b.y, plan.y)) || (this.nearlyEqual(a.y, plan.y + plan.h) && this.nearlyEqual(b.y, plan.y + plan.h)) || (this.nearlyEqual(a.x, plan.x) && this.nearlyEqual(b.x, plan.x)) || (this.nearlyEqual(a.x, plan.x + plan.w) && this.nearlyEqual(b.x, plan.x + plan.w));
    const isOnShell = (a: Point, b: Point) => (this.nearlyEqual(a.y, shell.y) && this.nearlyEqual(b.y, shell.y)) || (this.nearlyEqual(a.y, shell.y + shell.h) && this.nearlyEqual(b.y, shell.y + shell.h)) || (this.nearlyEqual(a.x, shell.x) && this.nearlyEqual(b.x, shell.x)) || (this.nearlyEqual(a.x, shell.x + shell.w) && this.nearlyEqual(b.x, shell.x + shell.w));

    rooms.forEach(room => {
      const pts = this.rectToPolygon(room).points;
      const outdoor = this.isOutdoorRoom(room);
      for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
        const key = edgeKey(p1, p2);
        let type: WallRecord['type'] = 'building-interior';
        if (!outdoor && isOnPlan(p1, p2)) type = 'building-exterior';
        else if (isOnShell(p1, p2)) type = 'site-boundary';
        else if (outdoor) type = 'garden-boundary';
        if (!wallMap.has(key)) wallMap.set(key, { p1, p2, type, owners: [room] });
        else { const existing = wallMap.get(key)!; existing.owners.push(room); if (type === 'building-interior' || existing.type === 'building-interior') existing.type = 'building-interior'; }
      }
    });

    const addSegmentedWallWithOpening = (p1: Point, p2: Point, exterior: boolean, openingRatio = 0.62) => {
      const length = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (length < 1.2) return;
      const gap = Math.min(length * openingRatio, length - 0.7);
      const side = (length - gap) / 2;
      const dx = (p2.x - p1.x) / length, dy = (p2.y - p1.y) / length;
      const a1 = p1, a2 = { x: p1.x + dx * side, y: p1.y + dy * side };
      const b1 = { x: p2.x - dx * side, y: p2.y - dy * side }, b2 = p2;
      if (Math.hypot(a2.x - a1.x, a2.y - a1.y) > 0.25) this.addWall(elements, a1, a2, exterior, geometry);
      if (Math.hypot(b2.x - b1.x, b2.y - b1.y) > 0.25) this.addWall(elements, b1, b2, exterior, geometry);
    };

    wallMap.forEach(edge => {
      const length = Math.hypot(edge.p2.x - edge.p1.x, edge.p2.y - edge.p1.y);
      if (length <= 0.1) return;
      if (edge.owners.length >= 2) {
        const [a, b] = edge.owners;
        if (this.shouldBeOpenBetween(a, b)) { addSegmentedWallWithOpening(edge.p1, edge.p2, false, 0.72); return; }
        this.addWall(elements, edge.p1, edge.p2, false, geometry);
        return;
      }
      if (edge.type === 'site-boundary' || edge.type === 'garden-boundary') elements.push({ id: crypto.randomUUID(), type: 'line', p1: edge.p1, p2: edge.p2, thickness: 0.05 });
      else this.addWall(elements, edge.p1, edge.p2, edge.type === 'building-exterior', geometry);
    });
  }


  private static addResidentialLabels(
    rooms: ResidentialRectRoom[],
    elements: ArchElement[],
    unitSystem: 'metric' | 'imperial'
  ) {
    rooms.forEach(room => {
      const areaM2 = room.w * room.h;

      let dimStr = '';
      let areaStr = '';

      if (unitSystem === 'imperial') {
        const wFt = room.w * 3.28084;
        const hFt = room.h * 3.28084;
        dimStr = `${wFt.toFixed(1)}' x ${hFt.toFixed(1)}'`;
        areaStr = `(${(areaM2 * 10.7639).toFixed(1)} ft²)`;
      } else {
        dimStr = `${room.w.toFixed(1)}m x ${room.h.toFixed(1)}m`;
        areaStr = `(${areaM2.toFixed(1)} m²)`;
      }

      elements.push({
        id: crypto.randomUUID(),
        type: 'room',
        label: `${room.label.toUpperCase()}\n${dimStr}\n${areaStr}`,
        pos: {
          x: room.x + room.w / 2,
          y: room.y + room.h / 2
        },
        width: room.w,
        depth: room.h,
        color: room.color
      });
    });
  }

  private static addResidentialOpenings(
    rooms: ResidentialRectRoom[],
    elements: ArchElement[],
    shell: { x: number; y: number; w: number; h: number },
    plan: { x: number; y: number; w: number; h: number }
  ) {
    type OpeningRecord = { x: number; y: number; rotation: number; width: number; kind: 'door' | 'window' };
    const openings: OpeningRecord[] = [];
    const overlapsOpening = (x: number, y: number, rotation: number, width: number, clearance = 0.35) => openings.some(o => {
      const sameHorizontal = rotation === 0 && o.rotation === 0 && Math.abs(o.y - y) < 0.08;
      const sameVertical = rotation === 90 && o.rotation === 90 && Math.abs(o.x - x) < 0.08;
      if (!sameHorizontal && !sameVertical) return false;
      return rotation === 0 ? Math.abs(o.x - x) < (o.width + width) / 2 + clearance : Math.abs(o.y - y) < (o.width + width) / 2 + clearance;
    });
    const addDoor = (x: number, y: number, rotation: number, width = 0.9) => { if (overlapsOpening(x, y, rotation, width, 0.45)) return; openings.push({ x, y, rotation, width, kind: 'door' }); elements.push({ id: crypto.randomUUID(), type: 'door', pos: { x, y }, rotation, width }); };
    const addWindow = (x: number, y: number, rotation: number, width = 1.2) => { if (overlapsOpening(x, y, rotation, width, 0.45)) return; openings.push({ x, y, rotation, width, kind: 'window' }); elements.push({ id: crypto.randomUUID(), type: 'window', pos: { x, y }, rotation, width }); };

    const usableRooms = rooms.filter(r => !this.isOutdoorRoom(r));
    const livingRooms = usableRooms.filter(r => r.kind === 'living' || r.kind === 'family');
    const entryRooms = usableRooms.filter(r => r.kind === 'entry');
    const bedrooms = usableRooms.filter(r => r.kind === 'bedroom');
    const baths = usableRooms.filter(r => r.kind === 'bath');
    const kitchens = usableRooms.filter(r => r.kind === 'kitchen');
    const corridors = usableRooms.filter(r => r.kind === 'corridor');
    const center = (room: ResidentialRectRoom) => ({ x: room.x + room.w / 2, y: room.y + room.h / 2 });
    const distance = (a: ResidentialRectRoom, b: ResidentialRectRoom) => Math.hypot(center(a).x - center(b).x, center(a).y - center(b).y);
    const placeDoorBetween = (a: ResidentialRectRoom, b: ResidentialRectRoom, preferredWidth = 0.9) => {
      if (this.shouldBeOpenBetween(a, b)) return;
      const shared = this.getSharedRoomEdge(a, b);
      if (!shared || shared.length < 0.9) return;
      const width = Math.min(preferredWidth, Math.max(0.7, shared.length * 0.55));
      if (shared.orientation === 'horizontal') addDoor((shared.p1.x + shared.p2.x) / 2, shared.p1.y, 0, width);
      else addDoor(shared.p1.x, (shared.p1.y + shared.p2.y) / 2, 90, width);
    };
    const nearestConnectedRoom = (room: ResidentialRectRoom, candidates: ResidentialRectRoom[]) => {
      const connected = candidates.map(candidate => ({ room: candidate, edge: this.getSharedRoomEdge(room, candidate), dist: distance(room, candidate) })).filter(item => item.edge && item.edge.length >= 0.9).sort((a, b) => a.dist - b.dist);
      return connected[0]?.room || null;
    };

    const mainAccessRoom = entryRooms[0] || livingRooms[0] || usableRooms[0];
    if (mainAccessRoom) {
      const candidates: { x: number; y: number; rotation: number; score: number }[] = [];
      if (this.nearlyEqual(mainAccessRoom.y, plan.y)) candidates.push({ x: mainAccessRoom.x + mainAccessRoom.w / 2, y: plan.y, rotation: 0, score: 1 });
      if (this.nearlyEqual(mainAccessRoom.y + mainAccessRoom.h, plan.y + plan.h)) candidates.push({ x: mainAccessRoom.x + mainAccessRoom.w / 2, y: plan.y + plan.h, rotation: 0, score: 2 });
      if (this.nearlyEqual(mainAccessRoom.x, plan.x)) candidates.push({ x: plan.x, y: mainAccessRoom.y + mainAccessRoom.h / 2, rotation: 90, score: 1.5 });
      if (this.nearlyEqual(mainAccessRoom.x + mainAccessRoom.w, plan.x + plan.w)) candidates.push({ x: plan.x + plan.w, y: mainAccessRoom.y + mainAccessRoom.h / 2, rotation: 90, score: 1.5 });
      const best = candidates.sort((a, b) => a.score - b.score)[0];
      if (best) addDoor(best.x, best.y, best.rotation, 1.0);
    }

    entryRooms.forEach(entry => { const target = nearestConnectedRoom(entry, livingRooms); if (target) placeDoorBetween(entry, target, 1.0); });
    kitchens.forEach(kitchen => { const label = kitchen.label.toLowerCase(); if (label.includes('open kitchen') || label.includes('semi-open kitchen') || label.includes('kitchen / dining')) return; const target = nearestConnectedRoom(kitchen, livingRooms) || nearestConnectedRoom(kitchen, corridors); if (target) placeDoorBetween(kitchen, target, 0.85); });
    bedrooms.forEach(bedroom => { const target = nearestConnectedRoom(bedroom, corridors) || nearestConnectedRoom(bedroom, livingRooms); if (target) placeDoorBetween(bedroom, target, 0.9); });
    baths.forEach(bath => { const target = nearestConnectedRoom(bath, corridors) || nearestConnectedRoom(bath, livingRooms) || nearestConnectedRoom(bath, bedrooms); if (target) placeDoorBetween(bath, target, 0.75); });

    usableRooms.forEach(room => {
      if (!room.daylight && room.kind !== 'kitchen') return;
      const windows: { x: number; y: number; rotation: number; width: number }[] = [];
      if (this.nearlyEqual(room.y, plan.y)) windows.push({ x: room.x + room.w / 2, y: plan.y, rotation: 0, width: Math.min(2.4, room.w * 0.45) });
      if (this.nearlyEqual(room.y + room.h, plan.y + plan.h)) windows.push({ x: room.x + room.w / 2, y: plan.y + plan.h, rotation: 0, width: Math.min(2.4, room.w * 0.45) });
      if (this.nearlyEqual(room.x, plan.x)) windows.push({ x: plan.x, y: room.y + room.h / 2, rotation: 90, width: Math.min(2.0, room.h * 0.45) });
      if (this.nearlyEqual(room.x + room.w, plan.x + plan.w)) windows.push({ x: plan.x + plan.w, y: room.y + room.h / 2, rotation: 90, width: Math.min(2.0, room.h * 0.45) });
      const valid = windows.filter(w => w.width >= 0.75).sort((a, b) => b.width - a.width);
      if (valid[0]) addWindow(valid[0].x, valid[0].y, valid[0].rotation, valid[0].width);
    });
  }


  private static pickWeighted<T extends string>(
    seed: number,
    salt: number,
    options: { value: T; weight: number }[]
  ): T {
    const total = options.reduce((s, o) => s + o.weight, 0);
    let r = this.residentialRandom(seed, salt) * total;

    for (const option of options) {
      r -= option.weight;
      if (r <= 0) return option.value;
    }

    return options[options.length - 1].value;
  }


  private static readonly LEGACY_PLANNING_STYLE_MAP: Record<string, PlanningStyle> = {
    'openPlan': 'open-social-core',
    'Open Plan': 'open-social-core',
    'open-plan': 'open-social-core',
    'semiOpenPlan': 'open-social-core',
    'Semi-Open Plan': 'open-social-core',
    'semi-open-plan': 'open-social-core',
    'closedCellular': 'private-wing',
    'Closed / Cellular': 'private-wing',
    'closed-cellular': 'private-wing',
    'splitZone': 'private-wing',
    'Split-Zone': 'private-wing',
    'split-zone': 'private-wing',
    'centralHub': 'central-hub',
    'Central-Hub': 'central-hub',
    'central-hub': 'central-hub',
    'spine': 'spine-plan',
    'Spine Plan': 'spine-plan',
    'spine-plan': 'spine-plan',
    'Linear': 'spine-plan',
    'courtyard': 'courtyard-indoor-outdoor',
    'Courtyard Plan': 'courtyard-indoor-outdoor',
    'courtyard-plan': 'courtyard-indoor-outdoor',
    'dualAnchor': 'dual-anchor',
    'Dual-Anchor': 'dual-anchor',
    'dual-anchor': 'dual-anchor',
    'cluster': 'central-hub',
    'Cluster Plan': 'central-hub',
    'cluster-plan': 'central-hub',
    'indoorOutdoor': 'courtyard-indoor-outdoor',
    'Indoor-Outdoor': 'courtyard-indoor-outdoor',
    'indoor-outdoor': 'courtyard-indoor-outdoor'
  };

  private static readonly LEGACY_GEOMETRY_STYLE_MAP: Record<string, GeometryStyle> = {
    'rectilinear': 'rectilinear',
    'Rectilinear': 'rectilinear',
    'angular': 'angular-oblique',
    'Angular': 'angular-oblique',
    'Angular / Oblique': 'angular-oblique',
    'angular-oblique': 'angular-oblique',
    'rectilinearAngular': 'hybrid',
    'Rectilinear + Angular': 'hybrid',
    'rectilinear-angular': 'hybrid',
    'curved': 'curved',
    'Curved': 'curved',
    'straightCurved': 'hybrid',
    'Straight + Curved': 'hybrid',
    'straight-curved': 'hybrid',
    'radialFan': 'organic-freeform',
    'Radial / Fan': 'organic-freeform',
    'radial-fan': 'organic-freeform',
    'courtyardRing': 'courtyard-ring',
    'Courtyard / Ring': 'courtyard-ring',
    'courtyard-ring': 'courtyard-ring',
    'linearBar': 'rectilinear',
    'Linear / Bar': 'rectilinear',
    'linear-bar': 'rectilinear',
    'clustered': 'organic-freeform',
    'Clustered': 'organic-freeform',
    'organicFreeform': 'organic-freeform',
    'Organic / Freeform': 'organic-freeform',
    'organic-freeform': 'organic-freeform',
    'Organic': 'organic-freeform',
    'hybrid': 'hybrid'
  };

  private static normalizeResidentialPlanningStyle(value: any, subtype: string): ResidentialPlanningStyleId {
    const v = String(value || '').trim();

    const aliases: Record<string, ResidentialPlanningStyleId> = {
      'open-social-core': 'open-social-core',
      'private-wing': 'private-wing',
      'central-hub': 'central-hub',
      'spine-plan': 'spine-plan',
      'courtyard-indoor-outdoor': 'courtyard-indoor-outdoor',
      'dual-anchor': 'dual-anchor',
      'side-wet-core': 'side-wet-core',
      'entry-wet-pod': 'entry-wet-pod',
      'linear-galley': 'linear-galley',
      'balcony-front': 'balcony-front',
      'sleeping-alcove': 'sleeping-alcove',
      'corner-facade': 'corner-facade',
      'hotel-style': 'hotel-style'
    };

    if (aliases[v]) return aliases[v];

    const mapped = this.LEGACY_PLANNING_STYLE_MAP[v];
    if (mapped) return mapped;

    if (subtype === 'studio' || subtype === '1br') return 'open-social-core';
    if (subtype === 'row-house') return 'spine-plan';
    if (subtype === 'villa' || subtype === 'farmhouse') return 'courtyard-indoor-outdoor';
    if (subtype === 'mansion') return 'dual-anchor';
    if (subtype === 'coliving' || subtype === 'student-housing') return 'central-hub';
    return 'open-social-core';
  }

  private static normalizeResidentialGeometry(value: any, subtype: string): ResidentialGeometryStandardId {
    const v = String(value || '').trim();

    const aliases: Record<string, ResidentialGeometryStandardId> = {
      'rectilinear': 'rectilinear',
      'angular-oblique': 'angular-oblique',
      'curved': 'curved',
      'hybrid': 'hybrid',
      'courtyard-ring': 'courtyard-ring',
      'organic-freeform': 'organic-freeform'
    };

    if (aliases[v]) return aliases[v];

    const mapped = this.LEGACY_GEOMETRY_STYLE_MAP[v];
    if (mapped) return mapped;

    if (subtype === 'row-house') return 'rectilinear';
    if (subtype === 'villa') return 'courtyard-ring';
    if (subtype === 'farmhouse') return 'organic-freeform';
    if (subtype === 'penthouse') return 'hybrid';
    if (subtype === 'duplex') return 'organic-freeform';
    if (subtype === 'mansion' || subtype === 'coliving' || subtype === 'student-housing') return 'organic-freeform';
    return 'rectilinear';
  }

  private static planningStyleFamilyPenalty(
    planningStyle: ResidentialPlanningStyleId,
    family: ResidentialLogicDefinition['family']
  ): number {
    const preferred: Record<ResidentialPlanningStyleId, ResidentialLogicDefinition['family'][]> = {
      'open-social-core': ['OPEN_PUBLIC_CORE', 'NO_CORRIDOR', 'CORNER_ANCHOR', 'BALCONY_FRONT', 'PUBLIC_PRIVATE_BAR', 'SIDE_WING', 'COMPACT_WET_CORE'],
      'private-wing': ['PUBLIC_PRIVATE_BAR', 'SIDE_WING', 'GALLERY_RAIL', 'SERVICE_SPINE', 'SPLIT_BEDROOMS', 'TWO_WING'],
      'central-hub': ['OPEN_PUBLIC_CORE', 'SHARED_HUB', 'KITCHEN_CORE', 'FAMILY_CORE', 'POD_CLUSTER', 'MODULE_SPINE', 'CLUSTER_COURTYARD'],
      'spine-plan': ['SERVICE_SPINE', 'MODULE_SPINE', 'DOUBLE_LOADED', 'LINEAR_ROW'],
      'courtyard-indoor-outdoor': ['COURTYARD_RING', 'CLUSTER_COURTYARD', 'BALCONY_FRONT', 'VERANDA_BAR', 'GARDEN_CORNER', 'SERVICE_YARD'],
      'dual-anchor': ['DUAL_ANCHOR', 'FAMILY_CORE', 'TWO_WING'],
      'side-wet-core': [],
      'entry-wet-pod': [],
      'linear-galley': [],
      'balcony-front': [],
      'sleeping-alcove': [],
      'corner-facade': [],
      'hotel-style': []
    };

    return preferred[planningStyle]?.includes(family) ? -1200 : 650;
  }

  private static geometryFamilyPenalty(
    layoutGeometry: ResidentialGeometryStandardId,
    family: ResidentialLogicDefinition['family']
  ): number {
    const preferred: Record<ResidentialGeometryStandardId, ResidentialLogicDefinition['family'][]> = {
      rectilinear: ['PUBLIC_PRIVATE_BAR', 'OPEN_PUBLIC_CORE', 'SIDE_WING', 'COMPACT_WET_CORE', 'LINEAR_ROW', 'SERVICE_SPINE', 'MODULE_SPINE', 'DOUBLE_LOADED'],
      'angular-oblique': ['CORNER_ANCHOR', 'SPLIT_BEDROOMS', 'TWO_WING', 'GARDEN_CORNER'],
      curved: ['COURTYARD_RING', 'VERANDA_BAR', 'GARDEN_CORNER', 'OPEN_PUBLIC_CORE'],
      hybrid: ['GALLERY_RAIL', 'CORNER_ANCHOR', 'SPLIT_BEDROOMS', 'BALCONY_FRONT', 'VERANDA_BAR', 'GARDEN_CORNER', 'FAMILY_CORE'],
      'courtyard-ring': ['COURTYARD_RING', 'CLUSTER_COURTYARD'],
      'organic-freeform': ['GARDEN_CORNER', 'COURTYARD_RING', 'VERANDA_BAR', 'DUAL_ANCHOR', 'FAMILY_CORE', 'TWO_WING', 'POD_CLUSTER', 'CLUSTER_COURTYARD', 'SHARED_HUB', 'MODULE_SPINE']
    };

    return preferred[layoutGeometry]?.includes(family) ? -900 : 350;
  }

  private static createResidentialDNA(
    subtype: string,
    category: ResidentialCategoryId,
    bedrooms: number,
    totalAreaM2: number,
    seed: number,
    requirements: any = {}
  ): ResidentialDesignDNA {
    const isStudio = subtype === 'studio';
    const isApartment = category === 'apartments';
    const isHouse = category === 'houses';
    const isShared = category === 'shared-special';

    const planningStyle = this.normalizeResidentialPlanningStyle(requirements.planningStyle || requirements.style, subtype);
    const layoutGeometry = this.normalizeResidentialGeometry(requirements.layoutGeometry || requirements.geometry, subtype);

    const entryMode = planningStyle === 'open-social-core' || isStudio
      ? this.pickWeighted(seed, 11, [
          { value: 'direct', weight: 0.68 },
          { value: 'niche', weight: 0.28 },
          { value: 'enclosed', weight: 0.04 }
        ])
      : planningStyle === 'private-wing'
        ? this.pickWeighted(seed, 11, [
            { value: 'enclosed', weight: 0.65 },
            { value: 'niche', weight: 0.25 },
            { value: 'direct', weight: 0.10 }
          ])
        : this.pickWeighted(seed, 11, [
            { value: 'enclosed', weight: isHouse ? 0.42 : 0.20 },
            { value: 'niche', weight: 0.36 },
            { value: 'direct', weight: isApartment ? 0.44 : 0.22 }
          ]);

    const kitchenMode = planningStyle === 'open-social-core'
      ? this.pickWeighted(seed, 12, [
          { value: 'open', weight: 0.72 },
          { value: 'semiOpen', weight: 0.24 },
          { value: 'closed', weight: 0.04 }
        ])
      : planningStyle === 'private-wing'
        ? this.pickWeighted(seed, 12, [
            { value: 'closed', weight: 0.68 },
            { value: 'semiOpen', weight: 0.24 },
            { value: 'open', weight: 0.08 }
          ])
        : this.pickWeighted(seed, 12, [
            { value: 'open', weight: isApartment ? 0.45 : 0.25 },
            { value: 'semiOpen', weight: 0.35 },
            { value: 'closed', weight: isHouse ? 0.40 : 0.20 }
          ]);

    const diningMode = isStudio || subtype === 'serviced-apartment'
      ? this.pickWeighted(seed, 13, [
          { value: 'merged', weight: 0.76 },
          { value: 'none', weight: 0.24 }
        ])
      : planningStyle === 'private-wing'
        ? this.pickWeighted(seed, 13, [
            { value: 'separate', weight: 0.68 },
            { value: 'merged', weight: 0.27 },
            { value: 'none', weight: 0.05 }
          ])
        : planningStyle === 'open-social-core'
          ? this.pickWeighted(seed, 13, [
              { value: 'merged', weight: 0.76 },
              { value: 'none', weight: bedrooms <= 1 ? 0.18 : 0.06 },
              { value: 'separate', weight: 0.18 }
            ])
          : this.pickWeighted(seed, 13, [
              { value: 'separate', weight: bedrooms >= 3 || isHouse ? 0.42 : 0.22 },
              { value: 'merged', weight: 0.58 },
              { value: 'none', weight: bedrooms <= 1 ? 0.20 : 0.06 }
            ]);

    const bedroomAccessMode = planningStyle === 'open-social-core' && bedrooms <= 2
      ? this.pickWeighted(seed, 14, [
          { value: 'livingDistributor', weight: 0.66 },
          { value: 'lobby', weight: 0.28 },
          { value: 'corridor', weight: 0.06 }
        ])
      : planningStyle === 'spine-plan'
        ? this.pickWeighted(seed, 14, [
            { value: 'corridor', weight: 0.72 },
            { value: 'lobby', weight: 0.20 },
            { value: 'livingDistributor', weight: 0.08 }
          ])
        : bedrooms <= 1
          ? this.pickWeighted(seed, 14, [
              { value: 'livingDistributor', weight: 0.55 },
              { value: 'lobby', weight: 0.35 },
              { value: 'corridor', weight: 0.10 }
            ])
          : this.pickWeighted(seed, 14, [
              { value: 'corridor', weight: bedrooms >= 3 || isShared ? 0.55 : 0.30 },
              { value: 'lobby', weight: 0.38 },
              { value: 'livingDistributor', weight: bedrooms <= 2 ? 0.32 : 0.10 }
            ]);

    const wetCoreMode = planningStyle === 'spine-plan'
      ? this.pickWeighted(seed, 15, [
          { value: 'spine', weight: 0.75 },
          { value: 'compact', weight: 0.18 },
          { value: 'split', weight: 0.07 }
        ])
      : planningStyle === 'private-wing' || isHouse
        ? this.pickWeighted(seed, 15, [
            { value: 'split', weight: 0.48 },
            { value: 'compact', weight: 0.28 },
            { value: 'spine', weight: 0.24 }
          ])
        : this.pickWeighted(seed, 15, [
            { value: 'compact', weight: isApartment ? 0.48 : 0.25 },
            { value: 'spine', weight: isShared ? 0.55 : 0.30 },
            { value: 'split', weight: isHouse || bedrooms >= 3 ? 0.35 : 0.22 }
          ]);

    const outdoorMode = planningStyle === 'courtyard-indoor-outdoor'
      ? (isApartment
          ? this.pickWeighted(seed, 16, [
              { value: 'balcony', weight: 0.48 },
              { value: 'terrace', weight: totalAreaM2 > 120 ? 0.42 : 0.22 },
              { value: 'none', weight: 0.10 }
            ])
          : this.pickWeighted(seed, 16, [
              { value: 'garden', weight: 0.32 },
              { value: 'courtyard', weight: totalAreaM2 > 140 ? 0.28 : 0.10 },
              { value: 'veranda', weight: 0.32 },
              { value: 'none', weight: 0.08 }
            ]))
      : isApartment
        ? this.pickWeighted(seed, 16, [
            { value: 'none', weight: 0.40 },
            { value: 'balcony', weight: 0.42 },
            { value: 'terrace', weight: totalAreaM2 > 120 ? 0.18 : 0.05 }
          ])
        : isHouse
          ? this.pickWeighted(seed, 16, [
              { value: 'garden', weight: 0.35 },
              { value: 'courtyard', weight: totalAreaM2 > 140 ? 0.25 : 0.05 },
              { value: 'veranda', weight: 0.25 },
              { value: 'none', weight: 0.15 }
            ])
          : this.pickWeighted(seed, 16, [
              { value: 'none', weight: 0.35 },
              { value: 'terrace', weight: 0.25 },
              { value: 'courtyard', weight: totalAreaM2 > 150 ? 0.25 : 0.05 },
              { value: 'balcony', weight: 0.15 }
            ]);

    const planPlacement = this.pickWeighted(seed, 17, [
      { value: 'center', weight: layoutGeometry === 'courtyard-ring' || layoutGeometry === 'organic-freeform' ? 0.34 : 0.18 },
      { value: 'left', weight: 0.15 },
      { value: 'right', weight: 0.15 },
      { value: 'top', weight: 0.15 },
      { value: 'bottom', weight: 0.15 },
      { value: 'corner', weight: layoutGeometry === 'organic-freeform' ? 0.30 : 0.15 }
    ]);

    const angularity =
      layoutGeometry === 'angular-oblique' ? 0.90 :
      layoutGeometry === 'hybrid' ? 0.55 :
      layoutGeometry === 'organic-freeform' ? 0.75 :
      0.0;

    const curvature =
      layoutGeometry === 'curved' ? 0.90 :
      layoutGeometry === 'hybrid' ? 0.55 :
      layoutGeometry === 'courtyard-ring' ? 0.35 :
      layoutGeometry === 'organic-freeform' ? 0.70 :
      0.0;

    return {
      entryMode,
      kitchenMode,
      diningMode,
      bedroomAccessMode,
      wetCoreMode,
      outdoorMode,
      planPlacement,
      compactness: 0.82 + this.residentialRandom(seed, 18) * 0.20,
      publicShare: 0.34 + this.residentialRandom(seed, 19) * 0.18,
      privateShare: 0.34 + this.residentialRandom(seed, 20) * 0.18,
      serviceShare: 0.16 + this.residentialRandom(seed, 21) * 0.10,
      logicPreferenceSalt: Math.floor(this.residentialRandom(seed, 22) * 10000),
      planningStyle,
      layoutGeometry,
      geometryStrength: 0.35 + this.residentialRandom(seed, 23) * 0.65,
      angularity,
      curvature,
      openness: kitchenMode === 'open' || diningMode === 'merged' ? 0.80 : kitchenMode === 'semiOpen' ? 0.50 : 0.20
    };
  }

  private static generateResidentialLayout(
    boundaryPoints: Point[],
    programId: string,
    options: ResidentialLayoutOptions = {}
  ): { elements: ArchElement[]; metrics: any; warnings: string[] } {
    const {
      geometry = 'rectilinear',
      unitSystem = 'metric',
      requirements = {},
      seed = Math.random()
    } = options;

    const normGeometry = this.normalizeResidentialGeometry(geometry, '');

    const bounds = this.getPolygonBounds({ points: boundaryPoints });
    const totalAreaM2 = this.getPolygonArea({ points: boundaryPoints });
    const warnings: string[] = [];
    const rooms: ResidentialRectRoom[] = [];
    const elements: ArchElement[] = [];

    const randomSeed =
      Number((requirements as any).layoutSeed) ||
      Number(seed) ||
      Math.random();

    const subtype = String(requirements.subtype || '2br').toLowerCase();
    (requirements as any).geometry = (requirements as any).layoutGeometry || geometry;
    const category = this.getResidentialCategory(subtype);

    // Design DNA layer controls topological variation
    const dna = this.createResidentialDNA(
      subtype,
      category,
      Number(requirements.numBedrooms ?? 2),
      totalAreaM2,
      randomSeed,
      requirements
    );

    const requestedBedrooms = Number(requirements.numBedrooms ?? 2);
    const requestedBaths = Number(requirements.numBaths ?? 1);

    const programTemplate = SPATIAL_PROGRAMS[programId] || SPATIAL_PROGRAMS['domestic-standard'];
    const program = this.applyRequirementsToProgram(programTemplate, requirements);
    const programMetrics = this.calculatePlanMetrics(program, programId);

    if (totalAreaM2 < programMetrics.minRequiredArea) {
      const smallElements: ArchElement[] = [];

      boundaryPoints.forEach((p, i) => {
        smallElements.push({
          id: crypto.randomUUID(),
          type: 'line',
          p1: p,
          p2: boundaryPoints[(i + 1) % boundaryPoints.length],
          thickness: 0.1,
          color: '#fca5a5'
        });
      });

      smallElements.push({
        id: crypto.randomUUID(),
        type: 'room',
        label: `PLAN TOO SMALL\nRequired: ${programMetrics.minRequiredArea.toFixed(1)}m²\nAvailable: ${totalAreaM2.toFixed(1)}m²`,
        pos: this.getPolygonCentroid({ points: boundaryPoints }),
        width: bounds.w,
        depth: bounds.h,
        color: '#fee2e2'
      });

      return {
        elements: smallElements,
        metrics: { totalAreaM2, roomCount: 0 },
        warnings: ['Boundary is too small for the requested residential program.']
      };
    }

    const shell = { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h };
    const estimatedRequiredArea = 30 + (requestedBedrooms * 16) + (requestedBaths * 6);
    const isApartment = category === 'apartments';

    // Apply scaling if the boundary is significantly larger than what is needed for the requested program.
    const isOversized = totalAreaM2 > estimatedRequiredArea * 2.1;
    const targetResidentialArea = isOversized ? estimatedRequiredArea * 1.35 : totalAreaM2;

    let plan = isOversized
      ? this.fitResidentialPlanInsideShell(shell, targetResidentialArea, randomSeed, dna)
      : { ...shell };

    if (isOversized) {
      const outdoorLabel = 
        dna.outdoorMode === 'terrace' ? 'Unassigned Terrace' :
        dna.outdoorMode === 'garden' ? 'Unassigned Garden' :
        dna.outdoorMode === 'courtyard' ? 'Unassigned Courtyard' :
        isApartment ? 'Unassigned Outdoor' : 'Unassigned Lot';
        
      const outdoorKind = 
        dna.outdoorMode === 'terrace' ? 'terrace' :
        dna.outdoorMode === 'garden' ? 'garden' :
        dna.outdoorMode === 'courtyard' ? 'courtyard' :
        isApartment ? 'terrace' : 'garden';

      // We add the "Unassigned" space around the actual optimized plan footprint.
      // Simple representation: everything in the shell but NOT in the plan.
      this.addRoomSafe(rooms, {
        label: outdoorLabel,
        kind: outdoorKind,
        x: shell.x,
        y: shell.y,
        w: shell.w,
        h: shell.h,
        color: '#f8fafc',
        exteriorContact: true
      });
    }

    const isStudio = subtype === 'studio';

    // --- STEP 2: Candidate Selection ---
    if (isStudio) {
      const studioStyle = requirements.planningStyle || 'side-wet-core';
      
      if (studioStyle === 'side-wet-core') {
        const wetBandWidth = this.clampNumber(plan.w * 0.28, 1.65, 2.30);
        const mainRoomWidth = plan.w - wetBandWidth;
        const bathH = this.clampNumber(plan.h * 0.30, 1.8, 2.5);
        const kitchenH = this.clampNumber(plan.h * 0.40, 2.0, 3.2);
        const entryH = plan.h - bathH - kitchenH;

        this.addRoomSafe(rooms, { label: 'Bathroom', kind: 'bath', x: plan.x, y: plan.y, w: wetBandWidth, h: bathH, color: '#f0f9ff' });
        this.addRoomSafe(rooms, { label: 'Kitchenette', kind: 'kitchen', x: plan.x, y: plan.y + bathH, w: wetBandWidth, h: kitchenH, color: '#f1f5f9' });
        this.addRoomSafe(rooms, { label: 'Entry', kind: 'entry', x: plan.x, y: plan.y + bathH + kitchenH, w: wetBandWidth, h: entryH, color: '#f8fafc', isOpenPlan: true });
        
        this.addRoomSafe(rooms, { 
          label: 'Living / Sleeping', 
          kind: 'living', 
          x: plan.x + wetBandWidth, 
          y: plan.y, 
          w: mainRoomWidth, 
          h: plan.h, 
          color: '#fef3c7', 
          daylight: 'required', 
          exteriorContact: true 
        });
      } else if (studioStyle === 'entry-wet-pod') {
        const podW = this.clampNumber(plan.w * 0.35, 1.65, 2.20);
        const entryH = this.clampNumber(plan.h * 0.25, 1.4, 2.0);
        const bathH = this.clampNumber(plan.h * 0.32, 1.8, 2.4);
        const kitchenH = this.clampNumber(plan.h * 0.32, 2.0, 3.0);
        const remainingH = plan.h - (entryH + bathH + kitchenH);
        
        let currentY = plan.y;
        if (remainingH > 1.2) {
          this.addRoomSafe(rooms, { label: 'Sleeping Niche', kind: 'bedroom', x: plan.x, y: currentY, w: podW, h: remainingH, color: '#faf5ff' });
          currentY += remainingH;
        }
        
        const finalKitchenH = remainingH > 1.2 ? kitchenH : kitchenH + remainingH;
        this.addRoomSafe(rooms, { label: 'Kitchenette', kind: 'kitchen', x: plan.x, y: currentY, w: podW, h: finalKitchenH, color: '#f1f5f9' });
        currentY += finalKitchenH;
        
        this.addRoomSafe(rooms, { label: 'Bathroom', kind: 'bath', x: plan.x, y: currentY, w: podW, h: bathH, color: '#f0f9ff' });
        currentY += bathH;
        
        this.addRoomSafe(rooms, { label: 'Entry', kind: 'entry', x: plan.x, y: currentY, w: podW, h: entryH, color: '#f8fafc' });

        this.addRoomSafe(rooms, { 
          label: 'Living / Sleeping', 
          kind: 'living', 
          x: plan.x + podW, 
          y: plan.y, 
          w: plan.w - podW, 
          h: plan.h, 
          color: '#fef3c7', 
          daylight: 'required', 
          exteriorContact: true 
        });
      } else if (studioStyle === 'linear-galley') {
        const leftBandW = this.clampNumber(plan.w * 0.38, 1.65, 2.20);
        const bathH = this.clampNumber(plan.h * 0.28, 1.8, 2.4);
        const kitchenH = plan.h - bathH;
        
        this.addRoomSafe(rooms, { label: 'Kitchenette', kind: 'kitchen', x: plan.x, y: plan.y, w: leftBandW, h: kitchenH, color: '#f1f5f9' });
        this.addRoomSafe(rooms, { label: 'Bathroom', kind: 'bath', x: plan.x, y: plan.y + kitchenH, w: leftBandW, h: bathH, color: '#f0f9ff' });
        
        const entryW = this.clampNumber(plan.w - leftBandW, 1.4, 2.0);
        const entryH = 1.5;
        this.addRoomSafe(rooms, { label: 'Entry / Vestibule', kind: 'entry', x: plan.x + leftBandW, y: plan.y + plan.h - entryH, w: entryW, h: entryH, color: '#f8fafc' });
        
        this.addRoomSafe(rooms, { 
          label: 'Living / Sleeping', 
          kind: 'living', 
          x: plan.x + leftBandW, 
          y: plan.y, 
          w: plan.w - leftBandW, 
          h: plan.h - entryH, 
          color: '#fef3c7', 
          daylight: 'required', 
          exteriorContact: true 
        });
      } else {
        // Phase 2 styles fallback to side-wet-core logic for now
        const wetBandWidth = this.clampNumber(plan.w * 0.28, 1.65, 2.30);
        const mainRoomWidth = plan.w - wetBandWidth;
        const bathH = this.clampNumber(plan.h * 0.30, 1.8, 2.5);
        const kitchenH = this.clampNumber(plan.h * 0.40, 2.0, 3.2);
        const entryH = plan.h - bathH - kitchenH;

        this.addRoomSafe(rooms, { label: 'Bathroom', kind: 'bath', x: plan.x, y: plan.y, w: wetBandWidth, h: bathH, color: '#f0f9ff' });
        this.addRoomSafe(rooms, { label: 'Kitchenette', kind: 'kitchen', x: plan.x, y: plan.y + bathH, w: wetBandWidth, h: kitchenH, color: '#f1f5f9' });
        this.addRoomSafe(rooms, { label: 'Entry', kind: 'entry', x: plan.x, y: plan.y + bathH + kitchenH, w: wetBandWidth, h: entryH, color: '#f8fafc', isOpenPlan: true });
        
        this.addRoomSafe(rooms, { 
          label: 'Living / Sleeping', 
          kind: 'living', 
          x: plan.x + wetBandWidth, 
          y: plan.y, 
          w: mainRoomWidth, 
          h: plan.h, 
          color: '#fef3c7', 
          daylight: 'required', 
          exteriorContact: true 
        });
      }
    } else {
      const allowedLogics = this.getAllowedResidentialLogics(subtype, requestedBedrooms, targetResidentialArea);
      const candidates: ResidentialSchemeCandidate[] = [];

      allowedLogics.forEach((logic, index) => {
        // Loop a few times to get internal variations of each logic type
        for (let i = 0; i < 3; i++) {
          const candidateSeed = randomSeed + index * 0.137 + i * 0.73 + dna.logicPreferenceSalt;
          
          const candidateDNA = this.createResidentialDNA(
            subtype,
            category,
            requestedBedrooms,
            targetResidentialArea,
            candidateSeed,
            requirements
          );

          const candidateRooms = this.generateRoomsForResidentialLogic(
            logic,
            plan,
            requestedBedrooms,
            requestedBaths,
            subtype,
            candidateSeed,
            candidateDNA
          );

          const quality = this.scoreResidentialCandidate(
            logic,
            candidateRooms,
            requestedBedrooms,
            requestedBaths,
            subtype,
            plan
          );

          // Slight noise ensures that identical scores don't always pick the same one
          const variationNoise = (this.residentialRandom(candidateSeed, 101) - 0.5) * 50;

          candidates.push({
            logic,
            rooms: candidateRooms,
            score: quality.score + variationNoise + quality.hardErrors.length * 10000 + this.planningStyleFamilyPenalty(candidateDNA.planningStyle, logic.family) + this.geometryFamilyPenalty(candidateDNA.layoutGeometry, logic.family),
            warnings: quality.warnings,
            dna: candidateDNA
          });
        }
      });

      const selected = this.chooseResidentialLogicCandidate(candidates, randomSeed);
      rooms.push(...selected.rooms);

      warnings.push(...selected.warnings);
      warnings.push(`Architectural logic used: ${selected.logic.name}.`);
      warnings.push(`Planning style: ${selected.dna.planningStyle}; Geometry standard: ${selected.dna.layoutGeometry}.`);
      warnings.push(
        `Design DNA: entry=${selected.dna.entryMode}, kitchen=${selected.dna.kitchenMode}, dining=${selected.dna.diningMode}, bedroomAccess=${selected.dna.bedroomAccessMode}, outdoor=${selected.dna.outdoorMode}.`
      );
    }

    // Flip variation
    if (this.residentialRandom(randomSeed, 101) > 0.6) {
      this.mirrorResidentialRooms(
        rooms,
        plan,
        this.residentialRandom(randomSeed, 102) > 0.5,
        this.residentialRandom(randomSeed, 103) > 0.5
      );
    }

    this.sanitizeResidentialRoomsInPlace(rooms, plan, warnings);
    this.validateResidentialRoomShapes(rooms, warnings);

    const finalFunctional = this.validateResidentialFunctionalLogic(rooms, subtype, requestedBedrooms, requestedBaths, plan);
    finalFunctional.warnings.forEach(w => warnings.push(w));
    finalFunctional.hardErrors.forEach(e => warnings.push(`FINAL HARD RULE: ${e}`));

    this.addResidentialWalls(rooms, elements, shell, plan, normGeometry);
    this.addResidentialLabels(rooms, elements, unitSystem);
    this.addResidentialOpenings(rooms, elements, shell, plan);

    return {
      elements,
      metrics: {
        totalAreaM2,
        buildingAreaM2: plan.w * plan.h,
        bedroomCount: rooms.filter(r => r.kind === 'bedroom').length,
        bathCount: rooms.filter(r => r.kind === 'bath').length,
        residentialEngine: 'geometry-and-planning-standards-v1',
        planningStyle: dna.planningStyle,
        layoutGeometry: dna.layoutGeometry,
        geometryStrength: dna.geometryStrength
      },
      warnings
    };
  }

  private static inferBedroomsFromProgram(programId: string): number {
    if (programId === 'domestic-studio') return 0;
    if (programId === 'domestic-1br') return 1;
    if (programId === 'domestic-standard') return 2;
    if (programId === 'domestic-3br') return 3;
    if (programId === 'domestic-4br') return 4;
    if (programId === 'house-villa') return 4;
    if (programId === 'house-farmhouse') return 3;
    if (programId === 'house-row') return 3;
    if (programId === 'house-single') return 2;
    return 2;
  }

  /**
   * Main entry point for generation. Now supports arbitrary polygons.
   */
  static generateLayout(
    boundaryPoints: Point[],
    programId: string = 'domestic-standard',
    options: {
      seed?: number;
      typology?: LayoutTypology;
      geometry?: LayoutGeometry;
      unitSystem?: 'metric' | 'imperial';
      requirements?: ArchElement['proceduralRequirements'];
      entryPoint?: Point;
    } = {}
  ): { elements: ArchElement[], metrics: any, warnings: string[] } {
    if (!boundaryPoints || !Array.isArray(boundaryPoints) || boundaryPoints.length < 3) {
      console.warn("SmartProceduralLayoutEngine: Invalid boundary points", boundaryPoints);
      return { elements: [], metrics: {}, warnings: [] };
    }
    const { 
      seed = 0.5, 
      typology = 'Standard', 
      geometry = 'Rectilinear',
      unitSystem = 'metric',
      requirements = {},
      entryPoint
    } = options;

    let targetProgramId = programId;
    const subtype = String(requirements.subtype || '').toLowerCase();

    if (programId === 'domestic-standard' && subtype) {
        if (subtype === 'studio') targetProgramId = 'domestic-studio';
        else if (subtype === '1br') targetProgramId = 'domestic-1br';
        else if (subtype === '2br' || subtype === 'apartment') targetProgramId = 'domestic-standard';
        else if (subtype === '3br') targetProgramId = 'domestic-3br';
        else if (subtype === '4br') targetProgramId = 'domestic-4br';
        else if (subtype === 'duplex' || subtype === 'penthouse') targetProgramId = 'domestic-duplex';
        else if (subtype === 'house') targetProgramId = 'house-single';
        else if (subtype === 'villa') targetProgramId = 'house-villa';
        else if (subtype === 'row-house') targetProgramId = 'house-row';
        else if (subtype === 'farmhouse') targetProgramId = 'house-farmhouse';
        else if (subtype === 'coliving') targetProgramId = 'res-coliving';
        else if (subtype === 'student-housing') targetProgramId = 'res-student';
        else if (subtype === 'senior-living') targetProgramId = 'res-senior';
    } else if (programId === 'office-corporate' && subtype) {
        if (subtype === 'open office') targetProgramId = 'office-open';
        else if (subtype === 'co-working') targetProgramId = 'office-coworking';
    } else if (programId === 'retail-shop' && subtype) {
        if (subtype === 'showroom') targetProgramId = 'retail-showroom';
        else if (subtype === 'grocery') targetProgramId = 'retail-grocery';
    } else if (programId === 'food-restaurant' && subtype) {
        if (subtype === 'cafe') targetProgramId = 'food-cafe';
        else if (subtype === 'qsr') targetProgramId = 'food-qsr';
    } else if (programId === 'healthcare-clinic' && subtype) {
        if (subtype === 'ward') targetProgramId = 'healthcare-ward';
    } else if (programId === 'educational-center' && subtype) {
        if (subtype === 'training center') targetProgramId = 'educational-training';
    } else if (programId === 'industrial-warehouse' && subtype) {
        if (subtype === 'factory') targetProgramId = 'industrial-factory';
        else if (subtype === 'storage') targetProgramId = 'industrial-storage';
    }

    const rootArea = this.getPolygonArea({ points: boundaryPoints });
    const bounds = this.getPolygonBounds({ points: boundaryPoints });

    // 0. SMALL AREA ABORT
    const MINIMUM_USABLE_PLAN_AREA = 10;
    if (rootArea < MINIMUM_USABLE_PLAN_AREA) {
      const elements: ArchElement[] = [];
      for (let i = 0; i < boundaryPoints.length; i++) {
        elements.push({
          id: crypto.randomUUID(),
          type: 'line',
          p1: boundaryPoints[i],
          p2: boundaryPoints[(i + 1) % boundaryPoints.length],
          thickness: 0.05
        });
      }
      return { elements, metrics: { totalAreaM2: rootArea, roomCount: 0 }, warnings: ["Boundary area is too small for a functional layout."] };
    }

    // Determine target metrics
    const programTemplate = SPATIAL_PROGRAMS[targetProgramId] || SPATIAL_PROGRAMS['domestic-standard'];
    const program = this.applyRequirementsToProgram(programTemplate, requirements);
    const metrics = this.calculatePlanMetrics(program, targetProgramId);
    
    // Check if boundary is too small or too narrow
    const minDim = Math.min(bounds.w, bounds.h);
    const MIN_REQ_DIM = this.getProgramMinLayoutDim(targetProgramId);
    
    if (rootArea < metrics.minRequiredArea || minDim < MIN_REQ_DIM) {
        // Return a plan with a single room and a warning label
        const elements: ArchElement[] = [];
        for (let i = 0; i < boundaryPoints.length; i++) {
          elements.push({
            id: crypto.randomUUID(),
            type: 'line',
            p1: boundaryPoints[i],
            p2: boundaryPoints[(i + 1) % boundaryPoints.length],
            thickness: 0.05
          });
        }
        const warning = minDim < MIN_REQ_DIM 
          ? `BOUNDARY TOO NARROW\nMin required: ${MIN_REQ_DIM.toFixed(1)}m\nAvailable: ${minDim.toFixed(1)}m`
          : `PLAN TOO SMALL\nRequired: ${metrics.minRequiredArea.toFixed(1)}m²\nAvailable: ${rootArea.toFixed(1)}m²`;

        elements.push({
          id: crypto.randomUUID(),
          type: 'room',
          label: warning,
          pos: this.getPolygonCentroid({ points: boundaryPoints }),
          width: bounds.w, depth: bounds.h,
          color: '#fee2e2'
        });
        return { 
          elements, 
          metrics: { totalAreaM2: rootArea, buildingAreaM2: rootArea, roomCount: 1 }, 
          warnings: [warning.replace('\n', ': ')] 
        };
    }

    // Run 40 candidate loops with varying seeds to find the architecturally superior layout
    let bestCandidate = null;
    let bestScore = -Infinity;
    let fallbackCandidate = null;
    let fallbackScore = -Infinity;

    for (let cIdx = 0; cIdx < 40; cIdx++) {
      const candidateSeed = seed + cIdx * 0.137 + 0.31;
      const candidateResult = this.generateSingleCandidate(boundaryPoints, targetProgramId, {
        ...options,
        requirements: { ...requirements, subtype }
      }, candidateSeed);

      if (candidateResult.rooms.length === 0) continue;

      const evalResult = this.scoreLayoutCandidate(
        candidateResult.rooms,
        candidateResult.elements,
        targetProgramId,
        { ...options, requirements: { ...requirements, subtype } },
        boundaryPoints
      );

      if (evalResult.totalScore > 0) {
        if (evalResult.totalScore > bestScore) {
          bestScore = evalResult.totalScore;
          bestCandidate = {
            result: candidateResult,
            score: evalResult.totalScore,
            warnings: evalResult.warnings,
            breakDown: evalResult.breakDown
          };
        }
      } else {
        const raw = evalResult.rawScore || evalResult.totalScore;
        if (raw > fallbackScore) {
          fallbackScore = raw;
          fallbackCandidate = {
            result: candidateResult,
            score: raw,
            warnings: evalResult.warnings,
            breakDown: evalResult.breakDown
          };
        }
      }
    }

    const selected = bestCandidate || fallbackCandidate;
    if (!selected) {
      // Return single fallback run
      return this.generateSingleCandidate(boundaryPoints, targetProgramId, options, seed);
    }

    const finalResult = selected.result;
    const finalWarnings = [...finalResult.warnings];
    selected.warnings.forEach((w) => {
      if (!finalWarnings.includes(w)) finalWarnings.push(w);
    });

    if (bestCandidate) {
      finalWarnings.push("Architectural design quality score: " + selected.score + "/100. (Passed Human Architect Test & Rejection Gates).");
    } else {
      finalWarnings.push("WARNING: Fallback design selected (" + selected.score + "/100). Fails some strict rejection gates.");
    }

    return {
      elements: finalResult.elements,
      metrics: {
        ...finalResult.metrics,
        designQualityScore: selected.score,
        breakDown: selected.breakDown
      },
      warnings: finalWarnings
    };
  }

  private static generateSingleCandidate(
    boundaryPoints: Point[],
    programId: string,
    options: {
      seed?: number;
      typology?: LayoutTypology;
      geometry?: LayoutGeometry;
      unitSystem?: 'metric' | 'imperial';
      requirements?: ArchElement['proceduralRequirements'];
      entryPoint?: Point;
    },
    candidateSeed: number
  ): { elements: ArchElement[]; rooms: PartitionNode[]; rootArea: number; buildingArea: number; warnings: string[]; metrics: any } {
    const { 
      typology = 'Standard', 
      geometry = 'Rectilinear',
      unitSystem = 'metric',
      requirements = {},
      entryPoint
    } = options;

    let points = boundaryPoints;
    const rootArea = this.getPolygonArea({ points: boundaryPoints });
    const bounds = this.getPolygonBounds({ points: boundaryPoints });
    const entry = entryPoint || { x: bounds.x + bounds.w / 2, y: bounds.y };

    const programTemplate = SPATIAL_PROGRAMS[programId] || SPATIAL_PROGRAMS['domestic-standard'];
    const program = this.applyRequirementsToProgram(programTemplate, requirements);
    const metrics = this.calculatePlanMetrics(program, programId);

    // If boundary is too large or any dimension exceeds target limits, cap building footprint
    const targetBuildingArea = metrics.maxUsefulArea * 1.05;
    const siteRatio = bounds.w / bounds.h;
    const targetRatio = Math.max(0.7, Math.min(1.4, siteRatio));
    
    let targetW = Math.sqrt(targetBuildingArea * targetRatio);
    let targetH = targetBuildingArea / targetW;
    
    // Ensure that target dimensions do not make the building area smaller than the minimum required area.
    // If the site width/height is narrow, the building needs more length to meet the minimum required area.
    const minW = metrics.minRequiredArea * 1.05 / bounds.h;
    const minH = metrics.minRequiredArea * 1.05 / bounds.w;
    
    targetW = Math.max(targetW, minW);
    targetH = Math.max(targetH, minH);

    const isOversized = rootArea > metrics.maxUsefulArea * 1.05 || bounds.w > targetW * 1.05 || bounds.h > targetH * 1.05;

    let currentSeed = candidateSeed;
    const seededRandom = () => {
        const x = Math.sin(currentSeed++) * 10000;
        return x - Math.floor(x);
    };

    // Apply layout archetype to modify zone depths and weights based on the seed
    const archetypeIndex = Math.floor(seededRandom() * 15);
    program.zones = this.applyLayoutArchetype(program.zones, archetypeIndex, programId);

    // Filter and SORT zones by zone order: custom depth or public -> service -> private
    const zonePriority = { 'public': 0, 'core': 1, 'service': 2, 'private': 3, 'hazard': 4 };
    const sortedZones = [...program.zones].sort((a, b) => {
        const depthA = a.depth !== undefined ? a.depth : (zonePriority[a.zone] || 0);
        const depthB = b.depth !== undefined ? b.depth : (zonePriority[b.zone] || 0);
        return depthA - depthB;
    });
    
    // We filter zones if area is tight, but if area is large, we keep all
    const filteredZones = rootArea < metrics.minRequiredArea * 2 
        ? this.filterZonesForArea(sortedZones, rootArea)
        : sortedZones;

    const rootContainer: PartitionNode = {
      id: 'root-container',
      polygon: { points: [...points] }
    };

    let targetZones = [...filteredZones];
    let rooms: PartitionNode[] = [];

    // 1. HANDLE OVERSIZED BOUNDARY: Split into Building Footprint and Garden/Unassigned
    let buildingNode: PartitionNode = rootContainer;
    if (isOversized) {
        const b = this.getPolygonBounds(rootContainer.polygon);
        
        const ratioW = Math.min(1.0, targetW / b.w);
        const ratioH = Math.min(1.0, targetH / b.h);
        
        let currentPoly = rootContainer.polygon;
        let buildingPart: Polygon = currentPoly;
        let gardenParts: PartitionNode[] = [];

        // For apartments, unassigned area becomes an "UNASSIGNED AREA" instead of "TERRACE"
        const isApartmentSubtype = programId.startsWith('domestic-');
        const unassignedLabel = 'UNASSIGNED AREA';
        const unassignedType = isApartmentSubtype ? 'balcony' : 'garden';

        // Width split
        if (b.w > targetW * 1.05) {
            const splitX = b.x + targetW;
            const splitLine = { p1: { x: splitX, y: b.y - 1000 }, p2: { x: splitX, y: b.y + 1000 } };
            const res = this.splitPolygon(currentPoly, splitLine.p1, splitLine.p2);
            if (res.poly1.points.length >= 3 && res.poly2.points.length >= 3) {
                buildingPart = res.poly1;
                gardenParts.push({ 
                    id: `ext-space-w-${crypto.randomUUID()}`, 
                    polygon: res.poly2,
                    zone: { id: 'ext.unassigned', type: unassignedType as any, label: unassignedLabel, zone: 'public', weight: 0, minAreaM2: 0, color: '#f8fafc' }
                });
                currentPoly = res.poly1;
            }
        }

        // Height split
        const currentBounds = this.getPolygonBounds(buildingPart);
        if (currentBounds.h > targetH * 1.05) {
            const splitY = b.y + targetH;
            const splitLine = { p1: { x: b.x - 1000, y: splitY }, p2: { x: b.x + b.w + 1000, y: splitY } };
            const res = this.splitPolygon(currentPoly, splitLine.p1, splitLine.p2);
            if (res.poly1.points.length >= 3 && res.poly2.points.length >= 3) {
                buildingPart = res.poly2; // Use res.poly2 (top part, height = targetH) for building!
                gardenParts.push({ 
                    id: `ext-space-h-${crypto.randomUUID()}`, 
                    polygon: res.poly1, // Use res.poly1 (bottom part, height = b.h - targetH) for unassigned area!
                    zone: { id: 'ext.unassigned', type: unassignedType as any, label: unassignedLabel, zone: 'public', weight: 0, minAreaM2: 0, color: '#f8fafc' }
                });
            }
        }

        if (gardenParts.length > 0) {
            buildingNode = { id: 'building-root', polygon: buildingPart };
            rootContainer.children = [buildingNode, ...gardenParts];
        }
    }

    // 1. Resolve normalized style and geometry values correctly
    const normStyle = this.normalizeResidentialPlanningStyle(typology, '');
    const normGeometry = this.normalizeResidentialGeometry(geometry, '');

    // 2. COURTYARD INTEGRATION (Architecturally Sound)
    const buildingArea = this.getPolygonArea(buildingNode.polygon);
    const bBounds = this.getPolygonBounds(buildingNode.polygon);
    const isSuitableForCourtyard = buildingArea > 180 && (bBounds.w / bBounds.h) > 0.6 && (bBounds.w / bBounds.h) < 1.6 && normStyle !== 'spine-plan';
    const canHaveCourtyard = !programId.startsWith('domestic-');
    const shouldIncludeCourtyard = canHaveCourtyard && (requirements.includeCourtyard || (isSuitableForCourtyard && seededRandom() < 0.2));

    if (shouldIncludeCourtyard) {
        const sizeW = 0.25 + seededRandom() * 0.1;
        const sizeH = 0.25 + seededRandom() * 0.1;

        const cx = bBounds.x + bBounds.w * (0.5);
        const cy = bBounds.y + bBounds.h * (0.5);
        const x1 = cx - bBounds.w * sizeW/2;
        const x2 = cx + bBounds.w * sizeW/2;
        const y1 = cy - bBounds.h * sizeH/2;
        const y2 = cy + bBounds.h * sizeH/2;

        const resV1 = this.splitPolygon(buildingNode.polygon, { x: x1, y: bBounds.y - 100 }, { x: x1, y: bBounds.y + bBounds.h + 100 });
        const resV2 = this.splitPolygon(resV1.poly2, { x: x2, y: bBounds.y - 100 }, { x: x2, y: bBounds.y + bBounds.h + 100 });
        const resH1 = this.splitPolygon(resV2.poly1, { x: bBounds.x - 100, y: y1 }, { x: bBounds.x + bBounds.w + 100, y: y1 });
        const resH2 = this.splitPolygon(resH1.poly2, { x: bBounds.x - 100, y: y2 }, { x: bBounds.x + bBounds.w + 100, y: y2 });
        
        this.partitionNode(buildingNode, targetZones, seededRandom, entry, points);
        
        const leaves: PartitionNode[] = [];
        this.collectLeafNodes(buildingNode, leaves);
        let bestC: PartitionNode | null = null;
        let minD = Infinity;
        leaves.forEach(l => {
            const cent = this.getPolygonCentroid(l.polygon);
            const d = Math.hypot(cent.x - cx, cent.y - cy);
            if (d < minD) { minD = d; bestC = l; }
        });
        if (bestC) {
            (bestC as PartitionNode).zone = { id: 'ext.courtyard', type: 'garden', label: 'COURTYARD', zone: 'public', weight: 0, minAreaM2: 0, color: '#f0fdf4' };
        }
    } else {
        if (programId === 'office-modern' && normStyle !== 'open-social-core') {
            this.partitionWithCore(buildingNode, targetZones, seededRandom, entry, points);
        } else if (normStyle === 'spine-plan') {
            this.partitionLinear(buildingNode, targetZones, seededRandom, entry, points);
        } else {
            this.partitionNode(buildingNode, targetZones, seededRandom, entry, points);
        }
    }

    this.collectLeafNodes(rootContainer, rooms);

    // 3. Element Generation
    const elements: ArchElement[] = [];
    const warnings: string[] = [];

    // ASPECT RATIO CHECK
    const buildingBounds = this.getPolygonBounds(buildingNode.polygon);
    const arBuilding = Math.max(buildingBounds.w, buildingBounds.h) / Math.min(buildingBounds.w, buildingBounds.h || 1);
    const siteBounds = this.getPolygonBounds(rootContainer.polygon);
    const arSite = Math.max(siteBounds.w, siteBounds.h) / Math.min(siteBounds.w, siteBounds.h || 1);

    if (arBuilding > 3.0 || arSite > 3.5) {
        warnings.push("Proportions not valid for required design. Consider a wider site or square footprint.");
    } else if (arBuilding > 2.2) {
        warnings.push("Layout is highly elongated. Room proportions may be suboptimal.");
    }

    this.generateGeometry(rootContainer, elements, normGeometry);
    
    // Convert Courtyard boundaries to railings if applicable
    if (shouldIncludeCourtyard) {
        const courtyardNode = rooms.find(r => r.zone?.id === 'ext.courtyard');
        if (courtyardNode) {
            const courtyardPoly = courtyardNode.polygon;
            const cCentroid = this.getPolygonCentroid(courtyardPoly);
            elements.forEach(el => {
                if (el.type === 'wall' && el.subType === 'interior') {
                    const mid = { x: (el.p1!.x + el.p2!.x)/2, y: (el.p1!.y + el.p2!.y)/2 };
                    const nudge = {
                        x: mid.x + (cCentroid.x - mid.x) * 0.01,
                        y: mid.y + (cCentroid.y - mid.y) * 0.01
                    };
                    if (this.isPointInsidePolygon(nudge, courtyardPoly)) {
                        el.type = 'railing';
                        el.subType = 'glass-guard';
                    }
                }
            });
        }
    }

    // Annotations (Room Labels) with BLOCK LETTERS and DIMENSIONS
    rooms.forEach(node => {
      if (node.zone) {
        const center = this.getPolygonCentroid(node.polygon);
        const bounds = this.getPolygonBounds(node.polygon);
        const area = this.getPolygonArea(node.polygon);
        
        const minDim = Math.min(bounds.w, bounds.h);
        const maxDim = Math.max(bounds.w, bounds.h);
        
        const showLabel = minDim > 0.8 && area > 0.8;

        if (showLabel) {
          let dimStr = '';
          
          if (unitSystem === 'imperial') {
              const wTotalInches = Math.round(bounds.w * 3.28084 * 12);
              const wFeet = Math.floor(wTotalInches / 12);
              const wInches = wTotalInches % 12;

              const hTotalInches = Math.round(bounds.h * 3.28084 * 12);
              const hFeet = Math.floor(hTotalInches / 12);
              const hInches = hTotalInches % 12;

              dimStr = `${wFeet}'-${wInches}" x ${hFeet}'-${hInches}"`;
          } else {
              dimStr = `${bounds.w.toFixed(2)}m x ${bounds.h.toFixed(2)}m`;
          }
          
          elements.push({
            id: crypto.randomUUID(),
            type: 'room',
            label: `${node.zone.label.toUpperCase()}\n${dimStr}`,
            pos: center,
            width: bounds.w,
            depth: bounds.h,
            color: node.zone.color || this.getRandomPastel(seededRandom),
            roomShowArea: false,
            textFontSize: 6,
            dimFontSize: 5
          });
        }
      }
    });

    this.addCirculation(rooms, elements);
    this.addFenestration(rooms, elements);

    return {
      elements,
      rooms,
      rootArea,
      buildingArea,
      warnings,
      metrics: {
        totalAreaM2: rootArea,
        buildingAreaM2: buildingArea,
        efficiency: metrics.targetRequiredArea / buildingArea,
        roomCount: rooms.length
      }
    };
  }

  private static arePolygonsAdjacent(poly1: { points: Point[] }, poly2: { points: Point[] }): boolean {
    if (!poly1 || !poly1.points || !poly2 || !poly2.points) return false;
    for (const p of poly1.points) {
      for (let j = 0; j < poly2.points.length; j++) {
        const s1 = poly2.points[j];
        const s2 = poly2.points[(j + 1) % poly2.points.length];
        const dist = this.pointToSegmentDistance(p, s1, s2);
        if (dist < 0.25) return true;
      }
    }
    for (const p of poly2.points) {
      for (let j = 0; j < poly1.points.length; j++) {
        const s1 = poly1.points[j];
        const s2 = poly1.points[(j + 1) % poly1.points.length];
        const dist = this.pointToSegmentDistance(p, s1, s2);
        if (dist < 0.25) return true;
      }
    }
    return false;
  }

  private static pointToSegmentDistance(p: Point, s1: Point, s2: Point): number {
    const dx = s2.x - s1.x;
    const dy = s2.y - s1.y;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(p.x - s1.x, p.y - s1.y);
    let t = ((p.x - s1.x) * dx + (p.y - s1.y) * dy) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (s1.x + t * dx), p.y - (s1.y + t * dy));
  }

  private static findRoomPath(
    rooms: PartitionNode[],
    start: PartitionNode,
    end: PartitionNode,
    forbiddenTypes: string[]
  ): boolean {
    if (!start || !end) return false;
    if (start.id === end.id) return true;

    const visited = new Set();
    const queue = [start];
    visited.add(start.id);

    while (queue.length > 0) {
      const curr = queue.shift();
      if (curr.id === end.id) return true;

      const neighbors = rooms.filter(r => r.id !== curr.id && this.arePolygonsAdjacent(curr.polygon, r.polygon));
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor.id)) {
          if (neighbor.id === end.id) {
            return true;
          }
          const type = neighbor.zone?.type || '';
          if (!forbiddenTypes.includes(type)) {
            visited.add(neighbor.id);
            queue.push(neighbor);
          }
        }
      }
    }
    return false;
  }

  private static scoreLayoutCandidate(
    rooms: PartitionNode[],
    elements: ArchElement[],
    programId: string,
    options: any,
    boundaryPoints: Point[]
  ): { totalScore: number; rawScore: number; breakDown: any; warnings: string[] } {
    const warnings = [];
    const subtype = String(options.requirements?.subtype || '').toLowerCase();
    
    // Find key zones using flexible names and types
    const entryRoom = rooms.find(r => {
      const label = (r.zone?.label || '').toLowerCase();
      const type = (r.zone?.type || '').toLowerCase();
      return type === 'entry' || label.includes('entry') || label.includes('recep') || label.includes('lobby') || label.includes('foyer') || label.includes('porch') || label.includes('gateway') || type === 'waiting';
    });

    const livingRoom = rooms.find(r => {
      const label = (r.zone?.label || '').toLowerCase();
      const type = (r.zone?.type || '').toLowerCase();
      return type === 'living' || label.includes('living') || label.includes('workspace') || label.includes('great room') || label.includes('community hub') || label.includes('dining floor');
    });

    const diningRoom = rooms.find(r => {
      const label = (r.zone?.label || '').toLowerCase();
      const type = (r.zone?.type || '').toLowerCase();
      return type === 'dining' || label.includes('dining') || label.includes('cafe');
    });

    const kitchenRoom = rooms.find(r => {
      const label = (r.zone?.label || '').toLowerCase();
      const type = (r.zone?.type || '').toLowerCase();
      return type === 'kitchen' || label.includes('kitchen') || label.includes('pantry') || label.includes('mudroom');
    });

    const bedrooms = rooms.filter(r => {
      const label = (r.zone?.label || '').toLowerCase();
      const type = (r.zone?.type || '').toLowerCase();
      return type === 'bedroom' || type === 'exam' || type === 'classroom' || label.includes('bedroom') || label.includes('master') || label.includes('pod') || label.includes('consultation') || label.includes('lecture') || label.includes('workshop');
    });

    const bathrooms = rooms.filter(r => {
      const label = (r.zone?.label || '').toLowerCase();
      const type = (r.zone?.type || '').toLowerCase();
      return type === 'bath' || type === 'bathroom' || label.includes('bath') || label.includes('wc') || label.includes('toilet') || label.includes('restroom') || label.includes('comfort');
    });

    // 1. ADJACENCY SCORE (S_adj)
    let adjRulesCount = 0;
    let adjRulesSatisfied = 0;
    const programTemplate = SPATIAL_PROGRAMS[programId] || SPATIAL_PROGRAMS['domestic-standard'];
    
    programTemplate.zones.forEach(zSpec => {
      if (zSpec.adjacency) {
        zSpec.adjacency.forEach(rule => {
          adjRulesCount++;
          const sourceRooms = rooms.filter(r => r.zone?.id === zSpec.id || r.zone?.type === zSpec.type);
          const targetRooms = rooms.filter(r => r.zone?.id === rule.to || r.zone?.type === rule.to);
          
          let satisfied = false;
          for (const sRoom of sourceRooms) {
            for (const tRoom of targetRooms) {
              const touches = this.arePolygonsAdjacent(sRoom.polygon, tRoom.polygon);
              const sCent = this.getPolygonCentroid(sRoom.polygon);
              const tCent = this.getPolygonCentroid(tRoom.polygon);
              const dist = Math.hypot(sCent.x - tCent.x, sCent.y - tCent.y);
              
              if (rule.kind === 'must_touch') {
                if (touches) { satisfied = true; break; }
              } else if (rule.kind === 'near') {
                if (touches || dist < 6.0) { satisfied = true; break; }
              } else if (rule.kind === 'avoid') {
                if (!touches && dist >= 6.0) { satisfied = true; break; }
              }
            }
            if (satisfied) break;
          }
          if (satisfied) {
            adjRulesSatisfied += rule.weight;
          }
        });
      }
    });

    // Check key global architectural adjacencies:
    if (entryRoom && livingRoom) {
      adjRulesCount++;
      if (this.arePolygonsAdjacent(entryRoom.polygon, livingRoom.polygon)) {
        adjRulesSatisfied += 1.0;
      }
    }
    
    if (diningRoom && kitchenRoom) {
      adjRulesCount++;
      if (this.arePolygonsAdjacent(diningRoom.polygon, kitchenRoom.polygon)) {
        adjRulesSatisfied += 1.0;
      }
    }

    if (bedrooms.length > 0 && bathrooms.length > 0) {
      bedrooms.forEach(bed => {
        adjRulesCount++;
        const hasNearBath = bathrooms.some(bath => {
          const sCent = this.getPolygonCentroid(bed.polygon);
          const tCent = this.getPolygonCentroid(bath.polygon);
          const dist = Math.hypot(sCent.x - tCent.x, sCent.y - tCent.y);
          return this.arePolygonsAdjacent(bed.polygon, bath.polygon) || dist < 6.0;
        });
        if (hasNearBath) {
          adjRulesSatisfied += 1.0;
        }
      });
    }

    let S_adj = adjRulesCount > 0 ? (adjRulesSatisfied / adjRulesCount) * 100 : 100;
    S_adj = Math.max(0, Math.min(100, S_adj));

    // 2. PRIVACY GRADIENT SCORE (S_priv)
    let S_priv = 100;
    if (entryRoom) {
      bedrooms.forEach(bed => {
        if (this.arePolygonsAdjacent(bed.polygon, entryRoom.polygon)) {
          S_priv -= 20;
        }
      });
    }

    bathrooms.forEach(bath => {
      if (diningRoom && this.arePolygonsAdjacent(bath.polygon, diningRoom.polygon)) {
        S_priv -= 20;
      }
      if (kitchenRoom && this.arePolygonsAdjacent(bath.polygon, kitchenRoom.polygon)) {
        S_priv -= 20;
      }
    });
    S_priv = Math.max(0, Math.min(100, S_priv));

    // 3. CIRCULATION EFFICIENCY SCORE (S_circ)
    let S_circ = 100;
    const totalGFA = rooms.reduce((sum, r) => sum + this.getPolygonArea(r.polygon), 0);
    const corridors = rooms.filter(r => r.zone?.type === 'corridor' || r.zone?.label.toLowerCase().includes('corridor') || r.zone?.label.toLowerCase().includes('passage') || r.zone?.label.toLowerCase().includes('lobby'));
    const corridorArea = corridors.reduce((sum, r) => sum + this.getPolygonArea(r.polygon), 0);
    const circRatio = corridorArea / (totalGFA || 1);

    if (circRatio > 0.15) {
      const excess = circRatio - 0.15;
      S_circ -= Math.round(excess * 250);
    } else if (circRatio < 0.05 && totalGFA > 50) {
      S_circ -= 15;
    }

    corridors.forEach(c => {
      const neighbors = rooms.filter(r => r.id !== c.id && this.arePolygonsAdjacent(c.polygon, r.polygon));
      if (neighbors.length <= 1) {
        S_circ -= 10;
      }
    });

    rooms.forEach(r => {
      if (r.zone?.type !== 'entry' && r.zone?.type !== 'living' && r.zone?.type !== 'corridor') {
        const canAccess = rooms.some(other => {
          const isDistributor = other.zone?.type === 'corridor' || other.zone?.type === 'living' || other.zone?.type === 'entry';
          return isDistributor && this.arePolygonsAdjacent(r.polygon, other.polygon);
        });
        if (!canAccess) {
          S_circ -= 15;
        }
      }
    });
    S_circ = Math.max(0, Math.min(100, S_circ));

    // 4. DAYLIGHT AVAILABILITY SCORE (S_day)
    let S_day = 100;
    const daylightRooms = rooms.filter(r => {
      const type = r.zone?.type;
      return type === 'bedroom' || type === 'living' || type === 'office' || type === 'classroom' || type === 'dining' || type === 'exam';
    });

    daylightRooms.forEach(r => {
      if (!this.polygonTouchesExterior(r.polygon, boundaryPoints)) {
        S_day -= 20;
      }
    });

    const serviceRooms = rooms.filter(r => {
      const type = r.zone?.type;
      return type === 'bath' || type === 'storage' || type === 'utility' || type === 'store';
    });

    let misplacedServiceCount = 0;
    serviceRooms.forEach(r => {
      if (this.polygonTouchesExterior(r.polygon, boundaryPoints)) {
        misplacedServiceCount++;
      }
    });

    if (misplacedServiceCount > 2 && daylightRooms.length > 0) {
      S_day -= 10;
    }
    S_day = Math.max(0, Math.min(100, S_day));

    // 5. WET CORE EFFICIENCY SCORE (S_wet)
    let S_wet = 100;
    const wetRooms = rooms.filter(r => r.zone?.wetCore || r.zone?.type === 'kitchen' || r.zone?.type === 'bath' || r.zone?.type === 'laundry');
    
    if (wetRooms.length > 1) {
      let clumpedCount = 0;
      wetRooms.forEach(w1 => {
        const isClumped = wetRooms.some(w2 => w1.id !== w2.id && this.arePolygonsAdjacent(w1.polygon, w2.polygon));
        if (isClumped) clumpedCount++;
      });
      const clumpRatio = clumpedCount / wetRooms.length;
      S_wet = Math.round(clumpRatio * 100);
    }
    S_wet = Math.max(0, Math.min(100, S_wet));

    // 6. ZONING CORRECTNESS SCORE (S_zone)
    let S_zone = 100;
    const publicGroup = rooms.filter(r => r.zone?.zone === 'public');
    const privateGroup = rooms.filter(r => r.zone?.zone === 'private');
    
    const getZoneCentroids = (g) => g.map(r => this.getPolygonCentroid(r.polygon));
    
    if (publicGroup.length > 1 && privateGroup.length > 1) {
      const pubCentroids = getZoneCentroids(publicGroup);
      const privCentroids = getZoneCentroids(privateGroup);
      
      const avgCentroid = (pts) => {
        const sum = pts.reduce((s, p) => ({ x: s.x + p.x, y: s.y + p.y }), { x: 0, y: 0 });
        return { x: sum.x / pts.length, y: sum.y / pts.length };
      };
      
      const pubCenter = avgCentroid(pubCentroids);
      const privCenter = avgCentroid(privCentroids);
      const zoneSep = Math.hypot(pubCenter.x - privCenter.x, pubCenter.y - privCenter.y);
      if (zoneSep < 3.0) {
        S_zone -= 15;
      }
    }
    S_zone = Math.max(0, Math.min(100, S_zone));

    // 7. ROOM USABILITY SCORE (S_use)
    let S_use = 100;
    rooms.forEach(r => {
      const bounds = this.getPolygonBounds(r.polygon);
      const minDim = Math.min(bounds.w, bounds.h);
      const maxDim = Math.max(bounds.w, bounds.h);
      const ar = maxDim / (minDim || 0.1);
      const isCorridor = r.zone?.type === 'corridor' || r.zone?.type === 'entry';
      
      if (!isCorridor && r.zone?.type !== 'balcony' && r.zone?.id !== 'ext.courtyard') {
        if (ar > 2.2) S_use -= 15;
        const minReq = r.zone?.minWidthM || 2.4;
        if (minDim < minReq) S_use -= 15;
      }
    });
    S_use = Math.max(0, Math.min(100, S_use));

    const rawScore = Math.round(
      S_adj * 0.25 +
      S_priv * 0.20 +
      S_circ * 0.15 +
      S_day * 0.15 +
      S_wet * 0.10 +
      S_zone * 0.08 +
      S_use * 0.07
    );

    // --- FINAL REJECTION TESTS ---
    let failedRejection = false;

    // 1. Living room must have exterior contact (if residential)
    const resLivingRoom = rooms.find(r => r.zone?.type === 'living' && programId.startsWith('domestic-'));
    if (resLivingRoom && !this.polygonTouchesExterior(resLivingRoom.polygon, boundaryPoints)) {
      failedRejection = true;
      warnings.push("REJECTED: Living room has no exterior contact.");
    }

    // 2. Bedrooms must have exterior wall/daylight
    const landlockedBedroom = bedrooms.find(r => r.zone?.type === 'bedroom' && !this.polygonTouchesExterior(r.polygon, boundaryPoints));
    if (landlockedBedroom) {
      failedRejection = true;
      warnings.push("REJECTED: Bedroom (" + (landlockedBedroom.zone?.label || "Bedroom") + ") has no exterior contact.");
    }

    // 3. Kitchen must not be the only path to bedrooms
    if (entryRoom && subtype !== 'studio') {
      const badBed = bedrooms.find(b => {
        // If no path exists from entry to bedroom that avoids kitchens/dining/baths/etc., it's rejected
        return !this.findRoomPath(rooms, entryRoom, b, ['kitchen', 'bath', 'storage', 'utility', 'laundry', 'bedroom', 'dining']);
      });
      if (badBed) {
        failedRejection = true;
        warnings.push("REJECTED: Bedroom (" + (badBed.zone?.label || "Bedroom") + ") is only accessible through kitchen/dining/bath/storage/other bedroom.");
      }
    }

    // 4. Bathroom must not be the only path to another room
    if (entryRoom) {
      const blockedRoom = rooms.find(r => {
        if (r.zone?.type === 'bath' || r.id === entryRoom.id || r.zone?.type === 'balcony' || r.zone?.type === 'garden') return false;
        return !this.findRoomPath(rooms, entryRoom, r, ['bath']);
      });
      if (blockedRoom) {
        failedRejection = true;
        warnings.push("REJECTED: Room (" + (blockedRoom.zone?.label || "Room") + ") is only accessible by crossing a bathroom.");
      }
    }

    // 5. Balcony/terrace must connect to living/public zones
    const disconnectedBalcony = rooms.find(r => {
      if (r.zone?.type !== 'balcony' || r.zone?.id === 'ext.courtyard') return false;
      const neighbors = rooms.filter(other => other.id !== r.id && this.arePolygonsAdjacent(r.polygon, other.polygon));
      return !neighbors.some(n => n.zone?.type === 'living' || n.zone?.type === 'dining' || n.zone?.zone === 'public');
    });
    if (disconnectedBalcony) {
      failedRejection = true;
      warnings.push("REJECTED: Balcony/terrace (" + (disconnectedBalcony.zone?.label || "Balcony") + ") is disconnected from living or main public space.");
    }

    // 6. Entry opens directly into private bedroom zone in non-studio layouts
    if (entryRoom && subtype !== 'studio') {
      const adjacentBedroom = bedrooms.find(b => this.arePolygonsAdjacent(entryRoom.polygon, b.polygon));
      if (adjacentBedroom) {
        failedRejection = true;
        warnings.push("REJECTED: Entry opens directly into private bedroom zone (" + (adjacentBedroom.zone?.label || "Bedroom") + ").");
      }
    }

    // 7. Wet rooms are scattered with no logic (clumping score must be >= 50% if multi-wet)
    if (wetRooms.length > 1 && S_wet < 50) {
      failedRejection = true;
      warnings.push("REJECTED: Wet rooms are scattered with no clumping logic.");
    }

    // 8. Public users must cross private bedrooms
    if (entryRoom) {
      const blockedPublic = rooms.find(r => {
        if (r.zone?.zone !== 'public' || r.zone?.type === 'entry' || r.zone?.type === 'balcony') return false;
        return !this.findRoomPath(rooms, entryRoom, r, ['bedroom']);
      });
      if (blockedPublic) {
        failedRejection = true;
        warnings.push("REJECTED: Public space (" + (blockedPublic.zone?.label || "Public Space") + ") requires crossing a private bedroom.");
      }
    }

    // 9. A major room is landlocked without reason
    const landlockedMajor = rooms.find(r => {
      const isMajor = r.zone?.daylight === 'required' || r.zone?.exteriorContact === 'required';
      return isMajor && !this.polygonTouchesExterior(r.polygon, boundaryPoints);
    });
    if (landlockedMajor) {
      failedRejection = true;
      warnings.push("REJECTED: Major room (" + (landlockedMajor.zone?.label || "Major Room") + ") is landlocked without daylight/exterior contact.");
    }

    // 10. Accidental circulation (isolated rooms)
    if (entryRoom) {
      const isolated = rooms.find(r => !this.findRoomPath(rooms, entryRoom, r, []));
      if (isolated) {
        failedRejection = true;
        warnings.push("REJECTED: Circulation is accidental; room (" + (isolated.zone?.label || "Room") + ") is isolated/unreachable.");
      }
    }

    const totalScore = failedRejection ? 0 : rawScore;

    return {
      totalScore,
      rawScore,
      breakDown: { S_adj, S_priv, S_circ, S_day, S_wet, S_zone, S_use },
      warnings
    };
  }

  private static applyRequirementsToProgram(template: SpatialProgram, reqs: ArchElement['proceduralRequirements']): SpatialProgram {
    if (!reqs) return template;
    
    // Deep clone the template
    let program = JSON.parse(JSON.stringify(template)) as SpatialProgram;
    const zones = program.zones;

    // Helper: Adjust zone count dynamically (adding/removing zones to match targetCount exactly)
    const adjustZoneCount = (type: string, targetCount: number, labelPrefix: string) => {
        const existing = zones.filter(z => z.type === type);
        const E = existing.length;
        if (E < targetCount) {
            // Add clones
            const tpl = existing[0] || zones.find(z => z.type === type);
            if (tpl) {
                for (let i = E; i < targetCount; i++) {
                    zones.push({
                        ...tpl,
                        id: `${tpl.id}-clone-${i}`,
                        label: `${labelPrefix} ${i + 1}`,
                        weight: tpl.weight * 0.9 
                    });
                }
            }
        } else if (E > targetCount) {
            // Remove extra zones
            for (let i = E - 1; i >= targetCount; i--) {
                const idx = zones.indexOf(existing[i]);
                if (idx !== -1) zones.splice(idx, 1);
            }
        }
    };

    // 1. Residential Requirements (Strict Validation)
    const isApartment = program.id.startsWith('domestic-') || program.id.startsWith('house-') || program.id === 'res-coliving';

    if (reqs.numBedrooms !== undefined) {
        const bedroomCount = reqs.numBedrooms;
        if (reqs.subtype !== 'studio') {
            adjustZoneCount('bedroom', bedroomCount, 'Bedroom');
        }
    }

    if (reqs.numBaths !== undefined) {
        adjustZoneCount('bath', reqs.numBaths, 'Bath');
    }

    if (reqs.numKitchens !== undefined && !isApartment) {
        adjustZoneCount('kitchen', reqs.numKitchens, 'Kitchen');
    }

    if (reqs.numBalconies !== undefined && isApartment) {
        adjustZoneCount('balcony', reqs.numBalconies, 'Balcony');
    }

    // 2. Office Requirements
    if (reqs.numMeetingRooms !== undefined) adjustZoneCount('meeting', reqs.numMeetingRooms, 'Meeting Room');
    if (reqs.numExecutiveCabins !== undefined) adjustZoneCount('office', reqs.numExecutiveCabins, 'Executive Cabin');

    // 3. F&B Requirements
    if (reqs.seatingCapacity) {
        const dining = zones.find(z => z.type === 'dining');
        if (dining) {
            dining.minAreaM2 = reqs.seatingCapacity * 1.5;
            dining.targetAreaM2 = reqs.seatingCapacity * 2.0;
        }
    }

    // 4. Education / Healthcare
    if (reqs.numClassrooms !== undefined) adjustZoneCount('classroom', reqs.numClassrooms, 'Classroom');
    if (reqs.numClinicalRooms !== undefined) adjustZoneCount('exam', reqs.numClinicalRooms, 'Exam Room');

    // 5. Global Tuning
    if (reqs.circulationPreference === 'spacious') {
        zones.forEach(z => {
            z.minWidthM = (z.minWidthM || 2.4) * 1.2;
        });
    }

    return program;
  }

  private static addFenestration(rooms: PartitionNode[], elements: ArchElement[]) {
    // Add windows to exterior walls of rooms, prioritizing those with daylight requirements
    elements.filter(e => e.type === 'wall' && e.subType === 'exterior').forEach(wall => {
      const len = Math.hypot(wall.p2!.x - wall.p1!.x, wall.p2!.y - wall.p1!.y);
      if (len < 1.0) return;

      // Find the room this wall belongs to
      const mid = { x: (wall.p1!.x + wall.p2!.x)/2, y: (wall.p1!.y + wall.p2!.y)/2 };
      const room = rooms.find(r => this.isPointInsidePolygon(this.nudgePoint(mid, r.polygon), r.polygon));
      
      let windowWidth = 1.2;
      let shouldAdd = false;

      if (room?.zone) {
          const req = room.zone.daylight;
          if (req === 'required' || req === 'preferred') {
              shouldAdd = true;
              windowWidth = Math.min(2.4, len * 0.7);
          } else if (req === 'optional' && len > 3.0) {
              shouldAdd = true;
              windowWidth = 0.9;
          }
      } else if (len > 3.0) {
          shouldAdd = true;
      }

      if (shouldAdd) {
        const cleanSpot = this.findCleanOpeningPos(wall, elements, windowWidth);
        if (cleanSpot) {
            const angle = Math.atan2(wall.p2!.y - wall.p1!.y, wall.p2!.x - wall.p1!.x) * (180/Math.PI);
            elements.push({
              id: crypto.randomUUID(),
              type: 'window',
              pos: cleanSpot.pos,
              rotation: angle,
              width: windowWidth,
              hostWallId: wall.id,
              hostT: cleanSpot.t
            });
        }
      }
    });
  }

  private static nudgePoint(p: Point, poly: Polygon): Point {
      const centroid = this.getPolygonCentroid(poly);
      return {
          x: p.x + (centroid.x - p.x) * 0.05,
          y: p.y + (centroid.y - p.y) * 0.05
      };
  }

  private static polygonTouchesExterior(poly: Polygon, exteriorPoints: Point[]): boolean {
    if (!poly || !poly.points || !exteriorPoints || exteriorPoints.length < 3) return false;
    for (const pt of poly.points) {
      for (let i = 0; i < exteriorPoints.length; i++) {
        const p1 = exteriorPoints[i];
        const p2 = exteriorPoints[(i + 1) % exteriorPoints.length];
        
        const A = pt.x - p1.x;
        const B = pt.y - p1.y;
        const C = p2.x - p1.x;
        const D = p2.y - p1.y;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        if (lenSq !== 0) param = dot / lenSq;
        
        let xx, yy;
        if (param < 0) {
          xx = p1.x;
          yy = p1.y;
        } else if (param > 1) {
          xx = p2.x;
          yy = p2.y;
        } else {
          xx = p1.x + param * C;
          yy = p1.y + param * D;
        }
        
        const dx = pt.x - xx;
        const dy = pt.y - yy;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.05) {
          return true;
        }
      }
    }
    return false;
  }

  private static partitionNode(
    node: PartitionNode, 
    zones: SpatialZone[], 
    seededRandom: () => number,
    entryAnchor: Point,
    exteriorPoints: Point[]
  ) {
    const area = this.getPolygonArea(node.polygon);

    if (zones.length <= 1) {
      if (zones.length === 1) {
        node.zone = zones[0];
        const area = this.getPolygonArea(node.polygon);
        
        // If we have subspaces, keep splitting
        if (zones[0].subSpaces && zones[0].subSpaces.length > 1) {
          const filteredSub = this.filterZonesForArea(zones[0].subSpaces, area);
          if (filteredSub.length > 1) {
             this.partitionNode(node, filteredSub, seededRandom, entryAnchor, exteriorPoints);
          } else if (filteredSub.length === 1) {
             node.zone = filteredSub[0];
          }
        }
      } else {
        node.zone = { 
            id: `circ-${crypto.randomUUID()}`, 
            type: 'corridor', 
            label: 'CIRCULATION', 
            zone: 'service', 
            weight: 1, 
            minAreaM2: 2, 
            color: '#f8fafc' 
        };
      }
      return;
    }

    const totalWeight = zones.reduce((sum, z) => sum + z.weight, 0);
    const bounds = this.getPolygonBounds(node.polygon);
    const isWide = bounds.w > bounds.h;
    
    interface SplitCandidate {
        line: { p1: Point; p2: Point };
        score: number;
        g1: SpatialZone[];
        g2: SpatialZone[];
        ratio: number;
    }

    let bestCandidate: SplitCandidate | null = null;
    const candidatesCount = 10;
    
    // Sort zones to keep related ones together: custom depth or public -> service -> private
    const zoneDepth = { 'public': 0, 'core': 1, 'service': 2, 'private': 3, 'hazard': 4 };
    const sortedZones = [...zones].sort((a,b) => {
        const depthA = a.depth !== undefined ? a.depth : (zoneDepth[a.zone] || 0);
        const depthB = b.depth !== undefined ? b.depth : (zoneDepth[b.zone] || 0);
        return depthA - depthB;
    });

    for (let axis = 0; axis < 2; axis++) { 
        const useVertical = axis === 0;
        const axisBonus = (useVertical && isWide) || (!useVertical && !isWide) ? 0 : 300;

        for (let i = 1; i <= candidatesCount; i++) {
            // Add slight seed-based coordinate noise to split ratio to vary room sizes
            const randShift = (seededRandom() - 0.5) * 0.05;
            const splitT = Math.max(0.1, Math.min(0.9, 0.2 + (i / (candidatesCount + 1)) * 0.6 + randShift));
            const splitLine = useVertical
                ? { p1: { x: bounds.x + bounds.w * splitT, y: bounds.y - 1000 }, p2: { x: bounds.x + bounds.w * splitT, y: bounds.y + 1000 } }
                : { p1: { x: bounds.x - 1000, y: bounds.y + bounds.h * splitT }, p2: { x: bounds.x + bounds.w + 1000, y: bounds.y + bounds.h * splitT } };

            const splitResult = this.splitPolygon(node.polygon, splitLine.p1, splitLine.p2);
            if (splitResult.poly1.points.length < 3 || splitResult.poly2.points.length < 3) continue;

            const area1 = this.getPolygonArea(splitResult.poly1);
            const ratio1 = area1 / area;

            const getTargetSum = (zList: SpatialZone[]) => zList.reduce((s, z) => s + (z.targetAreaM2 || z.minAreaM2 || 15), 0);
            const totalTarget = getTargetSum(sortedZones);
            
            let cumulative = 0;
            let splitIdx = 1;
            for (let j = 0; j < sortedZones.length; j++) {
                cumulative += (sortedZones[j].targetAreaM2 || sortedZones[j].minAreaM2 || 15) / (totalTarget || 1);
                if (cumulative >= ratio1 - 0.08 || j === sortedZones.length - 2) {
                    splitIdx = j + 1;
                    break;
                }
            }

            const g1 = sortedZones.slice(0, splitIdx);
            const g2 = sortedZones.slice(splitIdx);
            if (g1.length === 0 || g2.length === 0) continue;

            const targetArea1 = getTargetSum(g1);
            const targetRatio = targetArea1 / (totalTarget || 1);
            const areaPenalty = Math.abs(ratio1 - targetRatio) * 1500;
            
            const b1 = this.getPolygonBounds(splitResult.poly1);
            const b2 = this.getPolygonBounds(splitResult.poly2);
            const ar1 = Math.max(b1.w, b1.h) / Math.min(b1.w, b1.h);
            const ar2 = Math.max(b2.w, b2.h) / Math.min(b2.w, b2.h);
            
            let aspectPenalty = 0;
            [ar1, ar2].forEach(ar => {
                if (ar > 3.0) aspectPenalty += (ar - 3.0) * 5000;
                else if (ar > 2.0) aspectPenalty += (ar - 2.0) * 1000;
            });

            let minWidthPenalty = 0;
            const checkMinWidth = (bound: any, group: SpatialZone[]) => {
                const minW = Math.max(...group.map(z => z.minWidthM || 2.4));
                if (bound.w < minW || bound.h < minW) {
                    return (minW - Math.min(bound.w, bound.h)) * 12000;
                }
                return 0;
            };
            minWidthPenalty += checkMinWidth(b1, g1);
            minWidthPenalty += checkMinWidth(b2, g2);

            const c1 = this.getPolygonCentroid(splitResult.poly1);
            const c2 = this.getPolygonCentroid(splitResult.poly2);
            const dist1 = Math.hypot(c1.x - entryAnchor.x, c1.y - entryAnchor.y);
            const dist2 = Math.hypot(c2.x - entryAnchor.x, c2.y - entryAnchor.y);
            
            const g1Depth = Math.min(...g1.map(z => zoneDepth[z.zone] || 0));
            const g2Depth = Math.min(...g2.map(z => zoneDepth[z.zone] || 0));
            
            let anchorScore = 0;
            if (g1Depth < g2Depth) {
                anchorScore = dist1 < dist2 ? 0 : 2000;
            } else if (g2Depth < g1Depth) {
                anchorScore = dist2 < dist1 ? 0 : 2000;
            }

            let adjacencyPenalty = 0;
            sortedZones.forEach(z => {
                if (z.adjacency) {
                    z.adjacency.forEach(adj => {
                        const selfInG1 = g1.some(gz => gz.id === z.id);
                        const targetInG1 = g1.some(gz => gz.id === adj.to);
                        if (selfInG1 !== targetInG1) {
                            if (adj.kind === 'must_touch') {
                                adjacencyPenalty += adj.weight * 2500;
                            } else if (adj.kind === 'near') {
                                adjacencyPenalty += adj.weight * 800;
                            }
                        }
                    });
                }
            });

            // Daylight Penalty
            let daylightPenalty = 0;
            const hasDaylightG1 = this.polygonTouchesExterior(splitResult.poly1, exteriorPoints);
            const hasDaylightG2 = this.polygonTouchesExterior(splitResult.poly2, exteriorPoints);
            g1.forEach(z => {
                if (z.daylight === 'required' && !hasDaylightG1) {
                    daylightPenalty += 5000;
                }
            });
            g2.forEach(z => {
                if (z.daylight === 'required' && !hasDaylightG2) {
                    daylightPenalty += 5000;
                }
            });

            // Wet Core Clumping Penalty
            let wetCorePenalty = 0;
            const wetInG1 = g1.some(z => z.wetCore);
            const wetInG2 = g2.some(z => z.wetCore);
            if (wetInG1 && wetInG2) {
                wetCorePenalty = 3000;
            }

            const score = areaPenalty + aspectPenalty + minWidthPenalty + anchorScore + adjacencyPenalty + daylightPenalty + wetCorePenalty + axisBonus;

            if (!bestCandidate || score < bestCandidate.score) {
                bestCandidate = { line: splitLine, score, g1, g2, ratio: splitT };
            }
        }
    }

    if (bestCandidate) {
        const splitResult = this.splitPolygon(node.polygon, bestCandidate.line.p1, bestCandidate.line.p2);
        node.splitLine = bestCandidate.line;
        node.children = [
            { id: crypto.randomUUID(), polygon: splitResult.poly1 },
            { id: crypto.randomUUID(), polygon: splitResult.poly2 }
        ];
        this.partitionNode(node.children[0], bestCandidate.g1, seededRandom, entryAnchor, exteriorPoints);
        this.partitionNode(node.children[1], bestCandidate.g2, seededRandom, entryAnchor, exteriorPoints);
    } else {
        node.zone = sortedZones[0];
    }
  }

  /**
   * Geometry Generation: Converts spatial nodes into walls
   */
  private static generateGeometry(node: PartitionNode, elements: ArchElement[], geometryStyle: LayoutGeometry, isRoot = true) {
    const isBuildingRoot = node.id === 'building-root';
    const isGardenZone = node.zone?.type === 'garden' || node.zone?.id === 'ext.unassigned';
    
    // A layout has external space if the root has children and at least one is a garden or unassigned
    const hasExternalSpaces = isRoot && node.children?.some(c => 
      c.id.startsWith('ext-space') || c.zone?.type === 'garden' || c.zone?.id === 'ext.unassigned'
    );

    // 1. Site Boundary (Thin lines for the overall property)
    if (isRoot && hasExternalSpaces) {
      const pts = node.polygon.points;
      for (let i = 0; i < pts.length; i++) {
        elements.push({
          id: crypto.randomUUID(),
          type: 'line',
          p1: pts[i], 
          p2: pts[(i + 1) % pts.length],
          thickness: 0.05
        });
      }
    }

    // 2. Building Footprint (Thick exterior walls)
    // Draw thick walls if:
    // a) This IS the building-root node
    // b) This is the site root and there are NO external spaces (building fills the site)
    if (isBuildingRoot || (isRoot && !hasExternalSpaces)) {
      const pts = node.polygon.points;
      for (let i = 0; i < pts.length; i++) {
        this.addWall(elements, pts[i], pts[(i + 1) % pts.length], true, geometryStyle);
      }
    }

    // 3. Recursive Partitioning
    if (node.children) {
      if (node.splitLine) {
        const intersections = this.getPolygonLineIntersections(node.polygon, node.splitLine.p1, node.splitLine.p2);
        if (intersections.length >= 2) {
          const isSiteLevelSplit = isRoot && hasExternalSpaces;
          
          if (isSiteLevelSplit) {
            // Split between building and garden - draw a clean boundary line
            elements.push({
              id: crypto.randomUUID(),
              type: 'line',
              p1: intersections[0],
              p2: intersections[1],
              thickness: 0.05
            });
          } else if (isGardenZone) {
            // Internal garden subdivision - very thin line
            elements.push({
              id: crypto.randomUUID(),
              type: 'line',
              p1: intersections[0],
              p2: intersections[1],
              thickness: 0.02
            });
          } else {
            // Standard internal room partition
            this.addWall(elements, intersections[0], intersections[1], false, geometryStyle);
          }
        }
      }
      
      node.children.forEach(child => {
        this.generateGeometry(child, elements, geometryStyle, false);
      });
    }
  }

  private static geometryStyleKey(style: LayoutGeometry | string): ResidentialGeometryStandardId {
    return this.normalizeResidentialGeometry(style, '');
  }

  private static addWall(elements: ArchElement[], p1: Point, p2: Point, isExterior: boolean, style: LayoutGeometry | string) {
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    if (dist < 0.1) return;

    const key = this.geometryStyleKey(style);
    const baseThickness = isExterior ? 0.25 : 0.15;

    const pushStraight = (a: Point, b: Point, wallSource = 'line') => {
      elements.push({
        id: crypto.randomUUID(),
        type: 'wall',
        p1: a,
        p2: b,
        thickness: baseThickness,
        subType: isExterior ? 'exterior' : 'interior',
        wallSource
      });
    };

    const pushCurved = (a: Point, b: Point, curvature = 0.10, wallSource = 'arc') => {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 0.1) return;

      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const perp = { x: -dy, y: dx };
      const len = Math.hypot(perp.x, perp.y) || 1;

      const ctrl = {
        x: mid.x + (perp.x / len) * d * curvature,
        y: mid.y + (perp.y / len) * d * curvature
      };

      elements.push({
        id: crypto.randomUUID(),
        type: 'wall',
        p1: a,
        p2: b,
        isCurved: true,
        controlPoint: ctrl,
        thickness: baseThickness,
        subType: isExterior ? 'exterior' : 'interior',
        wallSource
      });
    };

    const pushFaceted = (a: Point, b: Point, kink = 0.08, wallSource = 'line') => {
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 2.0 || isExterior) {
        pushStraight(a, b, wallSource);
        return;
      }

      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const perp = { x: -dy, y: dx };
      const len = Math.hypot(perp.x, perp.y) || 1;
      const offset = Math.min(0.55, d * kink);

      const k = {
        x: mid.x + (perp.x / len) * offset,
        y: mid.y + (perp.y / len) * offset
      };

      pushStraight(a, k, wallSource);
      pushStraight(k, b, wallSource);
    };

    switch (key) {
      case 'angular-oblique':
        pushFaceted(p1, p2, 0.14, 'angular');
        break;
      case 'curved':
        pushCurved(p1, p2, isExterior ? 0.08 : 0.13, 'arc');
        break;
      case 'hybrid':
        if (!isExterior && dist > 2.3) {
          // hybrid combines rectilinear segments with curves / faceted turns
          if (dist > 3.5) {
            pushCurved(p1, p2, 0.08, 'arc');
          } else {
            pushFaceted(p1, p2, 0.08, 'rectilinear-angular');
          }
        } else {
          pushStraight(p1, p2, 'rectilinear');
        }
        break;
      case 'courtyard-ring':
        if (!isExterior && dist > 2.4) pushCurved(p1, p2, 0.05, 'arc');
        else pushStraight(p1, p2, 'ring');
        break;
      case 'organic-freeform':
        // organic-freeform uses highly expressive curved/faceted forms
        if (dist > 2.2) {
          pushCurved(p1, p2, isExterior ? 0.10 : 0.16, 'arc');
        } else {
          pushFaceted(p1, p2, 0.08, 'faceted-organic');
        }
        break;
      case 'rectilinear':
      default:
        pushStraight(p1, p2, 'rectilinear');
        break;
    }
  }

  /**
   * Utilities
   */
  private static splitPolygon(poly: Polygon, p1: Point, p2: Point): { poly1: Polygon; poly2: Polygon } {
    const pts = poly?.points;
    const poly1: Point[] = [];
    const poly2: Point[] = [];

    if (!pts || !Array.isArray(pts)) return { poly1: { points: [] }, poly2: { points: [] } };

    const side = (p: Point) => (p2.x - p1.x) * (p.y - p1.y) - (p2.y - p1.y) * (p.x - p1.x);

    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const sA = side(a);
        const sB = side(b);

        if (sA >= 0) poly1.push(a);
        if (sA <= 0) poly2.push(a);

        if ((sA > 0 && sB < 0) || (sA < 0 && sB > 0)) {
            const t = Math.abs(sA) / (Math.abs(sA) + Math.abs(sB));
            const intersect = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
            poly1.push(intersect);
            poly2.push(intersect);
        }
    }

    return { poly1: { points: poly1 }, poly2: { points: poly2 } };
  }

  private static getPolygonLineIntersections(poly: Polygon, p1: Point, p2: Point): Point[] {
    const pts = poly?.points;
    if (!pts || !Array.isArray(pts)) return [];
    const intersections: Point[] = [];
    const side = (p: Point) => (p2.x - p1.x) * (p.y - p1.y) - (p2.y - p1.y) * (p.x - p1.x);

    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        const sA = side(a);
        const sB = side(b);
        if ((sA > 0 && sB < 0) || (sA < 0 && sB > 0)) {
            const t = Math.abs(sA) / (Math.abs(sA) + Math.abs(sB));
            intersections.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
        }
    }
    return intersections;
  }

  private static isPointInsidePolygon(pt: Point, poly: Polygon): boolean {
    const pts = poly?.points;
    if (!pts || !Array.isArray(pts) || pts.length < 3) return false;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x, yi = pts[i].y;
        const xj = pts[j].x, yj = pts[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) && (pt.x < (xj - xi) * (pt.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
  }

  public static getPolygonBounds(poly: Polygon) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    poly.points.forEach(p => {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    });
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  private static getPolygonCentroid(poly: Polygon): Point {
    let x = 0, y = 0;
    poly.points.forEach(p => { x += p.x; y += p.y; });
    return { x: x / poly.points.length, y: y / poly.points.length };
  }

  public static getPolygonArea(poly: Polygon): number {
    const pts = poly?.points;
    if (!pts || !Array.isArray(pts) || pts.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < pts.length; i++) {
        const p1 = pts[i];
        const p2 = pts[(i + 1) % pts.length];
        area += p1.x * p2.y - p2.x * p1.y;
    }
    return Math.abs(area / 2);
  }

  private static filterZonesForArea(zones: SpatialZone[], availableArea: number): SpatialZone[] {
    const selected: SpatialZone[] = [];
    let currentMinSum = 0;
    const primaryTypes = ['living', 'entry', 'office', 'retail', 'exam', 'bedroom', 'kitchen'];

    for (const z of zones) {
        if (primaryTypes.includes(z.type)) {
            const minReq = z.minAreaM2 || 5;
            if (currentMinSum + minReq <= availableArea) {
                selected.push(z);
                currentMinSum += minReq;
            }
        }
    }
    for (const z of zones) {
        if (!primaryTypes.includes(z.type)) {
            const minReq = z.minAreaM2 || 5;
            if (currentMinSum + minReq <= availableArea) {
                selected.push(z);
                currentMinSum += minReq;
            }
        }
    }

    if (selected.length === 0 && zones.length > 0) return [zones[0]];

    const totalWeight = selected.reduce((s, z) => s + z.weight, 0);
    return selected.map(z => ({ 
        ...z, 
        weight: totalWeight > 0 ? (z.weight / totalWeight) : 1 / selected.length 
    }));
  }

  private static addCirculation(rooms: PartitionNode[], elements: ArchElement[]) {
      // 1. Add ENTRANCE DOOR
      const entryRoom = rooms.find(r => r.zone?.type === 'entry' || r.zone?.type === 'reception' || r.zone?.type === 'living');
      if (entryRoom) {
          const exteriorWalls = elements.filter(el => el.type === 'wall' && el.subType === 'exterior');
          for (const wall of exteriorWalls) {
              if (!wall.p1 || !wall.p2) continue;
              const mid = { x: (wall.p1.x + wall.p2.x) / 2, y: (wall.p1.y + wall.p2.y) / 2 };
              // Nudge slightly inside to check which room it belongs to
              const testPt = this.nudgePoint(mid, entryRoom.polygon);
              if (this.isPointInsidePolygon(testPt, entryRoom.polygon)) {
                  const cleanSpot = this.findCleanOpeningPos(wall, elements, 1.0);
                  if (cleanSpot) {
                      elements.push({
                          id: crypto.randomUUID(),
                          type: 'door',
                          pos: cleanSpot.pos,
                          rotation: Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x) * (180 / Math.PI),
                          width: 1.0,
                          hostWallId: wall.id,
                          hostT: cleanSpot.t
                      });
                      break;
                  }
              }
          }
      }

      // 2. INTERNAL CONNECTIVITY
      const mainHub = rooms.find(r => r.zone?.type === 'living' || r.zone?.type === 'entry' || r.zone?.type === 'lobby') || rooms[0];
      
      const connected = new Set<string>();
      if (mainHub) connected.add(mainHub.id);

      // Attempt to connect every room to the main hub
      // Breadth-first search for adjacency
      const queue = [mainHub];
      const doorsAdded = new Set<string>();

      while (queue.length > 0) {
          const current = queue.shift()!;
          
          rooms.forEach(other => {
              if (connected.has(other.id)) return;
              
              const shared = this.getSharedEdge(current.polygon, other.polygon);
              if (shared && shared.length > 0.8) {
                  // Connect if 'current' allows pass-through OR if it's the main hub
                  const allowsPass = current.zone?.passThrough !== 'never' || current === mainHub;
                  
                  if (allowsPass) {
                      const mid = { x: (shared.p1.x + shared.p2.x) / 2, y: (shared.p1.y + shared.p2.y) / 2 };
                      const wall = elements.find(el => el.type === 'wall' && el.subType === 'interior' && this.isPointOnWall(mid, el));
                      
                      if (wall && wall.p1 && wall.p2) {
                          const doorWidth = 0.9;
                          const cleanSpot = this.findCleanOpeningPos(wall, elements, doorWidth);
                          
                          if (cleanSpot) {
                              const dx = wall.p2.x - wall.p1.x;
                              const dy = wall.p2.y - wall.p1.y;
                              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                              
                              elements.push({
                                  id: crypto.randomUUID(),
                                  type: 'door',
                                  pos: cleanSpot.pos,
                                  rotation: angle,
                                  width: doorWidth,
                                  hostWallId: wall.id,
                                  hostT: cleanSpot.t
                              });
                              
                              connected.add(other.id);
                              queue.push(other);
                          } else {
                              // If no clean spot for 0.9m door, maybe try a wall opening?
                              // Or just force-connect since internal connectivity is critical
                              const dx = wall.p2.x - wall.p1.x;
                              const dy = wall.p2.y - wall.p1.y;
                              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
                              elements.push({
                                  id: crypto.randomUUID(),
                                  type: 'wall-opening',
                                  pos: mid,
                                  rotation: angle,
                                  width: doorWidth,
                                  hostWallId: wall.id,
                                  hostT: this.getTOnSegment(mid, wall.p1, wall.p2)
                              });
                              connected.add(other.id);
                              queue.push(other);
                          }
                      }
                  }
              }
          });
      }

      // Final pass for any remaining stranded rooms - force a connection to nearest neighbor
      rooms.forEach(r => {
          if (!connected.has(r.id)) {
              let bestNeighbor: PartitionNode | null = null;
              let bestEdge: { p1: Point, p2: Point, length: number } | null = null;

              rooms.forEach(n => {
                  if (n === r) return;
                  const shared = this.getSharedEdge(r.polygon, n.polygon);
                  if (shared && (!bestEdge || shared.length > bestEdge.length)) {
                      bestNeighbor = n;
                      bestEdge = shared;
                  }
              });

              if (bestNeighbor && bestEdge) {
                  const mid = { x: (bestEdge.p1.x + bestEdge.p2.x) / 2, y: (bestEdge.p1.y + bestEdge.p2.y) / 2 };
                  const wall = elements.find(el => el.type === 'wall' && el.subType === 'interior' && this.isPointOnWall(mid, el));
                  if (wall && wall.p1 && wall.p2) {
                      const doorWidth = 0.8;
                      const cleanSpot = this.findCleanOpeningPos(wall, elements, doorWidth);
                      if (cleanSpot) {
                          elements.push({
                              id: crypto.randomUUID(),
                              type: 'door',
                              pos: cleanSpot.pos,
                              rotation: Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x) * (180/Math.PI),
                              width: doorWidth,
                              hostWallId: wall.id,
                              hostT: cleanSpot.t
                          });
                          connected.add(r.id);
                      } else {
                          // Fallback to simple midpoint if impossible elsewhere, internal connectivity is priority
                          elements.push({
                              id: crypto.randomUUID(),
                              type: 'wall-opening',
                              pos: mid,
                              rotation: Math.atan2(wall.p2.y - wall.p1.y, wall.p2.x - wall.p1.x) * (180/Math.PI),
                              width: doorWidth,
                              hostWallId: wall.id,
                              hostT: 0.5
                          });
                          connected.add(r.id);
                      }
                  }
              }
          }
      });
  }

  private static getSharedEdge(p1: Polygon, p2: Polygon): { p1: Point; p2: Point; length: number } | null {
      // Very simple shared edge detection for adjacent rooms in a BSP tree
      // Optimization: look for overlapping segments
      for (const pt1 of p1.points) {
          for (const pt2 of p1.points) {
              if (pt1 === pt2) continue;
              // Check if segment pt1-pt2 lies on an edge of p2
              const mid = { x: (pt1.x + pt2.x) / 2, y: (pt1.y + pt2.y) / 2 };
              if (this.distPointToPolygon(mid, p2) < 0.05) {
                  return { p1: pt1, p2: pt2, length: Math.hypot(pt2.x - pt1.x, pt2.y - pt1.y) };
              }
          }
      }
      return null;
  }

  private static distPointToPolygon(p: Point, poly: Polygon): number {
      let minDist = Infinity;
      const pts = poly.points;
      for (let i = 0; i < pts.length; i++) {
          minDist = Math.min(minDist, this.distPointToSegment(p, pts[i], pts[(i+1)%pts.length]));
      }
      return minDist;
  }

  private static isPointOnWall(p: Point, wall: ArchElement): boolean {
    if (!wall.p1 || !wall.p2) return false;
    return this.distPointToSegment(p, wall.p1, wall.p2) < 0.1;
  }

  private static getTOnSegment(p: Point, a: Point, b: Point): number {
    const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
    const vv = vx * vx + vy * vy;
    if (vv < 1e-9) return 0;
    return (wx * vx + wy * vy) / vv;
  }

  private static distPointToSegment(p: Point, a: Point, b: Point) {
    const vx = b.x - a.x, vy = b.y - a.y, wx = p.x - a.x, wy = p.y - a.y;
    const vv = vx * vx + vy * vy;
    if (vv < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
    let t = (wx * vx + wy * vy) / vv;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
  }

  private static findCleanOpeningPos(wall: ArchElement, allElements: ArchElement[], width: number): { pos: Point, t: number } | null {
      if (!wall.p1 || !wall.p2) return null;
      
      const wallLen = Math.hypot(wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y);
      const minClearance = 0.3; // 30cm minimum clearance from corners/junctions
      const bufferT = (width / 2 + minClearance) / wallLen; 

      if (wallLen < width + minClearance * 2) return null; 

      // Find all points where other walls meet this wall
      const junctions: number[] = []; 
      allElements.forEach(el => {
          if (el.type === 'wall' && el.id !== wall.id) {
              if (el.p1) {
                  if (this.distPointToSegment(el.p1, wall.p1!, wall.p2!) < 0.05) {
                      junctions.push(this.getTOnSegment(el.p1, wall.p1!, wall.p2!));
                  }
              }
              if (el.p2) {
                  if (this.distPointToSegment(el.p2, wall.p1!, wall.p2!) < 0.05) {
                      junctions.push(this.getTOnSegment(el.p2, wall.p1!, wall.p2!));
                  }
              }
          }
      });

      // Find existing openings on this wall to avoid overlaps
      const existingOpenings: {t: number, widthT: number}[] = [];
      allElements.forEach(el => {
          if ((el.type === 'door' || el.type === 'window' || el.type === 'wall-opening') && el.hostWallId === wall.id && el.hostT !== undefined) {
              const elWidth = el.width || 0.9;
              existingOpenings.push({
                  t: el.hostT,
                  widthT: elWidth / wallLen
              });
          }
      });

      // Try candidates for placement
      const candidates = [0.5, 0.4, 0.6, 0.3, 0.7, 0.35, 0.65, 0.25, 0.75, 0.2, 0.8];
      
      for (const t of candidates) {
          let conflict = false;
          // Check against wall ends
          if (t < bufferT || t > 1 - bufferT) conflict = true;
          
          // Check against junctions
          if (!conflict) {
              for (const jt of junctions) {
                  if (Math.abs(t - jt) < bufferT) {
                      conflict = true;
                      break;
                  }
              }
          }

          // Check against existing openings
          if (!conflict) {
              for (const op of existingOpenings) {
                  const combinedBuffer = (width / 2 + (op.widthT * wallLen) / 2 + minClearance) / wallLen;
                  if (Math.abs(t - op.t) < combinedBuffer) {
                      conflict = true;
                      break;
                  }
              }
          }
          
          if (!conflict) {
              return {
                  pos: {
                      x: wall.p1!.x + t * (wall.p2!.x - wall.p1!.x),
                      y: wall.p1!.y + t * (wall.p2!.y - wall.p1!.y)
                  },
                  t: t
              };
          }
      }

      return null;
  }

  /**
   * Linear organization (corridor-based)
   */
  private static partitionLinear(node: PartitionNode, zones: SpatialZone[], seededRandom: () => number, entryAnchor: Point, exteriorPoints: Point[]) {
      const bounds = this.getPolygonBounds(node.polygon);
      const useVertical = bounds.w > bounds.h;
      
      // Create a corridor through the center
      const corridorWidth = 1.8; // Standard commercial corridor
      const splitT = 0.5;

      const splitLine1 = useVertical
        ? { p1: { x: bounds.x + bounds.w * splitT - corridorWidth/2, y: bounds.y - 1000 }, p2: { x: bounds.x + bounds.w * splitT - corridorWidth/2, y: bounds.y + 1000 } }
        : { p1: { x: bounds.x - 1000, y: bounds.y + bounds.h * splitT - corridorWidth/2 }, p2: { x: bounds.x + 1000, y: bounds.y + bounds.h * splitT - corridorWidth/2 } };
      
      const split1 = this.splitPolygon(node.polygon, splitLine1.p1, splitLine1.p2);
      
      const splitLine2 = useVertical
        ? { p1: { x: bounds.x + bounds.w * splitT + corridorWidth/2, y: bounds.y - 1000 }, p2: { x: bounds.x + bounds.w * splitT + corridorWidth/2, y: bounds.y + 1000 } }
        : { p1: { x: bounds.x - 1000, y: bounds.y + bounds.h * splitT + corridorWidth/2 }, p2: { x: bounds.x + 1000, y: bounds.y + bounds.h * splitT + corridorWidth/2 } };
      
      const split2 = this.splitPolygon(split1.poly2, splitLine2.p1, splitLine2.p2);

      // Now we have poly1 (Left/Top side), split2.poly1 (Corridor), split2.poly2 (Right/Bottom side)
      const corridorZone: SpatialZone = { 
        id: 'circ.corridor', 
        type: 'corridor',
        label: 'Corridor', 
        zone: 'service',
        weight: 0, 
        minAreaM2: 0,
        color: '#f8fafc' 
      };

      // Divide zones between sides
      const halfCount = Math.ceil(zones.length / 2);
      const s1 = { id: crypto.randomUUID(), polygon: split1.poly1 };
      const s2 = { id: crypto.randomUUID(), polygon: split2.poly2 };
      
      this.partitionNode(s1, zones.slice(0, halfCount), seededRandom, entryAnchor, exteriorPoints);
      this.partitionNode(s2, zones.slice(halfCount), seededRandom, entryAnchor, exteriorPoints);
      
      node.children = [
          s1,
          { id: crypto.randomUUID(), polygon: split2.poly1, zone: corridorZone },
          s2
      ] as any;
  }

  private static collectLeafNodes(node: PartitionNode, leaves: PartitionNode[]) {
    if (node.children && (node.children as any).length > 0) {
      (node.children as any).forEach((child: PartitionNode) => this.collectLeafNodes(child, leaves));
    } else {
      leaves.push(node);
    }
  }

  /**
   * Complex organization with a central service core
   */
  private static partitionWithCore(node: PartitionNode, zones: SpatialZone[], seededRandom: () => number, entryAnchor: Point, exteriorPoints: Point[]) {
      const bounds = this.getPolygonBounds(node.polygon);
      
      const coreZone: SpatialZone = { 
        id: 'core.service', 
        type: 'core',
        label: 'Service Core', 
        zone: 'core',
        weight: 0, 
        minAreaM2: 0,
        color: '#e2e8f0' 
      };
      
      this.partitionNode(node, zones, seededRandom, entryAnchor, exteriorPoints);
      
      // Find the most central leaf node and turn it into a core
      const rooms: PartitionNode[] = [];
      this.collectLeafNodes(node, rooms);
      
      const center = { x: bounds.x + bounds.w/2, y: bounds.y + bounds.h/2 };
      let closest: PartitionNode | null = null;
      let minD = Infinity;
      
      rooms.forEach(r => {
          const c = this.getPolygonCentroid(r.polygon);
          const d = Math.hypot(c.x - center.x, c.y - center.y);
          if (d < minD) { minD = d; closest = r; }
      });
      
      if (closest) {
          (closest as PartitionNode).zone = coreZone;
      }
  }

  private static getRandomPastel(rand: () => number) {
      const h = rand() * 360;
      return `hsl(${h}, 70%, 90%)`;
  }
}
