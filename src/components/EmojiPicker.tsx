'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Smile,
  Heart,
  ThumbsUp,
  Briefcase,
  Flame,
  CheckCircle2,
  Clock,
  Search,
  X,
} from 'lucide-react';

export interface EmojiItem {
  char: string;
  name: string;
  category: 'recent' | 'smileys' | 'gestures' | 'hearts' | 'office' | 'reactions' | 'symbols';
  keywords: string[];
}

const EMOJI_DATABASE: EmojiItem[] = [
  // --- Smileys & Emotions ---
  { char: '😀', name: 'Grinning Face', category: 'smileys', keywords: ['smile', 'happy', 'grin'] },
  { char: '😃', name: 'Smiling Face with Big Eyes', category: 'smileys', keywords: ['smile', 'happy', 'joy'] },
  { char: '😄', name: 'Smiling Face with Smiling Eyes', category: 'smileys', keywords: ['happy', 'laugh', 'pleased'] },
  { char: '😁', name: 'Beaming Face with Smiling Eyes', category: 'smileys', keywords: ['grin', 'smile', 'cheerful'] },
  { char: '😆', name: 'Grinning Squinting Face', category: 'smileys', keywords: ['laugh', 'lol', 'haha'] },
  { char: '😅', name: 'Grinning Face with Sweat', category: 'smileys', keywords: ['sweat', 'nervous', 'relief'] },
  { char: '😂', name: 'Face with Tears of Joy', category: 'smileys', keywords: ['laugh', 'cry', 'tears', 'lol', 'haha', 'funny'] },
  { char: '🤣', name: 'Rolling on the Floor Laughing', category: 'smileys', keywords: ['rofl', 'laugh', 'lol', 'haha'] },
  { char: '🥲', name: 'Smiling Face with Tear', category: 'smileys', keywords: ['tear', 'sad smile', 'emotional'] },
  { char: '🥹', name: 'Face Holding Back Tears', category: 'smileys', keywords: ['pleading', 'proud', 'tears', 'watery eyes'] },
  { char: '😊', name: 'Smiling Face with Smiling Eyes', category: 'smileys', keywords: ['blush', 'smile', 'happy', 'kind'] },
  { char: '😇', name: 'Smiling Face with Halo', category: 'smileys', keywords: ['angel', 'innocent', 'good'] },
  { char: '🙂', name: 'Slightly Smiling Face', category: 'smileys', keywords: ['smile', 'fine', 'ok'] },
  { char: '🙃', name: 'Upside-Down Face', category: 'smileys', keywords: ['sarcasm', 'silly', 'irony'] },
  { char: '😉', name: 'Winking Face', category: 'smileys', keywords: ['wink', 'flirt', 'joke'] },
  { char: '😌', name: 'Relieved Face', category: 'smileys', keywords: ['relief', 'calm', 'peace'] },
  { char: '😍', name: 'Smiling Face with Heart-Eyes', category: 'smileys', keywords: ['love', 'crush', 'heart', 'adore'] },
  { char: '🥰', name: 'Smiling Face with Hearts', category: 'smileys', keywords: ['love', 'hearts', 'affection', 'sweet'] },
  { char: '😘', name: 'Face Blowing a Kiss', category: 'smileys', keywords: ['kiss', 'love', 'flirt'] },
  { char: '🤭', name: 'Face with Hand Over Mouth', category: 'smileys', keywords: ['giggle', 'laugh', 'chuckle', 'snicker', 'oops', 'covering mouth', 'secret', 'haha', 'snickering'] },
  { char: '🫢', name: 'Face with Open Eyes and Hand Over Mouth', category: 'smileys', keywords: ['gasp', 'shock', 'surprise', 'oops', 'omg', 'mouth'] },
  { char: '🫣', name: 'Face Peeking Eye', category: 'smileys', keywords: ['peek', 'peeking', 'shy', 'cant look', 'scared', 'hide', 'curious'] },
  { char: '🤫', name: 'Shushing Face', category: 'smileys', keywords: ['shh', 'quiet', 'secret', 'silence'] },
  { char: '😋', name: 'Face Savoring Food', category: 'smileys', keywords: ['yum', 'delicious', 'tongue', 'tasty'] },
  { char: '😛', name: 'Face with Tongue', category: 'smileys', keywords: ['tongue', 'playful', 'silly'] },
  { char: '😜', name: 'Winking Face with Tongue', category: 'smileys', keywords: ['wink', 'tongue', 'joke', 'crazy'] },
  { char: '🤪', name: 'Zany Face', category: 'smileys', keywords: ['crazy', 'wild', 'goofy'] },
  { char: '😝', name: 'Squinting Face with Tongue', category: 'smileys', keywords: ['tongue', 'playful', 'silly', 'joke'] },
  { char: '🤑', name: 'Money-Mouth Face', category: 'smileys', keywords: ['money', 'rich', 'dollar', 'cash'] },
  { char: '🤠', name: 'Cowboy Hat Face', category: 'smileys', keywords: ['cowboy', 'yeehaw', 'western'] },
  { char: '🤨', name: 'Face with Raised Eyebrow', category: 'smileys', keywords: ['suspicious', 'doubt', 'skeptical'] },
  { char: '🧐', name: 'Face with Monocle', category: 'smileys', keywords: ['curious', 'inspect', 'classy', 'smart'] },
  { char: '🤓', name: 'Nerd Face', category: 'smileys', keywords: ['nerd', 'geek', 'glasses', 'tech'] },
  { char: '😎', name: 'Smiling Face with Sunglasses', category: 'smileys', keywords: ['cool', 'shades', 'awesome'] },
  { char: '🤩', name: 'Star-Struck', category: 'smileys', keywords: ['stars', 'amazed', 'excited', 'wow'] },
  { char: '🥳', name: 'Partying Face', category: 'smileys', keywords: ['party', 'celebrate', 'birthday', 'woohoo'] },
  { char: '😏', name: 'Smirking Face', category: 'smileys', keywords: ['smirk', 'flirt', 'sneaky'] },
  { char: '😒', name: 'Unamused Face', category: 'smileys', keywords: ['annoyed', 'meh', 'displeased'] },
  { char: '😞', name: 'Disappointed Face', category: 'smileys', keywords: ['sad', 'disappointed', 'down'] },
  { char: '😔', name: 'Pensive Face', category: 'smileys', keywords: ['pensive', 'sad', 'thoughtful'] },
  { char: '😟', name: 'Worried Face', category: 'smileys', keywords: ['worried', 'nervous', 'scared'] },
  { char: '😕', name: 'Confused Face', category: 'smileys', keywords: ['confused', 'puzzled', 'doubt'] },
  { char: '🙁', name: 'Slightly Frowning Face', category: 'smileys', keywords: ['frown', 'sad'] },
  { char: '😣', name: 'Persevering Face', category: 'smileys', keywords: ['struggling', 'pain', 'frustrated'] },
  { char: '😖', name: 'Confounded Face', category: 'smileys', keywords: ['frustrated', 'upset'] },
  { char: '😫', name: 'Tired Face', category: 'smileys', keywords: ['tired', 'exhausted', 'whine'] },
  { char: '😩', name: 'Weary Face', category: 'smileys', keywords: ['weary', 'crying', 'tired'] },
  { char: '🥺', name: 'Pleading Face', category: 'smileys', keywords: ['pleading', 'begging', 'puppy eyes', 'please'] },
  { char: '😢', name: 'Crying Face', category: 'smileys', keywords: ['crying', 'sad', 'tear'] },
  { char: '😭', name: 'Loudly Crying Face', category: 'smileys', keywords: ['sob', 'crying', 'sad', 'tears', 'bawling'] },
  { char: '😤', name: 'Face with Steam From Nose', category: 'smileys', keywords: ['triumph', 'proud', 'huff', 'angry'] },
  { char: '😠', name: 'Angry Face', category: 'smileys', keywords: ['angry', 'mad', 'grumpy'] },
  { char: '😡', name: 'Enraged Face', category: 'smileys', keywords: ['red', 'furious', 'rage', 'mad'] },
  { char: '🤬', name: 'Face with Symbols on Mouth', category: 'smileys', keywords: ['cursing', 'swearing', 'angry'] },
  { char: '🤯', name: 'Exploding Head', category: 'smileys', keywords: ['mind blown', 'shock', 'explode', 'wow'] },
  { char: '😳', name: 'Flushed Face', category: 'smileys', keywords: ['flushed', 'blush', 'shock', 'embarrassed'] },
  { char: '🥵', name: 'Hot Face', category: 'smileys', keywords: ['hot', 'heat', 'sweat', 'summer'] },
  { char: '🥶', name: 'Cold Face', category: 'smileys', keywords: ['cold', 'freeze', 'ice', 'winter'] },
  { char: '😱', name: 'Face Screaming in Fear', category: 'smileys', keywords: ['scream', 'scared', 'horror', 'shock'] },
  { char: '😨', name: 'Fearful Face', category: 'smileys', keywords: ['fear', 'scared', 'nervous'] },
  { char: '😰', name: 'Anxious Face with Sweat', category: 'smileys', keywords: ['anxious', 'worried', 'sweat'] },
  { char: '😥', name: 'Sad but Relieved Face', category: 'smileys', keywords: ['phew', 'relieved', 'sweat'] },
  { char: '😓', name: 'Downcast Face with Sweat', category: 'smileys', keywords: ['sweat', 'hard work', 'exhausted'] },
  { char: '🤗', name: 'Smiling Face with Open Hands', category: 'smileys', keywords: ['hug', 'open arms', 'warm'] },
  { char: '🫡', name: 'Saluting Face', category: 'smileys', keywords: ['salute', 'respect', 'yes sir', 'roger'] },
  { char: '🤔', name: 'Thinking Face', category: 'smileys', keywords: ['think', 'ponder', 'hmm', 'curious', 'question'] },
  { char: '🤥', name: 'Lying Face', category: 'smileys', keywords: ['lie', 'pinocchio', 'fake'] },
  { char: '😶', name: 'Face Without Mouth', category: 'smileys', keywords: ['speechless', 'silent', 'mute'] },
  { char: '😐', name: 'Neutral Face', category: 'smileys', keywords: ['neutral', 'blank', 'meh'] },
  { char: '😑', name: 'Expressionless Face', category: 'smileys', keywords: ['blank', 'unimpressed', 'meh'] },
  { char: '😬', name: 'Grimacing Face', category: 'smileys', keywords: ['grimace', 'awkward', 'cringe', 'eek'] },
  { char: '🫠', name: 'Melting Face', category: 'smileys', keywords: ['melt', 'disappear', 'hot', 'awkward'] },
  { char: '🙄', name: 'Face with Rolling Eyes', category: 'smileys', keywords: ['eyeroll', 'whatever', 'bored'] },
  { char: '😯', name: 'Hushed Face', category: 'smileys', keywords: ['surprise', 'oh', 'wow'] },
  { char: '🥱', name: 'Yawning Face', category: 'smileys', keywords: ['yawn', 'sleepy', 'bored'] },
  { char: '😴', name: 'Sleeping Face', category: 'smileys', keywords: ['sleep', 'zzz', 'night', 'tired'] },
  { char: '🤤', name: 'Drooling Face', category: 'smileys', keywords: ['drool', 'delicious', 'craving'] },
  { char: '😪', name: 'Sleepy Face', category: 'smileys', keywords: ['sleepy', 'bubble', 'tired'] },
  { char: '😵', name: 'Face with Crossed-Out Eyes', category: 'smileys', keywords: ['dizzy', 'dead', 'knockout'] },
  { char: '😵‍💫', name: 'Face with Spiral Eyes', category: 'smileys', keywords: ['dizzy', 'spiral', 'hypnotized', 'confused', 'overwhelmed'] },
  { char: '💀', name: 'Skull', category: 'smileys', keywords: ['dead', 'dying', 'laughing', 'lol', 'skeleton', 'funny', 'dead laugh'] },
  { char: '☠️', name: 'Skull and Crossbones', category: 'smileys', keywords: ['danger', 'pirate', 'poison', 'dead'] },
  { char: '🤡', name: 'Clown Face', category: 'smileys', keywords: ['clown', 'fool', 'joke', 'circus'] },
  { char: '👻', name: 'Ghost', category: 'smileys', keywords: ['ghost', 'spooky', 'boo', 'halloween'] },
  { char: '🤐', name: 'Zipper-Mouth Face', category: 'smileys', keywords: ['secret', 'zip it', 'confidential', 'quiet'] },
  { char: '🥴', name: 'Woozy Face', category: 'smileys', keywords: ['drunk', 'woozy', 'tipsy', 'unsteady'] },
  { char: '🤢', name: 'Nauseated Face', category: 'smileys', keywords: ['sick', 'gross', 'nausea'] },
  { char: '🤧', name: 'Sneezing Face', category: 'smileys', keywords: ['sneeze', 'tissue', 'cold', 'flu'] },
  { char: '😷', name: 'Face with Medical Mask', category: 'smileys', keywords: ['mask', 'sick', 'covid', 'doctor'] },
  { char: '🤒', name: 'Face with Thermometer', category: 'smileys', keywords: ['fever', 'sick', 'ill'] },
  { char: '🤕', name: 'Face with Head-Bandage', category: 'smileys', keywords: ['hurt', 'injury', 'bandage'] },

  // --- Gestures & People ---
  { char: '👍', name: 'Thumbs Up', category: 'gestures', keywords: ['like', 'ok', 'yes', 'approve', 'agree', 'good'] },
  { char: '👎', name: 'Thumbs Down', category: 'gestures', keywords: ['dislike', 'no', 'bad', 'disapprove'] },
  { char: '👏', name: 'Clapping Hands', category: 'gestures', keywords: ['applause', 'bravo', 'congrats', 'clap'] },
  { char: '🙌', name: 'Raising Hands', category: 'gestures', keywords: ['hooray', 'celebrate', 'praise', 'cheer'] },
  { char: '🫶', name: 'Heart Hands', category: 'gestures', keywords: ['love', 'care', 'gratitude', 'heart'] },
  { char: '👐', name: 'Open Hands', category: 'gestures', keywords: ['open', 'hug', 'welcome'] },
  { char: '🤲', name: 'Palms Up Together', category: 'gestures', keywords: ['prayer', 'dua', 'asking', 'offering'] },
  { char: '🤝', name: 'Handshake', category: 'gestures', keywords: ['deal', 'agreement', 'partnership', 'hello', 'meet'] },
  { char: '🙏', name: 'Folded Hands', category: 'gestures', keywords: ['please', 'thank you', 'thanks', 'pray', 'namaste', 'hope'] },
  { char: '✍️', name: 'Writing Hand', category: 'gestures', keywords: ['write', 'edit', 'draft', 'clause', 'note'] },
  { char: '👋', name: 'Waving Hand', category: 'gestures', keywords: ['wave', 'hello', 'hi', 'bye', 'goodbye'] },
  { char: '🤚', name: 'Raised Back of Hand', category: 'gestures', keywords: ['hand', 'backhand', 'stop'] },
  { char: '🖐️', name: 'Hand with Fingers Splayed', category: 'gestures', keywords: ['five', 'high five', 'stop'] },
  { char: '✋', name: 'Raised Hand', category: 'gestures', keywords: ['stop', 'halt', 'high five', 'question'] },
  { char: '🖖', name: 'Vulcan Salute', category: 'gestures', keywords: ['spock', 'peace', 'live long'] },
  { char: '👌', name: 'OK Hand', category: 'gestures', keywords: ['ok', 'perfect', 'fine', 'good'] },
  { char: '🤌', name: 'Pinched Fingers', category: 'gestures', keywords: ['italian', 'what', 'gesture'] },
  { char: '🤏', name: 'Pinching Hand', category: 'gestures', keywords: ['small', 'little bit', 'tiny'] },
  { char: '✌️', name: 'Victory Hand', category: 'gestures', keywords: ['peace', 'victory', 'two'] },
  { char: '🤞', name: 'Crossed Fingers', category: 'gestures', keywords: ['luck', 'hope', 'wish'] },
  { char: '🫰', name: 'Hand with Index Finger and Thumb Crossed', category: 'gestures', keywords: ['finger heart', 'love', 'korean heart', 'money'] },
  { char: '🤟', name: 'Love-You Gesture', category: 'gestures', keywords: ['ily', 'love you', 'rock'] },
  { char: '🤘', name: 'Sign of the Horns', category: 'gestures', keywords: ['rock on', 'metal'] },
  { char: '🤙', name: 'Call Me Hand', category: 'gestures', keywords: ['call', 'shaka', 'phone'] },
  { char: '👈', name: 'Backhand Index Pointing Left', category: 'gestures', keywords: ['point', 'left'] },
  { char: '👉', name: 'Backhand Index Pointing Right', category: 'gestures', keywords: ['point', 'right', 'there'] },
  { char: '👆', name: 'Backhand Index Pointing Up', category: 'gestures', keywords: ['point', 'up', 'above'] },
  { char: '👇', name: 'Backhand Index Pointing Down', category: 'gestures', keywords: ['point', 'down', 'below'] },
  { char: '☝️', name: 'Index Pointing Up', category: 'gestures', keywords: ['point', 'one', 'attention'] },
  { char: '🫵', name: 'Index Pointing at the Viewer', category: 'gestures', keywords: ['you', 'target'] },
  { char: '✊', name: 'Raised Fist', category: 'gestures', keywords: ['power', 'solidarity', 'strength'] },
  { char: '👊', name: 'Oncoming Fist', category: 'gestures', keywords: ['fist bump', 'punch', 'bro'] },
  { char: '🤛', name: 'Left-Facing Fist', category: 'gestures', keywords: ['fist bump', 'left'] },
  { char: '🤜', name: 'Right-Facing Fist', category: 'gestures', keywords: ['fist bump', 'right'] },
  { char: '💪', name: 'Flexed Biceps', category: 'gestures', keywords: ['strong', 'muscle', 'power', 'gym', 'flex'] },
  { char: '🫂', name: 'People Hugging', category: 'gestures', keywords: ['hug', 'comfort', 'friends'] },
  { char: '👀', name: 'Eyes', category: 'gestures', keywords: ['look', 'see', 'preview', 'watch', 'peek'] },
  { char: '👁️', name: 'Eye', category: 'gestures', keywords: ['look', 'vision', 'single eye'] },
  { char: '🤦', name: 'Person Facepalming', category: 'gestures', keywords: ['facepalm', 'disappointed', 'smh', 'duh'] },
  { char: '🤷', name: 'Person Shrugging', category: 'gestures', keywords: ['shrug', 'idk', 'dunno', 'whatever'] },
  { char: '💅', name: 'Nail Polish', category: 'gestures', keywords: ['nails', 'slay', 'sassy', 'glamour'] },
  { char: '🙈', name: 'See-No-Evil Monkey', category: 'gestures', keywords: ['monkey', 'blind', 'shy', 'cant look', 'see no evil', 'hide'] },
  { char: '🙉', name: 'Hear-No-Evil Monkey', category: 'gestures', keywords: ['monkey', 'deaf', 'cant hear', 'hear no evil'] },
  { char: '🙊', name: 'Speak-No-Evil Monkey', category: 'gestures', keywords: ['monkey', 'mute', 'secret', 'speak no evil', 'oops'] },

  // --- Hearts & Love ---
  { char: '❤️', name: 'Red Heart', category: 'hearts', keywords: ['love', 'heart', 'red', 'like'] },
  { char: '💖', name: 'Sparkling Heart', category: 'hearts', keywords: ['sparkle', 'love', 'special', 'shine'] },
  { char: '💕', name: 'Two Hearts', category: 'hearts', keywords: ['hearts', 'love', 'couple'] },
  { char: '💞', name: 'Revolving Hearts', category: 'hearts', keywords: ['hearts', 'spin', 'love'] },
  { char: '💓', name: 'Beating Heart', category: 'hearts', keywords: ['heartbeat', 'alive', 'excited'] },
  { char: '💗', name: 'Growing Heart', category: 'hearts', keywords: ['growing', 'more love'] },
  { char: '💘', name: 'Heart with Arrow', category: 'hearts', keywords: ['cupid', 'crush', 'fall in love'] },
  { char: '💝', name: 'Heart with Ribbon', category: 'hearts', keywords: ['gift', 'present', 'sweet'] },
  { char: '💟', name: 'Heart Decoration', category: 'hearts', keywords: ['heart', 'decor', 'purple'] },
  { char: '💔', name: 'Broken Heart', category: 'hearts', keywords: ['heartbreak', 'sad', 'break up', 'hurts'] },
  { char: '❤️‍🔥', name: 'Heart on Fire', category: 'hearts', keywords: ['burning love', 'passion', 'lust'] },
  { char: '❤️‍🩹', name: 'Mending Heart', category: 'hearts', keywords: ['healing', 'better', 'recovering'] },
  { char: '❣️', name: 'Heart Exclamation', category: 'hearts', keywords: ['heart point', 'emphasis'] },
  { char: '🧡', name: 'Orange Heart', category: 'hearts', keywords: ['orange', 'friendship'] },
  { char: '💛', name: 'Yellow Heart', category: 'hearts', keywords: ['yellow', 'pure', 'warmth'] },
  { char: '💚', name: 'Green Heart', category: 'hearts', keywords: ['green', 'nature', 'envy'] },
  { char: '💙', name: 'Blue Heart', category: 'hearts', keywords: ['blue', 'trust', 'loyalty'] },
  { char: '💜', name: 'Purple Heart', category: 'hearts', keywords: ['purple', 'glamour'] },
  { char: '🖤', name: 'Black Heart', category: 'hearts', keywords: ['black', 'dark', 'goth'] },
  { char: '🤍', name: 'White Heart', category: 'hearts', keywords: ['white', 'peace', 'pure'] },
  { char: '🤎', name: 'Brown Heart', category: 'hearts', keywords: ['brown', 'chocolate'] },
  { char: '💋', name: 'Kiss Mark', category: 'hearts', keywords: ['kiss', 'lips', 'makeup'] },
  { char: '💌', name: 'Love Letter', category: 'hearts', keywords: ['letter', 'mail', 'note', 'message'] },
  { char: '🌹', name: 'Rose', category: 'hearts', keywords: ['flower', 'rose', 'romantic'] },
  { char: '💐', name: 'Bouquet', category: 'hearts', keywords: ['flowers', 'gift', 'congrats'] },
  { char: '💎', name: 'Gem Stone', category: 'hearts', keywords: ['diamond', 'precious', 'shine'] },

  // --- Office & Technical (Camouflage friendly) ---
  { char: '📄', name: 'Page Facing Up', category: 'office', keywords: ['document', 'page', 'clause', 'file', 'word'] },
  { char: '📝', name: 'Memo', category: 'office', keywords: ['note', 'memo', 'write', 'pencil', 'edit'] },
  { char: '📁', name: 'File Folder', category: 'office', keywords: ['folder', 'directory', 'save'] },
  { char: '📂', name: 'Open File Folder', category: 'office', keywords: ['open folder', 'archive'] },
  { char: '📑', name: 'Bookmark Tabs', category: 'office', keywords: ['tabs', 'bookmarks', 'index'] },
  { char: '📊', name: 'Bar Chart', category: 'office', keywords: ['chart', 'graph', 'metrics', 'stats'] },
  { char: '📈', name: 'Chart Increasing', category: 'office', keywords: ['growth', 'upward', 'success', 'trend'] },
  { char: '📉', name: 'Chart Decreasing', category: 'office', keywords: ['downward', 'loss', 'trend'] },
  { char: '📜', name: 'Scroll', category: 'office', keywords: ['scroll', 'contract', 'agreement', 'ancient'] },
  { char: '📋', name: 'Clipboard', category: 'office', keywords: ['clipboard', 'copy', 'paste', 'checklist'] },
  { char: '📌', name: 'Pushpin', category: 'office', keywords: ['pin', 'pinned', 'important'] },
  { char: '📍', name: 'Round Pushpin', category: 'office', keywords: ['location', 'place', 'marker'] },
  { char: '📎', name: 'Paperclip', category: 'office', keywords: ['attach', 'attachment', 'clip'] },
  { char: '🖇️', name: 'Linked Paperclips', category: 'office', keywords: ['link', 'attachment', 'connect'] },
  { char: '📏', name: 'Straight Ruler', category: 'office', keywords: ['ruler', 'measure', 'margin'] },
  { char: '📐', name: 'Triangular Ruler', category: 'office', keywords: ['triangle', 'math', 'measure'] },
  { char: '✂️', name: 'Scissors', category: 'office', keywords: ['cut', 'trim', 'snip'] },
  { char: '🔒', name: 'Locked', category: 'office', keywords: ['lock', 'security', 'panic', 'private', 'password'] },
  { char: '🔓', name: 'Unlocked', category: 'office', keywords: ['unlock', 'open', 'access', 'authenticated'] },
  { char: '🔏', name: 'Locked with Pen', category: 'office', keywords: ['signature', 'privacy', 'secured contract'] },
  { char: '🔐', name: 'Locked with Key', category: 'office', keywords: ['credentials', 'safe', 'secure'] },
  { char: '🔑', name: 'Key', category: 'office', keywords: ['passcode', 'access', 'token', 'key'] },
  { char: '🗝️', name: 'Old Key', category: 'office', keywords: ['vintage', 'secret', 'master key'] },
  { char: '💡', name: 'Light Bulb', category: 'office', keywords: ['idea', 'solution', 'bright', 'smart', 'tip'] },
  { char: '💻', name: 'Laptop', category: 'office', keywords: ['computer', 'code', 'laptop', 'work'] },
  { char: '🖥️', name: 'Desktop Computer', category: 'office', keywords: ['pc', 'screen', 'monitor'] },
  { char: '🖨️', name: 'Printer', category: 'office', keywords: ['print', 'hardcopy', 'paper'] },
  { char: '⌨️', name: 'Keyboard', category: 'office', keywords: ['type', 'typing', 'keys', 'input'] },
  { char: '🖱️', name: 'Computer Mouse', category: 'office', keywords: ['click', 'pointer', 'hardware'] },
  { char: '📱', name: 'Mobile Phone', category: 'office', keywords: ['phone', 'cell', 'smartphone'] },
  { char: '📲', name: 'Mobile Phone with Arrow', category: 'office', keywords: ['incoming', 'call', 'push'] },
  { char: '☎️', name: 'Telephone', category: 'office', keywords: ['phone', 'contact', 'dial'] },
  { char: '📞', name: 'Telephone Receiver', category: 'office', keywords: ['call', 'audio', 'voice'] },
  { char: '📧', name: 'E-Mail', category: 'office', keywords: ['email', 'letter', 'send'] },
  { char: '📨', name: 'Incoming Envelope', category: 'office', keywords: ['received', 'message', 'mail'] },
  { char: '📩', name: 'Envelope with Arrow', category: 'office', keywords: ['sent', 'mail', 'dispatch'] },
  { char: '📦', name: 'Package', category: 'office', keywords: ['box', 'delivery', 'cargo'] },
  { char: '📅', name: 'Date', category: 'office', keywords: ['calendar', 'date', 'schedule'] },
  { char: '📆', name: 'Tear-Off Calendar', category: 'office', keywords: ['calendar', 'meeting', 'day'] },
  { char: '🗓️', name: 'Spiral Calendar', category: 'office', keywords: ['schedule', 'agenda', 'planner'] },
  { char: '🗃️', name: 'Card File Box', category: 'office', keywords: ['database', 'archive', 'records'] },
  { char: '🗄️', name: 'File Cabinet', category: 'office', keywords: ['filing', 'storage', 'cabinet'] },
  { char: '🗑️', name: 'Wastebasket', category: 'office', keywords: ['trash', 'delete', 'wipe', 'bin'] },
  { char: '⚙️', name: 'Gear', category: 'office', keywords: ['settings', 'config', 'preferences', 'engine'] },
  { char: '🔧', name: 'Wrench', category: 'office', keywords: ['tool', 'fix', 'maintain'] },
  { char: '🔨', name: 'Hammer', category: 'office', keywords: ['build', 'repair', 'construction'] },
  { char: '🛠️', name: 'Hammer and Wrench', category: 'office', keywords: ['tools', 'developer', 'setup'] },
  { char: '⚖️', name: 'Balance Scale', category: 'office', keywords: ['law', 'legal', 'justice', 'clause'] },
  { char: '🔬', name: 'Microscope', category: 'office', keywords: ['science', 'research', 'detail', 'inspect'] },
  { char: '🎯', name: 'Direct Hit', category: 'office', keywords: ['target', 'goal', 'bullseye', 'focus'] },
  { char: '⏱️', name: 'Stopwatch', category: 'office', keywords: ['timer', 'seconds', 'speed', 'sync'] },
  { char: '⏰', name: 'Alarm Clock', category: 'office', keywords: ['alarm', 'wake', 'time', 'reminder'] },
  { char: '⏳', name: 'Hourglass Not Done', category: 'office', keywords: ['pending', 'wait', 'in progress'] },
  { char: '⌛', name: 'Hourglass Done', category: 'office', keywords: ['time out', 'expired', 'finished'] },

  // --- Reactions & Celebration ---
  { char: '🔥', name: 'Fire', category: 'reactions', keywords: ['flame', 'lit', 'hot', 'fire', 'burn'] },
  { char: '✨', name: 'Sparkles', category: 'reactions', keywords: ['magic', 'shine', 'clean', 'star', 'new'] },
  { char: '💯', name: 'Hundred Points', category: 'reactions', keywords: ['100', 'perfect', 'full mark', 'score'] },
  { char: '💢', name: 'Anger Symbol', category: 'reactions', keywords: ['mad', 'anime', 'vein'] },
  { char: '💥', name: 'Collision', category: 'reactions', keywords: ['boom', 'explode', 'bang'] },
  { char: '💫', name: 'Dizzy Star', category: 'reactions', keywords: ['star', 'sparkle', 'magic'] },
  { char: '💦', name: 'Sweat Droplets', category: 'reactions', keywords: ['water', 'sweat', 'drops'] },
  { char: '💨', name: 'Dashing Away', category: 'reactions', keywords: ['fast', 'speed', 'run', 'smoke'] },
  { char: '🎉', name: 'Party Popper', category: 'reactions', keywords: ['party', 'celebrate', 'congrats', 'tada'] },
  { char: '🎊', name: 'Confetti Ball', category: 'reactions', keywords: ['confetti', 'holiday', 'festival'] },
  { char: '🎈', name: 'Balloon', category: 'reactions', keywords: ['birthday', 'float', 'party'] },
  { char: '🍾', name: 'Bottle with Popping Cork', category: 'reactions', keywords: ['champagne', 'drink', 'celebration'] },
  { char: '🥂', name: 'Clinking Glasses', category: 'reactions', keywords: ['cheers', 'toast', 'celebrate'] },
  { char: '🍻', name: 'Clinking Beer Mugs', category: 'reactions', keywords: ['beer', 'drink', 'cheers'] },
  { char: '🍺', name: 'Beer Mug', category: 'reactions', keywords: ['drink', 'pub', 'party'] },
  { char: '☕', name: 'Hot Beverage', category: 'reactions', keywords: ['coffee', 'tea', 'cafe', 'break', 'morning'] },
  { char: '🍵', name: 'Teacup Without Handle', category: 'reactions', keywords: ['green tea', 'matcha'] },
  { char: '🧋', name: 'Bubble Tea', category: 'reactions', keywords: ['boba', 'tea', 'drink'] },
  { char: '🍕', name: 'Pizza', category: 'reactions', keywords: ['food', 'lunch', 'slice'] },
  { char: '🍔', name: 'Hamburger', category: 'reactions', keywords: ['burger', 'food', 'snack'] },
  { char: '🍟', name: 'French Fries', category: 'reactions', keywords: ['chips', 'food', 'fast food'] },
  { char: '🌮', name: 'Taco', category: 'reactions', keywords: ['mexican', 'food'] },
  { char: '🍩', name: 'Doughnut', category: 'reactions', keywords: ['donut', 'sweet', 'bakery'] },
  { char: '🍰', name: 'Shortcake', category: 'reactions', keywords: ['cake', 'slice', 'dessert'] },
  { char: '🎂', name: 'Birthday Cake', category: 'reactions', keywords: ['birthday', 'candles', 'celebration'] },
  { char: '🍫', name: 'Chocolate Bar', category: 'reactions', keywords: ['chocolate', 'candy'] },
  { char: '🍿', name: 'Popcorn', category: 'reactions', keywords: ['movie', 'snack', 'cinema'] },
  { char: '🍪', name: 'Cookie', category: 'reactions', keywords: ['biscuit', 'snack', 'sweet'] },
  { char: '🚀', name: 'Rocket', category: 'reactions', keywords: ['launch', 'fast', 'blast off', 'moon', 'speed'] },
  { char: '🛸', name: 'Flying Saucer', category: 'reactions', keywords: ['ufo', 'alien', 'space'] },
  { char: '✈️', name: 'Airplane', category: 'reactions', keywords: ['flight', 'travel', 'trip', 'vacation'] },
  { char: '🚗', name: 'Automobile', category: 'reactions', keywords: ['car', 'drive', 'trip'] },
  { char: '🏝️', name: 'Desert Island', category: 'reactions', keywords: ['island', 'beach', 'tropical', 'vacation'] },
  { char: '🏖️', name: 'Beach with Umbrella', category: 'reactions', keywords: ['summer', 'sun', 'relax'] },
  { char: '🌅', name: 'Sunrise', category: 'reactions', keywords: ['morning', 'dawn', 'sun'] },
  { char: '🎮', name: 'Video Game', category: 'reactions', keywords: ['gaming', 'controller', 'play'] },
  { char: '🏆', name: 'Trophy', category: 'reactions', keywords: ['winner', 'first place', 'champion', 'prize'] },
  { char: '🥇', name: '1st Place Medal', category: 'reactions', keywords: ['gold', 'first', 'winner'] },
  { char: '⭐', name: 'Star', category: 'reactions', keywords: ['star', 'rating', 'favorite', 'gold'] },
  { char: '🌟', name: 'Glowing Star', category: 'reactions', keywords: ['glow', 'shine', 'sparkle'] },
  { char: '⚡', name: 'High Voltage', category: 'reactions', keywords: ['lightning', 'zap', 'fast', 'power', 'bolt'] },

  // --- Symbols & Badges ---
  { char: '✅', name: 'Check Mark Button', category: 'symbols', keywords: ['check', 'done', 'tick', 'approved', 'yes', 'verified'] },
  { char: '❌', name: 'Cross Mark', category: 'symbols', keywords: ['cross', 'x', 'no', 'wrong', 'reject', 'fail'] },
  { char: '⭕', name: 'Heavy Large Circle', category: 'symbols', keywords: ['circle', 'o', 'correct'] },
  { char: '🛑', name: 'Stop Sign', category: 'symbols', keywords: ['stop', 'halt', 'red'] },
  { char: '⛔', name: 'No Entry', category: 'symbols', keywords: ['forbidden', 'restricted', 'do not enter'] },
  { char: '🚫', name: 'Prohibited', category: 'symbols', keywords: ['banned', 'no', 'forbidden'] },
  { char: '⚠️', name: 'Warning', category: 'symbols', keywords: ['warning', 'alert', 'caution', 'danger'] },
  { char: '🔔', name: 'Bell', category: 'symbols', keywords: ['notification', 'alert', 'ring', 'sound'] },
  { char: '🔕', name: 'Bell with Slash', category: 'symbols', keywords: ['mute', 'silent', 'no sound'] },
  { char: '❓', name: 'Question Mark', category: 'symbols', keywords: ['question', 'what', 'help', 'doubt'] },
  { char: '❔', name: 'White Question Mark', category: 'symbols', keywords: ['question', 'query'] },
  { char: '❗', name: 'Exclamation Mark', category: 'symbols', keywords: ['exclamation', 'important', 'alert', 'notice'] },
  { char: '❕', name: 'White Exclamation Mark', category: 'symbols', keywords: ['exclamation', 'info'] },
  { char: '‼️', name: 'Double Exclamation Mark', category: 'symbols', keywords: ['urgent', 'emergency', 'attention'] },
  { char: '⁉️', name: 'Exclamation Question Mark', category: 'symbols', keywords: ['confused', 'shock', 'really'] },
  { char: '➕', name: 'Plus', category: 'symbols', keywords: ['add', 'plus', 'math', 'positive'] },
  { char: '➖', name: 'Minus', category: 'symbols', keywords: ['subtract', 'minus', 'negative'] },
  { char: '➗', name: 'Divide', category: 'symbols', keywords: ['division', 'math'] },
  { char: '✖️', name: 'Multiply', category: 'symbols', keywords: ['multiply', 'math', 'times'] },
  { char: '🟰', name: 'Heavy Equals Sign', category: 'symbols', keywords: ['equals', 'math', 'result'] },
  { char: '💲', name: 'Heavy Dollar Sign', category: 'symbols', keywords: ['dollar', 'money', 'cash', 'usd'] },
  { char: '™️', name: 'Trade Mark', category: 'symbols', keywords: ['trademark', 'brand'] },
  { char: '©️', name: 'Copyright', category: 'symbols', keywords: ['copyright', 'reserved'] },
  { char: '®️', name: 'Registered', category: 'symbols', keywords: ['registered', 'trademark'] },
  { char: '🔴', name: 'Red Circle', category: 'symbols', keywords: ['red', 'live', 'recording', 'dot'] },
  { char: '🟠', name: 'Orange Circle', category: 'symbols', keywords: ['orange', 'status', 'dot'] },
  { char: '🟡', name: 'Yellow Circle', category: 'symbols', keywords: ['yellow', 'pending', 'dot'] },
  { char: '🟢', name: 'Green Circle', category: 'symbols', keywords: ['green', 'online', 'active', 'ok', 'dot'] },
  { char: '🔵', name: 'Blue Circle', category: 'symbols', keywords: ['blue', 'info', 'dot'] },
  { char: '🟣', name: 'Purple Circle', category: 'symbols', keywords: ['purple', 'dot'] },
  { char: '⚫', name: 'Black Circle', category: 'symbols', keywords: ['black', 'dot'] },
  { char: '⚪', name: 'White Circle', category: 'symbols', keywords: ['white', 'dot'] },
  { char: '🔺', name: 'Red Triangle Pointed Up', category: 'symbols', keywords: ['triangle', 'up', 'delta'] },
  { char: '🔻', name: 'Red Triangle Pointed Down', category: 'symbols', keywords: ['triangle', 'down'] },
  { char: '💠', name: 'Diamond with a Dot', category: 'symbols', keywords: ['diamond', 'gem', 'flower'] },
  { char: '🔘', name: 'Radio Button', category: 'symbols', keywords: ['radio', 'button', 'select'] },
  { char: '💬', name: 'Speech Balloon', category: 'symbols', keywords: ['chat', 'message', 'talk', 'bubble'] },
  { char: '💭', name: 'Thought Balloon', category: 'symbols', keywords: ['thought', 'thinking', 'dream'] },
  { char: '🗯️', name: 'Right Anger Bubble', category: 'symbols', keywords: ['shout', 'angry bubble'] },
  { char: '🏁', name: 'Chequered Flag', category: 'symbols', keywords: ['finish', 'race', 'done'] },
  { char: '🚩', name: 'Triangular Flag', category: 'symbols', keywords: ['flag', 'red flag', 'mark'] },
  { char: '🏳️', name: 'White Flag', category: 'symbols', keywords: ['surrender', 'peace'] },
  { char: '🏴', name: 'Black Flag', category: 'symbols', keywords: ['pirate', 'dark'] },
];

const DEFAULT_RECENT = ['🤭', '😊', '👍', '😂', '❤️', '🔥', '✨', '🙏', '✅', '💡', '🎉', '👏', '💀', '👀', '🥺', '🤣'];

interface EmojiPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectEmoji: (emoji: string) => void;
  darkMode: boolean;
  className?: string;
}

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  isOpen,
  onClose,
  onSelectEmoji,
  darkMode,
  className = '',
}) => {
  const [activeCategory, setActiveCategory] = useState<string>('smileys');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [hoveredEmoji, setHoveredEmoji] = useState<EmojiItem | null>(null);
  const [recentEmojis, setRecentEmojis] = useState<string[]>(DEFAULT_RECENT);

  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Load recent emojis from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('word_recent_emojis');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (!parsed.includes('🤭')) {
            parsed.unshift('🤭');
          }
          setRecentEmojis(parsed);
          return;
        }
      }
    } catch {
      // ignore
    }
  }, []);

  // Autofocus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    } else {
      setSearchQuery('');
      setHoveredEmoji(null);
    }
  }, [isOpen]);

  // Click outside listener
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onClose]);

  const handleEmojiClick = (char: string) => {
    onSelectEmoji(char);

    // Update recents
    const updated = [char, ...recentEmojis.filter((e) => e !== char)].slice(0, 24);
    setRecentEmojis(updated);
    try {
      localStorage.setItem('word_recent_emojis', JSON.stringify(updated));
    } catch {
      // ignore
    }
  };

  const categories = [
    { id: 'recent', label: 'Recent', icon: Clock },
    { id: 'smileys', label: 'Smileys', icon: Smile },
    { id: 'gestures', label: 'Hands', icon: ThumbsUp },
    { id: 'hearts', label: 'Hearts', icon: Heart },
    { id: 'office', label: 'Office', icon: Briefcase },
    { id: 'reactions', label: 'Reactions', icon: Flame },
    { id: 'symbols', label: 'Symbols', icon: CheckCircle2 },
  ];

  // Filtered emojis
  const displayedEmojis = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      return EMOJI_DATABASE.filter(
        (item) =>
          item.name.toLowerCase().includes(q) ||
          item.keywords.some((k) => k.toLowerCase().includes(q)) ||
          item.char === q
      );
    }

    if (activeCategory === 'recent') {
      return recentEmojis.map((char) => {
        const found = EMOJI_DATABASE.find((e) => e.char === char);
        return found || { char, name: 'Recent Emoji', category: 'recent' as const, keywords: [] };
      });
    }

    return EMOJI_DATABASE.filter((item) => item.category === activeCategory);
  }, [searchQuery, activeCategory, recentEmojis]);

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className={`rounded-lg border shadow-2xl flex flex-col overflow-hidden select-none z-50 animate-in fade-in zoom-in-95 duration-150 ${
        darkMode
          ? 'bg-[#1e293b] border-[#334155] text-[#f1f5f9]'
          : 'bg-[#ffffff] border-[#cbd5e1] text-[#0f172a]'
      } ${className}`}
      style={{
        width: '320px',
        maxWidth: 'calc(100vw - 24px)',
        height: '380px',
      }}
    >
      {/* Top Header: Search and Close */}
      <div
        className={`p-2 border-b flex items-center space-x-1.5 shrink-0 ${
          darkMode ? 'bg-[#0f172a]/70 border-[#334155]' : 'bg-[#f8fafc] border-[#e2e8f0]'
        }`}
      >
        <div
          className={`flex-1 flex items-center px-2 py-1 rounded-md text-xs border transition-colors ${
            darkMode
              ? 'bg-[#1e293b] border-[#475569] text-white focus-within:border-[#38bdf8]'
              : 'bg-white border-[#cbd5e1] text-neutral-800 focus-within:border-[#0078d4]'
          }`}
        >
          <Search className="w-3.5 h-3.5 opacity-50 mr-1.5 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emoji (smile, ok, heart)..."
            className="w-full bg-transparent outline-none text-[11.5px] leading-tight"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="opacity-50 hover:opacity-100 p-0.5 cursor-pointer"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`p-1 rounded-md transition-colors cursor-pointer shrink-0 ${
            darkMode
              ? 'hover:bg-[#334155] text-[#94a3b8] hover:text-white'
              : 'hover:bg-[#e2e8f0] text-[#64748b] hover:text-black'
          }`}
          title="Close Emoji Box"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Category Navigation Bar (when not searching) */}
      {!searchQuery && (
        <div
          className={`flex items-center justify-between px-1 py-1 border-b shrink-0 text-xs ${
            darkMode ? 'bg-[#0f172a]/40 border-[#334155]' : 'bg-[#f1f5f9]/70 border-[#e2e8f0]'
          }`}
        >
          {categories.map((cat) => {
            const Icon = cat.icon;
            const isActive = activeCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategory(cat.id)}
                title={cat.label}
                className={`p-1.5 rounded-md transition-all cursor-pointer flex items-center justify-center flex-1 ${
                  isActive
                    ? darkMode
                      ? 'bg-[#38bdf8]/20 text-[#38bdf8] font-bold'
                      : 'bg-[#0078d4]/15 text-[#0078d4] font-bold'
                    : darkMode
                    ? 'text-[#94a3b8] hover:text-white hover:bg-[#334155]/60'
                    : 'text-[#64748b] hover:text-black hover:bg-[#e2e8f0]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </button>
            );
          })}
        </div>
      )}

      {/* Emoji Grid Container */}
      <div className="flex-1 overflow-y-auto p-2 scrollbar-thin">
        {displayedEmojis.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 opacity-60">
            <Smile className="w-8 h-8 mb-1.5 opacity-40" />
            <span className="text-xs">No emojis found</span>
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1">
            {displayedEmojis.map((item, idx) => (
              <button
                key={`${item.char}-${idx}`}
                type="button"
                onClick={() => handleEmojiClick(item.char)}
                onMouseEnter={() => setHoveredEmoji(item)}
                onMouseLeave={() => setHoveredEmoji(null)}
                className={`w-9 h-9 flex items-center justify-center text-[19px] rounded-md transition-transform hover:scale-120 active:scale-95 cursor-pointer leading-none ${
                  darkMode ? 'hover:bg-[#334155]' : 'hover:bg-[#e2e8f0]'
                }`}
                title={item.name}
              >
                {item.char}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer: Preview and Info Bar */}
      <div
        className={`px-2.5 py-1.5 border-t flex items-center justify-between text-[11px] shrink-0 ${
          darkMode ? 'bg-[#0f172a]/60 border-[#334155]' : 'bg-[#f8fafc] border-[#e2e8f0]'
        }`}
      >
        {hoveredEmoji ? (
          <div className="flex items-center space-x-2 truncate">
            <span className="text-lg leading-none">{hoveredEmoji.char}</span>
            <span className="truncate font-medium opacity-90">{hoveredEmoji.name}</span>
          </div>
        ) : (
          <span className="opacity-60 text-[10.5px]">
            {searchQuery
              ? `${displayedEmojis.length} matching emojis`
              : 'Click emoji to insert into clause'}
          </span>
        )}

        <span
          className={`text-[9.5px] px-1.5 py-0.5 rounded font-mono ${
            darkMode ? 'bg-[#334155] text-[#94a3b8]' : 'bg-[#e2e8f0] text-[#64748b]'
          }`}
        >
          Clause Input
        </span>
      </div>
    </div>
  );
};
