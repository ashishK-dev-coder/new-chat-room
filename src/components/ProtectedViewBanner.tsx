'use client';

import React from 'react';
import { AlertCircle, Lock } from 'lucide-react';

interface ProtectedViewBannerProps {
  onEnableEditing: () => void;
}

export const ProtectedViewBanner: React.FC<ProtectedViewBannerProps> = ({ onEnableEditing }) => {
  return (
    <div className="bg-[#fff4ce] border-b border-[#f0c36d] px-2.5 sm:px-4 py-1.5 flex items-center justify-between text-xs text-[#323130] select-none shrink-0 shadow-xs gap-2">
      <div className="flex items-center space-x-2 min-w-0">
        <AlertCircle className="w-4 h-4 text-[#8a660a] shrink-0" />
        <div className="truncate">
          <span className="font-bold text-[#795b00] uppercase tracking-wider mr-1 sm:mr-2 text-[10px] sm:text-[11px] shrink-0">
            PROTECTED VIEW
          </span>
          <span className="text-[11px] sm:text-[12px] text-[#484644] hidden xs:inline">
            Password-protected. Unless you need to edit, it&apos;s safer to stay in Protected View.
          </span>
        </div>
      </div>

      <button
        onClick={onEnableEditing}
        className="bg-[#107c41] hover:bg-[#0b5c30] text-white px-2.5 sm:px-3 py-1 rounded text-xs font-semibold flex items-center space-x-1 sm:space-x-1.5 transition-colors cursor-pointer shadow-xs shrink-0"
      >
        <Lock className="w-3 h-3" />
        <span>Enable Editing</span>
      </button>
    </div>
  );
};
