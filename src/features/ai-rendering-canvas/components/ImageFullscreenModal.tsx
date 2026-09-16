import React, { useEffect } from 'react';
import { Edit3, ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageFullscreenModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: string[];
  currentIndex: number;
  onEditInRasterCanvas: (imageUrl: string) => void;
  onChangeIndex: (newIndex: number) => void;
}

export const ImageFullscreenModal: React.FC<ImageFullscreenModalProps> = ({
  isOpen,
  onClose,
  images,
  currentIndex,
  onEditInRasterCanvas,
  onChangeIndex,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleBack = (event: Event) => {
      const detail = (event as CustomEvent<{ priority: number; action?: () => void }>).detail;
      if (detail && detail.priority < 30) {
        detail.priority = 30;
        detail.action = onClose;
      }
      event.preventDefault();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener('archai:navigate-back', handleBack);
    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('archai:navigate-back', handleBack);
      window.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen, onClose]);

  if (!isOpen || images.length === 0) return null;

  const currentImage = images[currentIndex];

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex > 0) onChangeIndex(currentIndex - 1);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (currentIndex < images.length - 1) onChangeIndex(currentIndex + 1);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md">
      {/* Header controls */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-center z-10 bg-gradient-to-b from-black/80 to-transparent">
        <div className="flex items-center gap-4">
          <span className="text-slate-300 font-mono text-sm">
            {currentIndex + 1} / {images.length}
          </span>
          <button
            onClick={() => onEditInRasterCanvas(currentImage)}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-bold text-sm transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Edit3 size={16} />
            <span>Edit Image</span>
          </button>
        </div>
      </div>

      {/* Prev button */}
      {currentIndex > 0 && (
        <button
          onClick={handlePrev}
          className="absolute left-6 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white bg-black/50 hover:bg-black/80 rounded-full backdrop-blur transition-all"
        >
          <ChevronLeft size={32} />
        </button>
      )}

      {/* Image */}
      <img
        src={currentImage}
        alt="Fullscreen render"
        className="max-w-full max-h-full object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Next button */}
      {currentIndex < images.length - 1 && (
        <button
          onClick={handleNext}
          className="absolute right-6 top-1/2 -translate-y-1/2 p-3 text-white/50 hover:text-white bg-black/50 hover:bg-black/80 rounded-full backdrop-blur transition-all"
        >
          <ChevronRight size={32} />
        </button>
      )}
    </div>
  );
};
