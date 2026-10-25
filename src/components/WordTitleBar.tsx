'use client';

import React from 'react';
import {
  Save,
  Undo2,
  Redo2,
  Search,
  Share2,
  Minus,
  Square,
  X,
  Lock,
  Unlock,
  Settings,
  Sun,
  Moon,
} from 'lucide-react';

interface WordTitleBarProps {
  docTitle: string;
  isUnlocked: boolean;
  participantCount: number;
  currentAuthorId?: string;
  onOpenSettings: () => void;
  onLockToggle: () => void;
  onPanic: () => void;
  darkMode?: boolean;
  toggleDarkMode?: () => void;
  isSaving?: boolean;
}

export const WordTitleBar: React.FC<WordTitleBarProps> = ({
  docTitle,
  isUnlocked,
  participantCount,
  currentAuthorId,
  onOpenSettings,
  onLockToggle,
  onPanic,
  darkMode = false,
  toggleDarkMode,
  isSaving = false,
}) => {
  return (
    <header
      className={`h-[42px] text-white flex items-center justify-between px-2 select-none shrink-0 relative z-20 transition-colors ${
        darkMode ? 'bg-[#0f2d59] border-b border-[#0a1f3d]' : 'bg-[#185abd]'
      }`}
    >
      {/* Left: Quick Access Toolbar & Word Identity */}
      <div className="flex items-center space-x-1.5">
        {/* Word W Icon */}
        <div className="w-6 h-6 bg-white/20 rounded flex items-center justify-center font-bold text-xs tracking-tight shadow-sm hover:bg-white/30 cursor-pointer mr-1">
          W
        </div>

        {/* Quick Save */}
        <button
          onClick={onPanic}
          title="Save (Ctrl+S)"
          className="p-1 hover:bg-white/20 rounded transition-colors text-white/90 hover:text-white cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" />
        </button>

        {/* Undo */}
        <button
          onClick={onPanic}
          title="Undo (Ctrl+Z)"
          className="p-1 hover:bg-white/20 rounded transition-colors text-white/90 hover:text-white cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </button>

        {/* Redo */}
        <button
          title="Redo (Ctrl+Y)"
          className="hidden sm:block p-1 hover:bg-white/20 rounded transition-colors text-white/90 hover:text-white opacity-70 cursor-pointer"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </button>

        {/* Document Title */}
        <div className="flex items-center ml-1 sm:ml-2 space-x-1.5 min-w-0">
          <span className="font-semibold text-xs tracking-wide truncate max-w-[110px] xs:max-w-[160px] sm:max-w-[240px] md:max-w-none">
            {docTitle}
          </span>
          {isSaving ? (
            <span className="text-amber-200 text-[10px] sm:text-[11px] flex items-center space-x-1 animate-pulse select-none shrink-0">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-300"></span>
              <span>- Saving...</span>
            </span>
          ) : (
            <span className="text-white/60 text-[11px] select-none hidden sm:inline shrink-0">- Saved to OneDrive</span>
          )}
        </div>
      </div>

      {/* Middle: Universal Search Bar */}
      <div className="hidden md:flex items-center justify-center flex-1 max-w-md mx-4">
        <div className={`w-full max-w-xs flex items-center rounded-md px-2.5 py-1 text-xs cursor-pointer transition-colors shadow-inner border border-white/10 ${
          darkMode ? 'bg-[#091e3b] text-white/70' : 'bg-[#104a9b] hover:bg-[#0c3977] text-white/80'
        }`}>
          <Search className="w-3 h-3 mr-2 text-white/60" />
          <span className="text-[11px] text-white/70">Search (Alt + Q)</span>
        </div>
      </div>

      {/* Right: Presence, Theme Toggle, Lock Status, Share, Windows Controls */}
      <div className="flex items-center space-x-1">
        {/* Dark/Light mode toggle */}
        {toggleDarkMode && (
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
            className="p-1 hover:bg-white/20 rounded transition-colors text-white/90 hover:text-white cursor-pointer mr-1"
          >
            {darkMode ? <Sun className="w-3.5 h-3.5 text-amber-300" /> : <Moon className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Co-authoring Presence Badges (Disguised 2-Person Word Collaboration) */}
        {(() => {
          const displayCount = Math.min(2, Math.max(1, participantCount));
          return (
            <div
              title={`${displayCount} co-author${displayCount === 1 ? '' : 's'} active`}
              className="flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-white/10 transition cursor-pointer mr-1"
            >
              <div className="flex -space-x-1.5">
                <div
                  className={`w-5 h-5 rounded-full bg-[#0078d4] text-white text-[9px] font-bold flex items-center justify-center border ${
                    currentAuthorId === 'author-1' ? 'border-white ring-1 ring-white/70' : 'border-[#185abd]'
                  }`}
                  title={`Author 1 (Online)${currentAuthorId === 'author-1' ? ' - You' : ''}`}
                >
                  A1
                </div>
                {displayCount > 1 ? (
                  <div
                    className={`w-5 h-5 rounded-full bg-[#107c41] text-white text-[9px] font-bold flex items-center justify-center border ${
                      currentAuthorId === 'author-2' ? 'border-white ring-1 ring-white/70' : 'border-[#185abd]'
                    }`}
                    title={`Author 2 (Online)${currentAuthorId === 'author-2' ? ' - You' : ''}`}
                  >
                    A2
                  </div>
                ) : (
                  <div
                    className="w-5 h-5 rounded-full bg-white/20 text-white/60 text-[8px] font-medium flex items-center justify-center border border-white/20"
                    title="Waiting for Author 2..."
                  >
                    +
                  </div>
                )}
              </div>
              {isUnlocked && currentAuthorId ? (
                <span
                  className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded shadow-xs select-none ml-1 ${
                    currentAuthorId === 'author-2'
                      ? 'bg-[#107c41] text-white ring-1 ring-white/40'
                      : 'bg-[#0078d4] text-white ring-1 ring-white/40'
                  }`}
                  title={currentAuthorId === 'author-2' ? 'Logged in as Author 2' : 'Logged in as Author 1'}
                >
                  {currentAuthorId === 'author-2' ? 'You: A2' : 'You: A1'}
                </span>
              ) : (
                <span className="text-[10px] text-white/90 ml-1 font-medium select-none">
                  {displayCount === 2 ? '2 Authors' : '1 Author'}
                </span>
              )}
            </div>
          );
        })()}

        {/* Document Editing status */}
        <button
          onClick={onLockToggle}
          title={isUnlocked ? 'Editing Mode (Click to Lock)' : 'Viewing Mode (Click to Unlock)'}
          className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-medium transition-colors cursor-pointer ${
            isUnlocked
              ? 'bg-emerald-600/70 hover:bg-emerald-600 text-white'
              : 'bg-amber-500/80 hover:bg-amber-600 text-white'
          }`}
        >
          {isUnlocked ? (
            <>
              <Unlock className="w-3 h-3 mr-0.5" />
              <span className="hidden sm:inline">Editing</span>
            </>
          ) : (
            <>
              <Lock className="w-3 h-3 mr-0.5" />
              <span className="hidden sm:inline">Viewing</span>
            </>
          )}
        </button>

        {/* Share Button */}
        <button
          onClick={onOpenSettings}
          className="hidden sm:flex items-center space-x-1 bg-white/15 hover:bg-white/25 px-2.5 py-1 rounded text-xs transition-colors cursor-pointer"
          title="Share"
        >
          <Share2 className="w-3 h-3" />
          <span className="text-[11px] font-medium">Share</span>
        </button>

        {/* Properties button */}
        <button
          onClick={onOpenSettings}
          className="p-1 hover:bg-white/20 rounded transition-colors text-white/80 hover:text-white cursor-pointer"
          title="Properties"
        >
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Window controls (desktop only) */}
        <div className="hidden md:flex items-center pl-2 ml-1 border-l border-white/20">
          <button
            onClick={onPanic}
            title="Minimize"
            className="w-7 h-7 flex items-center justify-center hover:bg-white/20 text-white/90 hover:text-white cursor-pointer"
          >
            <Minus className="w-3 h-3" />
          </button>
          <button
            title="Maximize"
            className="w-7 h-7 flex items-center justify-center hover:bg-white/20 text-white/90 hover:text-white cursor-pointer"
          >
            <Square className="w-2.5 h-2.5" />
          </button>
          <button
            onClick={onPanic}
            title="Close"
            className="w-7 h-7 flex items-center justify-center hover:bg-red-600 text-white/90 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
