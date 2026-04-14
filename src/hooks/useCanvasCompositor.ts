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
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const mergedStreamRef = useRef<MediaStream | null>(null);
  const overlaySnapshotRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number>(0);
  const captureIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturingRef = useRef(false);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const overlayElRef = useRef<HTMLDivElement | null>(null);
  const [compositedStream, setCompositedStream] = useState<MediaStream | null>(null);
  const [isCompositing, setIsCompositing] = useState(false);

  videoElRef.current = videoElement;
  overlayElRef.current = overlayElement;

  const renderFrame = useCallback(() => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    const vid = videoElRef.current;
    if (!ctx || !canvas || !vid) {
      animFrameRef.current = requestAnimationFrame(renderFrame);
      return;
    }

    try {
      if (vid.readyState >= 2) {
        ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
      }
      if (overlaySnapshotRef.current) {
        ctx.drawImage(overlaySnapshotRef.current, 0, 0, canvas.width, canvas.height);
      }
    } catch (_e) {
      // ignore draw errors
    }

    animFrameRef.current = requestAnimationFrame(renderFrame);
  }, []);

  const captureOverlay = useCallback(async () => {
    const el = overlayElRef.current;
    if (!el || isCapturingRef.current) return;
    if (el.offsetWidth === 0 || el.offsetHeight === 0) return;
    isCapturingRef.current = true;
    try {
      const scaleX = width / el.offsetWidth;
      const scaleY = height / el.offsetHeight;
      const scale = Math.min(scaleX, scaleY);

      const snapshot = await html2canvas(el, {
        backgroundColor: null,
        scale,
        useCORS: true,
        allowTaint: true,
        logging: false,
        width: el.offsetWidth,
        height: el.offsetHeight,
      });
      overlaySnapshotRef.current = snapshot;
    } catch (e) {
      console.warn('[Compositor] Overlay capture error:', e);
    } finally {
      isCapturingRef.current = false;
    }
  }, [width, height]);

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
      if (canvasStreamRef.current) {
        canvasStreamRef.current.getTracks().forEach(t => t.stop());
        canvasStreamRef.current = null;
      }
      mergedStreamRef.current = null;
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

    if (canvasStreamRef.current) {
      canvasStreamRef.current.getTracks().forEach(t => t.stop());
    }
    const canvasStream = canvas.captureStream(frameRate);
    canvasStreamRef.current = canvasStream;

    const merged = new MediaStream();
    canvasStream.getVideoTracks().forEach(t => merged.addTrack(t));
    sourceStream.getAudioTracks().forEach(t => merged.addTrack(t));
    mergedStreamRef.current = merged;
    setCompositedStream(merged);
    setIsCompositing(true);

    animFrameRef.current = requestAnimationFrame(renderFrame);

    console.log(`[Compositor] Started: ${width}x${height} @${frameRate}fps`);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = 0;
      }
      if (canvasStreamRef.current) {
        canvasStreamRef.current.getTracks().forEach(t => t.stop());
        canvasStreamRef.current = null;
      }
      mergedStreamRef.current = null;
      setIsCompositing(false);
      overlaySnapshotRef.current = null;
      console.log('[Compositor] Stopped');
    };
  }, [enabled, videoElement, sourceStream, width, height, frameRate, renderFrame]);

  useEffect(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    if (!enabled || !overlayElement) {
      overlaySnapshotRef.current = null;
      return;
    }

    captureOverlay();
    captureIntervalRef.current = setInterval(captureOverlay, 1000 / overlayCaptureFps);
    console.log(`[Compositor] Overlay capture started @${overlayCaptureFps}fps`);

    return () => {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
        captureIntervalRef.current = null;
      }
    };
  }, [enabled, overlayElement, overlayCaptureFps, captureOverlay]);

  useEffect(() => {
    const merged = mergedStreamRef.current;
    if (!merged || !sourceStream) return;
    const currentAudioIds = new Set(merged.getAudioTracks().map(t => t.id));
    const sourceAudioTracks = sourceStream.getAudioTracks();
    const sourceAudioIds = new Set(sourceAudioTracks.map(t => t.id));

    merged.getAudioTracks().forEach(t => {
      if (!sourceAudioIds.has(t.id)) merged.removeTrack(t);
    });
    sourceAudioTracks.forEach(t => {
      if (!currentAudioIds.has(t.id)) merged.addTrack(t);
    });
  }, [compositedStream, sourceStream]);

  return { compositedStream, isCompositing };
}
