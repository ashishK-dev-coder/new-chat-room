'use client';

import React, { useState } from 'react';
import {
  Clipboard,
  Scissors,
  Copy,
  Paintbrush,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Subscript,
  Superscript,
  Highlighter,
  Baseline,
  List,
  ListOrdered,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Search,
  Replace,
  MousePointer2,
  Eraser,
  PenTool,
  Moon,
  Sun,
  FileText,
  Eye,
} from 'lucide-react';

export interface FontSettings {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  alignment: 'left' | 'center' | 'right' | 'justify';
}

interface WordRibbonProps {
  fontSettings: FontSettings;
  setFontSettings: React.Dispatch<React.SetStateAction<FontSettings>>;
  onOpenFileMenu: () => void;
  onPanicClear: () => void;
  darkMode: boolean;
  toggleDarkMode: () => void;
  isFontColorBlinking: boolean;
}

export const WordRibbon: React.FC<WordRibbonProps> = ({
  fontSettings,
  setFontSettings,
  onOpenFileMenu,
  onPanicClear,
  darkMode,
  toggleDarkMode,
  isFontColorBlinking,
}) => {
  const [activeTab, setActiveTab] = useState<'Home' | 'Insert' | 'Layout' | 'Review' | 'View'>('Home');

  const tabs = [
    { id: 'File', label: 'File', isSpecial: true },
    { id: 'Home', label: 'Home' },
    { id: 'Insert', label: 'Insert' },
    { id: 'Draw', label: 'Draw' },
    { id: 'Design', label: 'Design' },
    { id: 'Layout', label: 'Layout' },
    { id: 'References', label: 'References' },
    { id: 'Mailings', label: 'Mailings' },
    { id: 'Review', label: 'Review' },
    { id: 'View', label: 'View' },
    { id: 'Help', label: 'Help' },
  ];

  const toggleBold = () => setFontSettings((s) => ({ ...s, bold: !s.bold }));
  const toggleItalic = () => setFontSettings((s) => ({ ...s, italic: !s.italic }));
  const toggleUnderline = () => setFontSettings((s) => ({ ...s, underline: !s.underline }));

  return (
    <div
      className={`border-b select-none text-xs shrink-0 shadow-xs transition-colors ${
        darkMode
          ? 'bg-[#202020] border-[#333333] text-[#e0e0e0]'
          : 'bg-[#f3f2f1] border-[#e1dfdd] text-[#201f1e]'
      }`}
    >
      {/* Ribbon Tabs Header */}
      <div
        className={`flex items-center space-x-0.5 px-3 pt-1 border-b transition-colors ${
          darkMode ? 'bg-[#181818] border-[#333333]' : 'bg-[#fbfbfb] border-[#e1dfdd]'
        }`}
      >
        {tabs.map((tab) => {
          if (tab.id === 'File') {
            return (
              <button
                key={tab.id}
                onClick={onOpenFileMenu}
                className="bg-[#185abd] hover:bg-[#104a9b] text-white px-3 py-1 font-semibold rounded-t-sm transition-colors text-xs mr-1 cursor-pointer"
              >
                {tab.label}
              </button>
            );
          }

          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-3 py-1 text-xs rounded-t-sm font-medium transition-colors cursor-pointer relative ${
                isActive
                  ? darkMode
                    ? 'text-[#4ba3f4] bg-[#202020] font-semibold border-t-2 border-[#4ba3f4]'
                    : 'text-[#185abd] bg-[#f3f2f1] font-semibold border-t-2 border-[#185abd]'
                  : darkMode
                  ? 'text-[#a0a0a0] hover:bg-[#282828]'
                  : 'text-[#323130] hover:bg-[#eae8e6]'
              }`}
            >
              {tab.label}
            </button>
          );
        })}

        {/* Quick Dark Mode toggle tab button on right */}
        <div className="flex-1 flex justify-end pr-2 pb-0.5">
          <button
            onClick={toggleDarkMode}
            title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className={`flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] transition-colors cursor-pointer ${
              darkMode
                ? 'bg-[#333333] hover:bg-[#444444] text-amber-300'
                : 'bg-white hover:bg-[#eae8e6] border border-[#c8c6c4] text-[#323130]'
            }`}
          >
            {darkMode ? <Sun className="w-3 h-3 text-amber-300" /> : <Moon className="w-3 h-3 text-neutral-600" />}
            <span className="hidden sm:inline font-medium">
              {darkMode ? 'Light Mode' : 'Dark Mode'}
            </span>
          </button>
        </div>
      </div>

      {/* Ribbon Tools Container */}
      <div
        className={`h-[88px] px-3 py-1.5 flex items-stretch space-x-3 overflow-x-auto transition-colors ${
          darkMode ? 'bg-[#202020]' : 'bg-[#f3f2f1]'
        }`}
      >
        {activeTab === 'View' ? (
          /* View Tab Specific Tools */
          <div className="flex items-center space-x-4">
            <div className="flex flex-col justify-between pr-3 border-r border-[#888888]/20">
              <button
                onClick={toggleDarkMode}
                className={`flex flex-col items-center justify-center px-3 py-1.5 rounded transition-colors cursor-pointer group ${
                  darkMode ? 'hover:bg-[#333333]' : 'hover:bg-[#eae8e6]'
                }`}
              >
                {darkMode ? (
                  <Sun className="w-6 h-6 text-amber-400" />
                ) : (
                  <Moon className="w-6 h-6 text-[#185abd]" />
                )}
                <span className="text-[10px] mt-1 font-medium">
                  {darkMode ? 'Switch Modes (Light)' : 'Switch Modes (Dark)'}
                </span>
              </button>
              <span className="text-[9px] text-[#888888] text-center font-medium">Dark Mode</span>
            </div>

            <div className="flex flex-col justify-between pr-3 border-r border-[#888888]/20">
              <div className="flex items-center space-x-2">
                <div className="flex flex-col items-center px-2 py-1">
                  <FileText className="w-5 h-5 text-[#888888]" />
                  <span className="text-[10px] mt-0.5">Print Layout</span>
                </div>
                <div className="flex flex-col items-center px-2 py-1">
                  <Eye className="w-5 h-5 text-[#888888]" />
                  <span className="text-[10px] mt-0.5">Immersive</span>
                </div>
              </div>
              <span className="text-[9px] text-[#888888] text-center font-medium">Views</span>
            </div>
          </div>
        ) : (
          /* Home Tab Standard Tools */
          <>
            {/* Clipboard Group */}
            <div className={`flex flex-col justify-between pr-3 border-r ${darkMode ? 'border-[#333333]' : 'border-[#e1dfdd]'}`}>
              <div className="flex items-start space-x-1">
                <button
                  title="Paste (Ctrl+V)"
                  className={`flex flex-col items-center justify-center px-2 py-1 rounded transition-colors group cursor-pointer ${
                    darkMode ? 'hover:bg-[#2f2f2f]' : 'hover:bg-[#eae8e6]'
                  }`}
                >
                  <Clipboard className={`w-5 h-5 ${darkMode ? 'text-[#e0e0e0]' : 'text-[#323130]'}`} />
                  <span className="text-[10px] mt-0.5 font-normal">Paste</span>
                </button>

                <div className="flex flex-col space-y-0.5">
                  <button
                    title="Cut (Ctrl+X)"
                    className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                      darkMode ? 'hover:bg-[#2f2f2f]' : 'hover:bg-[#eae8e6]'
                    }`}
                  >
                    <Scissors className="w-3 h-3 text-[#888888]" />
                    <span>Cut</span>
                  </button>
                  <button
                    title="Copy (Ctrl+C)"
                    className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                      darkMode ? 'hover:bg-[#2f2f2f]' : 'hover:bg-[#eae8e6]'
                    }`}
                  >
                    <Copy className="w-3 h-3 text-[#888888]" />
                    <span>Copy</span>
                  </button>
                  <button
                    title="Format Painter"
                    className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                      darkMode ? 'hover:bg-[#2f2f2f]' : 'hover:bg-[#eae8e6]'
                    }`}
                  >
                    <Paintbrush className="w-3 h-3 text-[#888888]" />
                    <span>Painter</span>
                  </button>
                </div>
              </div>
              <span className="text-[9px] text-[#888888] text-center font-medium">Clipboard</span>
            </div>

            {/* Font Group */}
            <div className={`flex flex-col justify-between pr-3 border-r ${darkMode ? 'border-[#333333]' : 'border-[#e1dfdd]'}`}>
              <div className="flex flex-col space-y-1">
                {/* Font Family & Size Dropdowns */}
                <div className="flex items-center space-x-1.5">
                  <select
                    value={fontSettings.family}
                    onChange={(e) => setFontSettings((s) => ({ ...s, family: e.target.value }))}
                    className={`h-6 px-1.5 text-xs rounded focus:outline-none cursor-pointer border ${
                      darkMode
                        ? 'bg-[#2b2b2b] border-[#444444] text-[#e0e0e0] focus:border-[#4ba3f4]'
                        : 'bg-white border-[#c8c6c4] text-[#323130] focus:border-[#185abd]'
                    }`}
                  >
                    <option value="Calibri">Calibri</option>
                    <option value="Aptos">Aptos</option>
                    <option value="Arial">Arial</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Segoe UI">Segoe UI</option>
                  </select>

                  <select
                    value={fontSettings.size}
                    onChange={(e) => setFontSettings((s) => ({ ...s, size: Number(e.target.value) }))}
                    className={`h-6 w-12 px-1 text-xs rounded focus:outline-none cursor-pointer border ${
                      darkMode
                        ? 'bg-[#2b2b2b] border-[#444444] text-[#e0e0e0] focus:border-[#4ba3f4]'
                        : 'bg-white border-[#c8c6c4] text-[#323130] focus:border-[#185abd]'
                    }`}
                  >
                    {[9, 10, 11, 12, 14, 16, 18].map((sz) => (
                  <option key={sz} value={sz}>
                    {sz}
                  </option>
                ))}
              </select>

              <button
                onClick={onPanicClear}
                title="Clear All Formatting"
                className={`p-1 rounded transition-colors ml-1 cursor-pointer ${
                  darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Font Styling Buttons */}
            <div className="flex items-center space-x-1">
              <button
                onClick={toggleBold}
                className={`p-1 rounded transition-colors ${
                  fontSettings.bold
                    ? darkMode
                      ? 'bg-[#0f3a7a] text-white font-bold'
                      : 'bg-[#c7e0f4] text-[#004578]'
                    : darkMode
                    ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]'
                    : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
                title="Bold (Ctrl+B)"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={toggleItalic}
                className={`p-1 rounded transition-colors ${
                  fontSettings.italic
                    ? darkMode
                      ? 'bg-[#0f3a7a] text-white'
                      : 'bg-[#c7e0f4] text-[#004578]'
                    : darkMode
                    ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]'
                    : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
                title="Italic (Ctrl+I)"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={toggleUnderline}
                className={`p-1 rounded transition-colors ${
                  fontSettings.underline
                    ? darkMode
                      ? 'bg-[#0f3a7a] text-white'
                      : 'bg-[#c7e0f4] text-[#004578]'
                    : darkMode
                    ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]'
                    : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
                title="Underline (Ctrl+U)"
              >
                <Underline className="w-3.5 h-3.5" />
              </button>

              <button
                title="Strikethrough"
                className={`p-1 rounded ${darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'}`}
              >
                <Strikethrough className="w-3.5 h-3.5" />
              </button>

              <button
                title="Subscript"
                className={`p-1 rounded ${darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'}`}
              >
                <Subscript className="w-3.5 h-3.5" />
              </button>

              <button
                title="Superscript"
                className={`p-1 rounded ${darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'}`}
              >
                <Superscript className="w-3.5 h-3.5" />
              </button>

              <button
                title="Text Highlight"
                className={`p-1 rounded ${darkMode ? 'hover:bg-[#2f2f2f]' : 'hover:bg-[#eae8e6]'}`}
              >
                <Highlighter className="w-3.5 h-3.5 text-amber-500" />
              </button>

              {/* The 'A' Font Color button (shows a clean subtle border when message arrives while logged out) */}
              <button
                title="Font Color"
                className={`p-1 rounded cursor-pointer relative transition-colors ${
                  isFontColorBlinking
                    ? darkMode
                      ? 'border border-red-400 bg-red-950/30'
                      : 'border border-red-500 bg-red-50/70'
                    : darkMode
                    ? 'border border-transparent hover:bg-[#2f2f2f] text-[#e0e0e0]'
                    : 'border border-transparent hover:bg-[#eae8e6] text-[#323130]'
                }`}
              >
                <Baseline className="w-3.5 h-3.5 text-red-600" />
              </button>
            </div>
          </div>
          <span className="text-[9px] text-[#888888] text-center font-medium">Font</span>
        </div>

        {/* Paragraph Group */}
        <div className={`flex flex-col justify-between pr-3 border-r ${darkMode ? 'border-[#333333]' : 'border-[#e1dfdd]'}`}>
          <div className="flex flex-col space-y-1">
            <div className="flex items-center space-x-1">
              <button
                title="Bullets"
                className={`p-1 rounded ${darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                title="Numbering"
                className={`p-1 rounded ${darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'}`}
              >
                <ListOrdered className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex items-center space-x-1">
              <button
                onClick={() => setFontSettings((s) => ({ ...s, alignment: 'left' }))}
                className={`p-1 rounded ${
                  fontSettings.alignment === 'left'
                    ? darkMode ? 'bg-[#0f3a7a] text-white' : 'bg-[#c7e0f4] text-[#004578]'
                    : darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
                title="Align Left"
              >
                <AlignLeft className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setFontSettings((s) => ({ ...s, alignment: 'center' }))}
                className={`p-1 rounded ${
                  fontSettings.alignment === 'center'
                    ? darkMode ? 'bg-[#0f3a7a] text-white' : 'bg-[#c7e0f4] text-[#004578]'
                    : darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
                title="Center"
              >
                <AlignCenter className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setFontSettings((s) => ({ ...s, alignment: 'right' }))}
                className={`p-1 rounded ${
                  fontSettings.alignment === 'right'
                    ? darkMode ? 'bg-[#0f3a7a] text-white' : 'bg-[#c7e0f4] text-[#004578]'
                    : darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
                title="Align Right"
              >
                <AlignRight className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={() => setFontSettings((s) => ({ ...s, alignment: 'justify' }))}
                className={`p-1 rounded ${
                  fontSettings.alignment === 'justify'
                    ? darkMode ? 'bg-[#0f3a7a] text-white' : 'bg-[#c7e0f4] text-[#004578]'
                    : darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
                title="Justify"
              >
                <AlignJustify className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <span className="text-[9px] text-[#888888] text-center font-medium">Paragraph</span>
        </div>

        {/* Styles Gallery */}
        <div className={`hidden lg:flex flex-col justify-between pr-3 border-r ${darkMode ? 'border-[#333333]' : 'border-[#e1dfdd]'}`}>
          <div className="flex items-center space-x-1.5">
            <div className={`h-12 w-16 border rounded p-1 flex flex-col justify-between cursor-pointer ${
              darkMode ? 'bg-[#2b2b2b] border-[#4ba3f4]' : 'bg-white border-[#0078d4]'
            }`}>
              <span className={`text-[11px] font-medium leading-none ${darkMode ? 'text-white' : 'text-[#201f1e]'}`}>AaBbCc</span>
              <span className="text-[9px] text-[#888888] leading-none">Normal</span>
            </div>
            <div className={`h-12 w-16 border rounded p-1 flex flex-col justify-between cursor-pointer ${
              darkMode ? 'bg-[#252525] border-[#3e3e42] hover:border-[#666]' : 'bg-white border-[#e1dfdd] hover:border-[#8a8886]'
            }`}>
              <span className={`text-[11px] font-normal leading-none ${darkMode ? 'text-[#ccc]' : 'text-[#201f1e]'}`}>AaBbCc</span>
              <span className="text-[9px] text-[#888888] leading-none">No Spacing</span>
            </div>
            <div className={`h-12 w-16 border rounded p-1 flex flex-col justify-between cursor-pointer ${
              darkMode ? 'bg-[#252525] border-[#3e3e42] hover:border-[#666]' : 'bg-white border-[#e1dfdd] hover:border-[#8a8886]'
            }`}>
              <span className="text-[11px] font-bold text-[#4ba3f4] leading-none">AaBbCc</span>
              <span className="text-[9px] text-[#888888] leading-none">Heading 1</span>
            </div>
            <div className={`h-12 w-16 border rounded p-1 flex flex-col justify-between cursor-pointer ${
              darkMode ? 'bg-[#252525] border-[#3e3e42] hover:border-[#666]' : 'bg-white border-[#e1dfdd] hover:border-[#8a8886]'
            }`}>
              <span className="text-[11px] font-semibold text-[#80b5ff] leading-none">AaBbCc</span>
              <span className="text-[9px] text-[#888888] leading-none">Heading 2</span>
            </div>
          </div>
          <span className="text-[9px] text-[#888888] text-center font-medium">Styles</span>
        </div>

        {/* Editing & Editor proofing */}
        <div className="flex flex-col justify-between">
          <div className="flex items-center space-x-2">
            <div className="flex flex-col space-y-0.5">
              <button
                title="Find (Ctrl+F)"
                className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                  darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
              >
                <Search className="w-3 h-3 text-[#888888]" />
                <span>Find</span>
              </button>
              <button
                title="Replace (Ctrl+H)"
                className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                  darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
              >
                <Replace className="w-3 h-3 text-[#888888]" />
                <span>Replace</span>
              </button>
              <button
                title="Select"
                className={`flex items-center space-x-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer ${
                  darkMode ? 'hover:bg-[#2f2f2f] text-[#e0e0e0]' : 'hover:bg-[#eae8e6] text-[#323130]'
                }`}
              >
                <MousePointer2 className="w-3 h-3 text-[#888888]" />
                <span>Select</span>
              </button>
            </div>

            <button
              onClick={onPanicClear}
              title="Editor & Style Checking"
              className={`flex flex-col items-center justify-center px-2 py-1 rounded cursor-pointer transition-colors ${
                darkMode ? 'hover:bg-[#2f2f2f]' : 'hover:bg-[#eae8e6]'
              }`}
            >
              <PenTool className="w-4 h-4 text-[#185abd]" />
              <span className={`text-[10px] mt-0.5 font-normal ${darkMode ? 'text-[#e0e0e0]' : 'text-[#323130]'}`}>Editor</span>
            </button>
          </div>
          <span className="text-[9px] text-[#888888] text-center font-medium">Editing</span>
        </div>
      </>
        )}
      </div>
    </div>
  );
};
