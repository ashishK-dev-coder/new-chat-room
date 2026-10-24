'use client';

import React from 'react';

interface WordRulerProps {
  darkMode?: boolean;
}

export const WordRuler: React.FC<WordRulerProps> = ({ darkMode = false }) => {
  return (
    <div
      className={`hidden md:flex w-full items-center justify-center shrink-0 border-b select-none py-0.5 transition-colors ${
        darkMode ? 'bg-[#181818] border-[#333333]' : 'bg-[#f3f2f1] border-[#e1dfdd]'
      }`}
    >
      <div
        className={`w-[816px] h-4 border-x flex items-center relative text-[9px] transition-colors ${
          darkMode ? 'bg-[#282828] border-[#444444] text-[#a0a0a0]' : 'bg-white border-[#c8c6c4] text-[#605e5c]'
        }`}
      >
        {/* Left Margin area (grayed) */}
        <div
          className={`w-[88px] h-full border-r relative transition-colors ${
            darkMode ? 'bg-[#1e1e1e] border-[#555]' : 'bg-[#e1dfdd] border-[#8a8886]'
          }`}
        >
          {/* Indent sliders */}
          <div
            className={`absolute right-0 top-0 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-t-[5px] ${
              darkMode ? 'border-t-[#a0a0a0]' : 'border-t-[#605e5c]'
            }`}
            title="First Line Indent"
          />
          <div
            className={`absolute right-0 bottom-0 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[5px] ${
              darkMode ? 'border-b-[#a0a0a0]' : 'border-b-[#605e5c]'
            }`}
            title="Left Indent"
          />
        </div>

        {/* Active Ruler Zone with 1-inch marks (96px each) */}
        <div className="flex-1 h-full flex items-center justify-between px-3 relative">
          {[1, 2, 3, 4, 5, 6].map((num) => (
            <div key={num} className="flex-1 flex items-center justify-between h-full relative">
              <div className={`h-1 w-px ${darkMode ? 'bg-[#444]' : 'bg-[#c8c6c4]'}`} />
              <div className={`h-1.5 w-px ${darkMode ? 'bg-[#666]' : 'bg-[#a19f9d]'}`} />
              <div className={`h-1 w-px ${darkMode ? 'bg-[#444]' : 'bg-[#c8c6c4]'}`} />
              <span className={`text-[9px] font-sans font-medium px-1 ${
                darkMode ? 'text-[#a0a0a0]' : 'text-[#605e5c]'
              }`}>
                {num}
              </span>
            </div>
          ))}
        </div>

        {/* Right Margin area (grayed) */}
        <div
          className={`w-[88px] h-full border-l relative transition-colors ${
            darkMode ? 'bg-[#1e1e1e] border-[#555]' : 'bg-[#e1dfdd] border-[#8a8886]'
          }`}
        >
          <div
            className={`absolute left-0 bottom-0 w-0 h-0 border-l-[3px] border-l-transparent border-r-[3px] border-r-transparent border-b-[5px] ${
              darkMode ? 'border-b-[#a0a0a0]' : 'border-b-[#605e5c]'
            }`}
            title="Right Indent"
          />
        </div>
      </div>
    </div>
  );
};
