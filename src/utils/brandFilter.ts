
/**
 * Refined English keywords for filtering off-brand content.
 * Target: Depression, Trauma (extreme), Extreme Health, Legally Protected Knowledge.
 */
export const OFF_BRAND_KEYWORDS = [
  // Depression & Trauma (Extreme cases)
  'depression', 'depressive', 'major depressive', 'suicide', 'suicidal', 'self-harm',
  'trauma', 'traumatic', 'ptsd', 'post-traumatic', 'sexual abuse', 'physical abuse',
  'bipolar', 'schizophrenia', 'psychosis', 'psychotic', 'mental hospital', 'psychiatric',
  'hopelessness', 'mental breakdown', 'panic attack', 'anxiety disorder', 'therapy session',
  'traumatized', 'childhood trauma', 'emotional abuse',

  // Family & Relationship Drama (Off-brand for high-performance masculine focus)
  'motherhood', 'parenting', 'toddler', 'baby', 'pregnant', 'maternity',
  'ex-wife', 'ex-husband', 'ex-girlfriend', 'ex-boyfriend', 'divorce', 'cheating', 
  'toxic relationship', 'narcissist', 'narcissism', 'dating apps', 'tinder', 'bumble',
  'toxic partner', 'heartbreak', 'breakup', 'break up', 'childcare', 'babysitting',
  'marriage problems', 'wedding', 'dating advice',

  // Spiritual / Religious / Occult (Unless generic mindset)
  'jesus', 'god', 'bible', 'scripture', 'allah', 'religion', 'religious',
  'manifesting', 'universe said', 'astrology', 'horoscope', 'zodiac', 'witchcraft',
  'prophecy', 'amen', 'lord',

  // Extreme Health / Medical Advice
  'cancer', 'chemotherapy', 'terminal illness', 'diagnosed with', 'medical advice',
  'prescription drugs', 'medication side effects', 'surgery', 'chronic disease',
  'hospitalized', 'emergency room', 'cardiac arrest', 'tumor', 'metastasis',
  'chronic illness', 'medical condition', 'physician', 'pharmacology',
  'insulin', 'diabetes', 'blood pressure', 'medication', 'doctor said',

  // Legally Protected / Specialized Knowledge
  'legal advice', 'attorney', 'lawyer', 'litigation', 'lawsuit', 'court case',
  'confidential information', 'trade secret', 'non-disclosure', 'privileged communication',
  'copyright infringement', 'patent law', 'legal counsel', 'malpractice',
  'legal contract', 'binding agreement', 'statutory',

  // Generic / Low-Effort / Noise / Distractions
  'great video', 'thank you', 'amazing content', 'best channel', 'first comment',
  'whatsapp', 'telegram', 'invest', 'crypto', 'scam', 'dm me', 'follow me on',
  'subscribe', 'sub to me', 'nice video', 'keep it up', 'love this', 'helpful video',
  'shout out', 'shoutout', 'check my channel', 'song name', 'track ID', 'what music',
  'gaming', 'fortnite', 'minecraft', 'roblox', 'video game', 'playing console'
];

/**
 * Checks if the given text contains any off-brand keywords or fails intensity check.
 */
export function findOffBrandMatch(
  title: string, 
  description: string, 
  quotes: string[] = [],
  intensity: number = 10
): string | null {
  // 1. Minimum Title/Description Length (Filter very short/vague entries)
  if (title.length < 15) {
    return 'Too Short (Title)';
  }

  // 2. Intensity check: Brand focus is on HIGH intensity pain points
  // Filtering < 8 targets ~60% of entries, leaving only the "Heavy Hitters"
  if (intensity < 8) {
    return `Low Intensity (${intensity})`;
  }

  const combinedText = `${title} ${description} ${quotes.join(' ')}`.toLowerCase();
  
  for (const keyword of OFF_BRAND_KEYWORDS) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'i');
    if (regex.test(combinedText)) {
      return keyword;
    }
  }
  
  return null;
}
