import React, { useRef, useState, useEffect } from 'react';
import { Compass, RotateCw, RotateCcw, Box, Eye } from 'lucide-react';
import { motion, animate } from 'motion/react';
import { DrawingViewId } from '../types';

interface ViewportCompassProps {
  canvasAngle?: number;
  onAngleChange?: (angle: number) => void;
  viewMode: '2D' | '3D';
  onToggleViewMode?: (mode: '2D' | '3D') => void;
  activeDrawingView?: DrawingViewId;
  onSelectDrawingView?: (viewId: DrawingViewId) => void;
  onSnap3DCamera?: (dir: 'N' | 'S' | 'E' | 'W' | 'TOP' | 'BOTTOM' | 'NE' | 'NW' | 'SE' | 'SW') => void;
  elements?: any[];
  isParallel?: boolean;
  onToggleParallel?: () => void;
}

export const ViewportCompass: React.FC<ViewportCompassProps> = ({
  canvasAngle = 0,
  onAngleChange,
  viewMode,
  onToggleViewMode,
  activeDrawingView = 'plan',
  onSelectDrawingView,
  onSnap3DCamera,
  elements = [],
  isParallel = false,
  onToggleParallel
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);
  const [displayAngle, setDisplayAngle] = useState<number | null>(null);
  const [cameraState, setCameraState] = useState<{ theta: number; phi: number } | null>(null);

  useEffect(() => {
    if (viewMode !== '3D') {
      setCameraState(null);
      return;
    }
    const handleCameraChange = (e: Event) => {
      const { theta, phi } = (e as CustomEvent).detail;
      setCameraState({ theta, phi });
    };
    window.addEventListener('3d-camera-change', handleCameraChange);
    return () => {
      window.removeEventListener('3d-camera-change', handleCameraChange);
    };
  }, [viewMode]);

  // When animation finishes, we reset the display override
  const handleAnimationComplete = (finalTarget: number) => {
    setIsAnimating(false);
    setDisplayAngle(null);
    let normalized = finalTarget % 360;
    if (normalized < 0) normalized += 360;
    onAngleChange?.(normalized);
  };

  // Smoothly reset 2D angle to 0
  const handleResetAngle = () => {
    if (viewMode === '2D') {
      setIsAnimating(true);
      setDisplayAngle(Math.round(canvasAngle));
      animate(canvasAngle, 0, {
        duration: 0.5,
        ease: "easeInOut",
        onUpdate: (v) => onAngleChange?.(v),
        onComplete: () => handleAnimationComplete(0)
      });
    } else {
      onSnap3DCamera?.('TOP');
    }
  };

  // Increment rotation by 90 deg
  const handleRotateCW = () => {
    if (viewMode === '2D') {
      setIsAnimating(true);
      const target = canvasAngle + 90;
      setDisplayAngle(Math.round((target % 360 + 360) % 360));
      animate(canvasAngle, target, {
        duration: 0.5,
        ease: "easeInOut",
        onUpdate: (v) => {
          onAngleChange?.(v);
        },
        onComplete: () => handleAnimationComplete(target)
      });
    }
  };

  const handleRotateCCW = () => {
    if (viewMode === '2D') {
      setIsAnimating(true);
      const target = canvasAngle - 90;
      setDisplayAngle(Math.round((target % 360 + 360) % 360));
      animate(canvasAngle, target, {
        duration: 0.5,
        ease: "easeInOut",
        onUpdate: (v) => {
          onAngleChange?.(v);
        },
        onComplete: () => handleAnimationComplete(target)
      });
    }
  };

  // Drag revolving gesture math
  const handlePointerDown = (e: React.PointerEvent) => {
    if (viewMode !== '2D') return;
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    // Compass center coordinates
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    
    setIsRotating(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const dx = moveEvent.clientX - cx;
      const dy = moveEvent.clientY - cy;
      
      // Calculate angle from 12 o'clock (representing North)
      // Math.atan2(dy, dx) gives 3 o'clock as 0 angle; so we add +90 deg
      let angleRad = Math.atan2(dy, dx);
      let angleDeg = angleRad * (180 / Math.PI) + 90;
      if (angleDeg < 0) angleDeg += 360;
      
      // Dynamic round to nearest 1 degree
      onAngleChange?.(Math.round(angleDeg % 360));
    };

    const onPointerUp = () => {
      setIsRotating(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const xRot = cameraState ? (cameraState.phi - Math.PI / 2) * (180 / Math.PI) : -25;
  const yRot = cameraState ? -cameraState.theta * (180 / Math.PI) : 45;
  const compassRotation = viewMode === '2D' ? -canvasAngle : (cameraState ? -cameraState.theta * 180 / Math.PI : 0);

  return (
    <div 
      ref={containerRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      id="viewport-compass-widget"
      className="relative shrink-0 bg-white/95 backdrop-blur shadow-lg shadow-slate-200/50 border border-slate-200 rounded-2xl p-2 flex flex-col items-center gap-1.5 transition-all duration-300 hover:shadow-xl hover:border-slate-300 text-slate-700 select-none pointer-events-auto"
      style={{ width: '116px' }}
    >
        {/* Widget Header / Toggle Mode */}
        <div className="flex items-center justify-between w-full bg-slate-100/80 rounded-lg p-1 mb-1">
          <button
            onClick={() => {
              if (viewMode === '2D' && activeDrawingView !== 'plan') {
                onSelectDrawingView?.('plan');
              } else {
                onToggleViewMode?.('2D');
              }
            }}
            className={`flex-1 px-1 py-1 text-[10px] font-bold rounded transition-all flex items-center justify-center gap-1 ${
              viewMode === '2D' && activeDrawingView === 'plan'
                ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50 font-black'
                : viewMode === '2D'
                ? 'bg-blue-50/70 text-blue-600'
                : 'text-slate-500 hover:text-slate-700'
            }`}
            title="2D Plan View"
          >
            2D Plan
          </button>
          <button
            onClick={() => onToggleViewMode?.('3D')}
            className={`flex-1 px-1 py-1 text-[10px] font-bold rounded transition-all flex items-center justify-center gap-1 ${
              viewMode === '3D' ? 'bg-white text-blue-600 shadow-sm ring-1 ring-slate-200/50 font-black' : 'text-slate-500 hover:text-slate-700'
            }`}
            title="3D View"
          >
            3D View
          </button>
        </div>

      {/* Main Interactive Compass Ring & Cube */}
      <div className="relative w-20 h-20 flex items-center justify-center select-none">
        {/* Dynamic Rotating SVG Ring (2D Mode only) */}
        {viewMode === '2D' && (
          <motion.svg 
            className="absolute inset-0 w-full h-full cursor-col-resize"
            viewBox="0 0 96 96"
            initial={false}
            animate={{ 
              rotate: compassRotation 
            }}
            transition={{
              type: "spring",
              stiffness: 260,
              damping: 20
            }}
            style={{ 
              transformOrigin: '50% 50%'
            }}
            onPointerDown={handlePointerDown}
          >
            <defs>
              <radialGradient id="ring-glow" cx="50%" cy="50%" r="50%">
                <stop offset="70%" stopColor="transparent" />
                <stop offset="95%" stopColor="rgba(59, 130, 246, 0.05)" />
                <stop offset="100%" stopColor="rgba(59, 130, 246, 0.15)" />
              </radialGradient>
            </defs>
            
            {/* Main outer ring track */}
            <circle cx="48" cy="48" r="43" fill="url(#ring-glow)" stroke="#e2e8f0" strokeWidth="2.5" />
            <circle cx="48" cy="48" r="33" fill="none" stroke="#f1f5f9" strokeWidth="1" strokeDasharray="2, 2" />

            {/* North Direction Indicator Needle */}
            <polygon 
              points="48,5 52,14 44,14" 
              className="fill-red-500"
            />
            
            {/* Cardinal direction letter groups with counter-rotation style so text stays upright */}
            {[
              { label: 'N', x: 48, y: 15, rot: 0, dir: 'N' },
              { label: 'E', x: 81, y: 48, rot: 90, dir: 'E' },
              { label: 'S', x: 48, y: 81, rot: 180, dir: 'S' },
              { label: 'W', x: 15, y: 48, rot: 270, dir: 'W' }
            ].map(d => {
              const rotTextAngle = canvasAngle;
              return (
                <g key={d.label}>
                  <text
                    x={d.x}
                    y={d.y}
                    textAnchor="middle"
                    dominantBaseline="central"
                    onClick={(e) => {
                      e.stopPropagation();
                      onAngleChange?.(d.rot);
                    }}
                    className="text-[9px] font-black cursor-pointer transition-colors fill-slate-500 hover:fill-blue-600 select-none"
                    style={{
                      transform: `rotate(${rotTextAngle}deg)`,
                      transformOrigin: `${d.x}px ${d.y}px`
                    }}
                  >
                    {d.label}
                  </text>
                </g>
              );
            })}
          </motion.svg>
        )}

        {/* Center view cube: flat TOP for 2D, 3D-box for 3D */}
        {viewMode === '2D' ? (
          // 2D Mode: Flat Top box
          <button 
            onClick={handleResetAngle}
            title="Reset Plan Rotation"
            className="absolute w-[36px] h-[36px] bg-slate-100 hover:bg-blue-50 border border-slate-300 rounded flex items-center justify-center transition-all shadow-inner active:scale-90 group z-10 cursor-pointer"
          >
            <span className="text-[9px] font-black text-slate-600 group-hover:text-blue-600 uppercase tracking-tighter">
              TOP
            </span>
          </button>
        ) : (
          // 3D Mode: Rotating CAD 3D ViewCube in HTML/CSS 3D
          <div className="absolute w-[64px] h-[64px] z-10 flex items-center justify-center pointer-events-auto" style={{ perspective: '300px' }}>
            <div
              className="w-10 h-10 relative"
              style={{
                transformStyle: 'preserve-3d',
                transform: `rotateX(${xRot}deg) rotateY(${yRot}deg)`,
                transition: cameraState ? 'none' : 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)',
              }}
            >
              {/* TOP FACE with embedded 3x3 grid for TOP view, 4 top corners (NW, NE, SW, SE) and 4 top edges (N, E, S, W) */}
              <div 
                className="absolute inset-0 grid grid-cols-[8px_1fr_8px] grid-rows-[8px_1fr_8px] border border-slate-350 bg-white/95"
                style={{ transform: 'rotateX(90deg) translateZ(20px)', backfaceVisibility: 'hidden', width: '40px', height: '40px' }}
              >
                {/* Row 1 */}
                <button 
                  onClick={() => onSnap3DCamera?.('NW')} 
                  className="bg-slate-200 hover:bg-indigo-600 transition-colors cursor-pointer border-r border-b border-slate-300/40" 
                  title="Snap to NW Corner" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('N')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-b border-slate-300/40" 
                  title="Snap to N Edge" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('NE')} 
                  className="bg-slate-200 hover:bg-indigo-600 transition-colors cursor-pointer border-l border-b border-slate-300/40" 
                  title="Snap to NE Corner" 
                />

                {/* Row 2 */}
                <button 
                  onClick={() => onSnap3DCamera?.('W')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-r border-slate-300/40" 
                  title="Snap to W Edge" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('TOP')} 
                  className="flex items-center justify-center text-[7px] font-black text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors select-none cursor-pointer"
                >
                  TOP
                </button>
                <button 
                  onClick={() => onSnap3DCamera?.('E')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-l border-slate-300/40" 
                  title="Snap to E Edge" 
                />

                {/* Row 3 */}
                <button 
                  onClick={() => onSnap3DCamera?.('SW')} 
                  className="bg-slate-200 hover:bg-indigo-600 transition-colors cursor-pointer border-r border-t border-slate-300/40" 
                  title="Snap to SW Corner" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('S')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-t border-slate-300/40" 
                  title="Snap to S Edge" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('SE')} 
                  className="bg-slate-200 hover:bg-indigo-600 transition-colors cursor-pointer border-l border-t border-slate-300/40" 
                  title="Snap to SE Corner" 
                />
              </div>

              {/* BOTTOM FACE */}
              <button
                onClick={() => onSnap3DCamera?.('BOTTOM')}
                className="absolute inset-0 flex items-center justify-center border border-slate-300 bg-slate-100/95 text-[7px] font-black text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors select-none cursor-pointer"
                style={{ transform: 'rotateX(-90deg) translateZ(20px)', backfaceVisibility: 'hidden', width: '40px', height: '40px' }}
                title="Snap to Bottom View"
              >
                BTM
              </button>

              {/* FRONT FACE (South) with vertical edges (SW, SE) */}
              <div 
                className="absolute inset-0 grid grid-cols-[8px_1fr_8px] border border-slate-300 bg-white/95"
                style={{ transform: 'translateZ(20px)', backfaceVisibility: 'hidden', width: '40px', height: '40px' }}
              >
                <button 
                  onClick={() => onSnap3DCamera?.('SW')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-r border-slate-300/40" 
                  title="Snap to SW Vertical Edge" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('S')} 
                  className="flex items-center justify-center text-[7px] font-black text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors select-none cursor-pointer"
                >
                  FRONT
                </button>
                <button 
                  onClick={() => onSnap3DCamera?.('SE')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-l border-slate-300/40" 
                  title="Snap to SE Vertical Edge" 
                />
              </div>

              {/* BACK FACE (North) with vertical edges (NE, NW) */}
              <div 
                className="absolute inset-0 grid grid-cols-[8px_1fr_8px] border border-slate-300 bg-white/95"
                style={{ transform: 'rotateY(180deg) translateZ(20px)', backfaceVisibility: 'hidden', width: '40px', height: '40px' }}
              >
                <button 
                  onClick={() => onSnap3DCamera?.('NE')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-r border-slate-300/40" 
                  title="Snap to NE Vertical Edge" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('N')} 
                  className="flex items-center justify-center text-[7px] font-black text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors select-none cursor-pointer"
                >
                  BACK
                </button>
                <button 
                  onClick={() => onSnap3DCamera?.('NW')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-l border-slate-300/40" 
                  title="Snap to NW Vertical Edge" 
                />
              </div>

              {/* LEFT FACE (West) with vertical edges (NW, SW) */}
              <div 
                className="absolute inset-0 grid grid-cols-[8px_1fr_8px] border border-slate-300 bg-slate-50/95"
                style={{ transform: 'rotateY(-90deg) translateZ(20px)', backfaceVisibility: 'hidden', width: '40px', height: '40px' }}
              >
                <button 
                  onClick={() => onSnap3DCamera?.('NW')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-r border-slate-300/40" 
                  title="Snap to NW Vertical Edge" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('W')} 
                  className="flex items-center justify-center text-[7px] font-black text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors select-none cursor-pointer"
                >
                  LEFT
                </button>
                <button 
                  onClick={() => onSnap3DCamera?.('SW')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-l border-slate-300/40" 
                  title="Snap to SW Vertical Edge" 
                />
              </div>

              {/* RIGHT FACE (East) with vertical edges (SE, NE) */}
              <div 
                className="absolute inset-0 grid grid-cols-[8px_1fr_8px] border border-slate-300 bg-slate-50/95"
                style={{ transform: 'rotateY(90deg) translateZ(20px)', backfaceVisibility: 'hidden', width: '40px', height: '40px' }}
              >
                <button 
                  onClick={() => onSnap3DCamera?.('SE')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-r border-slate-300/40" 
                  title="Snap to SE Vertical Edge" 
                />
                <button 
                  onClick={() => onSnap3DCamera?.('E')} 
                  className="flex items-center justify-center text-[7px] font-black text-slate-500 hover:bg-blue-50 hover:text-blue-600 transition-colors select-none cursor-pointer"
                >
                  RIGHT
                </button>
                <button 
                  onClick={() => onSnap3DCamera?.('NE')} 
                  className="bg-slate-100 hover:bg-indigo-650 transition-colors cursor-pointer border-l border-slate-300/40" 
                  title="Snap to NE Vertical Edge" 
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Manual Reset / Rotate Buttons (always visible) */}
      <div 
        className={`flex items-center gap-1.5 self-stretch justify-center border-t border-slate-100 pt-1.5 mt-0.5 opacity-100 ${
          viewMode === '2D' ? 'h-6' : 'h-auto'
        }`}
      >
        {viewMode === '2D' ? (
          <>
            <button 
              onClick={handleRotateCCW}
              title="Rotate Left 90°"
              className="p-1 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            >
              <RotateCcw size={12} />
            </button>
            <button 
              onClick={handleResetAngle}
              className="text-[10px] font-bold min-w-[32px] px-1 text-slate-500 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded select-none tabular-nums cursor-pointer"
              title="Reset angle to 0°"
            >
              {displayAngle !== null ? displayAngle : Math.round(canvasAngle % 360 + 360) % 360}°
            </button>
            <button 
              onClick={handleRotateCW}
              title="Rotate Right 90°"
              className="p-1 text-slate-400 hover:text-slate-700 bg-slate-50 hover:bg-slate-100 rounded transition-colors cursor-pointer"
            >
              <RotateCw size={12} />
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-1.5 w-full">
            <button 
              onClick={onToggleParallel}
              className="text-[9px] font-bold px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 rounded flex items-center justify-center uppercase transition-colors cursor-pointer"
            >
              {isParallel ? 'Parallel' : 'Perspective'}
            </button>
          </div>
        )}
      </div>

      {/* Direction / Elevation View Buttons (N, S, E, W) */}
      <div className="flex items-center gap-1 self-stretch justify-between border-t border-slate-100 pt-1.5 mt-0.5">
        {(['N', 'S', 'E', 'W'] as const).map(dir => {
          const elevationViewId = `elevation-${dir.toLowerCase()}` as DrawingViewId;
          const isActive = viewMode === '2D' && activeDrawingView === elevationViewId;

          return (
            <button
              key={dir}
              onClick={() => {
                if (viewMode === '2D') {
                  onSelectDrawingView?.(elevationViewId);
                } else {
                  onSnap3DCamera?.(dir);
                }
              }}
              className={`flex-1 py-1 text-[10px] font-bold rounded transition-all flex items-center justify-center cursor-pointer ${
                isActive
                  ? 'bg-blue-600 text-white shadow-sm font-black'
                  : 'bg-slate-50 text-slate-600 hover:bg-blue-50 hover:text-blue-600 border border-slate-200/60'
              }`}
              title={viewMode === '2D' ? `${dir} Elevation View` : `Snap 3D Camera to ${dir} View`}
            >
              {dir}
            </button>
          );
        })}
      </div>
    </div>
  );
};
