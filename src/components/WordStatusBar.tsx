'use client';

import React from 'react';
import {
  BookOpen,
  FileText,
  Globe,
  Sliders,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';

interface WordStatusBarProps {
  wordCount: number;
  zoomLevel: number;
  setZoomLevel: (zoom: number) => void;
  isUnlocked: boolean;
  darkMode?: boolean;
}

export const WordStatusBar: React.FC<WordStatusBarProps> = ({
  wordCount,
  zoomLevel,
  setZoomLevel,
  isUnlocked,
  darkMode = false,
}) => {
  const handleZoomChange = (delta: number) => {
    const next = Math.min(160, Math.max(70, zoomLevel + delta));
    setZoomLevel(next);
  };

  return (
    <footer
      className={`h-6 text-white flex items-center justify-between px-3 text-[11px] select-none shrink-0 z-20 font-sans transition-colors ${
        darkMode ? 'bg-[#0f2d59] border-t border-[#0a1f3d]' : 'bg-[#185abd]'
      }`}
    >
      {/* Left items: Page, Word count, Proofing, Language */}
      <div className="flex items-center space-x-3">
        <button className="hover:bg-white/20 px-1.5 py-0.5 rounded transition cursor-pointer">
          Page 1 of 1
        </button>

        <button className="hover:bg-white/20 px-1.5 py-0.5 rounded transition cursor-pointer">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </button>

        <div className="flex items-center space-x-1 hover:bg-white/20 px-1.5 py-0.5 rounded transition cursor-pointer">
          <CheckCircle2 className="w-3 h-3 text-white/90" />
          <span className="hidden sm:inline">No proofing errors</span>
        </div>

        <button className="hover:bg-white/20 px-1.5 py-0.5 rounded transition cursor-pointer hidden md:inline">
          English (United States)
        </button>

        <div className="hidden lg:flex items-center space-x-1 text-white/80">
          <span>Mode:</span>
          <span className="font-semibold text-white">
            {isUnlocked ? 'Editing Mode' : 'Viewing Mode'}
          </span>
        </div>
      </div>

      {/* Right items: Focus & Views (desktop/tablet) + Zoom Controls (all devices including mobile) */}
      <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
        <button
          title="Focus Mode"
          className="hover:bg-white/20 px-1 py-0.5 rounded text-white/80 hover:text-white transition hidden md:inline"
        >
          <Sliders className="w-3 h-3" />
        </button>

        {/* View buttons (hidden on mobile to save space) */}
        <div className="hidden sm:flex items-center space-x-0.5 border-r border-white/20 pr-2 mr-1">
          <button
            title="Read Mode"
            className="p-1 hover:bg-white/20 text-white/80 hover:text-white rounded transition"
          >
            <BookOpen className="w-3 h-3" />
          </button>
          <button
            title="Print Layout (Current)"
            className="p-1 bg-white/25 text-white rounded transition"
          >
            <FileText className="w-3 h-3" />
          </button>
          <button
            title="Web Layout"
            className="p-1 hover:bg-white/20 text-white/80 hover:text-white rounded transition"
          >
            <Globe className="w-3 h-3" />
          </button>
        </div>

        {/* Zoom controls: accessible on phone, tablet, and desktop */}
        <div className="flex items-center space-x-1 bg-white/10 sm:bg-transparent px-1.5 py-0.5 rounded">
          <button
            onClick={() => handleZoomChange(-10)}
            title="Zoom Out"
            className="hover:bg-white/25 active:bg-white/40 p-1 sm:p-0.5 rounded transition text-white/90 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          </button>

          <input
            type="range"
            min={70}
            max={160}
            step={5}
            value={zoomLevel}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
            className="hidden sm:inline w-16 h-1 bg-white/40 rounded-lg appearance-none cursor-pointer accent-white"
          />

          <button
            onClick={() => handleZoomChange(10)}
            title="Zoom In"
            className="hover:bg-white/25 active:bg-white/40 p-1 sm:p-0.5 rounded transition text-white/90 hover:text-white flex items-center justify-center cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
          </button>

          {/* Clickable zoom percentage badge that cycles zoom presets on tap */}
          <button
            onClick={() => {
              if (zoomLevel < 100) setZoomLevel(100);
              else if (zoomLevel === 100) setZoomLevel(120);
              else if (zoomLevel <= 125) setZoomLevel(150);
              else setZoomLevel(90);
            }}
            title="Click to cycle zoom presets (90%, 100%, 120%, 150%)"
            className="w-10 text-center font-medium text-[10px] bg-white/15 sm:bg-transparent hover:bg-white/25 px-1 py-0.5 rounded cursor-pointer transition select-none"
          >
            {zoomLevel}%
          </button>
        </div>
      </div>
    </footer>
  );
};
