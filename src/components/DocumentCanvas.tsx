'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CornerUpLeft, X, Clock, Check, CheckCheck, AlertCircle, Eye } from 'lucide-react';
import { ChatMessage, sortChatMessages } from '@/lib/chatStore';
import { FontSettings } from './WordRibbon';

interface DocumentCanvasProps {
  messages: ChatMessage[];
  currentUserId: string;
  isUnlocked: boolean;
  fontSettings: FontSettings;
  stealthMode: 'coauthor' | 'plain' | 'memo';
  onSendMessage: (text: string, replyTo?: ChatMessage['replyTo']) => void;
  onRequireUnlock: () => void;
  onPanicClear: () => void;
  onPanicWipe?: () => void;
  peerTyping: boolean;
  participantCount?: number;
  onOpenPreview?: () => void;
  darkMode?: boolean;
  zoomLevel?: number;
}

interface AISection {
  id: number;
  title: string;
  points: string[];
}

const STATIC_SECTIONS: AISection[] = [
  {
    id: 1,
    title: '1. Foundation Models & Transformer Architecture Implementation',
    points: [
      'Comprehensive understanding of multi-head self-attention mechanisms, rotary position embeddings (RoPE), and KV-cache optimization across GPU memory hierarchies.',
      'Proficient fine-tuning of large foundation models using parameter-efficient adapters (PEFT, LoRA/QLoRA), PyTorch FSDP, and DeepSpeed ZeRO-3 distributed pipelines.',
    ],
  },
  {
    id: 2,
    title: '2. Retrieval-Augmented Generation (RAG) & Vector Database Architecture',
    points: [
      'Architecting enterprise hybrid retrieval systems combining sparse lexical BM25 search with dense HNSW vector similarity in Milvus, Qdrant, or Pinecone.',
      'Implementing recursive document chunking, contextual metadata enrichment, reciprocal rank fusion (RRF), and cross-encoder reranking algorithms.',
    ],
  },
  {
    id: 3,
    title: '3. Autonomous Agentic Workflows & Multi-Agent Orchestration',
    points: [
      'Designing stateful multi-agent execution graphs using LangGraph with cyclic execution paths, persistent memory checkpointing, and human-in-the-loop review nodes.',
      'Engineering deterministic function-calling pipelines with strict JSON-Schema validation, sandboxed code execution, and autonomous error recovery routines.',
    ],
  },
  {
    id: 4,
    title: '4. High-Throughput Inference Serving, Quantization & Latency Budgets',
    points: [
      'Deploying low-latency production inference clusters utilizing vLLM, TensorRT-LLM, continuous dynamic batching, and chunked prefill scheduling.',
      'Applying post-training quantization schemes (FP8, AWQ, GPTQ) to minimize memory bandwidth constraints while preserving model evaluation metrics.',
    ],
  },
];

export const DocumentCanvas: React.FC<DocumentCanvasProps> = ({
  messages,
  currentUserId,
  isUnlocked,
  fontSettings,
  stealthMode,
  onSendMessage,
  onRequireUnlock,
  onPanicClear,
  onPanicWipe,
  peerTyping,
  participantCount = 1,
  onOpenPreview,
  darkMode = false,
  zoomLevel = 100,
}) => {
  const [inputText, setInputText] = useState('');
  const [taggedMessage, setTaggedMessage] = useState<{
    id: string;
    senderName: string;
    text: string;
    prefix?: string;
  } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isWipingRef = useRef(false);
  const lastTapTimeRef = useRef<number>(0);
  const lastTapPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Trigger Panic Wipe: completely wipes messages on server + both clients and logs out immediately
  const triggerPanicWipe = useCallback(() => {
    // If already wiping or already logged out, ignore
    if (isWipingRef.current || !isUnlocked) return;
    isWipingRef.current = true;

    // Immediately dismiss virtual keyboard & clear text selection so mobile browser doesn't hang
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    }

    setInputText('');
    setTaggedMessage(null);

    if (onPanicWipe) {
      onPanicWipe();
    } else {
      onPanicClear();
    }

    setTimeout(() => {
      isWipingRef.current = false;
    }, 800);
  }, [onPanicWipe, onPanicClear, isUnlocked]);

  // Double-click on any paragraph, point, heading, or document text triggers instant wipe out & logout
  const handleParagraphDoubleClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target?.tagName === 'TEXTAREA' ||
      target?.tagName === 'INPUT' ||
      target?.tagName === 'BUTTON' ||
      target?.closest('button') ||
      target?.closest('textarea') ||
      target?.closest('input')
    ) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    triggerPanicWipe();
  };

  // Mobile / touchscreen double-tap gesture on any paragraph / document text
  const handleParagraphTouchEnd = (e: React.TouchEvent) => {
    const target = e.target as HTMLElement | null;
    if (
      target?.tagName === 'TEXTAREA' ||
      target?.tagName === 'INPUT' ||
      target?.tagName === 'BUTTON' ||
      target?.closest('button') ||
      target?.closest('textarea') ||
      target?.closest('input')
    ) {
      return;
    }

    const touch = e.changedTouches?.[0];
    const now = Date.now();
    const timeDelta = now - lastTapTimeRef.current;

    let distance = 0;
    if (touch && lastTapPosRef.current.x !== 0) {
      const dx = touch.clientX - lastTapPosRef.current.x;
      const dy = touch.clientY - lastTapPosRef.current.y;
      distance = Math.sqrt(dx * dx + dy * dy);
    }

    if (touch) {
      lastTapPosRef.current = { x: touch.clientX, y: touch.clientY };
    }

    // Must be between 70ms and 360ms apart, within 45px radius (same spot double-tap)
    if (timeDelta > 70 && timeDelta < 360 && distance < 45) {
      lastTapTimeRef.current = 0;
      lastTapPosRef.current = { x: 0, y: 0 };
      e.stopPropagation();
      triggerPanicWipe();
    } else {
      lastTapTimeRef.current = now;
    }
  };

  const isPanicKey = (key: string, code: string): boolean => {
    return (
      key === 'Meta' ||
      key === 'OS' ||
      code === 'MetaLeft' ||
      code === 'MetaRight' ||
      key === 'Escape' ||
      code === 'Escape' ||
      key === 'Fn' ||
      code === 'Fn' ||
      key === 'FnLock' ||
      code === 'FnLock'
    );
  };

  // Global key listener for Windows key, Fn, Escape panic conceal + lock
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (isPanicKey(e.key, e.code)) {
        e.preventDefault();
        setInputText('');
        setTaggedMessage(null);
        onPanicClear();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onPanicClear]);

  // Focus textarea when unlocked and smoothly scroll to active clauses on new message append
  const latestMsgKey = messages[messages.length - 1]?.id || messages[messages.length - 1]?.timestamp;
  useEffect(() => {
    if (isUnlocked) {
      inputRef.current?.focus();
      const timer = setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 120);
      return () => clearTimeout(timer);
    }
  }, [isUnlocked, messages.length, latestMsgKey]);

  // When logged out (!isUnlocked), NO messages are shown on the UI!
  // Strictly maintain at most 4 messages in ascending chronological order (oldest at top, newest at bottom)
  const displayedMessages = isUnlocked
    ? [...messages].sort(sortChatMessages).slice(-4)
    : [];

  // Clicking document canvas does NOT open password popup (only focuses if already unlocked)
  const handleContainerClick = () => {
    if (isUnlocked) {
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // 1. Dedicated panic keys check (Windows Key, Escape, Fn)
    if (isPanicKey(e.key, e.code)) {
      e.preventDefault();
      setInputText('');
      setTaggedMessage(null);
      onPanicClear();
      return;
    }

    // 2. If locked, only trigger password popup if user actively tries to type normal text
    if (!isUnlocked) {
      e.preventDefault();
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        onRequireUnlock();
      }
      return;
    }

    // 3. Press Enter to send line
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendCurrent();
    }
  };

  const handleSendCurrent = () => {
    const trimmed = inputText.trim();
    if (trimmed) {
      const replyPayload = taggedMessage
        ? {
            id: taggedMessage.id,
            senderName: taggedMessage.prefix || taggedMessage.senderName,
            text: taggedMessage.text,
          }
        : undefined;

      onSendMessage(trimmed, replyPayload);
      setInputText('');
      setTaggedMessage(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    }
  };

  const getFontFamilyStyle = () => {
    switch (fontSettings.family) {
      case 'Calibri':
        return 'Calibri, sans-serif';
      case 'Aptos':
        return 'Aptos, Calibri, sans-serif';
      case 'Arial':
        return 'Arial, Helvetica, sans-serif';
      case 'Times New Roman':
        return '"Times New Roman", Times, serif';
      default:
        return 'Segoe UI, sans-serif';
    }
  };

  const formatMessageTime = (ts?: number): string => {
    if (!ts) return '';
    try {
      const d = new Date(ts);
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const seconds = String(d.getSeconds()).padStart(2, '0');
      const ms = String(d.getMilliseconds()).padStart(3, '0');
      // Sub-second precision (e.g. 10:45:00.128)
      return `${hours}:${minutes}:${seconds}.${ms}`;
    } catch {
      return '';
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`flex-1 overflow-auto flex justify-center py-2 sm:py-8 pb-44 sm:pb-60 px-1 sm:px-6 cursor-default relative transition-colors w-full min-w-0 overscroll-contain ${
        darkMode ? 'bg-[#181818]' : 'bg-[#ebebeb]'
      }`}
      style={{
        WebkitOverflowScrolling: 'touch',
      }}
    >
      {/* A4 Document Paper Sheet with expanded dimensions */}
      <div
        className={`word-page min-h-[1100px] sm:min-h-[1350px] w-full max-w-[880px] px-3 sm:px-12 md:px-[84px] py-4 sm:py-10 md:py-[56px] relative shadow-md flex flex-col justify-between transition-colors ${
          darkMode
            ? 'bg-[#242424] text-[#e0e0e0] border border-[#383838] shadow-2xl'
            : 'bg-white text-[#201f1e] shadow-md'
        }`}
        style={{
          fontFamily: getFontFamilyStyle(),
          fontSize: `${fontSettings.size}pt`,
          textAlign: fontSettings.alignment,
          transform: zoomLevel && zoomLevel !== 100 ? `scale(${zoomLevel / 100})` : undefined,
          transformOrigin: 'top center',
          transition: 'transform 0.15s ease-out',
        }}
        onDoubleClick={handleParagraphDoubleClick}
      >
        {/* Document Header Zone */}
        <div className="w-full min-w-0">
          <div
            className={`border-b pb-2 mb-3 sm:mb-4 select-none opacity-80 ${
              darkMode ? 'border-[#3e3e42]' : 'border-[#c8c6c4]'
            }`}
          >
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between text-[9px] sm:text-[10px] gap-0.5 ${
              darkMode ? 'text-[#9ca3af]' : 'text-[#605e5c]'
            }`}>
              <span className={`font-semibold uppercase tracking-wider truncate ${
                darkMode ? 'text-[#4ba3f4]' : 'text-[#185abd]'
              }`}>
                AI Systems Engineering &bull; Architecture &amp; Deployment Standards
              </span>
              <span className="shrink-0 text-[8.5px] sm:text-[10px]">Doc Ref: AI-SPEC-8820</span>
            </div>
          </div>

          {/* Document Main Heading & Abstract */}
          <div className="mb-3.5 sm:mb-5 w-full min-w-0">
            <h1
              className={`text-[13pt] sm:text-[17pt] font-bold leading-tight mb-1 select-none sm:select-text cursor-default break-words ${
                darkMode ? 'text-[#f3f4f6]' : 'text-[#1f2937]'
              }`}
            >
              AI Engineer Technical Architecture &amp; Core Competency Framework
            </h1>
            <p
              className={`text-[9pt] sm:text-[10pt] leading-normal italic select-none sm:select-text cursor-default break-words ${
                darkMode ? 'text-[#9ca3af]' : 'text-[#4b5563]'
              }`}
            >
              System architecture specifications, fine-tuning methodologies, RAG orchestration, and high-throughput production inference guidelines for AI engineering systems.
            </p>
          </div>

          {/* Document Technical Points (Sections 1 to 4) */}
          <div className="space-y-4 w-full min-w-0">
            {STATIC_SECTIONS.map((section) => (
              <div key={section.id} className="space-y-1.5 w-full min-w-0">
                <h2
                  className={`text-[11pt] sm:text-[11.5pt] font-bold select-none sm:select-text cursor-default break-words ${
                    darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
                  }`}
                >
                  {section.title}
                </h2>

                <ul className={`space-y-1 pl-3.5 sm:pl-4 list-disc leading-relaxed text-[9.5pt] sm:text-[10.5pt] ${
                  darkMode ? 'text-[#d1d5db]' : 'text-[#374151]'
                }`}>
                  {section.points.map((pt, pIdx) => (
                    <li
                      key={pIdx}
                      className="break-words select-none sm:select-text cursor-default"
                    >
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Section 5: Technical Implementation Clauses & Co-Author Annotations */}
            <div className="space-y-2 pt-1 w-full min-w-0">
              <div className="flex items-center justify-between">
                <h2
                  className={`text-[11pt] sm:text-[11.5pt] font-bold select-none sm:select-text cursor-default break-words ${
                    darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
                  }`}
                >
                  5. Technical Implementation Clauses &amp; Working Revision Notes
                </h2>
                {isUnlocked && (
                  <span className={`text-[8.5pt] font-mono select-none hidden sm:inline ${
                    darkMode ? 'text-[#34d399]' : 'text-[#107c41]'
                  }`}>
                    Live Working Clauses ({displayedMessages.length}/4)
                  </span>
                )}
              </div>

              {isUnlocked ? (
                <div className="space-y-2.5 w-full min-w-0 pt-1">
                  {/* Distinct sequential paragraphs: Left side = Other Author, Right side = Self Author */}
                  {displayedMessages.map((msg, idx) => {
                    const isSelf = msg.senderId === currentUserId;
                    const clauseNum = `Clause 5.${idx + 1}`;

                    return (
                      <div
                        key={msg.id}
                        className={`flex w-full min-w-0 ${isSelf ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`group relative py-2 px-3 rounded-xs transition-all w-full max-w-[94%] sm:max-w-[84%] ${
                            isSelf
                              ? darkMode
                                ? 'border-r-3 border-[#4ba3f4] bg-[#1a2333] text-[#f3f4f6] shadow-xs'
                                : 'border-r-3 border-[#0078d4] bg-[#f0f6ff] text-[#111827] shadow-xs'
                              : darkMode
                              ? 'border-l-3 border-[#34d399] bg-[#1a2722] text-[#f3f4f6] shadow-xs'
                              : 'border-l-3 border-[#107c41] bg-[#f2f8f4] text-[#111827] shadow-xs'
                          }`}
                        >
                          {/* Quoted / Tagged reference if replying to an earlier clause */}
                          {msg.replyTo && (
                            <div className={`flex items-center space-x-1.5 text-[8pt] sm:text-[8.5pt] mb-1.5 pl-2 py-0.5 border-l-2 select-none opacity-85 min-w-0 max-w-full overflow-hidden ${
                              darkMode
                                ? isSelf
                                  ? 'border-[#4ba3f4]/70 text-[#93c5fd] bg-[#4ba3f4]/10'
                                  : 'border-[#34d399]/70 text-[#a7f3d0] bg-[#34d399]/10'
                                : isSelf
                                ? 'border-[#0078d4]/70 text-[#0284c7] bg-[#0078d4]/5'
                                : 'border-[#107c41]/70 text-[#15803d] bg-[#107c41]/5'
                            }`}>
                              <CornerUpLeft className="w-2.5 h-2.5 shrink-0" />
                              <span className="font-semibold shrink-0">
                                {msg.replyTo.senderName}:
                              </span>
                              <span className="truncate italic flex-1 min-w-0">
                                "{msg.replyTo.text}"
                              </span>
                            </div>
                          )}

                          {/* Clause Paragraph Header: Author Tag on left, Timestamp & Status on right */}
                          <div className="flex items-center justify-between gap-1 mb-1 select-none">
                            <span className={`font-semibold text-[8.5pt] sm:text-[9.5pt] tracking-tight ${
                              isSelf
                                ? darkMode
                                  ? 'text-[#60a5fa]'
                                  : 'text-[#0078d4]'
                                : darkMode
                                ? 'text-[#34d399]'
                                : 'text-[#107c41]'
                            }`}>
                              • {clauseNum} [{isSelf
                                ? `You (${msg.senderName || (currentUserId === 'author-2' ? 'Author 2' : 'Author 1')})`
                                : (msg.senderName || (msg.senderId === 'author-2' ? 'Author 2' : 'Author 1'))}]:
                            </span>

                            <div className="flex items-center space-x-1.5 shrink-0">
                              {/* High-precision timestamp */}
                              {msg.timestamp && (
                                <span className={`font-mono text-[6.5pt] sm:text-[7.5pt] opacity-75 ${
                                  darkMode ? 'text-[#9ca3af]' : 'text-[#605e5c]'
                                }`}>
                                  {formatMessageTime(msg.timestamp)}
                                </span>
                              )}

                              {/* Single tick for sent, Double blue tick for seen (shown on self messages) */}
                              {isSelf && (
                                <>
                                  {msg.status === 'pending' ? (
                                    <span
                                      className={`inline-flex items-center space-x-0.5 font-mono px-1 py-0.5 rounded tracking-tight transition-all ${
                                        darkMode
                                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                                      }`}
                                      title="Sending clause... Going"
                                    >
                                      <Clock className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '2.5s' }} />
                                      <span className="text-[6.5pt] sm:text-[7pt]">going...</span>
                                    </span>
                                  ) : msg.status === 'failed' ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onSendMessage(msg.text, msg.replyTo);
                                      }}
                                      className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                                        darkMode
                                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                                          : 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                                      }`}
                                      title="Delivery failed. Click to retry"
                                    >
                                      <AlertCircle className="w-2.5 h-2.5" />
                                      <span className="text-[6.5pt] sm:text-[7pt]">failed (retry)</span>
                                    </button>
                                  ) : msg.status === 'seen' ? (
                                    <span
                                      className={`inline-flex items-center space-x-0.5 px-1 py-0.5 rounded font-medium transition-all ${
                                        darkMode
                                          ? 'text-[#4ba3f4] bg-[#4ba3f4]/15 border border-[#4ba3f4]/30'
                                          : 'text-[#0078d4] bg-[#f0f9ff] border border-[#0078d4]/30'
                                      }`}
                                      title="Seen by co-author"
                                    >
                                      <CheckCheck className="w-3 h-3 stroke-[2.4]" />
                                      <span className="font-semibold text-[6.5pt] sm:text-[7pt] tracking-tight">seen</span>
                                    </span>
                                  ) : (
                                    <span
                                      className={`inline-flex items-center space-x-0.5 px-1 py-0.5 rounded font-medium transition-all ${
                                        darkMode
                                          ? 'text-[#9ca3af] bg-white/5 border border-white/10'
                                          : 'text-[#64748b] bg-slate-50 border border-slate-200'
                                      }`}
                                      title="Sent & delivered to document room"
                                    >
                                      <Check className="w-2.5 h-2.5 stroke-[2.2]" />
                                      <span className="text-[6.5pt] sm:text-[7pt] tracking-tight">sent</span>
                                    </span>
                                  )}
                                </>
                              )}

                              {/* Backward reply arrow to tag this message */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTaggedMessage({
                                    id: msg.id,
                                    senderName: isSelf
                                      ? `You (${msg.senderName || (currentUserId === 'author-2' ? 'Author 2' : 'Author 1')})`
                                      : (msg.senderName || (msg.senderId === 'author-2' ? 'Author 2' : 'Author 1')),
                                    text: msg.text,
                                    prefix: clauseNum,
                                  });
                                  setTimeout(() => inputRef.current?.focus(), 10);
                                }}
                                title="Tag / Reply to this clause"
                                className={`opacity-40 hover:opacity-100 group-hover:opacity-100 transition-opacity p-0.5 rounded cursor-pointer shrink-0 ${
                                  darkMode
                                    ? 'hover:bg-white/10 text-white/70 hover:text-[#4ba3f4]'
                                    : 'hover:bg-black/5 text-[#64748b] hover:text-[#0078d4]'
                                }`}
                              >
                                <CornerUpLeft className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Clause Paragraph Body */}
                          <div className={`text-[10pt] sm:text-[10.5pt] leading-relaxed select-text break-words ${
                            darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
                          }`}>
                            <span
                              className={`break-words ${
                                fontSettings.bold ? 'font-bold' : ''
                              } ${fontSettings.italic ? 'italic' : ''} ${
                                fontSettings.underline ? 'underline' : ''
                              }`}
                            >
                              {msg.text}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {/* Active Inline Typing Input (Always placed neatly below the latest clause) */}
                  <div className={`flex flex-col mt-2 py-1.5 px-2.5 border-l-2 rounded-xs w-full min-w-0 ${
                    darkMode
                      ? 'border-[#4ba3f4] bg-[#1e293b]/40'
                      : 'border-[#0078d4] bg-[#f0f9ff]/40'
                  }`}>
                    {/* Tagged message citation pill */}
                    {taggedMessage && (
                      <div className={`flex items-center justify-between text-[8pt] sm:text-[8.5pt] px-2 py-1 mb-1.5 rounded border-l-2 select-none w-full min-w-0 ${
                        darkMode
                          ? 'bg-[#1e293b] border-[#4ba3f4] text-[#93c5fd]'
                          : 'bg-[#f0f9ff] border-[#0078d4] text-[#0369a1]'
                      }`}>
                        <div className="flex items-center space-x-1.5 min-w-0 flex-1 truncate">
                          <CornerUpLeft className="w-2.5 h-2.5 shrink-0" />
                          <span className="font-semibold shrink-0">
                            Tagging {taggedMessage.prefix || 'Clause'}:
                          </span>
                          <span className="truncate italic flex-1 min-w-0">
                            "{taggedMessage.text}"
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTaggedMessage(null)}
                          className="ml-2 shrink-0 opacity-60 hover:opacity-100 cursor-pointer p-0.5"
                          title="Remove tag"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-2 w-full min-w-0">
                      <span className={`font-semibold select-none shrink-0 text-[9.5pt] sm:text-[10.5pt] ${
                        darkMode ? 'text-[#9ca3af]' : 'text-[#64748b]'
                      }`}>
                        • Clause 5.{displayedMessages.length + 1}:
                      </span>

                      <div className="flex-1 min-w-0 relative flex items-center w-full">
                        <textarea
                          ref={inputRef}
                          value={inputText}
                          onChange={(e) => setInputText(e.target.value)}
                          onKeyDown={handleKeyDown}
                          onFocus={() => {
                            setTimeout(() => {
                              bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                            }, 180);
                          }}
                          placeholder="Type technical clause and press Enter..."
                          enterKeyHint="send"
                          rows={1}
                          className={`w-full min-w-0 resize-none bg-transparent outline-none border-b sm:border-none border-[#185abd]/30 pb-0.5 sm:pb-0 leading-relaxed text-[15px] sm:text-[10.5pt] ${
                            darkMode
                              ? 'text-[#f3f4f6] placeholder-[#6b7280]'
                              : 'text-[#111827] placeholder-[#9ca3af]'
                          }`}
                          style={{
                            fontFamily: getFontFamilyStyle(),
                            fontSize: `${fontSettings.size}pt`,
                          }}
                        />

                        {/* Blinking Word text cursor */}
                        {inputText.length === 0 && (
                          <span
                            className={`word-cursor inline-block w-[1.5px] h-[16px] absolute left-0 top-0.5 pointer-events-none ${
                              darkMode ? 'bg-[#f3f4f6]' : 'bg-[#111827]'
                            }`}
                          />
                        )}

                        {/* Mobile / Quick Append Button when clause text is typed */}
                        {inputText.trim().length > 0 && (
                          <button
                            type="button"
                            onClick={handleSendCurrent}
                            className={`ml-1.5 px-2.5 py-1 sm:py-0.5 rounded text-[11px] font-semibold transition-colors shrink-0 cursor-pointer shadow-xs ${
                              darkMode
                                ? 'bg-[#4ba3f4] text-[#0f172a] hover:bg-[#38bdf8]'
                                : 'bg-[#185abd] text-white hover:bg-[#104a9b]'
                            }`}
                            title="Append clause"
                          >
                            Append
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  {/* Bottom anchor for smooth scroll to latest clause */}
                  <div ref={bottomRef} className="h-6 w-full shrink-0 pointer-events-none" />
                </div>
              ) : (
                /* When locked: Static AI review points & unlock trigger */
                <div className="space-y-1 pl-3.5 sm:pl-4">
                  <ul className={`space-y-1 list-disc leading-relaxed text-[9.5pt] sm:text-[10.5pt] ${
                    darkMode ? 'text-[#d1d5db]' : 'text-[#374151]'
                  }`}>
                    <li className="break-words select-none sm:select-text cursor-default">
                      Automated benchmarking pipelines quantifying factual accuracy, hallucination rates, and RLHF/DPO reward calibration.
                    </li>
                    <li className="break-words select-none sm:select-text cursor-default">
                      Enforcing deterministic input/output guardrails using Llama-Guard and NeMo to prevent prompt injections and data leaks.
                    </li>
                  </ul>

                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequireUnlock();
                    }}
                    className="mt-2 pl-0.5 py-1 cursor-pointer select-none group"
                    title="Click to edit document"
                  >
                    <span className={`text-[10pt] italic transition-colors ${
                      darkMode
                        ? 'text-[#52525b] group-hover:text-[#9ca3af]'
                        : 'text-[#9ca3af] group-hover:text-[#6b7280]'
                    }`}>
                      • Click to review and amend working clauses...
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Peer Typing Indicator */}
            {isUnlocked && peerTyping && (
              <div className={`text-[9.5pt] italic pl-3.5 sm:pl-4 border-l-2 border-dashed ${
                darkMode ? 'text-[#9ca3af] border-[#34d399]' : 'text-[#6b7280] border-[#107c41]'
              }`}>
                Co-author is reviewing clause...
              </div>
            )}

            {/* End of Page: See preview option */}
            {isUnlocked && onOpenPreview && (
              <div className="mt-5 pt-3 border-t border-dashed border-[#c8c6c4] dark:border-[#3e3e42] flex items-center justify-between select-none">
                <div className="flex items-center space-x-1.5 text-[9pt] sm:text-[9.5pt] text-[#605e5c] dark:text-[#9ca3af]">
                  <Eye className="w-3.5 h-3.5 text-[#185abd]" />
                  <span className="font-medium">Document Visual Preview:</span>
                </div>

                {participantCount >= 2 ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPreview();
                    }}
                    className="px-2.5 py-1 text-[9pt] sm:text-[9.5pt] font-semibold rounded bg-[#185abd]/10 hover:bg-[#185abd]/20 text-[#185abd] dark:text-blue-300 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 border border-[#185abd]/30 cursor-pointer transition-all flex items-center space-x-1.5 shadow-xs"
                    title="Start visual preview (Both authors online)"
                  >
                    <span>See preview</span>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  </button>
                ) : (
                  <div
                    className="px-2 py-0.5 text-[8.5pt] text-[#a19f9d] dark:text-[#71717a] italic bg-black/5 dark:bg-white/5 rounded border border-black/5 select-none"
                    title="Visual preview requires both authors to be online"
                  >
                    See preview (Waiting for co-author...)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Document Footer Zone */}
        <div
          className={`border-t pt-3 mt-6 select-none opacity-70 w-full min-w-0 ${
            darkMode ? 'border-[#3e3e42]' : 'border-[#e5e7eb]'
          }`}
        >
          <div className={`flex items-center justify-between text-[9px] sm:text-[10px] gap-2 ${
            darkMode ? 'text-[#9ca3af]' : 'text-[#6b7280]'
          }`}>
            <span className="truncate">Microsoft Word &bull; AI Engineering Architecture Document</span>
            <span className="shrink-0">Page 1 of 1</span>
          </div>
        </div>
      </div>
    </div>
  );
};
