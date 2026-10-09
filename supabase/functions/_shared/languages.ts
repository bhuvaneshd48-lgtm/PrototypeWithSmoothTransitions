/** Supported output languages shared by the browser and Edge request boundary. */
export const LANGUAGES = ['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Odia', 'Urdu', 'Assamese', 'Spanish', 'French', 'German', 'Portuguese', 'Italian', 'Russian', 'Arabic', 'Chinese (Simplified)', 'Japanese', 'Korean', 'Indonesian', 'Turkish', 'Vietnamese', 'Thai', 'Swahili'] as const

export function supportedLanguage(value: unknown): string {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value) ? value : 'English'
}
