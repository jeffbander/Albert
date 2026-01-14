/**
 * Voice Response Formatter
 * Optimizes text responses for text-to-speech output.
 * Removes markdown, shortens long responses, and formats citations for audio.
 */

export interface VoiceFormattedResponse {
  /** Text optimized for TTS (short, no markdown) */
  spoken: string;
  /** Full original text for display */
  display: string;
  /** Simplified citation domains */
  citations: string[];
  /** Whether the response was truncated */
  truncated: boolean;
}

export interface VoiceFormatOptions {
  /** Maximum character length for spoken text (default: 1500 ~30s speech) */
  maxLength?: number;
  /** Include citation summary in spoken text (default: true) */
  includeCitations?: boolean;
  /** Add continuation prompt if truncated (default: true) */
  addContinuationPrompt?: boolean;
}

/**
 * Extract domain from URL for voice-friendly citation
 */
function extractDomain(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/**
 * Remove markdown formatting from text
 */
function stripMarkdown(text: string): string {
  return text
    // Remove headers
    .replace(/#{1,6}\s+/g, '')
    // Remove bold/italic
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    // Remove inline code
    .replace(/`([^`]+)`/g, '$1')
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, '')
    // Remove links but keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    // Remove images
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    // Remove blockquotes
    .replace(/^>\s+/gm, '')
    // Remove horizontal rules
    .replace(/^[-*_]{3,}$/gm, '')
    // Remove bullet points but keep content
    .replace(/^[-*+]\s+/gm, '')
    // Remove numbered lists but keep content
    .replace(/^\d+\.\s+/gm, '')
    // Clean up extra whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Simplify URLs in text to just domain names
 */
function simplifyUrls(text: string): string {
  return text.replace(
    /https?:\/\/[^\s)]+/g,
    (url) => extractDomain(url)
  );
}

/**
 * Truncate text at a natural sentence boundary
 */
function truncateAtSentence(text: string, maxLength: number): { text: string; truncated: boolean } {
  if (text.length <= maxLength) {
    return { text, truncated: false };
  }

  // Find the last sentence boundary before maxLength
  const truncated = text.slice(0, maxLength);
  const sentenceEndings = ['. ', '! ', '? ', '.\n', '!\n', '?\n'];

  let lastBoundary = -1;
  for (const ending of sentenceEndings) {
    const index = truncated.lastIndexOf(ending);
    if (index > lastBoundary && index > maxLength * 0.7) {
      lastBoundary = index + 1; // Include the punctuation
    }
  }

  if (lastBoundary > 0) {
    return { text: truncated.slice(0, lastBoundary).trim(), truncated: true };
  }

  // Fallback: truncate at word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return { text: truncated.slice(0, lastSpace).trim() + '.', truncated: true };
  }

  return { text: truncated.trim() + '...', truncated: true };
}

/**
 * Format a research/news response for voice output
 */
export function formatForVoice(
  answer: string,
  citations: string[] = [],
  options: VoiceFormatOptions = {}
): VoiceFormattedResponse {
  const {
    maxLength = 1500,
    includeCitations = true,
    addContinuationPrompt = true,
  } = options;

  // Step 1: Strip markdown and simplify URLs
  let spoken = stripMarkdown(answer);
  spoken = simplifyUrls(spoken);

  // Step 2: Clean up whitespace
  spoken = spoken
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim();

  // Step 3: Truncate if needed
  const { text: truncatedText, truncated } = truncateAtSentence(spoken, maxLength);
  spoken = truncatedText;

  // Step 4: Add citation summary if requested
  const uniqueDomains = Array.from(new Set(citations.map(extractDomain)));
  let citationSummary = '';

  if (includeCitations && uniqueDomains.length > 0) {
    if (uniqueDomains.length === 1) {
      citationSummary = ` This information comes from ${uniqueDomains[0]}.`;
    } else if (uniqueDomains.length <= 3) {
      citationSummary = ` This information comes from ${uniqueDomains.slice(0, -1).join(', ')} and ${uniqueDomains[uniqueDomains.length - 1]}.`;
    } else {
      citationSummary = ` This information comes from ${uniqueDomains.length} sources including ${uniqueDomains.slice(0, 2).join(' and ')}.`;
    }
  }

  // Step 5: Add continuation prompt if truncated
  let continuationPrompt = '';
  if (truncated && addContinuationPrompt) {
    continuationPrompt = ' Would you like me to share more details?';
  }

  return {
    spoken: spoken + citationSummary + continuationPrompt,
    display: answer,
    citations: uniqueDomains,
    truncated,
  };
}

/**
 * Format an error message for voice output
 */
export function formatErrorForVoice(error: string, suggestion?: string): string {
  // Clean up technical error messages
  let voiceError = error
    .replace(/Error:\s*/gi, '')
    .replace(/HTTP\s*\d+:\s*/gi, '')
    .replace(/\{[^}]+\}/g, '') // Remove JSON
    .replace(/\[[^\]]+\]/g, '') // Remove arrays
    .trim();

  // Capitalize first letter
  voiceError = voiceError.charAt(0).toUpperCase() + voiceError.slice(1);

  // Add period if missing
  if (!voiceError.endsWith('.') && !voiceError.endsWith('!') && !voiceError.endsWith('?')) {
    voiceError += '.';
  }

  // Add suggestion if provided
  if (suggestion) {
    voiceError += ` ${suggestion}`;
  }

  return voiceError;
}

/**
 * Format a list for voice output
 */
export function formatListForVoice(items: string[], maxItems = 5): string {
  if (items.length === 0) {
    return 'No items found.';
  }

  const displayItems = items.slice(0, maxItems);
  const remaining = items.length - maxItems;

  if (displayItems.length === 1) {
    return displayItems[0];
  }

  let result = displayItems.slice(0, -1).join(', ') + ' and ' + displayItems[displayItems.length - 1];

  if (remaining > 0) {
    result += `, plus ${remaining} more`;
  }

  return result;
}

/**
 * Format build status for voice output
 */
export function formatBuildStatusForVoice(status: {
  phase?: string;
  progress?: number;
  currentStep?: string;
  error?: string;
}): string {
  if (status.error) {
    return formatErrorForVoice(status.error, 'Would you like me to try again?');
  }

  if (status.phase === 'complete' || status.phase === 'completed') {
    return 'The build is complete and ready to preview.';
  }

  if (status.progress !== undefined) {
    const percent = Math.round(status.progress * 100);
    if (status.currentStep) {
      return `Build is ${percent}% complete. Currently ${status.currentStep.toLowerCase()}.`;
    }
    return `Build is ${percent}% complete.`;
  }

  if (status.currentStep) {
    return `Currently ${status.currentStep.toLowerCase()}.`;
  }

  return 'Build is in progress.';
}
