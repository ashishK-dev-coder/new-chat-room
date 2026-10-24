'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { CornerUpLeft, X, Clock, Check, CheckCheck, AlertCircle } from 'lucide-react';
import { ChatMessage } from '@/lib/chatStore';
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
  darkMode?: boolean;
}

interface AISection {
  id: number;
  title: string;
  points: string[];
  notePrefix: string;
}

const AI_SECTIONS: AISection[] = [
  {
    id: 1,
    title: '1. Foundation Models & Transformer Architecture Implementation',
    points: [
      'Comprehensive understanding of multi-head self-attention mechanisms, rotary position embeddings (RoPE), and KV-cache optimization across GPU memory hierarchies.',
      'Proficient fine-tuning of large foundation models using parameter-efficient adapters (PEFT, LoRA/QLoRA), PyTorch FSDP, and DeepSpeed ZeRO-3 distributed pipelines.',
    ],
    notePrefix: 'Specification Clause 1.1',
  },
  {
    id: 2,
    title: '2. Retrieval-Augmented Generation (RAG) & Vector Database Architecture',
    points: [
      'Architecting enterprise hybrid retrieval systems combining sparse lexical BM25 search with dense HNSW vector similarity in Milvus, Qdrant, or Pinecone.',
      'Implementing recursive document chunking, contextual metadata enrichment, reciprocal rank fusion (RRF), and cross-encoder reranking algorithms.',
    ],
    notePrefix: 'System Architecture Note 2.1',
  },
  {
    id: 3,
    title: '3. Autonomous Agentic Workflows & Multi-Agent Orchestration',
    points: [
      'Designing stateful multi-agent execution graphs using LangGraph with cyclic execution paths, persistent memory checkpointing, and human-in-the-loop review nodes.',
      'Engineering deterministic function-calling pipelines with strict JSON-Schema validation, sandboxed code execution, and autonomous error recovery routines.',
    ],
    notePrefix: 'Operational Standard 3.1',
  },
  {
    id: 4,
    title: '4. High-Throughput Inference Serving, Quantization & Latency Budgets',
    points: [
      'Deploying low-latency production inference clusters utilizing vLLM, TensorRT-LLM, continuous dynamic batching, and chunked prefill scheduling.',
      'Applying post-training quantization schemes (FP8, AWQ, GPTQ) to minimize memory bandwidth constraints while preserving model evaluation metrics.',
    ],
    notePrefix: 'Deployment Parameter 4.1',
  },
  {
    id: 5,
    title: '5. LLM Evaluation Benchmarks, Guardrails & Observability Standards',
    points: [
      'Establishing automated evaluation benchmarks utilizing Ragas, G-Eval, and synthetic test datasets for hallucination detection and domain calibration.',
      'Integrating input/output guardrails, prompt injection sanitization filters, and OpenTelemetry distributed tracing across inference pipelines.',
    ],
    notePrefix: 'Observability Protocol 5.1',
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
  darkMode = false,
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

  // Focus textarea when unlocked
  useEffect(() => {
    if (isUnlocked) {
      inputRef.current?.focus();
    }
  }, [isUnlocked]);

  // When logged out (!isUnlocked), NO messages are shown on the UI!
  // Strictly maintain at most 5 messages (oldest auto-pruned)
  const displayedMessages = isUnlocked ? messages.slice(-5) : [];

  // Determine active slot index for typing (up to index 4 for 5 slots)
  const activeSlotIndex = isUnlocked ? Math.min(displayedMessages.length, AI_SECTIONS.length - 1) : -1;

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
      className={`flex-1 overflow-y-auto flex justify-center py-1.5 sm:py-6 px-1 sm:px-4 cursor-default relative transition-colors w-full min-w-0 ${
        darkMode ? 'bg-[#181818]' : 'bg-[#ebebeb]'
      }`}
    >
      {/* A4 Document Paper Sheet */}
      <div
        className={`word-page min-h-full sm:min-h-[1056px] w-full max-w-[816px] px-3 sm:px-12 md:px-[88px] py-4 sm:py-10 md:py-[64px] relative shadow-md flex flex-col justify-between transition-colors overflow-hidden ${
          darkMode
            ? 'bg-[#242424] text-[#e0e0e0] border border-[#383838] shadow-2xl'
            : 'bg-white text-[#201f1e] shadow-md'
        }`}
        style={{
          fontFamily: getFontFamilyStyle(),
          fontSize: `${fontSettings.size}pt`,
          textAlign: fontSettings.alignment,
        }}
        onDoubleClick={handleParagraphDoubleClick}
        onTouchEnd={handleParagraphTouchEnd}
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

          {/* Document Technical Points with Gap Chat Slots */}
          <div className="space-y-4 w-full min-w-0">
            {AI_SECTIONS.map((section, slotIdx) => {
              const currentSlotMsg = displayedMessages[slotIdx];
              const isThisActiveInputSlot = activeSlotIndex === slotIdx;

              return (
                <div key={section.id} className="space-y-1.5 w-full min-w-0">
                  {/* Technical Section Heading */}
                  <h2
                    className={`text-[11pt] sm:text-[11.5pt] font-bold select-none sm:select-text cursor-default break-words ${
                      darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
                    }`}
                  >
                    {section.title}
                  </h2>

                  {/* Static AI Engineering Points */}
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

                  {/* Interleaved Gap Chat Slot Area (Visible ONLY when author unlocks) */}
                  {isUnlocked ? (
                    <div className="mt-2 pl-1 sm:pl-4 pr-0.5 sm:pr-1 w-full max-w-full min-w-0">
                      {/* 1. Existing Chat Message in this Slot */}
                      {currentSlotMsg && (
                        <div
                          className={`group relative py-1.5 px-2 sm:px-2.5 rounded-xs transition-colors my-1 w-full min-w-0 ${
                            darkMode
                              ? stealthMode === 'coauthor'
                                ? currentSlotMsg.senderId === currentUserId
                                  ? 'border-l-2 border-[#4ba3f4] bg-[#2a2d34]'
                                  : 'border-l-2 border-[#34d399] bg-[#2a2d34]'
                                : 'border-l-2 border-[#6b7280] bg-[#282828]'
                              : stealthMode === 'coauthor'
                              ? currentSlotMsg.senderId === currentUserId
                                ? 'border-l-2 border-[#0078d4] bg-[#f8fafc]'
                                : 'border-l-2 border-[#107c41] bg-[#f8fafc]'
                              : 'border-l-2 border-[#9ca3af] bg-[#fafafa]'
                          }`}
                        >
                          {/* Quoted / Tagged reference if replying to an earlier clause */}
                          {currentSlotMsg.replyTo && (
                            <div className={`flex items-center space-x-1.5 text-[8pt] sm:text-[8.5pt] mb-1 pl-1.5 border-l-2 select-none opacity-85 min-w-0 max-w-full overflow-hidden ${
                              darkMode
                                ? 'border-[#4ba3f4]/70 text-[#93c5fd]'
                                : 'border-[#0078d4]/70 text-[#0284c7]'
                            }`}>
                              <CornerUpLeft className="w-2.5 h-2.5 shrink-0" />
                              <span className="font-semibold shrink-0">
                                {currentSlotMsg.replyTo.senderName}:
                              </span>
                              <span className="truncate italic flex-1 min-w-0">
                                "{currentSlotMsg.replyTo.text}"
                              </span>
                            </div>
                          )}

                          <div className={`flex flex-col sm:flex-row sm:items-start justify-between gap-1 sm:gap-2 text-[10pt] sm:text-[10.5pt] leading-relaxed select-text w-full min-w-0 ${
                            darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
                          }`}>
                            <div className="flex-1 min-w-0 break-words pr-0.5">
                              <span className={`font-semibold mr-1.5 select-none ${
                                darkMode ? 'text-[#9ca3af]' : 'text-[#4b5563]'
                              }`}>
                                {stealthMode === 'plain'
                                  ? '•'
                                  : `• ${section.notePrefix}:`}
                              </span>
                              <span
                                className={`break-words ${
                                  fontSettings.bold ? 'font-bold' : ''
                                } ${fontSettings.italic ? 'italic' : ''} ${
                                  fontSettings.underline ? 'underline' : ''
                                }`}
                              >
                                {currentSlotMsg.text}
                              </span>
                            </div>

                            <div className="flex items-center justify-end shrink-0 space-x-1.5 self-end sm:self-center pt-0.5 sm:pt-0">
                              {/* Message Time and Status Indicator */}
                              <div className="flex items-center space-x-1 select-none text-[7pt] sm:text-[7.5pt] tracking-tight">
                                {/* Formatted timestamp (e.g. 10:45 AM) */}
                                {currentSlotMsg.timestamp && (
                                  <span className={`font-mono text-[6.5pt] sm:text-[7.5pt] mr-0.5 opacity-80 ${
                                    darkMode ? 'text-[#9ca3af]' : 'text-[#605e5c]'
                                  }`}>
                                    {formatMessageTime(currentSlotMsg.timestamp)}
                                  </span>
                                )}

                                {/* Single tick for going/sent, double tick for seen */}
                                {currentSlotMsg.status === 'pending' ? (
                                  <span
                                    className={`inline-flex items-center space-x-0.5 font-mono px-1 py-0.5 rounded tracking-tight transition-all ${
                                      darkMode
                                        ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}
                                    title="Sending clause... Going"
                                  >
                                    <Clock className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: '2.5s' }} />
                                    <span>going...</span>
                                  </span>
                                ) : currentSlotMsg.status === 'failed' ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSendMessage(currentSlotMsg.text, currentSlotMsg.replyTo);
                                    }}
                                    className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded cursor-pointer transition-all ${
                                      darkMode
                                        ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30'
                                        : 'bg-rose-50 text-rose-600 border border-rose-200 hover:bg-rose-100'
                                    }`}
                                    title="Delivery failed. Click to retry"
                                  >
                                    <AlertCircle className="w-2.5 h-2.5" />
                                    <span>failed (retry)</span>
                                  </button>
                                ) : currentSlotMsg.status === 'seen' ? (
                                  /* Double Tick: Seen by co-author */
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
                                  /* Single Tick: Going / Delivered to server */
                                  <span
                                    className={`inline-flex items-center space-x-0.5 px-1 py-0.5 rounded font-medium transition-all ${
                                      darkMode
                                        ? 'text-[#9ca3af] bg-white/5 border border-white/10'
                                        : 'text-[#64748b] bg-slate-50 border border-slate-200'
                                    }`}
                                    title={
                                      currentSlotMsg.senderId === currentUserId
                                        ? 'Sent & delivered to server (waiting for co-author)'
                                        : 'Received clause'
                                    }
                                  >
                                    <Check className="w-2.5 h-2.5 stroke-[2.2]" />
                                    <span className="text-[6.5pt] sm:text-[7pt] tracking-tight">sent</span>
                                  </span>
                                )}
                              </div>

                              {/* Backward reply arrow to tag this message */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setTaggedMessage({
                                    id: currentSlotMsg.id,
                                    senderName: currentSlotMsg.senderId === currentUserId ? 'You' : 'Author',
                                    text: currentSlotMsg.text,
                                    prefix: section.notePrefix,
                                  });
                                  setTimeout(() => inputRef.current?.focus(), 10);
                                }}
                                title="Tag / Reply to this clause"
                                className={`opacity-40 hover:opacity-100 group-hover:opacity-100 transition-opacity p-1 rounded cursor-pointer shrink-0 ${
                                  darkMode
                                    ? 'hover:bg-white/10 text-white/70 hover:text-[#4ba3f4]'
                                    : 'hover:bg-black/5 text-[#64748b] hover:text-[#0078d4]'
                                }`}
                              >
                                <CornerUpLeft className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* 2. Active Inline Typing Input */}
                      {isThisActiveInputSlot && (
                        <div className={`flex flex-col mt-1.5 py-1.5 px-2 sm:px-2.5 border-l-2 rounded-xs w-full min-w-0 ${
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
                              {stealthMode === 'plain'
                                ? '•'
                                : `• ${section.notePrefix}:`}
                            </span>

                            <div className="flex-1 min-w-0 relative flex items-center w-full">
                              <textarea
                                ref={inputRef}
                                value={inputText}
                                onChange={(e) => setInputText(e.target.value)}
                                onKeyDown={handleKeyDown}
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
                      )}
                    </div>
                  ) : (
                    /* When locked: Only a subtle note trigger on slot 0 when user explicitly clicks to chat */
                    slotIdx === 0 && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          onRequireUnlock();
                        }}
                        className="mt-2 pl-3.5 sm:pl-4 py-1 cursor-pointer select-none group"
                        title="Click to edit document"
                      >
                        <span className={`text-[10pt] italic transition-colors ${
                          darkMode
                            ? 'text-[#52525b] group-hover:text-[#9ca3af]'
                            : 'text-[#9ca3af] group-hover:text-[#6b7280]'
                        }`}>
                          • Click to append technical clause...
                        </span>
                      </div>
                    )
                  )}
                </div>
              );
            })}

            {/* Closing Point 5: Model Evaluation & Guardrails */}
            <div className="space-y-1.5 pt-1 w-full min-w-0">
              <h2
                className={`text-[11pt] sm:text-[11.5pt] font-bold select-none sm:select-text cursor-default break-words ${
                  darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
                }`}
              >
                5. Model Alignment, Red-Teaming &amp; Production Guardrails
              </h2>
              <ul className={`space-y-1 pl-3.5 sm:pl-4 list-disc leading-relaxed text-[9.5pt] sm:text-[10.5pt] ${
                darkMode ? 'text-[#d1d5db]' : 'text-[#374151]'
              }`}>
                <li
                  className="break-words select-none sm:select-text cursor-default"
                >
                  Automated benchmarking pipelines quantifying factual accuracy, hallucination rates, and RLHF/DPO reward calibration.
                </li>
                <li
                  className="break-words select-none sm:select-text cursor-default"
                >
                  Enforcing deterministic input/output guardrails using Llama-Guard and NeMo to prevent prompt injections and data leaks.
                </li>
              </ul>
            </div>

            {/* Peer Typing Indicator */}
            {isUnlocked && peerTyping && (
              <div className={`text-[9.5pt] italic pl-3.5 sm:pl-4 border-l-2 border-dashed ${
                darkMode ? 'text-[#9ca3af] border-[#34d399]' : 'text-[#6b7280] border-[#107c41]'
              }`}>
                Co-author is reviewing clause...
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
