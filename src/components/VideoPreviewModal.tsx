'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  X,
  Eye,
  Camera,
  RefreshCw,
  PhoneOff,
  Shield,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { WebRTCSignal } from '@/lib/chatStore';

interface VideoPreviewModalProps {
  isOpen: boolean;
  isInitiator: boolean;
  currentAuthorId: string; // 'author-1' | 'author-2'
  peerAuthorName: string;
  roomId: string;
  onClose: () => void;
  sendSignal: (type: WebRTCSignal['type'], data?: unknown) => Promise<void>;
  registerSignalListener: (listener: (sig: WebRTCSignal) => void) => () => void;
  onPanicCutAndWipe?: () => void;
  darkMode?: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  isOpen,
  isInitiator,
  currentAuthorId,
  peerAuthorName,
  onClose,
  sendSignal,
  registerSignalListener,
  onPanicCutAndWipe,
  darkMode = false,
}) => {
  const [status, setStatusState] = useState<'requesting' | 'connecting' | 'connected' | 'ended' | 'error'>(
    isInitiator ? 'requesting' : 'connecting'
  );
  const statusRef = useRef(status);
  const setStatus = useCallback((s: 'requesting' | 'connecting' | 'connected' | 'ended' | 'error') => {
    statusRef.current = s;
    setStatusState(s);
  }, []);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [isFullScreen, setIsFullScreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const isCleaningUpRef = useRef<boolean>(false);
  const iceCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const hasCreatedOfferRef = useRef<boolean>(false);
  const hasAnsweredRef = useRef<boolean>(false);

  const sendSignalRef = useRef(sendSignal);
  sendSignalRef.current = sendSignal;

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const isInitiatorRef = useRef(isInitiator);
  isInitiatorRef.current = isInitiator;

  const onPanicCutAndWipeRef = useRef(onPanicCutAndWipe);
  onPanicCutAndWipeRef.current = onPanicCutAndWipe;

  // Safely stop all hardware camera tracks and close connection
  const stopAllMedia = useCallback(() => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      localStreamRef.current = null;
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch {
        // ignore
      }
      pcRef.current = null;
    }
  }, []);

  const handleEndPreview = useCallback(() => {
    try {
      sendSignalRef.current('preview-end');
    } catch {
      // ignore
    }
    stopAllMedia();
    onCloseRef.current();
  }, [stopAllMedia]);

  // Start local camera (video only, STRICTLY audio: false)
  const startCamera = useCallback(async (mode: 'user' | 'environment'): Promise<MediaStream | null> => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      // Normal quality 640x480 video with strict 0 audio (visual preview only)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: mode,
        },
        audio: false, // NO sound or microphone
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        localVideoRef.current.play().catch(() => {});
      }
      return stream;
    } catch (err) {
      console.error('Camera access error:', err);
      setErrorMessage('Could not access camera. Please allow camera permission.');
      setStatus('error');
      return null;
    }
  }, [setStatus]);

  // Initialize WebRTC Peer Connection
  const initPeerConnection = useCallback((stream: MediaStream) => {
    if (pcRef.current) {
      try {
        pcRef.current.close();
      } catch {
        // ignore
      }
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    pcRef.current = pc;

    // Add local video track
    stream.getVideoTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Handle remote track
    pc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        const remoteStream = event.streams[0];
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
          remoteVideoRef.current.muted = true;
          remoteVideoRef.current.playsInline = true;
          remoteVideoRef.current.play().catch(() => {});
        }
        setStatus('connected');
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalRef.current('candidate', event.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        setStatus('connected');
      } else if (state === 'failed') {
        setStatus('ended');
      }
    };

    return pc;
  }, [setStatus]);

  // Direct signal processor
  const processSignal = useCallback(async (sig: WebRTCSignal) => {
    const pc = pcRef.current;
    if (!pc) return;
    const { type, data } = sig;

    try {
      if (type === 'preview-accept') {
        // Peer accepted our invite! Offerer creates SDP offer
        if (isInitiatorRef.current && pc.signalingState === 'stable' && !hasCreatedOfferRef.current) {
          hasCreatedOfferRef.current = true;
          setStatus('connecting');
          const offer = await pc.createOffer({
            offerToReceiveVideo: true,
            offerToReceiveAudio: false,
          });
          await pc.setLocalDescription(offer);
          await sendSignalRef.current('offer', offer);
        }
      } else if (type === 'offer') {
        // Peer sent offer: set remote description and create answer
        if (!isInitiatorRef.current && pc.signalingState === 'stable' && !hasAnsweredRef.current) {
          hasAnsweredRef.current = true;
          setStatus('connecting');
          const sessionDesc = new RTCSessionDescription(data as RTCSessionDescriptionInit);
          await pc.setRemoteDescription(sessionDesc);

          // Drain queued ICE candidates
          while (iceCandidatesQueueRef.current.length > 0) {
            const cand = iceCandidatesQueueRef.current.shift();
            if (cand) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }

          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignalRef.current('answer', answer);
        }
      } else if (type === 'answer') {
        // Initiator received answer: set remote description
        if (isInitiatorRef.current && pc.signalingState === 'have-local-offer') {
          const sessionDesc = new RTCSessionDescription(data as RTCSessionDescriptionInit);
          await pc.setRemoteDescription(sessionDesc);

          // Drain queued ICE candidates
          while (iceCandidatesQueueRef.current.length > 0) {
            const cand = iceCandidatesQueueRef.current.shift();
            if (cand) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }
        }
      } else if (type === 'candidate') {
        if (data) {
          const candInit = data as RTCIceCandidateInit;
          if (pc.remoteDescription && pc.remoteDescription.type) {
            await pc.addIceCandidate(new RTCIceCandidate(candInit)).catch(() => {});
          } else {
            iceCandidatesQueueRef.current.push(candInit);
          }
        }
      } else if (type === 'preview-decline' || type === 'preview-end') {
        stopAllMedia();
        onCloseRef.current();
      }
    } catch (err) {
      console.error('Error processing WebRTC signal:', err);
    }
  }, [setStatus, stopAllMedia]);

  // Main lifecycle: starts camera once on open and tears down strictly on close
  useEffect(() => {
    if (!isOpen) return;

    isCleaningUpRef.current = false;
    hasCreatedOfferRef.current = false;
    hasAnsweredRef.current = false;
    iceCandidatesQueueRef.current = [];

    let isMounted = true;
    let inviteInterval: NodeJS.Timeout | null = null;

    // Direct listener registration (no React tree re-renders or camera restarts)
    const unregisterListener = registerSignalListener((sig) => {
      if (isMounted) {
        processSignal(sig);
      }
    });

    const setup = async () => {
      const stream = await startCamera(facingMode);
      if (!stream || !isMounted) return;

      const pc = initPeerConnection(stream);

      if (isInitiatorRef.current) {
        setStatus('requesting');
        await sendSignalRef.current('preview-invite');

        // Re-send preview-invite every 2.5s (up to 12 times = 30s) while waiting for peer response
        let retries = 0;
        inviteInterval = setInterval(() => {
          if (!isMounted || retries >= 12 || statusRef.current !== 'requesting') {
            if (inviteInterval) clearInterval(inviteInterval);
            return;
          }
          retries++;
          sendSignalRef.current('preview-invite').catch(() => {});
        }, 2500);
      } else {
        setStatus('connecting');
        await sendSignalRef.current('preview-accept');
      }

      // Flush any queued ICE candidates if remote desc ready
      if (pc.remoteDescription) {
        while (iceCandidatesQueueRef.current.length > 0) {
          const candidate = iceCandidatesQueueRef.current.shift();
          if (candidate) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          }
        }
      }
    };

    setup();

    // Panic key handler: Windows key, Ctrl, Fn, Alt, Escape immediately cuts video call, wipes room and logs out
    const isPanicKey = (e: KeyboardEvent): boolean => {
      const key = e.key;
      const code = e.code;
      return (
        key === 'Meta' ||
        key === 'OS' ||
        code === 'MetaLeft' ||
        code === 'MetaRight' ||
        key === 'Control' ||
        code === 'ControlLeft' ||
        code === 'ControlRight' ||
        key === 'Alt' ||
        code === 'AltLeft' ||
        code === 'AltRight' ||
        key === 'Fn' ||
        key === 'FnLock' ||
        code === 'Fn' ||
        code === 'FnLock' ||
        key === 'Escape' ||
        code === 'Escape' ||
        e.ctrlKey ||
        e.altKey ||
        e.metaKey
      );
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (isPanicKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleEndPreview();
        if (onPanicCutAndWipeRef.current) {
          onPanicCutAndWipeRef.current();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, true);

    return () => {
      isMounted = false;
      if (inviteInterval) {
        clearInterval(inviteInterval);
      }
      unregisterListener();
      window.removeEventListener('keydown', handleKeyDown, true);
      stopAllMedia();
    };
  }, [isOpen]); // STABLE: strictly depends only on isOpen!

  // Flip mobile camera (front vs back) using seamless replaceTrack without renegotiation
  const toggleFacingMode = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    const newStream = await startCamera(nextMode);
    if (newStream && pcRef.current) {
      const newTrack = newStream.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && newTrack) {
        sender.replaceTrack(newTrack).catch(() => {});
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 backdrop-blur-[3px] p-2 sm:p-4 select-none animate-in fade-in duration-200"
      onDoubleClick={(e) => {
        // Double-click outside modal instantly closes
        if (e.target === e.currentTarget) handleEndPreview();
      }}
    >
      {/* Centered mobile-fit screen frame on desktop */}
      <div
        className={`w-full ${
          isFullScreen
            ? 'max-w-md h-[95vh]'
            : 'max-w-[340px] sm:max-w-[365px] h-[580px] sm:h-[620px] max-h-[88vh]'
        } bg-[#1e1e1e] text-white rounded-2xl shadow-2xl border border-[#3e3e42] flex flex-col overflow-hidden transition-all duration-200`}
      >
        {/* Office Title Bar */}
        <div className="bg-[#185abd] text-white px-3 py-2 flex items-center justify-between shrink-0 shadow-sm">
          <div className="flex items-center space-x-2 min-w-0">
            <div className="w-5 h-5 bg-white/20 rounded flex items-center justify-center font-bold text-xs">
              W
            </div>
            <div className="flex items-center space-x-1.5 truncate">
              <span className="font-semibold text-xs truncate">
                Print Preview &bull; Visual Document Inspector
              </span>
              <span className="text-[10px] text-white/70 hidden sm:inline">
                ({currentAuthorId === 'author-2' ? 'Author 2' : 'Author 1'})
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            <button
              onClick={() => setIsFullScreen((prev) => !prev)}
              title={isFullScreen ? 'Exit full screen' : 'Full screen'}
              className="p-1 hover:bg-white/20 rounded transition text-white/90 cursor-pointer hidden sm:block"
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleEndPreview}
              title="Close Preview (Esc)"
              className="p-1 hover:bg-red-600 rounded transition text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Video Canvas Container */}
        <div className="relative flex-1 bg-black min-h-[300px] sm:min-h-[380px] flex items-center justify-center overflow-hidden">
          {/* Main Remote Video feed (The other author) */}
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover transition-opacity duration-300 ${
              status === 'connected' ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Fallback / Loading Status Overlay */}
          {status !== 'connected' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-white/90 p-4 text-center space-y-3 z-10 bg-black/80">
              <div className="w-12 h-12 rounded-full bg-[#185abd]/30 border border-[#185abd] flex items-center justify-center text-blue-300 animate-pulse">
                <Eye className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <p className="text-xs sm:text-sm font-semibold tracking-wide">
                  {status === 'requesting'
                    ? `Waiting for ${peerAuthorName} to accept preview...`
                    : status === 'connecting'
                    ? 'Establishing smooth direct peer-to-peer visual stream...'
                    : status === 'error'
                    ? errorMessage || 'Camera preview error'
                    : 'Preview ended'}
                </p>
                <p className="text-[11px] text-white/60">
                  Strictly muted visual preview &bull; 0 audio &bull; No notifications
                </p>
              </div>

              {status === 'requesting' && (
                <div className="pt-2">
                  <span className="text-[10px] bg-white/10 px-2 py-1 rounded text-white/80 animate-pulse">
                    Request sent to {peerAuthorName}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Picture-in-Picture Local Video (Self) in Corner */}
          <div className="absolute top-3 right-3 w-20 sm:w-24 h-28 sm:h-34 rounded-xl overflow-hidden border border-white/30 shadow-lg z-20 bg-black/80 group">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]" // mirror self video
            />
            <div className="absolute bottom-1 left-1.5 text-[8px] font-semibold text-white/90 bg-black/60 px-1 py-0.2 rounded select-none">
              You ({currentAuthorId === 'author-2' ? 'Author 2' : 'Author 1'})
            </div>
          </div>

          {/* Top Left Stealth Badge */}
          <div className="absolute top-3 left-3 flex items-center space-x-1.5 bg-black/60 backdrop-blur-xs text-white/90 px-2 py-1 rounded text-[10px] z-20">
            <span
              className={`w-2 h-2 rounded-full ${
                status === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="font-medium">
              {status === 'connected' ? `${peerAuthorName} (Live)` : 'Visual Channel'}
            </span>
            <span className="text-white/50 text-[9px] border-l border-white/20 pl-1.5">Muted</span>
          </div>
        </div>

        {/* Office Footer Control Toolbar */}
        <div
          className={`px-4 py-2.5 flex items-center justify-between border-t text-xs select-none ${
            darkMode ? 'bg-[#2b2b2b] border-[#3e3e42] text-white/80' : 'bg-[#f3f2f1] border-[#c8c6c4] text-[#323130]'
          }`}
        >
          <div className="flex items-center space-x-2 text-[11px] text-[#605e5c] dark:text-[#a19f9d]">
            <Shield className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">Normal Quality P2P Stream &bull; Esc to close</span>
          </div>

          <div className="flex items-center space-x-2">
            {/* Camera switch for mobile / multi-camera devices */}
            <button
              onClick={toggleFacingMode}
              title="Switch Camera"
              className="p-1.5 hover:bg-black/10 dark:hover:bg-white/10 rounded transition text-[#605e5c] dark:text-white/80 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* End Preview Button */}
            <button
              onClick={handleEndPreview}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-xs font-semibold flex items-center space-x-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>End Preview</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
