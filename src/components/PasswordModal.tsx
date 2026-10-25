'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Lock, X, Eye, EyeOff, ShieldCheck } from 'lucide-react';

interface PasswordModalProps {
  isOpen: boolean;
  docTitle?: string;
  onClose: () => void;
  onVerify: (password: string) => Promise<{ success: boolean; error?: string }>;
}

export const PasswordModal: React.FC<PasswordModalProps> = ({
  isOpen,
  docTitle = 'Document1.docx',
  onClose,
  onVerify,
}) => {
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setPassword('');
      setErrorMsg(null);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password) {
      setErrorMsg('Please enter a password.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const result = await onVerify(password);
      if (!result.success) {
        setErrorMsg(result.error || 'The password you supplied is incorrect. Word cannot open the document in edit mode.');
      } else {
        onClose();
      }
    } catch {
      setErrorMsg('Could not verify password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[1px] p-4 animate-in fade-in duration-150">
      {/* Office Style Dialog Box */}
      <div className="w-full max-w-sm bg-white rounded-md shadow-2xl border border-[#c8c6c4] overflow-hidden text-[#201f1e] select-none text-xs">
        {/* Title bar */}
        <div className="bg-[#f3f2f1] border-b border-[#e1dfdd] px-3 py-2 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-[#185abd] text-white rounded flex items-center justify-center text-[10px] font-bold">
              W
            </div>
            <span className="font-semibold text-xs text-[#323130]">Password</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#e1dfdd] rounded text-[#605e5c] hover:text-[#201f1e] transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dialog Content */}
        <form onSubmit={handleSubmit} className="p-4 space-y-3">
          <div className="flex items-start space-x-3">
            <div className="p-2 bg-amber-50 rounded-full border border-amber-200 shrink-0 text-amber-700">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-[#201f1e] text-xs">
                &lsquo;{docTitle}&rsquo; is protected.
              </p>
              <p className="text-[#605e5c] text-[11px] leading-relaxed">
                Enter Author 1 or Author 2 password to unprotect this document and enable collaborative editing:
              </p>
            </div>
          </div>

          {/* Password Input Box */}
          <div className="space-y-1 pt-1">
            <label className="text-[11px] font-semibold text-[#323130] flex items-center justify-between">
              <span>Password:</span>
            </label>
            <div className="relative">
              <input
                ref={inputRef}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setErrorMsg(null);
                }}
                disabled={isLoading}
                placeholder="Enter password..."
                className="w-full h-8 px-2.5 pr-8 bg-white border border-[#8a8886] rounded text-[16px] sm:text-xs text-[#201f1e] focus:outline-none focus:border-[#185abd] focus:ring-1 focus:ring-[#185abd] transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                className="absolute right-2 top-2 text-[#8a8886] hover:text-[#323130]"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-[11px] leading-tight flex items-start space-x-1.5 animate-in fade-in">
              <span className="font-bold">⚠️</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Dialog Action Buttons */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-[#f3f2f1]">
            <button
              type="submit"
              disabled={isLoading}
              className="px-4 py-1.5 bg-[#0078d4] hover:bg-[#106ebe] text-white rounded text-xs font-medium transition-colors shadow-xs flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>{isLoading ? 'Verifying...' : 'OK'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="px-4 py-1.5 bg-[#f3f2f1] hover:bg-[#edebe9] text-[#201f1e] border border-[#8a8886] rounded text-xs font-medium transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
