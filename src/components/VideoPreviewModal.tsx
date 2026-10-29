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
  AlertTriangle,
  FlipHorizontal,
  SwitchCamera,
} from 'lucide-react';
import { WebRTCSignal } from '@/lib/chatStore';
import { isPanicKeyEvent } from '@/lib/panicUtils';

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
  peerTyping?: boolean;
  darkMode?: boolean;
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
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
  peerTyping = false,
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
  const [isLocalMirrored, setIsLocalMirrored] = useState<boolean>(true); // Front camera starts mirrored, back camera starts unmirrored
  const [isRemoteMirrored, setIsRemoteMirrored] = useState<boolean>(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const isCleaningUpRef = useRef<boolean>(false);
  const iceCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const hasCreatedOfferRef = useRef<boolean>(false);
  const hasAnsweredRef = useRef<boolean>(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const sendSignalRef = useRef(sendSignal);
  const onCloseRef = useRef(onClose);
  const isInitiatorRef = useRef(isInitiator);
  const onPanicCutAndWipeRef = useRef(onPanicCutAndWipe);

  // Keep screen and hardware decoder awake to prevent mobile OS battery-saver freeze
  const acquireWakeLock = useCallback(async () => {
    try {
      if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && !wakeLockRef.current) {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const releaseWakeLock = useCallback(() => {
    try {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    sendSignalRef.current = sendSignal;
    onCloseRef.current = onClose;
    isInitiatorRef.current = isInitiator;
    onPanicCutAndWipeRef.current = onPanicCutAndWipe;
  });

  // Safely stop all hardware camera tracks and close connection
  const stopAllMedia = useCallback(() => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    releaseWakeLock();

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
      localVideoRef.current.pause();
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.pause();
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
  }, [releaseWakeLock]);

  const handleEndPreview = useCallback(() => {
    try {
      sendSignalRef.current('preview-end');
    } catch {
      // ignore
    }
    stopAllMedia();
    onCloseRef.current();
  }, [stopAllMedia]);

  const handleEndAll = useCallback(() => {
    handleEndPreview();
    if (onPanicCutAndWipeRef.current) {
      onPanicCutAndWipeRef.current();
    }
  }, [handleEndPreview]);

  // Start local camera (supports all mobile and laptop cameras with universal fallback)
  const startCamera = useCallback(async (mode: 'user' | 'environment'): Promise<MediaStream | null> => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 },
            facingMode: { ideal: mode },
          },
          audio: false, // NO sound or microphone
        });
      } catch {
        // Universal fallback: handles cameras that reject resolution or framerate constraints
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

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

  // Initialize WebRTC Peer Connection with auto-recovery
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

    // Handle remote track with robust fallback
    pc.ontrack = (event) => {
      let remoteStream = event.streams && event.streams[0];
      if (!remoteStream) {
        remoteStream = new MediaStream([event.track]);
      }
      if (remoteVideoRef.current) {
        if (remoteVideoRef.current.srcObject !== remoteStream) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
        remoteVideoRef.current.muted = true;
        remoteVideoRef.current.playsInline = true;
        remoteVideoRef.current.play().catch(() => {});
      }
      setStatus('connected');

      // Auto-resume playback if track gets unmuted after temporary packet drop
      event.track.onunmute = () => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play().catch(() => {});
        }
      };
    };

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalRef.current('candidate', event.candidate.toJSON());
      }
    };

    // Auto-reconnect watchdog on ICE connection state change
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        setStatus('connected');
      } else if (state === 'disconnected') {
        // Temporary network hiccup: auto-kick video element to resume playing
        if (remoteVideoRef.current) {
          remoteVideoRef.current.play().catch(() => {});
        }
      } else if (state === 'failed') {
        // Auto-recover via ICE restart if initiator
        if (isInitiatorRef.current && pc.signalingState !== 'closed') {
          pc.createOffer({ iceRestart: true })
            .then((offer) => pc.setLocalDescription(offer).then(() => sendSignalRef.current('offer', offer)))
            .catch(() => setStatus('ended'));
        }
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
        if (isInitiatorRef.current) {
          if (pc.signalingState === 'stable' && !hasCreatedOfferRef.current) {
            hasCreatedOfferRef.current = true;
            setStatus('connecting');
            const offer = await pc.createOffer({
              offerToReceiveVideo: true,
              offerToReceiveAudio: false,
            });
            await pc.setLocalDescription(offer);
            await sendSignalRef.current('offer', offer);
          } else if (pc.signalingState === 'have-local-offer' && pc.localDescription) {
            // Re-send existing offer so answerer is guaranteed to receive it
            await sendSignalRef.current('offer', pc.localDescription);
          }
        }
      } else if (type === 'offer') {
        // Peer sent offer: set remote description and create answer
        if (!isInitiatorRef.current) {
          if (pc.signalingState === 'stable' && !hasAnsweredRef.current) {
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
          } else if (hasAnsweredRef.current && pc.localDescription) {
            // Re-send existing answer so initiator is guaranteed to receive it
            await sendSignalRef.current('answer', pc.localDescription);
          }
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

  const processSignalRef = useRef(processSignal);
  processSignalRef.current = processSignal;

  const startCameraRef = useRef(startCamera);
  startCameraRef.current = startCamera;

  const initPeerConnectionRef = useRef(initPeerConnection);
  initPeerConnectionRef.current = initPeerConnection;

  const stopAllMediaRef = useRef(stopAllMedia);
  stopAllMediaRef.current = stopAllMedia;

  const acquireWakeLockRef = useRef(acquireWakeLock);
  acquireWakeLockRef.current = acquireWakeLock;

  const registerSignalListenerRef = useRef(registerSignalListener);
  registerSignalListenerRef.current = registerSignalListener;

  // Main lifecycle: starts camera once on open and tears down strictly on close
  useEffect(() => {
    if (!isOpen) return;

    isCleaningUpRef.current = false;
    hasCreatedOfferRef.current = false;
    hasAnsweredRef.current = false;
    iceCandidatesQueueRef.current = [];

    let isMounted = true;
    let inviteInterval: NodeJS.Timeout | null = null;
    let acceptInterval: NodeJS.Timeout | null = null;

    // Keep screen awake while preview is open
    acquireWakeLockRef.current();

    // Anti-freeze watchdog: Checks every 2.5s if remote video paused or got stuck on a frame
    let lastVideoTime = -1;
    let stuckCount = 0;
    const watchdogInterval = setInterval(() => {
      if (!isMounted || statusRef.current !== 'connected') return;

      const videoEl = remoteVideoRef.current;
      if (!videoEl) return;

      // 1. If video paused unexpectedly (due to browser throttle or sleep), resume it
      if (videoEl.paused) {
        videoEl.play().catch(() => {});
      }

      // 2. Check if video playback is frozen on the same timestamp
      if (videoEl.currentTime > 0) {
        if (videoEl.currentTime === lastVideoTime) {
          stuckCount++;
          // Stuck for > 5 seconds: force kick video playback
          if (stuckCount >= 2) {
            videoEl.play().catch(() => {});
            if (pcRef.current) {
              const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
              if (sender?.track) {
                sender.track.enabled = true;
              }
            }
          }
        } else {
          lastVideoTime = videoEl.currentTime;
          stuckCount = 0;
        }
      }
    }, 2500);

    // Direct listener registration (no React tree re-renders or camera restarts)
    const unregisterListener = registerSignalListenerRef.current((sig) => {
      if (isMounted) {
        processSignalRef.current(sig);
      }
    });

    const setup = async () => {
      const stream = await startCameraRef.current(facingMode);
      if (!stream || !isMounted) return;

      const pc = initPeerConnectionRef.current(stream);

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

        // Re-send preview-accept every 1.5s while waiting for offer so offerer never misses it
        let acceptRetries = 0;
        acceptInterval = setInterval(() => {
          if (!isMounted || acceptRetries >= 10 || statusRef.current === 'connected' || hasAnsweredRef.current) {
            if (acceptInterval) clearInterval(acceptInterval);
            return;
          }
          acceptRetries++;
          sendSignalRef.current('preview-accept').catch(() => {});
        }, 1500);
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

    // Panic key handler: Mobile Volume buttons, Power, Android Back, Headset, Windows, Ctrl, Fn, Alt, Esc
    const handlePanic = (e: KeyboardEvent) => {
      if (isPanicKeyEvent(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleEndPreview();
        if (onPanicCutAndWipeRef.current) {
          onPanicCutAndWipeRef.current();
        }
      }
    };

    // Mobile Screen Lock & Background Panic Interceptor (Screen off / sleep / tab hidden)
    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        handleEndPreview();
        if (onPanicCutAndWipeRef.current) {
          onPanicCutAndWipeRef.current();
        }
      }
    };

    const handlePageHide = () => {
      handleEndPreview();
      if (onPanicCutAndWipeRef.current) {
        onPanicCutAndWipeRef.current();
      }
    };

    // MediaSession hardware call / bluetooth headset button interceptor
    const mediaActions: MediaSessionAction[] = [
      'hangup' as MediaSessionAction,
      'stop',
      'pause',
    ];
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const onMediaPanic = () => {
        handleEndPreview();
        if (onPanicCutAndWipeRef.current) {
          onPanicCutAndWipeRef.current();
        }
      };
      mediaActions.forEach((act) => {
        try {
          navigator.mediaSession.setActionHandler(act, onMediaPanic);
        } catch {}
      });
    }

    window.addEventListener('keydown', handlePanic, true);
    window.addEventListener('keyup', handlePanic, true);
    document.addEventListener('visibilitychange', handleVisibilityChange, true);
    window.addEventListener('pagehide', handlePageHide, true);

    return () => {
      isMounted = false;
      if (inviteInterval) {
        clearInterval(inviteInterval);
      }
      if (acceptInterval) {
        clearInterval(acceptInterval);
      }
      clearInterval(watchdogInterval);
      unregisterListener();
      window.removeEventListener('keydown', handlePanic, true);
      window.removeEventListener('keyup', handlePanic, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      window.removeEventListener('pagehide', handlePageHide, true);
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        mediaActions.forEach((act) => {
          try {
            navigator.mediaSession.setActionHandler(act, null);
          } catch {}
        });
      }
      stopAllMediaRef.current();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // STABLE: strictly depends only on isOpen!

  // Flip mobile camera (front vs back) using seamless replaceTrack without renegotiation
  const toggleFacingMode = async () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    // Back camera should NEVER be mirrored! Front camera mirrors by default
    setIsLocalMirrored(nextMode === 'user');
    const newStream = await startCamera(nextMode);
    if (newStream && pcRef.current) {
      const newTrack = newStream.getVideoTracks()[0];
      const sender = pcRef.current.getSenders().find((s) => s.track?.kind === 'video');
      if (sender && newTrack) {
        await sender.replaceTrack(newTrack).catch(() => {});
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
                Office Document Optical Scanner &bull; Print Preview
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handleEndAll}
              title="Reset Scanner, Discard Cache & Lock Document"
              className="px-2 py-0.5 bg-red-600/90 hover:bg-red-700 active:bg-red-800 text-white rounded text-[11px] font-bold flex items-center space-x-1 transition shadow-xs cursor-pointer border border-red-400/40"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Reset Scanner</span>
            </button>
            <button
              onClick={() => setIsFullScreen((prev) => !prev)}
              title={isFullScreen ? 'Exit full screen' : 'Full screen'}
              className="p-1 hover:bg-white/20 rounded transition text-white/90 cursor-pointer hidden sm:block"
            >
              {isFullScreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleEndPreview}
              title="Close Scanner (Esc)"
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
            onWaiting={() => remoteVideoRef.current?.play().catch(() => {})}
            onStalled={() => remoteVideoRef.current?.play().catch(() => {})}
            className={`w-full h-full object-cover transition-all duration-300 ${
              isRemoteMirrored ? 'scale-x-[-1]' : 'scale-x-100'
            } ${status === 'connected' ? 'opacity-100' : 'opacity-0'}`}
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
                    ? 'Waiting for collaborator to connect scanner...'
                    : status === 'connecting'
                    ? 'Calibrating optical document stream...'
                    : status === 'error'
                    ? errorMessage || 'Optical scanner error'
                    : 'Scanner session closed'}
                </p>
                <p className="text-[11px] text-white/60">
                  Optical document inspection stream &bull; Muted &bull; Secure peer-to-peer
                </p>
              </div>

              {status === 'requesting' && (
                <div className="pt-2">
                  <span className="text-[10px] bg-white/10 px-2 py-1 rounded text-white/80 animate-pulse">
                    Scan request sent to collaborator
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Picture-in-Picture Local Video (Self) in Corner */}
          <div className="absolute top-3 right-3 w-20 sm:w-28 h-28 sm:h-38 rounded-xl overflow-hidden border border-white/30 shadow-lg z-20 bg-black/80 group">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transition-transform duration-200 ${
                isLocalMirrored ? 'scale-x-[-1]' : 'scale-x-100'
              }`}
            />
            {/* Quick mirror toggle button in PiP corner */}
            <div className="absolute top-1 right-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsLocalMirrored((prev) => !prev);
                }}
                title={isLocalMirrored ? 'Disable Mirror (Normal View)' : 'Enable Mirror View'}
                className="p-1 bg-black/70 hover:bg-black text-white rounded-md text-[9px] cursor-pointer shadow-xs border border-white/20"
              >
                <FlipHorizontal className="w-3 h-3" />
              </button>
            </div>
            <div className="absolute bottom-1 left-1.5 right-1.5 flex items-center justify-between text-[8px] font-semibold text-white/90 bg-black/60 px-1 py-0.5 rounded select-none">
              <span className="truncate">Local</span>
              <span className="text-[7.5px] text-emerald-300 font-mono">
                {facingMode === 'environment' ? 'Back' : 'Front'}
              </span>
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
              {status === 'connected' ? 'Optical Feed (Active)' : 'Standby'}
            </span>
            <span className="text-white/50 text-[9px] border-l border-white/20 pl-1.5">Muted</span>
          </div>

          {/* Peer Drafting Presence Flag Overlay */}
          {peerTyping && (
            <div className="absolute bottom-3 left-3 flex items-center space-x-2 bg-black/85 backdrop-blur-xs text-white/95 px-2.5 py-1 rounded-full text-[10px] font-medium z-20 border border-emerald-500/50 shadow-lg animate-in fade-in duration-150">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span className="italic">Collaborator drafting revision...</span>
            </div>
          )}
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

          <div className="flex items-center space-x-1.5 sm:space-x-2">
            {/* Camera switch for mobile / multi-camera devices */}
            <button
              onClick={toggleFacingMode}
              title={facingMode === 'user' ? 'Switch to Back Camera (Normal orientation)' : 'Switch to Front Camera'}
              className="px-2 py-1.5 bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 rounded transition text-[#605e5c] dark:text-white/80 flex items-center space-x-1 cursor-pointer"
            >
              <SwitchCamera className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">
                {facingMode === 'user' ? 'Front' : 'Back'}
              </span>
            </button>

            {/* Toggle Mirror for Local Camera */}
            <button
              onClick={() => setIsLocalMirrored((prev) => !prev)}
              title={isLocalMirrored ? 'Disable Mirroring (Normal View)' : 'Enable Mirroring'}
              className={`px-2 py-1.5 rounded transition flex items-center space-x-1 cursor-pointer ${
                isLocalMirrored
                  ? 'bg-blue-600/15 text-blue-600 dark:text-blue-400 border border-blue-500/30'
                  : 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#605e5c] dark:text-white/80'
              }`}
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              <span className="text-[11px] font-medium hidden sm:inline">
                {isLocalMirrored ? 'Mirror' : 'Normal'}
              </span>
            </button>

            {/* Flip Remote Video (Helpful when peer shows a document or text) */}
            {status === 'connected' && (
              <button
                onClick={() => setIsRemoteMirrored((prev) => !prev)}
                title="Flip peer video horizontally (useful to read paper or whiteboard)"
                className={`px-2 py-1.5 rounded transition flex items-center space-x-1 cursor-pointer ${
                  isRemoteMirrored
                    ? 'bg-amber-600/20 text-amber-700 dark:text-amber-400 border border-amber-500/40'
                    : 'bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 text-[#605e5c] dark:text-white/80'
                }`}
              >
                <FlipHorizontal className="w-3.5 h-3.5 rotate-180" />
                <span className="text-[11px] font-medium hidden md:inline">Flip Peer</span>
              </button>
            )}

            {/* End Call Only Button */}
            <button
              onClick={handleEndPreview}
              title="End visual preview only (keep messages)"
              className="px-2.5 py-1.5 bg-neutral-600 hover:bg-neutral-700 text-white rounded text-xs font-medium flex items-center space-x-1 shadow-xs transition-colors cursor-pointer"
            >
              <PhoneOff className="w-3.5 h-3.5" />
              <span>End Call</span>
            </button>

            {/* End All: Cut video, wipe all messages & logout */}
            <button
              onClick={handleEndAll}
              title="End All: Cut Video, Wipe All Messages, & Logout Immediately"
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded text-xs font-bold flex items-center space-x-1.5 shadow-md transition-all cursor-pointer border border-red-500/50 animate-pulse hover:animate-none"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-white" />
              <span>End All</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
