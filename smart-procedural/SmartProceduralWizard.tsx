
import React, { useState, useMemo } from 'react';
import { ChevronRight, ChevronLeft, Sparkles, Home, Building2, ShoppingBag, Coffee, HeartPulse, GraduationCap, Factory, Layout, Maximize, Wind, EyeOff, Navigation, Sun } from 'lucide-react';
import { LayoutTypology, LayoutGeometry, ProceduralConfig, ArchElement } from '../types';
import { PROCEDURAL_TYPOLOGIES } from '../constants';

interface SmartProceduralWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (config: ProceduralConfig) => void;
  initialConfig?: ProceduralConfig;
}

const TYPOLOGIES_WITH_ICONS = [
  { id: 'residential', label: 'Residential', icon: <Home size={18} /> },
  { id: 'office', label: 'Office', icon: <Building2 size={18} /> },
  { id: 'retail', label: 'Retail', icon: <ShoppingBag size={18} /> },
  { id: 'food', label: 'Food & Beverage', icon: <Coffee size={18} /> },
  { id: 'healthcare', label: 'Healthcare', icon: <HeartPulse size={18} /> },
  { id: 'education', label: 'Education', icon: <GraduationCap size={18} /> },
  { id: 'industrial', label: 'Industrial / Warehouse', icon: <Factory size={18} /> },
];

type ResidentialCategoryId = 'apartments' | 'houses' | 'shared-special';

const RESIDENTIAL_CATEGORIES: Record<ResidentialCategoryId, {
  label: string;
  description: string;
  subtypes: { id: string; label: string; description: string }[];
}> = {
  apartments: {
    label: 'Apartments',
    description: 'Flats, compact units, penthouses and duplex apartments.',
    subtypes: [
      { id: 'studio', label: 'Studio', description: 'Living and sleeping combined.' },
      { id: '1br', label: '1 Bedroom', description: 'Living anchor + one private bedroom.' },
      { id: '2br', label: '2 Bedroom', description: 'Two-bedroom apartment with grouped private zone.' },
      { id: '3br', label: '3 Bedroom', description: 'Larger apartment with required bedroom cluster.' },
      { id: '4br', label: '4 Bedroom', description: 'Large apartment with stronger public/private separation.' },
      { id: 'duplex', label: 'Duplex', description: 'Two-level apartment logic.' },
      { id: 'penthouse', label: 'Penthouse', description: 'Luxury apartment with terrace emphasis.' },
      { id: 'serviced-apartment', label: 'Serviced Apartment', description: 'Compact hotel-like apartment support.' },
    ]
  },
  houses: {
    label: 'Houses / Villas',
    description: 'Ground-connected residences with outdoor space.',
    subtypes: [
      { id: 'house', label: 'House', description: 'Standard single-family house.' },
      { id: 'villa', label: 'Villa', description: 'Larger residence with indoor/outdoor relationship.' },
      { id: 'row-house', label: 'Row House', description: 'Narrow plot house with linear zoning.' },
      { id: 'farmhouse', label: 'Farmhouse', description: 'Outdoor-dominant residence.' },
      { id: 'mansion', label: 'Mansion', description: 'Luxury residence with multiple anchors.' },
    ]
  },
  'shared-special': {
    label: 'Shared / Special Residential',
    description: 'Shared living and accessibility-focused categories.',
    subtypes: [
      { id: 'coliving', label: 'Co-living', description: 'Shared living/kitchen with bedroom cluster.' },
      { id: 'student-housing', label: 'Student Housing', description: 'Repeated bedroom modules with shared support.' },
      { id: 'senior-living', label: 'Senior Living', description: 'Short movement, accessible bathroom proximity.' },
    ]
  }
};

const getResidentialCategoryForSubtype = (subtype: string): ResidentialCategoryId => {
  for (const [categoryId, category] of Object.entries(RESIDENTIAL_CATEGORIES)) {
    if (category.subtypes.some(s => s.id === subtype)) {
      return categoryId as ResidentialCategoryId;
    }
  }

  return 'apartments';
};

const defaultBedroomsForSubtype = (subtype: string) => {
  switch (subtype) {
    case 'studio': return 0;
    case '1br': return 1;
    case '2br': return 2;
    case '3br': return 3;
    case '4br': return 4;
    case 'duplex': return 3;
    case 'penthouse': return 3;
    case 'serviced-apartment': return 1;

    case 'house': return 3;
    case 'villa': return 4;
    case 'row-house': return 3;
    case 'farmhouse': return 3;
    case 'mansion': return 5;

    case 'coliving': return 6;
    case 'student-housing': return 8;
    case 'senior-living': return 1;

    default: return 2;
  }
};

const defaultBathsForSubtype = (subtype: string, bedrooms?: number) => {
  const beds = subtype === 'studio' ? 0 : bedrooms || defaultBedroomsForSubtype(subtype);

  if (subtype === 'studio') return 1;
  if (subtype === 'senior-living') return 1;
  if (subtype === 'student-housing') return Math.max(2, Math.ceil(beds / 4));
  if (subtype === 'coliving') return Math.max(2, Math.ceil(beds / 3));
  if (beds <= 1) return 1;
  if (beds <= 3) return 2;
  if (beds <= 5) return 3;
  return Math.ceil(beds / 2);
};

const isApartmentSubtype = (subtype: string) =>
  getResidentialCategoryForSubtype(subtype) === 'apartments';

const isHouseSubtype = (subtype: string) =>
  getResidentialCategoryForSubtype(subtype) === 'houses';


type PlanningStyleId =
  | 'open-social-core'
  | 'private-wing'
  | 'central-hub'
  | 'spine-plan'
  | 'courtyard-indoor-outdoor'
  | 'dual-anchor'
  | 'side-wet-core'
  | 'entry-wet-pod'
  | 'linear-galley'
  | 'balcony-front'
  | 'sleeping-alcove'
  | 'corner-facade'
  | 'hotel-style';

type LayoutGeometryStandardId =
  | 'rectilinear'
  | 'angular-oblique'
  | 'curved'
  | 'hybrid'
  | 'courtyard-ring'
  | 'organic-freeform';

const PLANNING_STYLE_OPTIONS: { id: PlanningStyleId; label: string; description: string; bestFor: string }[] = [
  { id: 'open-social-core', label: 'Open Social Core', description: 'Living, dining and kitchen are visually connected as a social anchor.', bestFor: 'Studios, 1BR, penthouses, modern houses' },
  { id: 'private-wing', label: 'Private Wing', description: 'Quiet bedroom wing separated from social/living wings for privacy.', bestFor: 'Multi-bedroom apartments, villas, family homes' },
  { id: 'central-hub', label: 'Central Hub', description: 'Central foyer/hub coordinates and connects all individual cellular zones.', bestFor: 'Traditional apartments, student housing, co-living' },
  { id: 'spine-plan', label: 'Spine Plan', description: 'Rooms organized linearly along a central circulation/service spine.', bestFor: 'Row houses, linear plans, commercial buildings' },
  { id: 'courtyard-indoor-outdoor', label: 'Courtyard / Indoor-Outdoor', description: 'Arranged around an internal open-air court or lightwell node.', bestFor: 'Villas, farmhouses, holiday homes' },
  { id: 'dual-anchor', label: 'Dual Anchor', description: 'Separated active and quiet anchors balance family vs formal hosting.', bestFor: 'Large houses, mansions, duplexes' },
];

const LAYOUT_GEOMETRY_OPTIONS: { id: LayoutGeometryStandardId; label: string; description: string; bestFor: string }[] = [
  { id: 'rectilinear', label: 'Rectilinear', description: 'Pure 90-degree layouts with aligned orthogonal walls.', bestFor: 'Modern apartments, offices, budget-friendly builds' },
  { id: 'angular-oblique', label: 'Angular / Oblique', description: 'Dynamic non-90-degree faceted walls and angled room lines.', bestFor: 'Expressive homes, corner/complex sites' },
  { id: 'curved', label: 'Curved', description: 'Sweeping arcs, curved walls and soft flowing transitions.', bestFor: 'High-end apartments, boutique offices' },
  { id: 'hybrid', label: 'Hybrid (Straight + Curved)', description: 'Practical rectilinear spaces with curved accents/circulation.', bestFor: 'Penthouses, custom residential homes' },
  { id: 'courtyard-ring', label: 'Courtyard Ring', description: 'Rooms enclosing a central open ring/atrium space.', bestFor: 'Atrium homes, luxury properties' },
  { id: 'organic-freeform', label: 'Organic / Freeform', description: 'Fluid, site-responsive lines that flow naturally.', bestFor: 'Eco-resorts, landscape-driven luxury villas' },
];

const STUDIO_PLANNING_STYLES = [
  { id: 'side-wet-core', label: 'Side Wet-Core Studio', description: 'Bathroom, kitchenette and optional store form one compact side service band. Main room occupies the remaining daylight-facing width.' },
  { id: 'entry-wet-pod', label: 'Entry Wet-Pod Studio', description: 'Entry, bathroom and storage form a compact arrival pod at the entrance. Kitchen continues from the pod along one wall. Main room opens beyond it.' },
  { id: 'linear-galley', label: 'Linear Galley Studio', description: 'Kitchen runs along one long wall; bathroom forms a compact block at entry/rear; open studio field runs in one direction toward windows/balcony.' },
  { id: 'balcony-front', label: 'Balcony-Front Studio', description: 'Living/sleeping room faces balcony. Kitchen and bath stay on rear or side service edge.' },
  { id: 'sleeping-alcove', label: 'Sleeping-Alcove Studio', description: 'Main room remains open, but one side receives a shallow bed alcove or partial privacy screen.' },
  { id: 'corner-facade', label: 'Corner-Facade Studio', description: 'Main studio room occupies both facades. Wet core is pushed to the internal corner.' },
  { id: 'hotel-style', label: 'Hotel-Style Studio', description: 'Bathroom sits directly beside entry; kitchenette is opposite or immediately after entry; one clean rectangular room occupies facade end.' }
];

const defaultPlanningStyleForSubtype = (subtype: string): PlanningStyleId => {
  if (subtype === 'studio') return 'side-wet-core';
  if (subtype === '1br') return 'open-social-core';
  if (subtype === '2br' || subtype === '3br' || subtype === '4br') return 'private-wing';
  if (subtype === 'penthouse') return 'open-social-core';
  if (subtype === 'row-house') return 'spine-plan';
  if (subtype === 'villa' || subtype === 'farmhouse') return 'courtyard-indoor-outdoor';
  if (subtype === 'mansion') return 'dual-anchor';
  if (subtype === 'coliving' || subtype === 'student-housing') return 'central-hub';
  if (subtype === 'senior-living') return 'central-hub';
  return 'open-social-core';
};

const defaultGeometryForSubtype = (subtype: string): LayoutGeometryStandardId => {
  if (subtype === 'studio' || subtype === '1br' || subtype === '2br') return 'rectilinear';
  if (subtype === '3br' || subtype === '4br') return 'hybrid';
  if (subtype === 'penthouse') return 'hybrid';
  if (subtype === 'duplex') return 'angular-oblique';
  if (subtype === 'row-house') return 'rectilinear';
  if (subtype === 'villa') return 'courtyard-ring';
  if (subtype === 'farmhouse') return 'organic-freeform';
  if (subtype === 'mansion') return 'organic-freeform';
  if (subtype === 'coliving' || subtype === 'student-housing') return 'rectilinear';
  return 'rectilinear';
};

const geometryIdToEngineGeometry = (geometryId: LayoutGeometryStandardId): LayoutGeometry => {
  return geometryId;
};

const planningStyleIdToEngineStyle = (styleId: PlanningStyleId): LayoutTypology => {
  return styleId;
};

const SmartProceduralWizard: React.FC<SmartProceduralWizardProps> = ({ isOpen, onClose, onApply, initialConfig }) => {
  const [step, setStep] = useState(1);
  const [typology, setTypology] = useState(initialConfig?.typology || 'residential');
  const [subtype, setSubtype] = useState(initialConfig?.subtype || '2br');
  const [residentialCategory, setResidentialCategory] = useState<ResidentialCategoryId>(
    getResidentialCategoryForSubtype(initialConfig?.subtype || '2br')
  );
  const [planningStyle, setPlanningStyle] = useState<PlanningStyleId>(
    ((initialConfig?.requirements as any)?.planningStyle as PlanningStyleId) || defaultPlanningStyleForSubtype(initialConfig?.subtype || '2br')
  );
  const [layoutGeometry, setLayoutGeometry] = useState<LayoutGeometryStandardId>(
    ((initialConfig?.requirements as any)?.layoutGeometry as LayoutGeometryStandardId) || defaultGeometryForSubtype(initialConfig?.subtype || '2br')
  );
  const [style, setStyle] = useState<LayoutTypology>(planningStyleIdToEngineStyle(planningStyle));
  const [geometry, setGeometry] = useState<LayoutGeometry>(geometryIdToEngineGeometry(layoutGeometry));
  const [requirements, setRequirements] = useState(initialConfig?.requirements || {});
  const [globals, setGlobals] = useState(initialConfig?.globals || {
    privacyPriority: 'medium',
    circulationPreference: 'compact',
    includeCourtyard: false
  });

  const selectedTypology = useMemo(() => PROCEDURAL_TYPOLOGIES.find(t => t.id === typology), [typology]);
  const selectedTypologyIcon = useMemo(() => TYPOLOGIES_WITH_ICONS.find(t => t.id === typology)?.icon, [typology]);

  if (!isOpen) return null;

  const handleNext = () => setStep(s => s + 1);
  const handleBack = () => setStep(s => s - 1);

  const handleFinalize = () => {
    const residentialRequirements =
      typology === 'residential'
        ? {
            ...requirements,
            ...globals,
            subtype,
            residentialCategory,
            planningStyle,
            layoutGeometry,
            layoutSeed: Math.random(),
            numBedrooms: subtype === 'studio'
              ? 0
              : (requirements.numBedrooms || defaultBedroomsForSubtype(subtype)),
            numBaths: requirements.numBaths || defaultBathsForSubtype(subtype, requirements.numBedrooms),
            numBalconies: isApartmentSubtype(subtype) ? (requirements.numBalconies || 0) : 0,
            includeCourtyard: isHouseSubtype(subtype) ? globals.includeCourtyard : false
          }
        : requirements;

    onApply({
      typology,
      subtype,
      style: planningStyleIdToEngineStyle(planningStyle),
      geometry: geometryIdToEngineGeometry(layoutGeometry),
      requirements: residentialRequirements,
      globals
    });

    onClose();
  };

  const updateRequirement = (key: string, val: any) => {
    setRequirements(prev => ({ ...prev, [key]: val }));
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col h-[70vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center shrink-0">
          <div className="flex items-center gap-2 text-blue-600">
            <Sparkles size={20} />
            <h2 className="font-bold text-lg text-slate-900">Smart Procedural Architect</h2>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-100 transition-colors">
            <ChevronLeft size={20} />
          </button>
        </div>

        {/* Stepper */}
        {subtype !== 'studio' && (
          <div className="px-8 pt-4 flex gap-2">
              {[1, 2, 3].map(s => (
                  <div key={s} className={`h-1.5 flex-1 rounded-full transition-all ${s <= step ? 'bg-blue-600' : 'bg-slate-100'}`} />
              ))}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
              <h3 className="text-xl font-bold text-slate-800">Select Building Typology</h3>
              <div className="grid grid-cols-2 gap-3">
                {PROCEDURAL_TYPOLOGIES.map(t => {
                  const Icon = TYPOLOGIES_WITH_ICONS.find(ti => ti.id === t.id)?.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => { setTypology(t.id); setSubtype(t.subtypes[0]); }}
                      className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${typology === t.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-100 hover:border-slate-200 text-slate-600'}`}
                    >
                      <div className={`p-2 rounded-lg ${typology === t.id ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{Icon}</div>
                      <span className="font-bold text-sm tracking-tight">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              
              {typology === 'residential' ? (
                <div className="pt-4 space-y-5">
                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-widest">
                      Residential Category
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {(Object.keys(RESIDENTIAL_CATEGORIES) as ResidentialCategoryId[]).map(categoryId => {
                        const category = RESIDENTIAL_CATEGORIES[categoryId];

                        return (
                          <button
                            key={categoryId}
                            onClick={() => {
                              const firstSubtype = category.subtypes[0].id;
                              setResidentialCategory(categoryId);
                              setSubtype(firstSubtype);
                              if (firstSubtype === 'studio') {
                                setStep(1);
                              }
                              const nextPlanningStyle = defaultPlanningStyleForSubtype(firstSubtype);
                              const nextGeometry = defaultGeometryForSubtype(firstSubtype);
                              setPlanningStyle(nextPlanningStyle);
                              setLayoutGeometry(nextGeometry);
                              setStyle(planningStyleIdToEngineStyle(nextPlanningStyle));
                              setGeometry(geometryIdToEngineGeometry(nextGeometry));
                              setRequirements(prev => ({
                                ...prev,
                                subtype: firstSubtype,
                                residentialCategory: categoryId,
                                numBedrooms: defaultBedroomsForSubtype(firstSubtype),
                                numBaths: defaultBathsForSubtype(firstSubtype),
                                numBalconies: isApartmentSubtype(firstSubtype) ? (prev.numBalconies || 0) : 0
                              }));
                            }}
                            className={`p-4 rounded-2xl border-2 text-left transition-all ${
                              residentialCategory === categoryId
                                ? 'border-blue-600 bg-blue-50'
                                : 'border-slate-100 hover:border-slate-200'
                            }`}
                          >
                            <div className={`font-bold text-sm ${
                              residentialCategory === categoryId ? 'text-blue-900' : 'text-slate-800'
                            }`}>
                              {category.label}
                            </div>
                            <div className="text-xs text-slate-500 mt-1 leading-snug">
                              {category.description}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-widest">
                      Select Residential Type
                    </label>

                    <div className="flex flex-wrap gap-2">
                      {RESIDENTIAL_CATEGORIES[residentialCategory].subtypes.map(s => (
                        <button
                          key={s.id}
                          onClick={() => {
                            setSubtype(s.id);
                            if (s.id === 'studio') {
                              setStep(1);
                            }
                            const nextPlanningStyle = defaultPlanningStyleForSubtype(s.id);
                            const nextGeometry = defaultGeometryForSubtype(s.id);
                            setPlanningStyle(nextPlanningStyle);
                            setLayoutGeometry(nextGeometry);
                            setStyle(planningStyleIdToEngineStyle(nextPlanningStyle));
                            setGeometry(geometryIdToEngineGeometry(nextGeometry));

                            setRequirements(prev => ({
                              ...prev,
                              subtype: s.id,
                              residentialCategory,
                              numBedrooms: defaultBedroomsForSubtype(s.id),
                              numBaths: defaultBathsForSubtype(s.id),
                              numBalconies: isApartmentSubtype(s.id) ? (prev.numBalconies || 0) : 0,
                              includeCourtyard: isHouseSubtype(s.id) ? prev.includeCourtyard : false
                            }));
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                            subtype === s.id
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                          title={s.description}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {subtype === 'studio' && (
                    <div className="border-t border-slate-100 pt-4 space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-widest text-slate-500">
                          Studio Planning Style
                        </label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {STUDIO_PLANNING_STYLES.map(styleOpt => (
                            <button
                              key={styleOpt.id}
                              onClick={() => {
                                setPlanningStyle(styleOpt.id as any);
                                updateRequirement('planningStyle', styleOpt.id);
                              }}
                              className={`p-3 rounded-xl border-2 text-left transition-all ${
                                planningStyle === styleOpt.id
                                  ? 'border-blue-600 bg-blue-50'
                                  : 'border-slate-100 hover:border-slate-200'
                              }`}
                            >
                              <div className={`font-bold text-xs ${
                                planningStyle === styleOpt.id ? 'text-blue-900' : 'text-slate-800'
                              }`}>
                                {styleOpt.label}
                              </div>
                              <div className="text-[10px] text-slate-500 mt-1 leading-snug">
                                {styleOpt.description}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-widest text-slate-500">
                          Studio Requirements
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          {/* Bathrooms counter (Fixed to 1 and greyed out) */}
                          <div className="flex items-center justify-between p-3 bg-slate-50 rounded-xl opacity-60">
                            <div className="font-bold text-xs text-slate-400 tracking-tight">Bathrooms</div>
                            <div className="flex items-center gap-3">
                              <button disabled className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-300 border border-slate-100">-</button>
                              <span className="font-mono font-bold text-slate-400 w-5 text-center">1</span>
                              <button disabled className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-300 border border-slate-100">+</button>
                            </div>
                          </div>

                          {/* Balconies counter */}
                          <ReqCounter
                            label="Balconies"
                            value={requirements.numBalconies || 0}
                            onChange={(v: number) => updateRequirement('numBalconies', v)}
                            min={0}
                            max={4}
                            compact
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="pt-4">
                  <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-widest">
                    Select Subtype
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedTypology?.subtypes.map(s => (
                      <button
                        key={s}
                        onClick={() => setSubtype(s)}
                        className={`px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                          subtype === s
                            ? 'bg-blue-600 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Planning Style</h3>
                <p className="text-sm text-slate-500 mb-4">
                  This controls the relationship between spaces: open, closed, split, spine, courtyard, cluster, etc.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PLANNING_STYLE_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setPlanningStyle(option.id);
                        setStyle(planningStyleIdToEngineStyle(option.id));
                        updateRequirement('planningStyle', option.id);
                      }}
                      className={`flex flex-col gap-2 p-4 rounded-2xl border-2 text-left transition-all ${planningStyle === option.id ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Layout className={planningStyle === option.id ? 'text-blue-600' : 'text-slate-400'} size={20} />
                        <div className={`font-bold text-sm ${planningStyle === option.id ? 'text-blue-900' : 'text-slate-800'}`}>{option.label}</div>
                      </div>
                      <div className="text-xs text-slate-500 leading-snug">{option.description}</div>
                      <div className="text-[10px] text-slate-400 leading-tight font-medium">Best for: {option.bestFor}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">Layout Geometry Standard</h3>
                <p className="text-sm text-slate-500 mb-4">
                  This controls the geometric language of the plan: right-angle, angular, curved, radial, ring, clustered, organic, etc.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {LAYOUT_GEOMETRY_OPTIONS.map(option => (
                    <button
                      key={option.id}
                      onClick={() => {
                        setLayoutGeometry(option.id);
                        setGeometry(geometryIdToEngineGeometry(option.id));
                        updateRequirement('layoutGeometry', option.id);
                      }}
                      className={`flex flex-col gap-2 p-4 rounded-2xl border-2 text-left transition-all ${layoutGeometry === option.id ? 'border-blue-600 bg-blue-50' : 'border-slate-100 hover:border-slate-200'}`}
                    >
                      <div className="flex items-center gap-2">
                        <Maximize className={layoutGeometry === option.id ? 'text-blue-600' : 'text-slate-400'} size={20} />
                        <div className={`font-bold text-sm ${layoutGeometry === option.id ? 'text-blue-900' : 'text-slate-800'}`}>{option.label}</div>
                      </div>
                      <div className="text-xs text-slate-500 leading-snug">{option.description}</div>
                      <div className="text-[10px] text-slate-400 leading-tight font-medium">Best for: {option.bestFor}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
               <div>
                  <h3 className="text-xl font-bold text-slate-800 mb-4">Specific Requirements</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                     {typology === 'residential' && (
                        <>
                          {subtype !== 'studio' && (
                            <ReqCounter
                              label="Bedrooms"
                              value={requirements.numBedrooms ?? defaultBedroomsForSubtype(subtype)}
                              onChange={(v: number) => updateRequirement('numBedrooms', v)}
                              min={1}
                              max={10}
                            />
                          )}

                          <ReqCounter
                            label="Bathrooms"
                            value={requirements.numBaths ?? defaultBathsForSubtype(subtype, requirements.numBedrooms)}
                            onChange={(v: number) => updateRequirement('numBaths', v)}
                            min={1}
                            max={8}
                          />

                          {(subtype === 'studio' || subtype === '1br' || subtype === '2br' || subtype === '3br' || subtype === '4br' || subtype === 'apartment' || subtype === 'penthouse' || subtype === 'duplex') && (
                            <ReqCounter
                              label="Balconies"
                              value={requirements.numBalconies || 0}
                              onChange={(v: number) => updateRequirement('numBalconies', v)}
                              min={0}
                              max={4}
                            />
                          )}
                        </>
                     )}
                     {typology === 'office' && (
                        <>
                          <ReqCounter label="Staff Count" value={requirements.numStaff || 10} onChange={(v: number) => updateRequirement('numStaff', v)} step={5} />
                          <ReqCounter label="Meeting Rooms" value={requirements.numMeetingRooms || 1} onChange={(v: number) => updateRequirement('numMeetingRooms', v)} />
                          <ReqCounter label="Exec Cabins" value={requirements.numExecutiveCabins || 0} onChange={(v: number) => updateRequirement('numExecutiveCabins', v)} />
                        </>
                     )}
                     {(typology === 'retail' || typology === 'food') && (
                        <>
                          <ReqCounter label="Seating Cap." value={requirements.seatingCapacity || 20} onChange={(v: number) => updateRequirement('seatingCapacity', v)} step={10} />
                          <ReqToggle label="Service Counter" enabled={requirements.hasCounter} onToggle={(v: boolean) => updateRequirement('hasCounter', v)} />
                          <ReqToggle label="Commercial Kitchen" enabled={requirements.hasKitchen} onToggle={(v: boolean) => updateRequirement('hasKitchen', v)} />
                        </>
                     )}
                     {typology === 'healthcare' && (
                        <ReqCounter label="Clinical Rooms" value={requirements.numClinicalRooms || 2} onChange={(v: number) => updateRequirement('numClinicalRooms', v)} />
                     )}
                     {typology === 'education' && (
                        <ReqCounter label="Classrooms" value={requirements.numClassrooms || 3} onChange={(v: number) => updateRequirement('numClassrooms', v)} />
                     )}
                  </div>
               </div>

               <div className="border-t border-slate-100 pt-6">
                  <h3 className="text-xl font-bold text-slate-800 mb-4">Global Preferences</h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <GlobalSelector 
                       label="Privacy Level" 
                       icon={<EyeOff size={18} />} 
                       value={globals.privacyPriority} 
                       options={['low', 'medium', 'high']} 
                       onChange={(v: any) => setGlobals(prev => ({ ...prev, privacyPriority: v }))} 
                     />

                     <GlobalSelector 
                       label="Circulation" 
                       icon={<Navigation size={18} />} 
                       value={globals.circulationPreference} 
                       options={['compact', 'spacious']} 
                       onChange={(v: any) => setGlobals(prev => ({ ...prev, circulationPreference: v }))} 
                     />
                  </div>

                  {typology === 'residential' && isHouseSubtype(subtype) && (
                     <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl mt-4">
                       <div className="flex items-center gap-3">
                           <Maximize className="text-blue-600" size={20} />
                           <div className="font-bold text-sm text-slate-800 text-left">Include Courtyard <span className="text-[10px] text-slate-400 font-normal block tracking-tight">Internal Open-Air Space</span></div>
                       </div>
                       <ReqToggle label="" enabled={globals.includeCourtyard} onToggle={(v: any) => setGlobals(prev => ({ ...prev, includeCourtyard: v }))} />
                     </div>
                  )}
               </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-slate-100 flex gap-3 animate-in slide-in-from-bottom-4">
          {step > 1 && (
            <button onClick={handleBack} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold rounded-xl transition-colors flex items-center justify-center gap-2">
              <ChevronLeft size={18} /> Back
            </button>
          )}
          {subtype === 'studio' ? (
            <button onClick={handleFinalize} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2">
              {initialConfig ? 'Regenerate Layout' : 'Draw Boundary'} <ChevronRight size={18} />
            </button>
          ) : step < 3 ? (
            <button onClick={handleNext} className="flex-[2] py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-2">
              Continue <ChevronRight size={18} />
            </button>
          ) : (
            <button onClick={handleFinalize} className="flex-[2] py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2">
              {initialConfig ? 'Regenerate Layout' : 'Draw Boundary'} <ChevronRight size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const ReqCounter = ({ label, value, onChange, min = 0, max = 50, step = 1, compact = false }: any) => (
  <div className={`flex items-center justify-between ${compact ? 'p-3 bg-slate-50 rounded-xl' : 'p-4 bg-slate-50 rounded-2xl'}`}>
    <div className="font-bold text-xs text-slate-600 tracking-tight">{label}</div>
    <div className="flex items-center gap-3">
      <button onClick={() => onChange(Math.max(min, value - step))} className={`${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:bg-red-50 hover:text-red-600 transition-colors border border-slate-100`}>-</button>
      <span className="font-mono font-bold text-slate-800 w-6 text-center">{value}</span>
      <button onClick={() => onChange(Math.min(max, value + step))} className={`${compact ? 'w-7 h-7' : 'w-8 h-8'} rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:bg-green-50 hover:text-green-600 transition-colors border border-slate-100`}>+</button>
    </div>
  </div>
);

const ReqToggle = ({ label, enabled, onToggle }: any) => (
  <div className={`flex items-center justify-between ${label ? 'p-4 bg-slate-50' : ''} rounded-2xl`}>
    {label && <div className="font-bold text-xs text-slate-600 tracking-tight">{label}</div>}
    <button
      onClick={() => onToggle(!enabled)}
      className={`w-12 h-6 rounded-full transition-all relative ${enabled ? 'bg-blue-600' : 'bg-slate-300'}`}
    >
      <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${enabled ? 'left-7' : 'left-1'}`} />
    </button>
  </div>
);

const GlobalSelector = ({ label, icon, value, options, onChange }: any) => (
  <div className="p-4 bg-white border border-slate-100 rounded-2xl shadow-sm">
    <div className="flex items-center gap-3 mb-4">
        <div className="text-blue-600">{icon}</div>
        <div className="font-bold text-sm text-slate-800">{label}</div>
    </div>
    <div className="flex gap-2">
        {options.map((o: string) => (
            <button
                key={o}
                onClick={() => onChange(o)}
                className={`flex-1 py-2 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all ${value === o ? 'bg-blue-600 text-white shadow-md shadow-blue-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
            >
                {o}
            </button>
        ))}
    </div>
  </div>
);

const Rocket = ({ size, className }: any) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-5c1.62-2.2 5-3 5-3" />
        <path d="M12 15v5s3.03-.55 5-2c2.2-1.62 3-5 3-5" />
    </svg>
);

export default SmartProceduralWizard;
