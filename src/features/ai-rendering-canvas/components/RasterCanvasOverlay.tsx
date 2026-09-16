import React from 'react';
import { RasterCanvasView } from '../../raster-canvas/components/RasterCanvasView';

interface RasterCanvasOverlayProps {
  isOpen: boolean;
  onClose: (editedImageBase64?: string) => void;
  initialImageBase64?: string;
  availableStudioImages?: any[];
}

export const RasterCanvasOverlay: React.FC<RasterCanvasOverlayProps> = ({
  isOpen,
  onClose,
  initialImageBase64,
  availableStudioImages = [],
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/95 backdrop-blur-sm">
      <div className="flex-1 flex overflow-hidden">
        <RasterCanvasView
          isOpen={isOpen}
          initialImageBase64={initialImageBase64}
          onBackToCanvas={onClose}
          availableStudioImages={availableStudioImages}
        />
      </div>
    </div>
  );
};
