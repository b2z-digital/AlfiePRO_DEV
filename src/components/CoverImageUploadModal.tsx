import React, { useState, useRef, useCallback } from 'react';
import { LogOut, Upload, ZoomIn, ZoomOut, RotateCw, Check } from 'lucide-react';
import imageCompression from 'browser-image-compression';

interface CoverImageUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (file: File, position: { x: number; y: number; scale: number }) => Promise<void>;
  currentImageUrl?: string | null;
  currentPosition?: { x: number; y: number; scale: number };
}

const CoverImageUploadModal: React.FC<CoverImageUploadModalProps> = ({
  isOpen,
  onClose,
  onSave,
  currentImageUrl,
  currentPosition,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentImageUrl || null);
  const [position, setPosition] = useState(currentPosition || { x: 0, y: 0 });
  const [scale, setScale] = useState(currentPosition?.scale || 1);
  const [showUploadInterface, setShowUploadInterface] = useState(!currentImageUrl);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

  // Reset state when modal opens
  React.useEffect(() => {
    if (isOpen) {
      setPreviewUrl(currentImageUrl || null);
      setPosition(currentPosition || { x: 0, y: 0 });
      setScale(currentPosition?.scale || 1);
      setShowUploadInterface(!currentImageUrl);
      setSelectedFile(null);
      setError(null);
    }
  }, [isOpen, currentImageUrl, currentPosition]);

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
        setShowUploadInterface(false);
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

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
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
      y: e.clientY - dragStart.y,
    });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  React.useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev + 0.1, 3));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev - 0.1, 0.5));
  };

  const handleReset = () => {
    setPosition({ x: 0, y: 0 });
    setScale(1);
  };

  const handleSave = async () => {
    if (!selectedFile && !currentImageUrl) return;

    setIsSaving(true);
    setError(null);
    try {
      // If we have a selected file, use it; otherwise save just the position for existing image
      if (selectedFile) {
        await onSave(selectedFile, { x: position.x, y: position.y, scale });
      } else if (currentImageUrl) {
        // For repositioning existing image, we need to create a File object from the URL
        const response = await fetch(currentImageUrl);
        const blob = await response.blob();
        const file = new File([blob], 'cover-image.jpg', { type: blob.type });
        await onSave(file, { x: position.x, y: position.y, scale });
      }
      onClose();
    } catch (error) {
      console.error('Error saving cover image:', error);
      setError(error instanceof Error ? error.message : 'Failed to save cover image. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReplaceImage = () => {
    setShowUploadInterface(true);
    setSelectedFile(null);
    setPreviewUrl(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-slate-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Upload Cover Image</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <LogOut className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-900/50 border border-red-700 rounded text-red-200 text-sm">
              {error}
            </div>
          )}
          {!previewUrl && showUploadInterface ? (
            <div
              ref={dropZoneRef}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className="border-2 border-dashed border-slate-600 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
            >
              <Upload className="w-16 h-16 text-slate-400 mx-auto mb-4" />
              <p className="text-slate-300 mb-2">Click or drag to upload cover image</p>
              <p className="text-sm text-slate-400">Recommended: 1920x300px, JPG or PNG</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div
                ref={containerRef}
                className="relative w-full h-[300px] bg-slate-900 rounded-lg overflow-hidden cursor-move"
                onMouseDown={handleMouseDown}
              >
                <img
                  src={previewUrl}
                  alt="Cover preview"
                  className="absolute pointer-events-none select-none"
                  style={{
                    transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
                    transformOrigin: 'center',
                    minWidth: '100%',
                    minHeight: '100%',
                  }}
                  draggable={false}
                />
                <div className="absolute inset-0 bg-black opacity-10 pointer-events-none" />
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleZoomOut}
                    className="p-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                    title="Zoom out"
                  >
                    <ZoomOut className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleZoomIn}
                    className="p-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                    title="Zoom in"
                  >
                    <ZoomIn className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleReset}
                    className="p-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                    title="Reset position"
                  >
                    <RotateCw className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={selectedFile ? () => fileInputRef.current?.click() : handleReplaceImage}
                  className="px-4 py-2 bg-slate-700 text-white rounded hover:bg-slate-600 transition-colors"
                >
                  {selectedFile ? 'Choose Different Image' : 'Replace Image'}
                </button>
              </div>

              <p className="text-sm text-slate-400 text-center">
                Drag to reposition • Zoom to adjust size
              </p>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-slate-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-300 hover:text-white transition-colors"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={(!selectedFile && !currentImageUrl) || isSaving}
            className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Check className="w-5 h-5" />
                Save Cover Image
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CoverImageUploadModal;
