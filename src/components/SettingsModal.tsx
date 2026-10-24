'use client';

import React, { useState } from 'react';
import {
  X,
  Copy,
  Check,
  ShieldAlert,
  Sliders,
  Users,
  FileText,
  KeyRound,
  Trash2,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  setRoomId: (id: string) => void;
  docTitle: string;
  setDocTitle: (title: string) => void;
  stealthMode: 'coauthor' | 'plain' | 'memo';
  setStealthMode: (mode: 'coauthor' | 'plain' | 'memo') => void;
  onPanicClear: () => void;
  currentPassword: string;
  setCurrentPassword: (pw: string) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  roomId,
  setRoomId,
  docTitle,
  setDocTitle,
  stealthMode,
  setStealthMode,
  onPanicClear,
  currentPassword,
  setCurrentPassword,
}) => {
  const [copied, setCopied] = useState(false);
  const [tempRoom, setTempRoom] = useState(roomId);
  const [tempTitle, setTempTitle] = useState(docTitle);
  const [tempPw, setTempPw] = useState(currentPassword);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/?room=${encodeURIComponent(tempRoom)}`;
      navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleSave = () => {
    setRoomId(tempRoom.trim() || 'default-room');
    setDocTitle(tempTitle.trim() || 'Document1 - Word');
    setCurrentPassword(tempPw.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4 animate-in fade-in select-none text-xs">
      <div className="w-full max-w-lg bg-white rounded-md shadow-2xl border border-[#c8c6c4] overflow-hidden text-[#201f1e]">
        {/* Backstage header */}
        <div className="bg-[#185abd] text-white px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Sliders className="w-4 h-4" />
            <span className="font-semibold text-sm">Document Properties & Live Co-authoring</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/20 rounded text-white/80 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content body */}
        <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
          {/* Quick Share Link */}
          <div className="bg-[#f3f2f1] p-3 rounded border border-[#e1dfdd] space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-[#201f1e] flex items-center">
                <Users className="w-3.5 h-3.5 mr-1.5 text-[#0078d4]" />
                2-Person Private Room Link
              </span>
              <button
                onClick={handleCopyLink}
                className="flex items-center space-x-1 text-[#0078d4] hover:text-[#106ebe] font-medium text-[11px] cursor-pointer"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? 'Link Copied!' : 'Copy Invitation Link'}</span>
              </button>
            </div>
            <p className="text-[11px] text-[#605e5c]">
              Share this link with your 2nd person. Both participants will see the Word document and sync real-time live typing.
            </p>
          </div>

          {/* Document Properties */}
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-[#323130] flex items-center">
                <FileText className="w-3.5 h-3.5 mr-1 text-[#605e5c]" />
                Disguise Document Title
              </label>
              <input
                type="text"
                value={tempTitle}
                onChange={(e) => setTempTitle(e.target.value)}
                placeholder="e.g. Financial_Audit_Draft_2026.docx"
                className="w-full h-8 px-2.5 bg-white border border-[#8a8886] rounded text-[16px] sm:text-xs text-[#201f1e] focus:outline-none focus:border-[#185abd]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#323130]">Room Identifier</label>
                <input
                  type="text"
                  value={tempRoom}
                  onChange={(e) => setTempRoom(e.target.value)}
                  placeholder="e.g. room-alpha"
                  className="w-full h-8 px-2.5 bg-white border border-[#8a8886] rounded text-[16px] sm:text-xs text-[#201f1e] focus:outline-none focus:border-[#185abd]"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-[#323130] flex items-center">
                  <KeyRound className="w-3 h-3 mr-1 text-[#605e5c]" />
                  Access Password
                </label>
                <input
                  type="text"
                  value={tempPw}
                  onChange={(e) => setTempPw(e.target.value)}
                  placeholder="Vercel ENV (CHAT_PASSWORD)"
                  className="w-full h-8 px-2.5 bg-white border border-[#8a8886] rounded text-[16px] sm:text-xs text-[#201f1e] focus:outline-none focus:border-[#185abd]"
                />
              </div>
            </div>
          </div>

          {/* Stealth Visual Mode */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[#323130]">Text Presentation Style</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setStealthMode('coauthor')}
                className={`p-2.5 rounded border text-left transition-all ${
                  stealthMode === 'coauthor'
                    ? 'border-[#0078d4] bg-[#eff6fc] font-semibold text-[#004578]'
                    : 'border-[#c8c6c4] hover:bg-[#f3f2f1] text-[#323130]'
                }`}
              >
                <div className="font-medium text-xs">Track Changes</div>
                <div className="text-[10px] text-[#605e5c] mt-0.5">Author color margin lines</div>
              </button>

              <button
                type="button"
                onClick={() => setStealthMode('plain')}
                className={`p-2.5 rounded border text-left transition-all ${
                  stealthMode === 'plain'
                    ? 'border-[#0078d4] bg-[#eff6fc] font-semibold text-[#004578]'
                    : 'border-[#c8c6c4] hover:bg-[#f3f2f1] text-[#323130]'
                }`}
              >
                <div className="font-medium text-xs">Plain Document</div>
                <div className="text-[10px] text-[#605e5c] mt-0.5">100% normal black text</div>
              </button>

              <button
                type="button"
                onClick={() => setStealthMode('memo')}
                className={`p-2.5 rounded border text-left transition-all ${
                  stealthMode === 'memo'
                    ? 'border-[#0078d4] bg-[#eff6fc] font-semibold text-[#004578]'
                    : 'border-[#c8c6c4] hover:bg-[#f3f2f1] text-[#323130]'
                }`}
              >
                <div className="font-medium text-xs">Numbered Memo</div>
                <div className="text-[10px] text-[#605e5c] mt-0.5">&sect; 1.1 paragraph clause</div>
              </button>
            </div>
          </div>

          {/* Panic Key Help & Instant Action */}
          <div className="p-3 bg-amber-50/70 border border-amber-200 rounded text-xs space-y-2">
            <div className="flex items-center space-x-1.5 text-amber-900 font-semibold">
              <ShieldAlert className="w-4 h-4 text-amber-600" />
              <span>Instant Stealth Panic Wipe</span>
            </div>
            <p className="text-[11px] text-amber-800 leading-relaxed">
              Press the <kbd className="px-1.5 py-0.5 bg-white border border-amber-300 rounded font-mono font-bold">Windows Key</kbd> or <kbd className="px-1.5 py-0.5 bg-white border border-amber-300 rounded font-mono">Escape</kbd> at any time. The entire document will be wiped instantly from your screen and synchronized in the background.
            </p>
            <button
              onClick={() => {
                onPanicClear();
                onClose();
              }}
              className="mt-1 flex items-center space-x-1.5 px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-xs font-medium cursor-pointer shadow-xs transition"
            >
              <Trash2 className="w-3 h-3" />
              <span>Wipe Document Now (Clear 4 Messages)</span>
            </button>
          </div>
        </div>

        {/* Action footer */}
        <div className="bg-[#f3f2f1] border-t border-[#e1dfdd] px-4 py-2.5 flex items-center justify-end space-x-2">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white hover:bg-[#eae8e6] border border-[#8a8886] rounded text-xs font-medium text-[#201f1e] cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 bg-[#0078d4] hover:bg-[#106ebe] text-white rounded text-xs font-medium cursor-pointer shadow-xs"
          >
            Apply Changes
          </button>
        </div>
      </div>
    </div>
  );
};
