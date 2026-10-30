/**
 * Mobile and Desktop Panic Mode Utilities
 * 
 * Intercepts physical hardware buttons (Volume Up/Down/Mute, Power, Android Back, Headset)
 * and screen lock events (display sleep, tab hidden, pagehide, blur) for instantaneous
 * covert call cut and session wipe to Microsoft Word Protected View.
 * 
 * STRICT GUARANTEE:
 * Typing any alphabet (like o, w, etc.), numeric, space, punctuation, or normal editing keys
 * must NEVER trigger panic mode.
 */

import React from 'react';

/**
 * Checks if a keyboard or hardware button event corresponds to an intentional panic trigger.
 * 
 * Supports:
 * - Desktop: Meta/Windows key, Ctrl, Alt, Fn, Escape, modifier combinations
 * - Mobile Volume Buttons: AudioVolumeUp, AudioVolumeDown, AudioVolumeMute
 * - Mobile Navigation/Hardware: Android Back (keyCode 4), Power/Sleep (keyCode 26), Headset hook
 */
export function isPanicKeyEvent(e: KeyboardEvent | React.KeyboardEvent): boolean {
  const key = e.key || '';
  const code = e.code || '';
  const keyCode = (e as any).keyCode || (e as any).which || 0;

  // 1. FAST REJECTION: Any single printable character (letters a-z, A-Z, numbers,
  // space, punctuation) typed without modifier keys (Ctrl/Alt/Meta) is NEVER a panic key!
  // This strictly guarantees alphabet keys like 'o' (keyCode 79), 'w' (keyCode 87),
  // 'u' (keyCode 85), 'v' (keyCode 86), 'x' (keyCode 88), etc. can NEVER trigger panic.
  if (key && key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
    return false;
  }

  // 2. Common editing and navigation keys are NEVER panic keys unless modified by Ctrl/Alt/Meta
  if (
    (key === 'Backspace' ||
      key === 'Enter' ||
      key === 'Tab' ||
      key === 'Spacebar' ||
      key === ' ' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight' ||
      key === 'ArrowUp' ||
      key === 'ArrowDown' ||
      key === 'Home' ||
      key === 'End' ||
      key === 'PageUp' ||
      key === 'PageDown' ||
      key === 'Delete' ||
      key === 'Shift' ||
      key === 'CapsLock') &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.metaKey
  ) {
    return false;
  }

  // 3. Desktop Dedicated Panic Keys (Windows, Meta, OS, Ctrl, Alt, Escape, Fn)
  if (
    key === 'Meta' ||
    key === 'OS' ||
    code === 'MetaLeft' ||
    code === 'MetaRight' ||
    key === 'Control' ||
    code === 'ControlLeft' ||
    code === 'ControlRight' ||
    key === 'Alt' ||
    code === 'AltLeft' ||
    code === 'AltRight' ||
    key === 'Escape' ||
    code === 'Escape' ||
    key === 'Fn' ||
    code === 'Fn' ||
    key === 'FnLock' ||
    code === 'FnLock' ||
    e.ctrlKey ||
    e.altKey ||
    e.metaKey
  ) {
    return true;
  }

  // 4. Mobile Physical Volume Buttons
  if (
    key === 'AudioVolumeUp' ||
    key === 'VolumeUp' ||
    code === 'AudioVolumeUp' ||
    code === 'VolumeUp' ||
    keyCode === 24 || // Android KEYCODE_VOLUME_UP
    keyCode === 175 || // Standard VK_VOLUME_UP
    key === 'AudioVolumeDown' ||
    key === 'VolumeDown' ||
    code === 'AudioVolumeDown' ||
    code === 'VolumeDown' ||
    keyCode === 25 || // Android KEYCODE_VOLUME_DOWN
    keyCode === 174 || // Standard VK_VOLUME_DOWN
    key === 'AudioVolumeMute' ||
    key === 'VolumeMute' ||
    code === 'AudioVolumeMute' ||
    code === 'VolumeMute' ||
    keyCode === 164 || // Android KEYCODE_VOLUME_MUTE
    keyCode === 173 // Standard VK_VOLUME_MUTE
  ) {
    return true;
  }

  // 5. Mobile Hardware Back, Power, Headset, and Media Buttons
  // Only match explicit string identifiers and non-alphanumeric mobile keycodes (keyCode 4 for Android Back, 26 for Power)
  if (
    key === 'GoBack' ||
    key === 'Back' ||
    code === 'GoBack' ||
    code === 'Back' ||
    keyCode === 4 || // Android KEYCODE_BACK
    key === 'Power' ||
    key === 'Sleep' ||
    code === 'Power' ||
    code === 'Sleep' ||
    keyCode === 26 || // Android KEYCODE_POWER
    key === 'HeadsetHook' ||
    key === 'MediaPlayPause' ||
    key === 'MediaStop' ||
    key === 'MediaTrackNext' ||
    key === 'MediaTrackPrevious' ||
    code === 'MediaPlayPause' ||
    code === 'MediaStop' ||
    code === 'MediaTrackNext' ||
    code === 'MediaTrackPrevious'
  ) {
    return true;
  }

  return false;
}
