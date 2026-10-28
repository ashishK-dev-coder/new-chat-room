'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Camera,
  RefreshCw,
  Send,
  SwitchCamera,
  FlipHorizontal,
  Shield,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface SnapCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSendSnap: (imageBase64: string, duration?: number) => Promise<boolean>;
  darkMode?: boolean;
}

export const SnapCaptureModal: React.FC<SnapCaptureModalProps> = ({
  isOpen,
  onClose,
  onSendSnap,
  darkMode = false,
}) => {
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Stop camera tracks safely
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  // Start camera stream
  const startCamera = useCallback(async () => {
    stopCamera();
    setErrorMessage(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera access is not supported by your browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraActive(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unable to access device camera';
      setErrorMessage(msg);
      setCameraActive(false);
    }
  }, [facingMode, stopCamera]);

  // Restart camera when modal opens or facingMode changes
  useEffect(() => {
    if (isOpen && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, capturedImage, startCamera, stopCamera]);

  // Handle capture shutter
  const handleCapture = () => {
    if (!videoRef.current || !cameraActive) return;

    try {
      const video = videoRef.current;
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      if (isMirrored) {
        ctx.translate(width, 0);
        ctx.scale(-1, 1);
      }

      ctx.drawImage(video, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

      setCapturedImage(dataUrl);
      stopCamera();
    } catch (err) {
      console.warn('Failed to capture frame:', err);
    }
  };

  // Handle send
  const handleSend = async () => {
    if (!capturedImage || isUploading) return;
    setIsUploading(true);
    setErrorMessage(null);

    try {
      const ok = await onSendSnap(capturedImage, 10);
      if (ok) {
        handleClose();
      } else {
        setErrorMessage('Failed to send snap. Please retry.');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send snap';
      setErrorMessage(msg);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setErrorMessage(null);
  };

  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setErrorMessage(null);
    setIsUploading(false);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-md rounded-xl shadow-2xl border flex flex-col overflow-hidden transition-all duration-200 ${
          darkMode ? 'bg-[#1e293b] border-[#334155] text-white' : 'bg-white border-[#cbd5e1] text-[#0f172a]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Word-camouflaged Header */}
        <div
          className={`flex items-center justify-between px-3.5 py-2.5 border-b select-none ${
            darkMode ? 'bg-[#0f172a] border-[#334155]' : 'bg-[#f8fafc] border-[#e2e8f0]'
          }`}
        >
          <div className="flex items-center space-x-2">
            <div className="w-6 h-6 rounded-md bg-[#0078d4] text-white flex items-center justify-center text-[11px] font-bold">
              📷
            </div>
            <div>
              <span className="font-semibold text-xs sm:text-[13px] block leading-tight">
                Confidential Exhibit Scanner
              </span>
              <span className="text-[10px] opacity-60 block leading-none mt-0.5">
                View-Once Ephemeral Document Snap
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Viewfinder / Capture Preview Box */}
        <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          {capturedImage ? (
            <img
              src={capturedImage}
              alt="Snap Preview"
              className="w-full h-full object-cover select-none"
            />
          ) : (
            <>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isMirrored ? 'scale-x-[-1]' : ''}`}
              />

              {!cameraActive && !errorMessage && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-white/70 space-y-2">
                  <RefreshCw className="w-6 h-6 animate-spin opacity-50" />
                  <span className="text-xs">Initializing hardware camera...</span>
                </div>
              )}
            </>
          )}

          {/* Error notice */}
          {errorMessage && (
            <div className="absolute top-2 left-2 right-2 p-2 rounded bg-rose-900/90 text-rose-100 text-xs flex items-center space-x-1.5 shadow-md">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{errorMessage}</span>
            </div>
          )}

          {/* Viewfinder Controls (only in live camera mode) */}
          {!capturedImage && cameraActive && (
            <div className="absolute top-2 right-2 flex items-center space-x-1.5 z-10">
              <button
                type="button"
                onClick={() => setIsMirrored((prev) => !prev)}
                className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow"
                title="Mirror Camera"
              >
                <FlipHorizontal className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
                  setIsMirrored((prev) => !prev);
                }}
                className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow"
                title="Switch Camera (Front/Rear)"
              >
                <SwitchCamera className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Ephemeral Security Badge */}
          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] text-amber-300 flex items-center space-x-1 shadow select-none">
            <Shield className="w-3 h-3" />
            <span>View-Once • Burn on Slide</span>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div
          className={`p-3 border-t flex items-center justify-between select-none ${
            darkMode ? 'bg-[#0f172a]/60 border-[#334155]' : 'bg-[#f8fafc] border-[#e2e8f0]'
          }`}
        >
          {capturedImage ? (
            <>
              <button
                type="button"
                onClick={handleRetake}
                disabled={isUploading}
                className="px-3 py-1.5 rounded-md text-xs font-medium border opacity-75 hover:opacity-100 transition-colors cursor-pointer disabled:opacity-30"
              >
                Retake
              </button>

              <div className="text-[11px] opacity-60">
                <span>Receiver can view 1 time</span>
              </div>

              <button
                type="button"
                onClick={handleSend}
                disabled={isUploading}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[#0078d4] hover:bg-[#106ebe] text-white flex items-center space-x-1.5 transition-colors cursor-pointer shadow disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Snap</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <div className="w-full flex items-center justify-between">
              <span className="text-[11px] opacity-60">
                Aim at document & tap shutter
              </span>

              {/* Shutter Button */}
              <button
                type="button"
                onClick={handleCapture}
                disabled={!cameraActive}
                className="w-12 h-12 rounded-full border-4 border-[#0078d4] p-1 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                title="Capture Snap Photo"
              >
                <div className="w-full h-full bg-white dark:bg-[#0078d4] rounded-full shadow" />
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="text-xs opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

