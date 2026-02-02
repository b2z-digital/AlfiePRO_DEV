import React, { useState, useRef, useCallback } from 'react';
import { X, Upload, ZoomIn, ZoomOut, Check } from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface BoatImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (file: File, position: { x: number; y: number; scale: number }) => Promise<void>;
  darkMode: boolean;
  boatName: string;
}

export const BoatImageUploadModal: React.FC<BoatImageUploadModalProps> = ({
  isOpen,
  onClose,
  onSave,
  darkMode,
  boatName
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setError(null);

    try {
      const options = {
        maxSizeMB: 2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      };

      const compressedFile = await imageCompression(file, options);
      setSelectedFile(compressedFile);

      const reader = new FileReader();
      reader.onloadend = () => {
        setPreviewUrl(reader.result as string);
        setPosition({ x: 0, y: 0 });
        setScale(1);
      };
      reader.readAsDataURL(compressedFile);
    } catch (error) {
      console.error('Error compressing image:', error);
      setError('Failed to process image. Please try another file.');
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files?.[0];
    if (file) await processFile(file);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!previewUrl) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleSave = async () => {
    if (!selectedFile) return;

    try {
      setIsSaving(true);
      setError(null);
      await onSave(selectedFile, { x: position.x, y: position.y, scale });
      onClose();
    } catch (error) {
      console.error('Error saving image:', error);
      setError('Failed to save image. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className={`
        relative w-full max-w-4xl rounded-2xl shadow-2xl
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            Upload Photo - {boatName}
          </h2>
          <button
            onClick={onClose}
            className={`
              p-2 rounded-lg transition-colors
              ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-600'}
            `}
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-sm">
              {error}
            </div>
          )}

          {!previewUrl ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              className={`
                border-2 border-dashed rounded-xl p-12 text-center transition-colors
                ${darkMode ? 'border-slate-600 hover:border-cyan-500' : 'border-slate-300 hover:border-cyan-500'}
              `}
            >
              <Upload className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-400'}`} />
              <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Drop an image here or click to browse
              </p>
              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Supports JPG, PNG, GIF up to 10MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200"
              >
                Choose File
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className={`text-sm text-center mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Preview shows the exact size and position as it will appear on your boat card
              </p>
              <div
                className={`
                  relative w-full h-64 rounded-xl overflow-hidden cursor-move
                  ${darkMode ? 'bg-slate-900' : 'bg-slate-100'}
                `}
                onMouseDown={handleMouseDown}
              >
                <div
                  className="absolute inset-0 flex items-center justify-center"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transformOrigin: 'center'
                  }}
                >
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="max-w-none"
                    style={{
                      width: 'auto',
                      height: '100%',
                      userSelect: 'none',
                      pointerEvents: 'none'
                    }}
                    draggable={false}
                  />
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setScale(Math.max(0.5, scale - 0.1))}
                    className={`
                      p-2 rounded-lg transition-colors
                      ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}
                    `}
                  >
                    <ZoomOut size={20} />
                  </button>
                  <span className={`text-sm font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    {Math.round(scale * 100)}%
                  </span>
                  <button
                    onClick={() => setScale(Math.min(3, scale + 0.1))}
                    className={`
                      p-2 rounded-lg transition-colors
                      ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}
                    `}
                  >
                    <ZoomIn size={20} />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setPreviewUrl(null);
                      setSelectedFile(null);
                      setPosition({ x: 0, y: 0 });
                      setScale(1);
                    }}
                    className={`
                      px-4 py-2 rounded-lg font-medium transition-colors
                      ${darkMode ? 'bg-slate-700 hover:bg-slate-600 text-white' : 'bg-slate-200 hover:bg-slate-300 text-slate-900'}
                    `}
                  >
                    Change Image
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg font-medium hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSaving ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check size={20} />
                        Save Image
                      </>
                    )}
                  </button>
                </div>
              </div>

              <p className={`text-sm text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Drag the image to reposition it, use zoom controls to adjust size
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
