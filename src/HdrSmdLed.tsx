import React, { useEffect, useRef, useState } from 'react';
import { HdrRenderer } from './hdr/Renderer';

interface Props {
  powerRatio: number;
}

export function HdrSmdLed({ powerRatio }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<HdrRenderer | null>(null);
  const [isHdr, setIsHdr] = useState(false);
  const [isSupported, setIsSupported] = useState<boolean | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [gpuError, setGpuError] = useState<string | null>(null);
  useEffect(() => {
    const handleErr = (e: any) => setGpuError(prev => (prev || '') + '\n' + (e.message || e.reason || e.error || e.toString()));
    window.addEventListener('error', handleErr);
    window.addEventListener('unhandledrejection', handleErr);
    return () => {
        window.removeEventListener('error', handleErr);
        window.removeEventListener('unhandledrejection', handleErr);
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    
    const renderer = new HdrRenderer(canvasRef.current);
    rendererRef.current = renderer;
    
    console.log("Starting WebGPU initialization...");
    renderer.initialize().then((success) => {
      console.log("WebGPU init success:", success, "HDR:", renderer.isHdrActive);
      if (renderer.device) {
          renderer.device.onuncapturederror = (event) => {
              console.error('WebGPU Error:', event.error);
              setGpuError(event.error.message);
          };
      }
      setIsSupported(success);
      if (success) {
        setIsHdr(renderer.isHdrActive);
      }
      setIsInitialized(true);
    });

    return () => {
      renderer.destroy();
      rendererRef.current = null;
    };
  }, []); // Run once on mount

  useEffect(() => {
    if (rendererRef.current && isInitialized && isSupported) {
      rendererRef.current.setBrightness(powerRatio, 0);
      rendererRef.current.render();
    }
  }, [powerRatio, isInitialized, isSupported]);

  // Handle Resize
  useEffect(() => {
    if (!canvasRef.current || !rendererRef.current) return;
    
    const resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
            const { width, height } = entry.contentRect;
            if (canvasRef.current && rendererRef.current && isInitialized) {
                // To avoid drawing logic on 0-size elements
                if (width > 0 && height > 0) {
                   canvasRef.current.width = width * window.devicePixelRatio;
                   canvasRef.current.height = height * window.devicePixelRatio;
                   rendererRef.current.render();
                }
            }
        }
    });
    
    resizeObserver.observe(canvasRef.current);
    return () => resizeObserver.disconnect();
  }, [isInitialized]);

  if (isSupported === false) {
    return (
        <div className="w-full h-full flex items-center justify-center bg-zinc-950 text-red-500 text-[10px] p-2 text-center border border-red-900/50 rounded">
            WebGPU Not Supported
        </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      {gpuError && <div className="absolute inset-0 z-50 bg-red-900/80 text-white text-[8px] p-1 overflow-auto">{gpuError}</div>}
      <canvas 
        ref={canvasRef} 
        className="w-full h-full block"
        style={{
            imageRendering: 'auto',
            contain: 'strict'
        }}
      />
      <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 pointer-events-none whitespace-nowrap">
        {isHdr ? (
           <span className="text-emerald-500/70 text-[8px] font-bold">HDR ACTIVE</span>
        ) : (
           <span className="text-amber-500/70 text-[8px] font-bold">HDR OFF</span>
        )}
      </div>
    </div>
  );
}
