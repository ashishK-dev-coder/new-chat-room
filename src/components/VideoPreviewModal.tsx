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
  incomingSignal: WebRTCSignal | null;
  onClearIncomingSignal: () => void;
  darkMode?: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
};

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  isOpen,
  isInitiator,
  currentAuthorId,
  peerAuthorName,
  onClose,
  sendSignal,
  incomingSignal,
  onClearIncomingSignal,
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
      sendSignal('preview-end');
    } catch {
      // ignore
    }
    stopAllMedia();
    onClose();
  }, [sendSignal, stopAllMedia, onClose]);

  // Start local camera (video only, STRICTLY audio: false)
  const startCamera = useCallback(async (): Promise<MediaStream | null> => {
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
          facingMode: facingMode,
        },
        audio: false, // NO sound or microphone
      });

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(() => {});
      }
      return stream;
    } catch (err) {
      console.error('Camera access error:', err);
      setErrorMessage('Could not access camera. Please allow camera permission.');
      setStatus('error');
      return null;
    }
  }, [facingMode]);

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
      if (remoteVideoRef.current && event.streams && event.streams[0]) {
        remoteVideoRef.current.srcObject = event.streams[0];
        remoteVideoRef.current.play().catch(() => {});
        setStatus('connected');
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('candidate', event.candidate.toJSON());
      }
    };

    pc.oniceconnectionstatechange = () => {
      if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
        setStatus('connected');
      } else if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        setStatus('ended');
      }
    };

    return pc;
  }, [sendSignal]);

  // Main lifecycle: mount and start camera
  useEffect(() => {
    if (!isOpen) return;
    isCleaningUpRef.current = false;
    iceCandidatesQueueRef.current = [];

    let isMounted = true;
    let inviteInterval: NodeJS.Timeout | null = null;

    const setup = async () => {
      const stream = await startCamera();
      if (!stream || !isMounted) return;

      const pc = initPeerConnection(stream);

      if (isInitiator) {
        setStatus('requesting');
        // Send preview invite to peer immediately
        await sendSignal('preview-invite');

        // Re-send preview-invite every 2.5s (up to 12 times = 30s) while waiting for peer response
        let retries = 0;
        inviteInterval = setInterval(() => {
          if (!isMounted || retries >= 12 || statusRef.current !== 'requesting') {
            if (inviteInterval) clearInterval(inviteInterval);
            return;
          }
          retries++;
          sendSignal('preview-invite').catch(() => {});
        }, 2500);
      } else {
        setStatus('connecting');
        // Joining: notify initiator we accepted
        await sendSignal('preview-accept');
      }

      // Flush any queued ICE candidates once remote desc is ready
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

    // Panic key handler: Escape, Meta, or Window keys immediately closes preview
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Meta' || e.key === 'OS') {
        handleEndPreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      isMounted = false;
      if (inviteInterval) {
        clearInterval(inviteInterval);
      }
      window.removeEventListener('keydown', handleKeyDown);
      stopAllMedia();
    };
  }, [isOpen, isInitiator, startCamera, initPeerConnection, sendSignal, stopAllMedia, handleEndPreview, setStatus]);

  // Handle incoming signaling messages from peer
  useEffect(() => {
    if (!isOpen || !incomingSignal) return;

    const { type, data } = incomingSignal;
    const pc = pcRef.current;

    const handleSignal = async () => {
      try {
        if (type === 'preview-accept') {
          // Peer accepted our invite! We are the offerer: create SDP offer
          if (pc && isInitiator) {
            setStatus('connecting');
            const offer = await pc.createOffer({
              offerToReceiveVideo: true,
              offerToReceiveAudio: false,
            });
            await pc.setLocalDescription(offer);
            await sendSignal('offer', offer);
          }
        } else if (type === 'offer') {
          // Received offer from initiator: set remote description and create answer
          if (pc && data) {
            setStatus('connecting');
            const sessionDesc = new RTCSessionDescription(data as RTCSessionDescriptionInit);
            await pc.setRemoteDescription(sessionDesc);

            // Drain queued ICE candidates
            while (iceCandidatesQueueRef.current.length > 0) {
              const cand = iceCandidatesQueueRef.current.shift();
              if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            await sendSignal('answer', answer);
          }
        } else if (type === 'answer') {
          // Initiator received answer from peer
          if (pc && data) {
            const sessionDesc = new RTCSessionDescription(data as RTCSessionDescriptionInit);
            await pc.setRemoteDescription(sessionDesc);

            // Drain queued ICE candidates
            while (iceCandidatesQueueRef.current.length > 0) {
              const cand = iceCandidatesQueueRef.current.shift();
              if (cand) await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }
        } else if (type === 'candidate') {
          if (data) {
            const candInit = data as RTCIceCandidateInit;
            if (pc && pc.remoteDescription && pc.remoteDescription.type) {
              await pc.addIceCandidate(new RTCIceCandidate(candInit)).catch(() => {});
            } else {
              iceCandidatesQueueRef.current.push(candInit);
            }
          }
        } else if (type === 'preview-decline' || type === 'preview-end') {
          // Peer declined or ended preview
          stopAllMedia();
          onClose();
        }
      } catch (err) {
        console.error('Error handling WebRTC signal:', err);
      } finally {
        onClearIncomingSignal();
      }
    };

    handleSignal();
  }, [incomingSignal, isOpen, isInitiator, sendSignal, onClearIncomingSignal, stopAllMedia, onClose]);

  // Flip mobile camera (front vs back)
  const toggleFacingMode = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-[2px] p-2 sm:p-4 select-none animate-in fade-in duration-200"
      onDoubleClick={(e) => {
        // Double-click outside modal instantly closes
        if (e.target === e.currentTarget) handleEndPreview();
      }}
    >
      <div
        className={`w-full ${
          isFullScreen ? 'max-w-5xl h-[92vh]' : 'max-w-2xl'
        } bg-white dark:bg-[#1f1f1f] rounded-lg shadow-2xl border border-[#c8c6c4] dark:border-[#3e3e42] flex flex-col overflow-hidden transition-all duration-200`}
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
          <div className="absolute top-3 right-3 w-28 sm:w-36 aspect-[4/3] bg-black/80 rounded-md overflow-hidden border border-white/30 shadow-lg z-20 group">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover scale-x-[-1]" // mirror self video
            />
            <div className="absolute bottom-1 left-1.5 text-[8.5px] font-semibold text-white/90 bg-black/60 px-1 py-0.2 rounded select-none">
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
