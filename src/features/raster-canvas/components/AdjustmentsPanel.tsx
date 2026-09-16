import React, { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Crosshair, Layers, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { RasterCanvasStore } from '../state/useRasterCanvasStore';
import { COLOR_MIXER_CHANNELS, ColorMixerChannel, DEFAULT_ADJUSTMENTS, ImageAdjustments } from '../types/canvas';

type NumericKey = 'exposure' | 'contrast' | 'highlights' | 'shadows' | 'whites' | 'blacks' |
  'temperature' | 'tint' | 'vibrance' | 'saturation' | 'texture' | 'clarity' | 'dehaze' |
  'vignette' | 'sharpness' | 'noiseReduction';

const GROUPS: { title: string; controls: [NumericKey, string, number, number][] }[] = [
  { title: 'Light', controls: [['exposure', 'Exposure', -100, 100], ['contrast', 'Contrast', -100, 100], ['highlights', 'Highlights', -100, 100], ['shadows', 'Shadows', -100, 100], ['whites', 'Whites', -100, 100], ['blacks', 'Blacks', -100, 100]] },
  { title: 'Color', controls: [['temperature', 'Temperature', -100, 100], ['tint', 'Tint', -100, 100], ['vibrance', 'Vibrance', -100, 100], ['saturation', 'Saturation', -100, 100]] },
  { title: 'Effects', controls: [['texture', 'Texture', -100, 100], ['clarity', 'Clarity', -100, 100], ['dehaze', 'Dehaze', -100, 100]] },
  { title: 'Detail', controls: [['sharpness', 'Sharpness', 0, 100], ['noiseReduction', 'Noise Reduction', 0, 100]] },
];

const CHANNEL_COLORS: Record<ColorMixerChannel, string> = {
  red: '#ef4444', orange: '#f97316', yellow: '#eab308', green: '#22c55e',
  aqua: '#06b6d4', blue: '#3b82f6', purple: '#a855f7', magenta: '#ec4899',
};

interface Props {
  store: RasterCanvasStore;
  embedded?: boolean;
}

const Slider: React.FC<{
  label: string; value: number; min: number; max: number; onChange: (value: number) => void; onReset: () => void;
}> = ({ label, value, min, max, onChange, onReset }) => (
  <label className="block py-1.5">
    <div className="mb-1 flex items-center justify-between">
      <span className="text-[11px] font-medium text-slate-300">{label}</span>
      <input
        value={value}
        min={min}
        max={max}
        type="number"
        onChange={event => onChange(Math.max(min, Math.min(max, Number(event.target.value))))}
        className="w-14 rounded-md border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-right font-mono text-[10px] text-slate-200 outline-none focus:border-cyan-500"
      />
    </div>
    <input
      type="range"
      min={min}
      max={max}
      value={value}
      onChange={event => onChange(Number(event.target.value))}
      onDoubleClick={onReset}
      className="h-1.5 w-full cursor-pointer accent-cyan-500"
      title="Double-click to reset"
    />
  </label>
);

export const AdjustmentsPanel: React.FC<Props> = ({ store, embedded = false }) => {
  const [open, setOpen] = useState<Record<string, boolean>>({ Light: true, Color: true, Effects: true, Detail: true, Advanced: false });
  const [channel, setChannel] = useState<ColorMixerChannel>('red');
  const update = (key: NumericKey, value: number) => store.setAdjustments({ [key]: value });
  const resetKeys = (keys: NumericKey[]) => store.setAdjustments(Object.fromEntries(keys.map(key => [key, DEFAULT_ADJUSTMENTS[key]])) as Partial<ImageAdjustments>);
  const toggle = (title: string) => setOpen(current => ({ ...current, [title]: !current[title] }));

  const section = (title: string, body: React.ReactNode, reset: () => void) => (
    <section className="border-b border-slate-800">
      <div className="flex items-center">
        <button onClick={() => toggle(title)} className="flex flex-1 items-center gap-2 px-4 py-3 text-left text-xs font-bold text-slate-100">
          {open[title] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}{title}
        </button>
        <button onClick={reset} className="mr-3 rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-white" title={`Reset ${title}`}><RotateCcw size={12} /></button>
      </div>
      {open[title] && <div className="px-4 pb-4">{body}</div>}
    </section>
  );

  const advancedReset = () => store.setAdjustments({
    vignette: 0,
    toneCurve: DEFAULT_ADJUSTMENTS.toneCurve.map(point => ({ ...point })),
    hsl: Object.fromEntries(COLOR_MIXER_CHANNELS.map(name => [name, { hue: 0, saturation: 0, luminance: 0 }])) as ImageAdjustments['hsl'],
    pointColor: { ...DEFAULT_ADJUSTMENTS.pointColor },
  });

  return (
    <aside
      onPointerDownCapture={event => {
        if (event.target instanceof HTMLInputElement && event.target.type === 'range') store.setAdjustmentDragging(true);
      }}
      onPointerUpCapture={() => store.setAdjustmentDragging(false)}
      onPointerCancelCapture={() => store.setAdjustmentDragging(false)}
      className={embedded
        ? 'flex min-h-0 w-full flex-col overflow-visible bg-transparent'
        : 'absolute inset-y-0 right-0 z-40 flex w-[350px] flex-col border-l border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur-xl'}
    >
      <header className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div className="flex items-center gap-2"><SlidersHorizontal size={16} className="text-cyan-400" /><div><h3 className="text-xs font-bold text-white">Adjustments</h3><p className="text-[9px] text-slate-500">Non-destructive color workflow</p></div></div>
        {!embedded && <button onClick={() => store.setActiveTool('select')} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white" title="Back"><ChevronLeft size={15} /></button>}
      </header>

      <div className="border-b border-slate-800 p-3">
        <div className="grid grid-cols-2 rounded-lg bg-slate-950 p-1">
          {(['image', 'selection'] as const).map(scope => (
            <button
              key={scope}
              disabled={scope === 'selection' && !store.selection.active}
              onClick={() => store.setAdjustmentScope(scope)}
              className={`rounded-md py-1.5 text-[10px] font-bold capitalize transition-colors ${store.adjustmentScope === scope ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white disabled:opacity-30'}`}
            >{scope === 'image' ? 'Entire Image' : 'Selection / Mask'}</button>
          ))}
        </div>
      </div>

      <div className={embedded ? 'min-h-0' : 'min-h-0 flex-1 overflow-y-auto'}>
        {GROUPS.map(group => section(group.title, group.controls.map(([key, label, min, max]) => (
          <Slider key={key} label={label} value={store.adjustments[key]} min={min} max={max} onChange={value => update(key, value)} onReset={() => update(key, DEFAULT_ADJUSTMENTS[key])} />
        )), () => resetKeys(group.controls.map(control => control[0]))))}

        {section('Advanced', (
          <div className="space-y-5">
            <Slider label="Vignette" value={store.adjustments.vignette} min={-100} max={100} onChange={value => update('vignette', value)} onReset={() => update('vignette', 0)} />
            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Tone Curve</div>
              <div className="rounded-lg border border-slate-800 bg-slate-950 p-2">
                <svg viewBox="0 0 255 255" className="mb-2 aspect-square w-full rounded bg-[linear-gradient(90deg,transparent_49.5%,#1e293b_50%),linear-gradient(transparent_49.5%,#1e293b_50%)]">
                  <polyline fill="none" stroke="#22d3ee" strokeWidth="3" points={store.adjustments.toneCurve.map(point => `${point.x},${255 - point.y}`).join(' ')} />
                  {store.adjustments.toneCurve.map((point, index) => <circle key={index} cx={point.x} cy={255 - point.y} r="5" fill="#e2e8f0" stroke="#0891b2" strokeWidth="2" />)}
                </svg>
                {store.adjustments.toneCurve.slice(1, -1).map((point, index) => (
                  <Slider key={point.x} label={`Point ${index + 1}`} value={point.y} min={0} max={255} onChange={value => {
                    const next = store.adjustments.toneCurve.map(item => ({ ...item }));
                    next[index + 1].y = value;
                    store.setAdjustments({ toneCurve: next });
                  }} onReset={() => {
                    const next = store.adjustments.toneCurve.map(item => ({ ...item }));
                    next[index + 1].y = next[index + 1].x;
                    store.setAdjustments({ toneCurve: next });
                  }} />
                ))}
              </div>
            </div>

            <div>
              <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">Color Mixer / HSL</div>
              <div className="mb-2 grid grid-cols-8 gap-1">
                {COLOR_MIXER_CHANNELS.map(name => <button key={name} onClick={() => setChannel(name)} title={name} className={`h-5 rounded-full border-2 ${channel === name ? 'border-white' : 'border-transparent'}`} style={{ background: CHANNEL_COLORS[name] }} />)}
              </div>
              {(['hue', 'saturation', 'luminance'] as const).map(key => (
                <Slider key={key} label={key[0].toUpperCase() + key.slice(1)} value={store.adjustments.hsl[channel][key]} min={-100} max={100} onChange={value => store.setAdjustments({ hsl: { ...store.adjustments.hsl, [channel]: { ...store.adjustments.hsl[channel], [key]: value } } })} onReset={() => store.setAdjustments({ hsl: { ...store.adjustments.hsl, [channel]: { ...store.adjustments.hsl[channel], [key]: 0 } } })} />
              ))}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Point Color</span><button onClick={() => store.setPointColorPicking(true)} className={`flex items-center gap-1 rounded-md px-2 py-1 text-[9px] font-bold ${store.pointColorPicking ? 'bg-cyan-500 text-slate-950' : 'bg-slate-800 text-cyan-300'}`}><Crosshair size={11} />{store.pointColorPicking ? 'Pick on canvas' : 'Eyedropper'}</button></div>
              <Slider label="Range" value={store.adjustments.pointColor.range} min={5} max={90} onChange={range => store.setAdjustments({ pointColor: { ...store.adjustments.pointColor, range } })} onReset={() => store.setAdjustments({ pointColor: { ...store.adjustments.pointColor, range: 20 } })} />
              {(['hue', 'saturation', 'luminance'] as const).map(key => <Slider key={key} label={key[0].toUpperCase() + key.slice(1)} value={store.adjustments.pointColor[key]} min={-100} max={100} onChange={value => store.setAdjustments({ pointColor: { ...store.adjustments.pointColor, enabled: true, [key]: value } })} onReset={() => store.setAdjustments({ pointColor: { ...store.adjustments.pointColor, [key]: 0 } })} />)}
            </div>
          </div>
        ), advancedReset)}
      </div>

      <footer className="space-y-2 border-t border-slate-800 bg-slate-950/80 p-3">
        <div className="grid grid-cols-2 gap-2">
          <button onMouseDown={() => store.setIsComparing(true)} onMouseUp={() => store.setIsComparing(false)} onMouseLeave={() => store.setIsComparing(false)} className="rounded-lg border border-slate-700 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-800">Hold Before</button>
          <button onClick={store.resetAdjustments} className="rounded-lg border border-slate-700 py-2 text-[10px] font-bold text-slate-300 hover:bg-slate-800">Reset All</button>
        </div>
        <button onClick={store.saveAdjustmentsAsLayers} className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 py-2.5 text-[11px] font-bold text-white shadow-lg shadow-cyan-950/30 hover:from-cyan-500 hover:to-blue-500"><Layers size={14} />Save as Adjustment Layers</button>
      </footer>
    </aside>
  );
};
