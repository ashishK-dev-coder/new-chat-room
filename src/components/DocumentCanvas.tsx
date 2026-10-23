'use client';

import React, { useRef, useEffect, useState } from 'react';
import { ChatMessage } from '@/lib/chatStore';
import { FontSettings } from './WordRibbon';

interface DocumentCanvasProps {
  messages: ChatMessage[];
  currentUserId: string;
  isUnlocked: boolean;
  fontSettings: FontSettings;
  stealthMode: 'coauthor' | 'plain' | 'memo';
  onSendMessage: (text: string) => void;
  onRequireUnlock: () => void;
  onPanicClear: () => void;
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
  peerTyping,
  darkMode = false,
}) => {
  const [inputText, setInputText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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
  const displayedMessages = isUnlocked ? messages.slice(-4) : [];

  // Determine active slot index for typing
  const activeSlotIndex = isUnlocked ? Math.min(displayedMessages.length, 3) : -1;

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
      const trimmed = inputText.trim();
      if (trimmed) {
        onSendMessage(trimmed);
        setInputText('');
      }
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

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className={`flex-1 overflow-y-auto flex justify-center py-6 px-4 cursor-default relative transition-colors ${
        darkMode ? 'bg-[#181818]' : 'bg-[#ebebeb]'
      }`}
    >
      {/* A4 Document Paper Sheet */}
      <div
        className={`word-page min-h-[1056px] w-[816px] max-w-full px-[88px] py-[64px] relative shadow-md flex flex-col justify-between transition-colors ${
          darkMode
            ? 'bg-[#242424] text-[#e0e0e0] border border-[#383838] shadow-2xl'
            : 'bg-white text-[#201f1e] shadow-md'
        }`}
        style={{
          fontFamily: getFontFamilyStyle(),
          fontSize: `${fontSettings.size}pt`,
          textAlign: fontSettings.alignment,
        }}
      >
        {/* Document Header Zone */}
        <div>
          <div
            className={`border-b pb-2 mb-4 select-none opacity-80 ${
              darkMode ? 'border-[#3e3e42]' : 'border-[#c8c6c4]'
            }`}
          >
            <div className={`flex items-center justify-between text-[10px] ${
              darkMode ? 'text-[#9ca3af]' : 'text-[#605e5c]'
            }`}>
              <span className={`font-semibold uppercase tracking-wider ${
                darkMode ? 'text-[#4ba3f4]' : 'text-[#185abd]'
              }`}>
                AI Systems Engineering &bull; Model Architecture &amp; Deployment Standards
              </span>
              <span>Doc Ref: AI-SPEC-8820</span>
            </div>
          </div>

          {/* Document Main Heading */}
          <div className="mb-5">
            <h1 className={`text-[17pt] font-bold leading-tight mb-1 ${
              darkMode ? 'text-[#f3f4f6]' : 'text-[#1f2937]'
            }`}>
              AI Engineer Technical Architecture &amp; Core Competency Framework
            </h1>
            <p className={`text-[10pt] leading-normal italic ${
              darkMode ? 'text-[#9ca3af]' : 'text-[#4b5563]'
            }`}>
              System architecture specifications, fine-tuning methodologies, RAG orchestration, and high-throughput production inference guidelines for AI engineering systems.
            </p>
          </div>

          {/* Document Technical Points with Gap Chat Slots */}
          <div className="space-y-4">
            {AI_SECTIONS.map((section, slotIdx) => {
              const currentSlotMsg = displayedMessages[slotIdx];
              const isThisActiveInputSlot = activeSlotIndex === slotIdx;

              return (
                <div key={section.id} className="space-y-1.5">
                  {/* Technical Section Heading */}
                  <h2 className={`text-[11.5pt] font-bold ${
                    darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
                  }`}>
                    {section.title}
                  </h2>

                  {/* Static AI Engineering Points */}
                  <ul className={`space-y-1 pl-4 list-disc leading-relaxed text-[10.5pt] ${
                    darkMode ? 'text-[#d1d5db]' : 'text-[#374151]'
                  }`}>
                    {section.points.map((pt, pIdx) => (
                      <li key={pIdx}>{pt}</li>
                    ))}
                  </ul>

                  {/* Interleaved Gap Chat Slot Area (Visible ONLY when author unlocks) */}
                  {isUnlocked ? (
                    <div className="mt-2 pl-4 pr-1">
                      {/* 1. Existing Chat Message in this Slot */}
                      {currentSlotMsg && (
                        <div
                          className={`py-1.5 px-2.5 rounded-xs transition-colors my-1 ${
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
                          <div className={`flex items-start text-[10.5pt] leading-relaxed select-text ${
                            darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
                          }`}>
                            <span className={`font-semibold mr-2 shrink-0 select-none ${
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
                        </div>
                      )}

                      {/* 2. Active Inline Typing Input */}
                      {isThisActiveInputSlot && (
                        <div className={`flex items-start mt-1.5 py-1 px-2 border-l-2 rounded-xs ${
                          darkMode
                            ? 'border-[#4ba3f4] bg-[#1e293b]/40'
                            : 'border-[#0078d4] bg-[#f0f9ff]/40'
                        }`}>
                          <span className={`font-medium mr-2 select-none shrink-0 text-[10.5pt] ${
                            darkMode ? 'text-[#9ca3af]' : 'text-[#64748b]'
                          }`}>
                            {stealthMode === 'plain'
                              ? '•'
                              : `• ${section.notePrefix}:`}
                          </span>

                          <div className="flex-1 relative">
                            <textarea
                              ref={inputRef}
                              value={inputText}
                              onChange={(e) => setInputText(e.target.value)}
                              onKeyDown={handleKeyDown}
                              placeholder="Type technical clause and press Enter to append..."
                              rows={1}
                              className={`w-full resize-none bg-transparent outline-none border-none p-0 leading-relaxed text-[10.5pt] ${
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
                        className="mt-2 pl-4 py-1 cursor-pointer select-none group"
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
            <div className="space-y-1.5 pt-1">
              <h2 className={`text-[11.5pt] font-bold ${
                darkMode ? 'text-[#f3f4f6]' : 'text-[#111827]'
              }`}>
                5. Model Alignment, Red-Teaming &amp; Production Guardrails
              </h2>
              <ul className={`space-y-1 pl-4 list-disc leading-relaxed text-[10.5pt] ${
                darkMode ? 'text-[#d1d5db]' : 'text-[#374151]'
              }`}>
                <li>
                  Automated benchmarking pipelines quantifying factual accuracy, hallucination rates, and RLHF/DPO reward calibration.
                </li>
                <li>
                  Enforcing deterministic input/output guardrails using Llama-Guard and NeMo to prevent prompt injections and data leaks.
                </li>
              </ul>
            </div>

            {/* Peer Typing Indicator */}
            {isUnlocked && peerTyping && (
              <div className={`text-[9.5pt] italic pl-4 border-l-2 border-dashed ${
                darkMode ? 'text-[#9ca3af] border-[#34d399]' : 'text-[#6b7280] border-[#107c41]'
              }`}>
                Co-author is reviewing clause...
              </div>
            )}
          </div>
        </div>

        {/* Document Footer Zone */}
        <div className={`border-t pt-3 mt-6 select-none opacity-70 ${
          darkMode ? 'border-[#3e3e42]' : 'border-[#e5e7eb]'
        }`}>
          <div className={`flex items-center justify-between text-[10px] ${
            darkMode ? 'text-[#9ca3af]' : 'text-[#6b7280]'
          }`}>
            <span>Microsoft Word &bull; AI Engineering Architecture Document</span>
            <span>Page 1 of 1</span>
          </div>
        </div>
      </div>
    </div>
  );
};
