import React from 'react';
import { Project, ArchElement } from '../types';
import { BarChart3, PieChart, Info, Building2, TreeDeciduous, Car, Map as MapIcon, Maximize2, Sparkles } from 'lucide-react';

interface UrbanDashboardProps {
  project: Project;
  onGenerateParcels?: () => void;
  onOpenUrbanWizard?: () => void;
}

export const UrbanDashboard: React.FC<UrbanDashboardProps> = ({ project, onGenerateParcels, onOpenUrbanWizard }) => {
  const elements = project.elements || [];
  
  // Calculations
  const siteArea = project.urbanSettings?.totalSiteArea || 100000;
  
  let totalGFA = 0;
  let totalFootprint = 0;
  let landscapeArea = 0;
  let roadArea = 0;
  
  const programMix: Record<string, number> = {
    residential: 0,
    office: 0,
    retail: 0,
    institutional: 0,
    park: 0
  };

  const typologyMix: Record<string, number> = {
    'perimeter-block': 0,
    'tower': 0,
    'slab': 0
  };

  elements.forEach(el => {
    if (el.type === 'building-mass') {
      const gfa = el.gfaM2 || 0;
      const foot = el.footprintAreaM2 || 0;
      totalGFA += gfa;
      totalFootprint += foot;
      if (el.usageType && programMix[el.usageType] !== undefined) {
        programMix[el.usageType] += gfa;
      }
      if (el.subType && typologyMix[el.subType] !== undefined) {
        typologyMix[el.subType]++;
      }
    } else if (el.type === 'landscape') {
      landscapeArea += (el.footprintAreaM2 || 0);
      programMix['park'] += (el.footprintAreaM2 || 0);
    } else if (el.type === 'road') {
      // Approximate road area if line based
      if (el.p1 && el.p2) {
        const dist = Math.hypot(el.p2.x - el.p1.x, el.p2.y - el.p1.y);
        roadArea += dist * (el.thickness || 12);
      }
    }
  });

  const far = totalGFA / siteArea;
  const coverage = (totalFootprint / siteArea) * 100;
  const greenSpace = (landscapeArea / siteArea) * 100;

  return (
    <div className="flex flex-col h-full bg-slate-50 border-l border-slate-200 w-80 overflow-y-auto">
      <div className="p-6 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-2 text-blue-600 mb-1">
          <BarChart3 size={18} />
          <h2 className="font-bold text-sm uppercase tracking-wider">Planning Metrics</h2>
        </div>
        <p className="text-xs text-slate-500 font-medium tracking-tight">REAL-TIME URBAN ANALYSIS</p>
      </div>

      <div className="p-6 space-y-8">
        {/* Quick Actions */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Site Tools</h3>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={onGenerateParcels}
              className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors shadow-sm gap-2 text-center"
            >
              <Maximize2 size={18} className="text-blue-600" />
              <span className="text-[10px] font-bold text-slate-700 leading-tight">Generate Parcels</span>
            </button>
            <button 
              onClick={onOpenUrbanWizard}
              className="flex flex-col items-center justify-center p-4 bg-white border border-slate-200 rounded-2xl hover:bg-slate-50 transition-colors shadow-sm gap-2 text-center"
            >
              <Sparkles size={18} className="text-purple-600" />
              <span className="text-[10px] font-bold text-slate-700 leading-tight">Urban Wizard</span>
            </button>
          </div>
        </div>

        {/* Key Ratios */}
        <div className="grid grid-cols-2 gap-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">FAR</p>
            <p className="text-2xl font-black text-slate-900">{far.toFixed(2)}</p>
            <div className="w-full h-1 bg-slate-100 mt-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full" 
                style={{ width: `${Math.min(100, (far / (project.urbanSettings?.targetFAR || 5)) * 100)}%` }}
              />
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
            <p className="text-[10px] font-bold text-slate-400 uppercase mb-1">GFA (m²)</p>
            <p className="text-xl font-black text-slate-900">{(totalGFA / 1000).toFixed(1)}k</p>
            <p className="text-[9px] text-slate-400 mt-1 font-medium italic">Target: {( (project.urbanSettings?.targetGFA || 0) / 1000).toFixed(0)}k</p>
          </div>
        </div>

        {/* Coverage Ratios */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Site Ratios</h3>
          
          <div className="space-y-3 bg-white p-5 rounded-3xl border border-slate-100 shadow-sm">
             <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Building2 size={12} className="text-slate-400" /> Building Coverage
                  </span>
                  <span className="text-slate-900">{coverage.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-800 rounded-full" style={{ width: `${coverage}%` }} />
                </div>
             </div>

             <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <TreeDeciduous size={12} className="text-green-500" /> Green Space
                  </span>
                  <span className="text-green-600">{greenSpace.toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-green-500 rounded-full" style={{ width: `${greenSpace}%` }} />
                </div>
             </div>

             <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-600 flex items-center gap-1.5">
                    <Car size={12} className="text-slate-400" /> Road / Infra
                  </span>
                  <span className="text-slate-600">{( (roadArea / siteArea) * 100 ).toFixed(1)}%</span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-400 rounded-full" style={{ width: `${( (roadArea / siteArea) * 100 )}%` }} />
                </div>
             </div>
          </div>
        </div>

        {/* Program Mix */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Program Distribution (GFA)</h3>
          <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-4">
            {Object.entries(programMix).filter(([_, val]) => val > 0).map(([key, val]) => (
               <div key={key} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full shrink-0 ${
                    key === 'residential' ? 'bg-slate-800' :
                    key === 'office' ? 'bg-blue-500' :
                    key === 'retail' ? 'bg-pink-500' :
                    key === 'park' ? 'bg-green-500' : 'bg-slate-400'
                  }`} />
                  <div className="flex-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="capitalize text-slate-600">{key}</span>
                      <span className="text-slate-900">{((val / (totalGFA || 1)) * 100).toFixed(0)}%</span>
                    </div>
                  </div>
               </div>
            ))}
          </div>
        </div>

        {/* Typology Counts */}
        <div className="space-y-4">
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Typology Mix</h3>
          <div className="grid grid-cols-1 gap-2">
            {Object.entries(typologyMix).map(([key, count]) => (
              <div key={key} className="bg-white px-4 py-3 rounded-2xl border border-slate-100 flex justify-between items-center shadow-sm">
                <span className="text-xs font-bold text-slate-600 capitalize">{key.replace('-', ' ')}</span>
                <span className="bg-slate-100 px-2 py-0.5 rounded-lg text-[10px] font-black text-slate-900">{count} Units</span>
              </div>
            ))}
          </div>
        </div>

        {/* Building Count */}
        <div className="bg-slate-900 rounded-3xl p-6 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-4 opacity-10">
            <Building2 size={80} />
          </div>
          <div className="relative z-10">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Asset Summary</p>
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-black">{elements.filter(e => e.type === 'building-mass').length}</span>
              <span className="text-sm font-bold text-slate-400">Total Blocks</span>
            </div>
            <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-2 gap-4">
               <div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Avg. Height</p>
                  <p className="text-lg font-bold">
                    { (elements.reduce((acc, e) => acc + (e.floors || 0), 0) / (elements.filter(e => e.type === 'building-mass').length || 1)).toFixed(1) } Floors
                  </p>
               </div>
               <div>
                  <p className="text-[9px] text-slate-500 font-bold uppercase">Complexity</p>
                  <p className="text-lg font-bold text-blue-400">Stable</p>
               </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
