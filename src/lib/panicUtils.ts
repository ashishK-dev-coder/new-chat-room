/**
 * Mobile and Desktop Panic Mode Utilities
 * 
 * Intercepts physical hardware buttons (Volume Up/Down/Mute, Power, Android Back, Headset)
 * and screen lock events (display sleep, tab hidden, pagehide, blur) for instantaneous
 * covert call cut and session wipe to Microsoft Word Protected View.
 */

import React from 'react';

/**
 * Checks if a keyboard or hardware button event corresponds to a panic trigger.
 * 
 * Supports:
 * - Desktop: Meta/Windows key, Ctrl, Alt, Fn, Escape, modifier shortcuts
 * - Mobile Volume Buttons: AudioVolumeUp, AudioVolumeDown, AudioVolumeMute, keyCodes 24, 25, 164, 173, 174, 175
 * - Mobile Navigation/Hardware: Android Back (keyCode 4), Power/Sleep (keyCode 26), Headset hook (keyCode 79), Media keys
 */
export function isPanicKeyEvent(e: KeyboardEvent | React.KeyboardEvent): boolean {
  const key = e.key || '';
  const code = e.code || '';
  const keyCode = (e as any).keyCode || (e as any).which || 0;

  // 1. Desktop Panic Keys (Windows, Meta, OS, Ctrl, Alt, Escape, Fn)
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

  // 2. Mobile Hardware Volume Keys
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

  // 3. Mobile Hardware Back, Power, Headset, and Media Buttons
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
    keyCode === 79 || // Android KEYCODE_HEADSETHOOK
    key === 'MediaPlayPause' ||
    key === 'MediaStop' ||
    key === 'MediaTrackNext' ||
    key === 'MediaTrackPrevious' ||
    keyCode === 85 ||
    keyCode === 86 ||
    keyCode === 87 ||
    keyCode === 88
  ) {
    return true;
  }

  return false;
}

