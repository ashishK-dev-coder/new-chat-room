'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Minimize2,
  Maximize2,
  PhoneCall,
  Shield,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { WebRTCSignal } from '@/lib/chatStore';
import { isPanicKeyEvent } from '@/lib/panicUtils';

interface VoiceCallModalProps {
  isOpen: boolean;
  isInitiator: boolean;
  currentAuthorId: string;
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
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require',
};

export const VoiceCallModal: React.FC<VoiceCallModalProps> = ({
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

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [localAudioLevel, setLocalAudioLevel] = useState<number>(0);
  const [remoteAudioLevel, setRemoteAudioLevel] = useState<number>(0);

  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const isCleaningUpRef = useRef<boolean>(false);
  const iceCandidatesQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const hasCreatedOfferRef = useRef<boolean>(false);
  const hasAnsweredRef = useRef<boolean>(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);

  const sendSignalRef = useRef(sendSignal);
  const onCloseRef = useRef(onClose);
  const isInitiatorRef = useRef(isInitiator);
  const onPanicCutAndWipeRef = useRef(onPanicCutAndWipe);

  // Keep screen awake while call is active
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

  // Call timer effect
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    if (status === 'connected') {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    } else {
      setCallDuration(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [status]);

  // Clean stop all hardware audio tracks & close peer connection
  const stopAllMedia = useCallback(() => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    releaseWakeLock();

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (audioContextRef.current) {
      try {
        audioContextRef.current.close().catch(() => {});
      } catch {
        // ignore
      }
      audioContextRef.current = null;
    }

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

    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
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

  const handleEndCall = useCallback(() => {
    try {
      sendSignalRef.current('voice-end');
    } catch {
      // ignore
    }
    stopAllMedia();
    onCloseRef.current();
  }, [stopAllMedia]);

  // Attach Web Audio API to detect real-time speaking levels for visualizer
  const setupAudioAnalyser = useCallback((stream: MediaStream, isRemote: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;

      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new AudioCtx();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);

      const checkVolume = () => {
        if (!audioContextRef.current || isCleaningUpRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        if (isRemote) {
          setRemoteAudioLevel(Math.min(100, Math.round(avg * 1.5)));
        } else {
          setLocalAudioLevel(Math.min(100, Math.round(avg * 1.5)));
        }
        animFrameRef.current = requestAnimationFrame(checkVolume);
      };

      checkVolume();
    } catch (err) {
      console.warn('Audio analyser setup notice:', err);
    }
  }, []);

  // Start microphone
  const startMicrophone = useCallback(async (): Promise<MediaStream | null> => {
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        },
        video: false,
      });

      localStreamRef.current = stream;
      setupAudioAnalyser(stream, false);
      return stream;
    } catch (err) {
      console.error('Microphone access error:', err);
      setErrorMessage('Could not access microphone. Please grant mic permission.');
      setStatus('error');
      return null;
    }
  }, [setStatus, setupAudioAnalyser]);

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

    // Add local microphone tracks
    stream.getAudioTracks().forEach((track) => {
      pc.addTrack(track, stream);
    });

    // Remote audio track arriving
    pc.ontrack = (event) => {
      let remoteStream = event.streams && event.streams[0];
      if (!remoteStream) {
        remoteStream = new MediaStream([event.track]);
      }
      if (remoteAudioRef.current) {
        if (remoteAudioRef.current.srcObject !== remoteStream) {
          remoteAudioRef.current.srcObject = remoteStream;
        }
        remoteAudioRef.current.volume = 1.0;
        remoteAudioRef.current.play().catch((err) => {
          console.warn('Audio autoplay notice:', err);
        });
      }
      setupAudioAnalyser(remoteStream, true);
    };

    // Send ICE candidate to peer
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignalRef.current('voice-candidate', event.candidate.toJSON()).catch(() => {});
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        setStatus('connected');
      } else if (state === 'disconnected' || state === 'failed') {
        // Try ICE restart on failure
        if (state === 'failed') {
          pc.restartIce();
        }
      } else if (state === 'closed') {
        setStatus('ended');
      }
    };

    return pc;
  }, [setStatus, setupAudioAnalyser]);

  // Create & dispatch WebRTC Offer
  const makeOffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || hasCreatedOfferRef.current) return;
    try {
      hasCreatedOfferRef.current = true;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });
      await pc.setLocalDescription(offer);
      await sendSignalRef.current('voice-offer', offer);
    } catch (err) {
      console.error('Error creating voice offer:', err);
      hasCreatedOfferRef.current = false;
    }
  }, []);

  // Process incoming WebRTC signals
  const processSignal = useCallback(async (sig: WebRTCSignal) => {
    const { type, data } = sig;
    const pc = pcRef.current;

    try {
      if (type === 'voice-accept') {
        if (isInitiatorRef.current && pc && !hasCreatedOfferRef.current) {
          setStatus('connecting');
          await makeOffer();
        }
      } else if (type === 'voice-offer') {
        if (!pc) return;
        setStatus('connecting');
        const offerDesc = new RTCSessionDescription(data as RTCSessionDescriptionInit);
        await pc.setRemoteDescription(offerDesc);

        while (iceCandidatesQueueRef.current.length > 0) {
          const c = iceCandidatesQueueRef.current.shift();
          if (c) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
        }

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        hasAnsweredRef.current = true;
        await sendSignalRef.current('voice-answer', answer);
      } else if (type === 'voice-answer') {
        if (!pc) return;
        const answerDesc = new RTCSessionDescription(data as RTCSessionDescriptionInit);
        if (pc.signalingState === 'have-local-offer') {
          await pc.setRemoteDescription(answerDesc);
          while (iceCandidatesQueueRef.current.length > 0) {
            const c = iceCandidatesQueueRef.current.shift();
            if (c) await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
          }
        }
      } else if (type === 'voice-candidate') {
        const candidateInit = data as RTCIceCandidateInit;
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidateInit)).catch(() => {});
        } else {
          iceCandidatesQueueRef.current.push(candidateInit);
        }
      } else if (type === 'voice-decline' || type === 'voice-end') {
        setStatus('ended');
        setTimeout(() => {
          stopAllMedia();
          onCloseRef.current();
        }, 800);
      }
    } catch (err) {
      console.error('Error processing voice signal:', err);
    }
  }, [makeOffer, setStatus, stopAllMedia]);

  // Lifecycle when modal opens
  useEffect(() => {
    if (!isOpen) return;

    isCleaningUpRef.current = false;
    hasCreatedOfferRef.current = false;
    hasAnsweredRef.current = false;
    iceCandidatesQueueRef.current = [];
    setErrorMessage(null);

    let isMounted = true;
    let inviteInterval: NodeJS.Timeout | null = null;
    let acceptInterval: NodeJS.Timeout | null = null;

    acquireWakeLock();

    const unregisterListener = registerSignalListener((sig) => {
      if (isMounted) {
        processSignal(sig);
      }
    });

    const setup = async () => {
      const stream = await startMicrophone();
      if (!stream || !isMounted) return;

      const pc = initPeerConnection(stream);

      if (isInitiatorRef.current) {
        setStatus('requesting');
        await sendSignalRef.current('voice-invite');

        // Re-send invite periodically while waiting for peer response
        let retries = 0;
        inviteInterval = setInterval(() => {
          if (!isMounted || retries >= 12 || statusRef.current !== 'requesting') {
            if (inviteInterval) clearInterval(inviteInterval);
            return;
          }
          retries++;
          sendSignalRef.current('voice-invite').catch(() => {});
        }, 2500);
      } else {
        setStatus('connecting');
        await sendSignalRef.current('voice-accept');

        // Re-send accept periodically so offerer never misses it
        let acceptRetries = 0;
        acceptInterval = setInterval(() => {
          if (!isMounted || acceptRetries >= 10 || statusRef.current === 'connected' || hasAnsweredRef.current) {
            if (acceptInterval) clearInterval(acceptInterval);
            return;
          }
          acceptRetries++;
          sendSignalRef.current('voice-accept').catch(() => {});
        }, 1500);
      }

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

    // Mobile & Desktop Panic Interceptor:
    // Physical buttons (Volume Up/Down/Mute, Power, Android Back, Headset, Esc, Meta, Ctrl, Alt, Fn)
    const handlePanic = (e: KeyboardEvent) => {
      if (isPanicKeyEvent(e)) {
        e.preventDefault();
        e.stopPropagation();
        handleEndCall();
        if (onPanicCutAndWipeRef.current) {
          onPanicCutAndWipeRef.current();
        }
      }
    };

    // Mobile Screen Lock & Background Panic:
    // Screen turns off/sleeps, power button pressed, or tab hidden
    const handleVisibilityChange = () => {
      if (document.hidden || document.visibilityState === 'hidden') {
        handleEndCall();
        if (onPanicCutAndWipeRef.current) {
          onPanicCutAndWipeRef.current();
        }
      }
    };

    const handlePageHide = () => {
      handleEndCall();
      if (onPanicCutAndWipeRef.current) {
        onPanicCutAndWipeRef.current();
      }
    };

    // Hardware volume button change on active audio element
    const audioEl = remoteAudioRef.current;
    const handleVolumeChange = () => {
      handleEndCall();
      if (onPanicCutAndWipeRef.current) {
        onPanicCutAndWipeRef.current();
      }
    };

    if (audioEl) {
      audioEl.addEventListener('volumechange', handleVolumeChange);
    }

    // MediaSession hardware call / bluetooth headset button interceptor
    const mediaActions: MediaSessionAction[] = [
      'hangup' as MediaSessionAction,
      'stop',
      'pause',
    ];
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      const onMediaPanic = () => {
        handleEndCall();
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
      if (inviteInterval) clearInterval(inviteInterval);
      if (acceptInterval) clearInterval(acceptInterval);
      window.removeEventListener('keydown', handlePanic, true);
      window.removeEventListener('keyup', handlePanic, true);
      document.removeEventListener('visibilitychange', handleVisibilityChange, true);
      window.removeEventListener('pagehide', handlePageHide, true);
      if (audioEl) {
        audioEl.removeEventListener('volumechange', handleVolumeChange);
      }
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
        mediaActions.forEach((act) => {
          try {
            navigator.mediaSession.setActionHandler(act, null);
          } catch {}
        });
      }
      unregisterListener();
      stopAllMedia();
    };
  }, [isOpen, acquireWakeLock, registerSignalListener, startMicrophone, initPeerConnection, processSignal, handleEndCall, stopAllMedia, setStatus]);

  // Toggle microphone mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      localStreamRef.current.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted((prev) => !prev);
    }
  };

  // Toggle speaker mute
  const toggleSpeakerMute = () => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = !remoteAudioRef.current.muted;
      setIsSpeakerMuted(remoteAudioRef.current.muted);
    }
  };

  if (!isOpen) return null;

  // Format call duration MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <>
      {/* Hidden audio element for receiving remote voice */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* Floating Minimized Widget when user wants to read document while talking */}
      {isMinimized ? (
        <div className="fixed bottom-12 right-4 z-[90] flex items-center space-x-2.5 px-3 py-2 rounded-lg bg-[#185abd] text-white shadow-2xl border border-white/20 select-none animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center space-x-1.5">
            <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-emerald-400 animate-ping' : 'bg-amber-400'}`} />
            <span className="font-semibold text-xs">{peerAuthorName}</span>
          </div>

          <span className="text-[11px] font-mono opacity-85">
            {status === 'connected' ? formatTime(callDuration) : status}
          </span>

          <div className="flex items-center space-x-1 pl-1 border-l border-white/20">
            <button
              type="button"
              onClick={toggleMute}
              className={`p-1 rounded cursor-pointer ${isMuted ? 'bg-rose-500 text-white' : 'hover:bg-white/20'}`}
              title={isMuted ? 'Unmute Mic' : 'Mute Mic'}
            >
              {isMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </button>
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="p-1 rounded hover:bg-white/20 cursor-pointer"
              title="Expand call window"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={handleEndCall}
              className="p-1 rounded bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              title="End call"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* Full Modal Dialog */
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs select-none animate-in fade-in duration-150">
          <div
            className={`w-full max-w-sm rounded-xl shadow-2xl border flex flex-col overflow-hidden transition-colors ${
              darkMode ? 'bg-[#1e293b] border-[#334155] text-white' : 'bg-white border-[#cbd5e1] text-[#0f172a]'
            }`}
          >
            {/* Word-camouflaged Top Header */}
            <div
              className={`flex items-center justify-between px-3.5 py-2.5 border-b select-none ${
                darkMode ? 'bg-[#0f172a] border-[#334155]' : 'bg-[#f8fafc] border-[#e2e8f0]'
              }`}
            >
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-md bg-[#185abd] text-white flex items-center justify-center text-[11px] font-bold">
                  W
                </div>
                <div>
                  <span className="font-semibold text-xs block leading-tight">
                    Document Voice Review
                  </span>
                  <span className="text-[10px] opacity-60 block leading-none mt-0.5">
                    Real-Time Dictation &amp; Review Channel
                  </span>
                </div>
              </div>

              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="p-1 rounded-md opacity-60 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
                  title="Minimize while editing clauses"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Central Call Card */}
            <div className="p-6 flex flex-col items-center justify-center text-center space-y-4">
              {/* Animated Speaking Avatar */}
              <div className="relative">
                {/* Speaking Wave Glow Ring */}
                {remoteAudioLevel > 15 && (
                  <div
                    className="absolute -inset-2 rounded-full bg-emerald-500/20 animate-ping pointer-events-none"
                    style={{ animationDuration: '1.2s' }}
                  />
                )}
                {localAudioLevel > 15 && (
                  <div
                    className="absolute -inset-1 rounded-full bg-blue-500/30 animate-pulse pointer-events-none"
                  />
                )}

                <div
                  className={`w-20 h-20 rounded-full flex items-center justify-center text-xl font-bold border-2 transition-all shadow-md ${
                    status === 'connected'
                      ? 'bg-gradient-to-br from-[#185abd] to-[#107c41] text-white border-emerald-400'
                      : 'bg-black/10 dark:bg-white/10 text-gray-500 border-dashed border-gray-400'
                  }`}
                >
                  {currentAuthorId === 'author-2' ? 'Author 1' : 'Author 2'}
                </div>

                <div className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[#185abd] text-white shadow-xs">
                  <PhoneCall className="w-3.5 h-3.5" />
                </div>
              </div>

              {/* Status and Timer */}
              <div className="space-y-1">
                <h3 className="font-semibold text-sm">
                  {peerAuthorName}
                </h3>
                <div className="flex items-center justify-center space-x-1.5 text-xs">
                  {status === 'requesting' && (
                    <span className="text-amber-500 flex items-center space-x-1 animate-pulse">
                      <Activity className="w-3.5 h-3.5" />
                      <span>Calling co-author...</span>
                    </span>
                  )}
                  {status === 'connecting' && (
                    <span className="text-blue-500 flex items-center space-x-1 animate-pulse">
                      <Activity className="w-3.5 h-3.5" />
                      <span>Connecting audio stream...</span>
                    </span>
                  )}
                  {status === 'connected' && (
                    <span className="text-emerald-500 font-mono font-bold flex items-center space-x-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                      <span>{formatTime(callDuration)}</span>
                    </span>
                  )}
                  {status === 'ended' && (
                    <span className="text-rose-500">Call Ended</span>
                  )}
                  {status === 'error' && (
                    <span className="text-rose-500 flex items-center space-x-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{errorMessage || 'Connection Failed'}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Real-time Voice Wave Bars Indicator */}
              {status === 'connected' && (
                <div className="flex items-center space-x-1 h-5 py-0.5">
                  {[...Array(5)].map((_, i) => {
                    const active = (remoteAudioLevel > (i + 1) * 12) || (localAudioLevel > (i + 1) * 12);
                    return (
                      <div
                        key={i}
                        className={`w-1 rounded-full transition-all duration-75 ${
                          active
                            ? 'bg-emerald-500 h-4'
                            : 'bg-gray-300 dark:bg-gray-700 h-1.5'
                        }`}
                      />
                    );
                  })}
                </div>
              )}

              {/* Security Banner */}
              <div className="text-[10.5px] opacity-60 flex items-center space-x-1">
                <Shield className="w-3 h-3 text-emerald-500" />
                <span>P2P WebRTC 48kHz Encrypted Audio</span>
              </div>
            </div>

            {/* Bottom Actions Bar */}
            <div
              className={`p-3.5 border-t flex items-center justify-around ${
                darkMode ? 'bg-[#0f172a]/60 border-[#334155]' : 'bg-[#f8fafc] border-[#e2e8f0]'
              }`}
            >
              {/* Mute Mic Button */}
              <button
                type="button"
                onClick={toggleMute}
                className={`p-2.5 rounded-full transition-all cursor-pointer shadow-xs ${
                  isMuted
                    ? 'bg-rose-500 text-white'
                    : darkMode
                    ? 'bg-[#334155] hover:bg-[#475569] text-white'
                    : 'bg-[#e2e8f0] hover:bg-[#cbd5e1] text-[#0f172a]'
                }`}
                title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
              >
                {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* End Call Button */}
              <button
                type="button"
                onClick={handleEndCall}
                className="px-6 py-2.5 rounded-full bg-rose-600 hover:bg-rose-700 active:scale-95 text-white flex items-center space-x-2 font-semibold text-xs transition-all cursor-pointer shadow-md"
                title="End Voice Call"
              >
                <PhoneOff className="w-4 h-4" />
                <span>End Call</span>
              </button>

              {/* Mute Speaker Button */}
              <button
                type="button"
                onClick={toggleSpeakerMute}
                className={`p-2.5 rounded-full transition-all cursor-pointer shadow-xs ${
                  isSpeakerMuted
                    ? 'bg-amber-500 text-white'
                    : darkMode
                    ? 'bg-[#334155] hover:bg-[#475569] text-white'
                    : 'bg-[#e2e8f0] hover:bg-[#cbd5e1] text-[#0f172a]'
                }`}
                title={isSpeakerMuted ? 'Unmute Speaker' : 'Mute Speaker'}
              >
                {isSpeakerMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

