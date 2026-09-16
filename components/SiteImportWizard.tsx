import React, { useState, useEffect, useRef } from 'react';
import { APIProvider, Map, useMapsLibrary, ControlPosition, MapControl } from '@vis.gl/react-google-maps';
import { Search, MapPin, Download, Loader2, X, ChevronRight, Globe, Layers, Wind } from 'lucide-react';
import { SiteLocation, TerrainSettings, Point, Project } from '../types';

const API_KEY = process.env.GOOGLE_MAPS_PLATFORM_KEY || '';

interface SiteImportWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (location: SiteLocation, terrain: TerrainSettings) => void;
}

export const SiteImportWizard: React.FC<SiteImportWizardProps> = ({ isOpen, onClose, onImport }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlace, setSelectedPlace] = useState<google.maps.places.PlaceResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);

  if (!isOpen) return null;

  if (!API_KEY) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-8 text-center space-y-6 animate-in fade-in zoom-in-95">
          <div className="w-20 h-20 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <Globe className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h2 className="text-2xl font-black text-slate-900">Google Maps Key Required</h2>
            <p className="text-slate-500 text-sm leading-relaxed">
              To import site locations and topography, you need to provide a Google Maps Platform API Key.
            </p>
          </div>
          <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 text-left space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Instructions</h4>
            <ul className="space-y-3">
              {[
                "Open Settings (gear icon, top-right corner)",
                "Select 'Secrets'",
                "Add GOOGLE_MAPS_PLATFORM_KEY",
                "Paste your API Key and press Enter"
              ].map((step, i) => (
                <li key={i} className="flex gap-3 text-sm font-medium text-slate-700">
                  <span className="w-5 h-5 bg-slate-200 text-slate-600 rounded-full flex items-center justify-center text-[10px] flex-shrink-0">{i+1}</span>
                  {step}
                </li>
              ))}
            </ul>
          </div>
          <button 
            onClick={onClose}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY} version="weekly">
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-md z-[100] flex items-center justify-center p-4">
        <div className="bg-white rounded-[2rem] shadow-2xl max-w-5xl w-full h-[80vh] flex overflow-hidden animate-in fade-in slide-in-from-bottom-8 duration-500">
          
          {/* Sidebar */}
          <div className="w-80 border-r border-slate-100 flex flex-col bg-slate-50/50">
            <div className="p-6 border-b border-slate-100 bg-white">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-blue-600 rounded-xl text-white shadow-lg shadow-blue-200">
                  <Globe className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-black text-slate-900 leading-tight">Site Import</h2>
              </div>
              
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
                <AutocompleteInput 
                  onPlaceSelect={(place) => {
                    setSelectedPlace(place);
                    setSearchQuery(place.formatted_address || '');
                  }} 
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedPlace ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-left-4">
                  <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-2">
                    <div className="flex items-center gap-2 text-blue-600">
                      <MapPin className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest">Selected Site</span>
                    </div>
                    <h3 className="text-sm font-bold text-slate-800">{selectedPlace.name}</h3>
                    <p className="text-xs text-slate-500 leading-relaxed font-medium">{selectedPlace.formatted_address}</p>
                    <div className="flex gap-4 pt-2 text-[10px] font-mono text-slate-400">
                      <span>LAT: {selectedPlace.geometry?.location?.lat().toFixed(4)}</span>
                      <span>LNG: {selectedPlace.geometry?.location?.lng().toFixed(4)}</span>
                    </div>
                  </div>

                  <div className="space-y-3 p-2">
                    <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-2">Import Options</h4>
                    <div className="space-y-2">
                        <ImportOptionItem icon={<Layers className="w-4 h-4" />} title="Topography" desc="High-res elevation grid (200m)" checked />
                        <ImportOptionItem icon={<ChevronRight className="w-4 h-4" />} title="Primary Roads" desc="Major vector paths" checked />
                        <ImportOptionItem icon={<X className="w-4 h-4" />} title="Cadastral Parcels" desc="Nearby plot boundaries" checked disabled />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4 px-6 text-slate-400">
                  <Search className="w-12 h-12 stroke-[1.5] text-slate-200" />
                  <p className="text-xs font-medium leading-relaxed">Search for a location to view options and import site data.</p>
                </div>
              )}
            </div>

            <div className="p-6 bg-white border-t border-slate-100">
              <button 
                disabled={!selectedPlace || isImporting}
                onClick={async () => {
                  if (!selectedPlace || !selectedPlace.geometry?.location) return;
                  setIsImporting(true);
                  // Simulated logic for elevation import
                  // In real app, call Elevation API
                  const lat = selectedPlace.geometry.location.lat();
                  const lng = selectedPlace.geometry.location.lng();
                  
                  for(let i=0; i<=100; i+=20) {
                    setImportProgress(i);
                    await new Promise(r => setTimeout(r, 200));
                  }

                  const mockData: number[][] = Array.from({length: 40}, (_, y) => 
                    Array.from({length: 40}, (_, x) => {
                        const dist = Math.sqrt((x-20)**2 + (y-20)**2);
                        return Math.sin(x/5) * 5 + Math.cos(y/5) * 3 + (dist < 10 ? 10 - dist : 0);
                    })
                  );

                  onImport(
                    { lat, lng, address: selectedPlace.formatted_address || selectedPlace.name || '' },
                    { 
                        isEnabled: true, 
                        data: mockData, 
                        resolution: 5, 
                        origin: { x: 0, y: 0 }, 
                        size: { width: 200, height: 200 } 
                    }
                  );
                  setIsImporting(false);
                  onClose();
                }}
                className={`w-full py-4 rounded-2xl font-bold flex items-center justify-center gap-2 transition-all shadow-xl ${
                  selectedPlace && !isImporting
                  ? 'bg-blue-600 text-white shadow-blue-200 hover:bg-blue-700 active:scale-95'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none'
                }`}
              >
                {isImporting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Importing... {importProgress}%</span>
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    <span>Download Site Data</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Map Preview */}
          <div className="flex-1 bg-slate-200 relative">
            <Map
              defaultCenter={{lat: 37.42, lng: -122.08}}
              center={selectedPlace?.geometry?.location ? { lat: selectedPlace.geometry.location.lat(), lng: selectedPlace.geometry.location.lng() } : undefined}
              defaultZoom={15}
              mapId="bf51a910020fa168"
              internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
              style={{ width: '100%', height: '100%' }}
              options={{
                disableDefaultUI: true,
                zoomControl: true,
                mapTypeControl: true,
                mapTypeId: 'satellite'
              }}
            />
          </div>

        </div>
      </div>
    </APIProvider>
  );
};

const AutocompleteInput = ({ onPlaceSelect }: { onPlaceSelect: (place: google.maps.places.PlaceResult) => void }) => {
  const places = useMapsLibrary('places');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!places || !inputRef.current) return;
    const autocomplete = new places.Autocomplete(inputRef.current, {
      fields: ['geometry', 'formatted_address', 'name', 'place_id']
    });
    autocomplete.addListener('place_changed', () => {
      onPlaceSelect(autocomplete.getPlace());
    });
  }, [places]);

  return (
    <input 
      ref={inputRef}
      type="text" 
      placeholder="Search for city, address, or landmark"
      className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl text-sm font-bold shadow-inner focus:ring-4 focus:ring-blue-100 focus:bg-white outline-none transition-all"
    />
  );
};

const ImportOptionItem = ({ icon, title, desc, checked, disabled }: { icon: React.ReactNode, title: string, desc: string, checked?: boolean, disabled?: boolean }) => (
    <label className={`flex items-start gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${
        disabled ? 'opacity-40 grayscale cursor-not-allowed' : 
        checked ? 'bg-blue-50/50 border-blue-200' : 'bg-white border-slate-100 hover:border-slate-300'
    }`}>
        <div className={`p-2 rounded-xl flex-shrink-0 ${checked && !disabled ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
            {icon}
        </div>
        <div className="flex-1 min-w-0">
            <h5 className="text-sm font-bold text-slate-800 leading-none">{title}</h5>
            <p className="text-[10px] text-slate-500 mt-1.5 font-medium">{desc}</p>
        </div>
        {!disabled && (
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${checked ? 'border-blue-600 bg-blue-600' : 'border-slate-200'}`}>
                {checked && <ChevronRight className="w-3 h-3 text-white" />}
            </div>
        )}
    </label>
);
