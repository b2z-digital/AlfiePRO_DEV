import { useRef, useState, useEffect, useCallback } from 'react';
import html2canvas from 'html2canvas';

interface UseCanvasCompositorOptions {
  videoElement: HTMLVideoElement | null;
  overlayElement: HTMLDivElement | null;
  sourceStream: MediaStream | null;
  enabled: boolean;
  width?: number;
  height?: number;
  overlayCaptureFps?: number;
  frameRate?: number;
}

interface UseCanvasCompositorReturn {
  compositedStream: MediaStream | null;
  isCompositing: boolean;
}

export function useCanvasCompositor({
  videoElement,
  overlayElement,
  sourceStream,
  enabled,
  width = 1280,
  height = 720,
  overlayCaptureFps = 2,
  frameRate = 30,
}: UseCanvasCompositorOptions): UseCanvasCompositorReturn {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const overlaySnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturingRef = useRef(false);
  const [compositedStream, setCompositedStream] = useState<MediaStream | null>(null);
  const [isCompositing, setIsCompositing] = useState(false);

  const renderFrame = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas || !videoElement) return;

    try {
      if (videoElement.readyState >= 2) {
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      }
      if (overlaySnapshotRef.current) {
        ctx.drawImage(overlaySnapshotRef.current, 0, 0, canvas.width, canvas.height);
      }
    } catch (e) {
      // Silently handle draw errors
    }

    animFrameRef.current = requestAnimationFrame(renderFrame);
  }, [videoElement]);

  const captureOverlay = useCallback(async () => {
    if (!overlayElement || isCapturingRef.current) return;
    isCapturingRef.current = true;
    try {
      const scaleX = width / overlayElement.offsetWidth;
      const scaleY = height / overlayElement.offsetHeight;
      const scale = Math.min(scaleX, scaleY);

      const snapshot = await html2canvas(overlayElement, {
        backgroundColor: null,
        scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: overlayElement.offsetWidth,
        height: overlayElement.offsetHeight,
      });
      overlaySnapshotRef.current = snapshot;
    } catch (e) {
      console.warn('[Compositor] Overlay capture error:', e);
    } finally {
      isCapturingRef.current = false;
    }
  }, [overlayElement, width, height]);

  useEffect(() => {
    if (!enabled || !videoElement || !sourceStream) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      if (compositedStream) {
        compositedStream.getVideoTracks().forEach(t => t.stop());
      }
      setCompositedStream(null);
      setIsCompositing(false);
      overlaySnapshotRef.current = null;
      return;
    }

    if (!canvasRef.current) {
      canvasRef.current = document.createElement('canvas');
    }
    const canvas = canvasRef.current;
    canvas.width = width;
    canvas.height = height;
    ctxRef.current = canvas.getContext('2d', { alpha: false });

    const canvasStream = canvas.captureStream(frameRate);
    const merged = new MediaStream();
    canvasStream.getVideoTracks().forEach(t => merged.addTrack(t));
    sourceStream.getAudioTracks().forEach(t => merged.addTrack(t));
    setCompositedStream(merged);
    setIsCompositing(true);

    animFrameRef.current = requestAnimationFrame(renderFrame);

    if (overlayElement) {
      captureOverlay();
      captureIntervalRef.current = setInterval(captureOverlay, 1000 / overlayCaptureFps);
    }

    console.log(`[Compositor] Started: ${width}x${height} @${frameRate}fps, overlay capture @${overlayCaptureFps}fps`);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
      canvasStream.getVideoTracks().forEach(t => t.stop());
      setIsCompositing(false);
      overlaySnapshotRef.current = null;
      console.log('[Compositor] Stopped');
    };
  }, [enabled, videoElement, sourceStream, overlayElement, width, height, frameRate, overlayCaptureFps, renderFrame, captureOverlay]);

  useEffect(() => {
    if (!compositedStream || !sourceStream) return;
    const currentAudioIds = new Set(compositedStream.getAudioTracks().map(t => t.id));
    const sourceAudioTracks = sourceStream.getAudioTracks();
    const sourceAudioIds = new Set(sourceAudioTracks.map(t => t.id));

    compositedStream.getAudioTracks().forEach(t => {
      if (!sourceAudioIds.has(t.id)) compositedStream.removeTrack(t);
    });
    sourceAudioTracks.forEach(t => {
      if (!currentAudioIds.has(t.id)) compositedStream.addTrack(t);
    });
  }, [compositedStream, sourceStream]);

  return { compositedStream, isCompositing };
}
