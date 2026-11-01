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
  Upload,
  ArrowLeft,
  Image as ImageIcon,
} from 'lucide-react';
import { isPanicKeyEvent } from '@/lib/panicUtils';

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
  // Modes: 'choose' (asks camera or upload), 'camera' (live viewfinder), 'preview' (image ready to send)
  const [mode, setMode] = useState<'choose' | 'camera' | 'preview'>('choose');
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isMirrored, setIsMirrored] = useState<boolean>(true);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Manage camera lifecycle: Only start when in 'camera' mode and no image captured yet
  useEffect(() => {
    if (isOpen && mode === 'camera' && !capturedImage) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => {
      stopCamera();
    };
  }, [isOpen, mode, capturedImage, startCamera, stopCamera]);

  // Reset modal state when opened
  useEffect(() => {
    if (isOpen) {
      setMode('choose');
      setCapturedImage(null);
      setErrorMessage(null);
      setIsUploading(false);
    } else {
      stopCamera();
    }
  }, [isOpen, stopCamera]);

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
      setMode('preview');
      stopCamera();
    } catch (err) {
      console.warn('Failed to capture frame:', err);
    }
  };

  // Handle local file upload
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input so user can pick the same file again if they retake
    e.target.value = '';

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select an image file (JPEG, PNG, WEBP, etc.)');
      return;
    }

    setErrorMessage(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      // Scale / compress image to max 1920px (JPEG 0.85) to ensure instant upload
      const img = new Image();
      img.onload = () => {
        try {
          const maxDim = 1920;
          let width = img.width;
          let height = img.height;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            setCapturedImage(compressedDataUrl);
            setMode('preview');
            stopCamera();
          } else {
            setCapturedImage(rawDataUrl);
            setMode('preview');
            stopCamera();
          }
        } catch {
          setCapturedImage(rawDataUrl);
          setMode('preview');
          stopCamera();
        }
      };
      img.onerror = () => {
        setCapturedImage(rawDataUrl);
        setMode('preview');
        stopCamera();
      };
      img.src = rawDataUrl;
    };
    reader.onerror = () => {
      setErrorMessage('Failed to read image file from local device.');
    };
    reader.readAsDataURL(file);
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
    setMode('choose');
  };

  const handleClose = () => {
    stopCamera();
    setCapturedImage(null);
    setErrorMessage(null);
    setIsUploading(false);
    setMode('choose');
    onClose();
  };

  // Mobile & Desktop Panic Interceptor: Hardware buttons (Volume, Power, Back) or Screen Lock closes camera
  useEffect(() => {
    if (!isOpen) return;

    const handlePanic = (e: KeyboardEvent) => {
      if (isPanicKeyEvent(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleClose();
      }
    };

    const handleVisibility = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        handleClose();
      }
    };

    const handlePageHide = () => {
      handleClose();
    };

    window.addEventListener('keydown', handlePanic, true);
    window.addEventListener('keyup', handlePanic, true);
    document.addEventListener('visibilitychange', handleVisibility, true);
    window.addEventListener('pagehide', handlePageHide, true);

    return () => {
      window.removeEventListener('keydown', handlePanic, true);
      window.removeEventListener('keyup', handlePanic, true);
      document.removeEventListener('visibilitychange', handleVisibility, true);
      window.removeEventListener('pagehide', handlePageHide, true);
    };
  }, [isOpen, stopCamera, onClose]);

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

          <div className="flex items-center space-x-1">
            {mode === 'camera' && (
              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  setMode('choose');
                }}
                className="px-2 py-0.5 rounded text-[11px] font-medium opacity-70 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors flex items-center space-x-1"
                title="Back to source selection"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
              title="Cancel"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Hidden native file input for local uploads */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* STATE 1: Choose Source Mode (Ask: Open Camera or Upload from Local) */}
        {mode === 'choose' && (
          <div className="p-5 sm:p-6 flex flex-col items-center justify-center select-none">
            <div className="text-center space-y-1 mb-5">
              <h3 className="font-semibold text-sm sm:text-base tracking-tight">
                Select Exhibit Source
              </h3>
              <p className="text-[11px] sm:text-xs opacity-65 max-w-xs">
                Choose how to attach your confidential view-once document snap:
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 w-full max-w-sm">
              {/* Option 1: Open Camera */}
              <button
                type="button"
                onClick={() => setMode('camera')}
                className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all cursor-pointer group text-center ${
                  darkMode
                    ? 'border-[#334155] hover:border-[#0078d4] bg-[#0f172a]/50 hover:bg-[#0078d4]/10'
                    : 'border-[#e2e8f0] hover:border-[#0078d4] bg-[#f8fafc] hover:bg-[#0078d4]/5'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-[#0078d4]/10 text-[#0078d4] flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                  <Camera className="w-6 h-6" />
                </div>
                <span className="font-semibold text-xs sm:text-sm block">
                  Open Camera
                </span>
                <span className="text-[10.5px] opacity-60 block mt-0.5 leading-snug">
                  Take a live photo with device camera
                </span>
              </button>

              {/* Option 2: Upload from Local */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center p-4 rounded-xl border-2 transition-all cursor-pointer group text-center ${
                  darkMode
                    ? 'border-[#334155] hover:border-emerald-500 bg-[#0f172a]/50 hover:bg-emerald-500/10'
                    : 'border-[#e2e8f0] hover:border-emerald-600 bg-[#f8fafc] hover:bg-emerald-600/5'
                }`}
              >
                <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-2.5 group-hover:scale-110 transition-transform">
                  <Upload className="w-6 h-6" />
                </div>
                <span className="font-semibold text-xs sm:text-sm block">
                  Upload from Local
                </span>
                <span className="text-[10.5px] opacity-60 block mt-0.5 leading-snug">
                  Choose photo from device or gallery
                </span>
              </button>
            </div>

            {errorMessage && (
              <div className="mt-4 p-2 rounded bg-rose-900/90 text-rose-100 text-xs flex items-center space-x-1.5 shadow-md max-w-sm w-full">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span className="truncate">{errorMessage}</span>
              </div>
            )}

            <div className="mt-5 flex items-center space-x-1.5 text-[10.5px] opacity-60">
              <Shield className="w-3.5 h-3.5 text-amber-500" />
              <span>Delivered view-once • Sender locked after sending</span>
            </div>
          </div>
        )}

        {/* STATE 2: Camera Viewfinder Mode */}
        {mode === 'camera' && (
          <>
            <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
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

              {/* Error notice with fallback button */}
              {errorMessage && (
                <div className="absolute inset-0 p-4 bg-black/85 flex flex-col items-center justify-center text-center space-y-3 z-20">
                  <AlertCircle className="w-8 h-8 text-rose-400" />
                  <span className="text-xs text-rose-200 max-w-xs">{errorMessage}</span>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[#0078d4] text-white flex items-center space-x-1.5 cursor-pointer shadow hover:bg-[#106ebe]"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Upload from Local Instead</span>
                  </button>
                </div>
              )}

              {/* Viewfinder Controls */}
              {cameraActive && (
                <div className="absolute top-2 right-2 flex items-center space-x-1.5 z-10">
                  {/* Upload Local shortcut right from camera */}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors shadow flex items-center space-x-1 text-[11px] px-2.5"
                    title="Upload image from local storage"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Upload</span>
                  </button>
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

            {/* Bottom Actions Bar for Camera */}
            <div
              className={`p-3 border-t flex items-center justify-between select-none ${
                darkMode ? 'bg-[#0f172a]/60 border-[#334155]' : 'bg-[#f8fafc] border-[#e2e8f0]'
              }`}
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs opacity-75 hover:opacity-100 flex items-center space-x-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Local</span>
              </button>

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
          </>
        )}

        {/* STATE 3: Preview Mode (Photo Taken or Local Image Selected) */}
        {mode === 'preview' && capturedImage && (
          <>
            <div className="relative w-full aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
              <img
                src={capturedImage}
                alt="Snap Preview"
                className="w-full h-full object-contain select-none"
              />

              {errorMessage && (
                <div className="absolute top-2 left-2 right-2 p-2 rounded bg-rose-900/90 text-rose-100 text-xs flex items-center space-x-1.5 shadow-md">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span className="truncate">{errorMessage}</span>
                </div>
              )}

              {/* Security badge */}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-xs text-[10px] text-amber-300 flex items-center space-x-1 shadow select-none">
                <Shield className="w-3 h-3" />
                <span>View-Once • Burn on Slide</span>
              </div>
            </div>

            {/* Bottom Actions Bar for Preview */}
            <div
              className={`p-3 border-t flex items-center justify-between select-none ${
                darkMode ? 'bg-[#0f172a]/60 border-[#334155]' : 'bg-[#f8fafc] border-[#e2e8f0]'
              }`}
            >
              <button
                type="button"
                onClick={handleRetake}
                disabled={isUploading}
                className="px-3 py-1.5 rounded-md text-xs font-medium border opacity-75 hover:opacity-100 transition-colors cursor-pointer disabled:opacity-30"
              >
                Choose Another
              </button>

              <div className="text-[11px] opacity-60 hidden sm:block">
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
            </div>
          </>
        )}
      </div>
    </div>
  );
};
