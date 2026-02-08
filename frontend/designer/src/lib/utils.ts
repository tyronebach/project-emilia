import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Mood emoji mapping
export const MOOD_EMOJI: Record<string, string> = {
  bashful: '😊',
  defiant: '😤',
  enraged: '🔥',
  erratic: '🌀',
  euphoric: '✨',
  flirty: '😏',
  melancholic: '😢',
  sarcastic: '😒',
  sassy: '💅',
  seductive: '💋',
  snarky: '🙄',
  supportive: '🤗',
  suspicious: '🤨',
  vulnerable: '🥺',
  whimsical: '🦋',
  zen: '🧘',
}

// Mood categories
export const MOOD_CATEGORIES: Record<string, string[]> = {
  positive: ['euphoric', 'supportive', 'flirty', 'whimsical', 'zen'],
  negative: ['enraged', 'melancholic', 'suspicious', 'defiant'],
  neutral: ['sarcastic', 'sassy', 'snarky', 'bashful', 'erratic', 'seductive', 'vulnerable'],
}

// Get mood color based on valence
export function getMoodColor(moodId: string): string {
  const positive = MOOD_CATEGORIES.positive.includes(moodId)
  const negative = MOOD_CATEGORIES.negative.includes(moodId)
  
  if (positive) return 'from-emerald-500 to-teal-500'
  if (negative) return 'from-red-500 to-orange-500'
  return 'from-violet-500 to-purple-500'
}

export function getMoodBgColor(moodId: string): string {
  const positive = MOOD_CATEGORIES.positive.includes(moodId)
  const negative = MOOD_CATEGORIES.negative.includes(moodId)
  
  if (positive) return 'bg-emerald-500/20 border-emerald-500/30'
  if (negative) return 'bg-red-500/20 border-red-500/30'
  return 'bg-violet-500/20 border-violet-500/30'
}

// All 16 moods in order
export const ALL_MOODS = [
  'bashful', 'defiant', 'enraged', 'erratic', 'euphoric', 'flirty',
  'melancholic', 'sarcastic', 'sassy', 'seductive', 'snarky',
  'supportive', 'suspicious', 'vulnerable', 'whimsical', 'zen'
]
