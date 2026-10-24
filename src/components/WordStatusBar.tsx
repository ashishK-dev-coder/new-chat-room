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

      {/* Right items: Focus, Views, Zoom Slider (desktop/tablet) */}
      <div className="hidden sm:flex items-center space-x-2">
        <button
          title="Focus Mode"
          className="hover:bg-white/20 px-1 py-0.5 rounded text-white/80 hover:text-white transition hidden sm:inline"
        >
          <Sliders className="w-3 h-3" />
        </button>

        {/* View buttons */}
        <div className="flex items-center space-x-0.5 border-r border-white/20 pr-2 mr-1">
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

        {/* Zoom controls */}
        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleZoomChange(-10)}
            title="Zoom Out"
            className="hover:bg-white/20 p-0.5 rounded transition text-white/80 hover:text-white"
          >
            <ZoomOut className="w-3 h-3" />
          </button>

          <input
            type="range"
            min={70}
            max={150}
            step={5}
            value={zoomLevel}
            onChange={(e) => setZoomLevel(Number(e.target.value))}
            className="w-16 h-1 bg-white/40 rounded-lg appearance-none cursor-pointer accent-white"
          />

          <button
            onClick={() => handleZoomChange(10)}
            title="Zoom In"
            className="hover:bg-white/20 p-0.5 rounded transition text-white/80 hover:text-white"
          >
            <ZoomIn className="w-3 h-3" />
          </button>

          <span className="w-8 text-right font-medium text-[10px]">
            {zoomLevel}%
          </span>
        </div>
      </div>
    </footer>
  );
};
