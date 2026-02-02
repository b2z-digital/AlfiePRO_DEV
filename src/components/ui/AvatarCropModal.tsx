import React, { useState, useRef, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Check } from 'lucide-react';

interface AvatarCropModalProps {
  isOpen: boolean;
  imageFile: File;
  onClose: () => void;
  onCrop: (croppedBlob: Blob) => void;
  darkMode?: boolean;
}

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  isOpen,
  imageFile,
  onClose,
  onCrop,
  darkMode = true,
}) => {
  const [imageSrc, setImageSrc] = useState<string>('');
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageSrc(e.target?.result as string);
      };
      reader.readAsDataURL(imageFile);
    }
  }, [imageFile]);

  useEffect(() => {
    if (imageSrc && imageRef.current) {
      imageRef.current.src = imageSrc;
    }
  }, [imageSrc]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    setIsDragging(true);
    setDragStart({
      x: touch.clientX - position.x,
      y: touch.clientY - position.y,
    });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y,
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev - 0.1, 0.5));
  };

  const handleCrop = async () => {
    if (!canvasRef.current || !imageRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 400;
    canvas.width = size;
    canvas.height = size;

    const containerSize = 300;
    const img = imageRef.current;

    ctx.save();
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    const scaleRatio = size / containerSize;
    const displayWidth = img.naturalWidth * scale;
    const displayHeight = img.naturalHeight * scale;

    const drawX = (containerSize / 2 + position.x - displayWidth / 2) * scaleRatio;
    const drawY = (containerSize / 2 + position.y - displayHeight / 2) * scaleRatio;
    const drawWidth = displayWidth * scaleRatio;
    const drawHeight = displayHeight * scaleRatio;

    ctx.drawImage(
      img,
      drawX,
      drawY,
      drawWidth,
      drawHeight
    );

    ctx.restore();

    canvas.toBlob((blob) => {
      if (blob) {
        onCrop(blob);
      }
    }, 'image/jpeg', 0.95);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div
        className={`rounded-2xl max-w-lg w-full ${
          darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
        } border shadow-2xl`}
      >
        <div className={`p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Position Your Photo
            </h2>
            <button
              onClick={onClose}
              className={`p-2 rounded-lg transition-colors ${
                darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'
              }`}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="p-6">
          <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Drag to reposition and use zoom controls to adjust your photo
          </p>

          <div className="flex justify-center mb-6">
            <div
              className="relative rounded-full overflow-hidden border-4 border-blue-500"
              style={{ width: 300, height: 300 }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <div
                className="absolute inset-0 flex items-center justify-center"
                style={{
                  transform: `translate(${position.x}px, ${position.y}px)`,
                  cursor: isDragging ? 'grabbing' : 'grab',
                }}
              >
                <img
                  ref={imageRef}
                  alt="Crop preview"
                  className="max-w-none"
                  style={{
                    transform: `scale(${scale})`,
                    transformOrigin: 'center',
                  }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const maxDim = Math.max(img.naturalWidth, img.naturalHeight);
                    const initialScale = 300 / maxDim;
                    setScale(initialScale * 1.2);
                  }}
                  draggable={false}
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 mb-6">
            <button
              onClick={handleZoomOut}
              className={`p-3 rounded-lg transition-colors ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
              }`}
              disabled={scale <= 0.5}
            >
              <ZoomOut size={20} />
            </button>

            <input
              type="range"
              min="0.5"
              max="3"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-48"
            />

            <button
              onClick={handleZoomIn}
              className={`p-3 rounded-lg transition-colors ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
              }`}
              disabled={scale >= 3}
            >
              <ZoomIn size={20} />
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className={`flex-1 px-6 py-3 rounded-lg font-medium transition-colors ${
                darkMode
                  ? 'bg-slate-700 hover:bg-slate-600 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleCrop}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Check size={20} />
              Apply
            </button>
          </div>
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
};
