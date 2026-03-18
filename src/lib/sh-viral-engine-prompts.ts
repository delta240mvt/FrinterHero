import type { ShViralEngineResolved } from './sh-viral-engine';

export function buildShViralEngineSystemPrompt(resolved: ShViralEngineResolved): string {
  if (!resolved.runtime.active) {
    return 'VIRAL ENGINE is disabled for this brief. Use the base SocialHub generation flow.';
  }

  const sections: string[] = [
    'VIRAL ENGINE is ENABLED for this brief.',
    `Mode: ${resolved.runtime.config.mode}`,
    resolved.personalizationSummary ? `Personalization: ${resolved.personalizationSummary}` : '',
  ];

  if (resolved.pcmSnapshot && resolved.runtime.shouldUseWrittenEngine) {
    const writtenRules = Array.isArray(resolved.runtime.config.written.additionalRules)
      ? resolved.runtime.config.written.additionalRules
      : [resolved.runtime.config.written.additionalRules].filter(Boolean);
    sections.push(
      [
        `PCM profile: ${resolved.pcmSnapshot.name} (${resolved.pcmSnapshot.key})`,
        `Core audience state: ${resolved.pcmSnapshot.coreAudienceState}`,
        `Dominant psychological need: ${resolved.pcmSnapshot.dominantPsychologicalNeed}`,
        `Channel of communication: ${resolved.pcmSnapshot.channelOfCommunication}`,
        `Preferred tone and language: ${resolved.pcmSnapshot.preferredToneAndLanguage}`,
        `Call to action style: ${resolved.pcmSnapshot.callToActionStyle}`,
        `Hook intensity: ${resolved.runtime.config.written.hookIntensity}`,
        `CTA intensity: ${resolved.runtime.config.written.ctaIntensity}`,
        writtenRules.length
          ? `Additional written rules: ${writtenRules.join(' | ')}`
          : '',
      ].filter(Boolean).join('\n'),
    );
  }

  if (resolved.videoFormat && resolved.runtime.shouldUseVideoEngine) {
    const videoRules = Array.isArray(resolved.runtime.config.video.additionalRules)
      ? resolved.runtime.config.video.additionalRules
      : [resolved.runtime.config.video.additionalRules].filter(Boolean);
    sections.push(
      [
        `Video format: ${resolved.videoFormat.name} (${resolved.videoFormat.slug})`,
        `Description: ${resolved.videoFormat.summary}`,
        `Hook pattern: ${resolved.videoFormat.hookPattern}`,
        `Opening pattern: ${resolved.videoFormat.openingPattern}`,
        `Pacing recommendation: ${resolved.videoFormat.pacing}`,
        `Scene template: ${resolved.videoFormat.sceneStructure.join(' -> ')}`,
        `CTA style: ${resolved.videoFormat.ctaPattern}`,
        videoRules.length
          ? `Additional video rules: ${videoRules.join(' | ')}`
          : '',
      ].filter(Boolean).join('\n'),
    );
  }

  sections.push('Apply VIRAL ENGINE before producing the final variants. Do not mention VIRAL ENGINE or PCM explicitly in the output.');
  return sections.filter(Boolean).join('\n\n');
}

export function buildShViralEngineUserPrompt(resolved: ShViralEngineResolved): string {
  if (!resolved.runtime.active) {
    return 'VIRAL ENGINE is off. Generate normally, while staying specific and source-faithful.';
  }

  const lines = [
    'Before writing the final variants:',
    '1. Internalize the VIRAL ENGINE instructions.',
    '2. Keep the output aligned with the source and brand voice.',
    resolved.runtime.shouldUseWrittenEngine && resolved.pcmSnapshot
      ? `3. Make hook, body and CTA align with PCM profile "${resolved.pcmSnapshot.name}" (${resolved.pcmSnapshot.key}).`
      : '3. Use a strong but natural written flow.',
    resolved.runtime.shouldUseVideoEngine && resolved.videoFormat
      ? `4. Make the videoScript follow "${resolved.videoFormat.slug}" with scene flow "${resolved.videoFormat.sceneStructure.join(' -> ')}".`
      : '4. Keep the videoScript aligned with the body text.',
    '5. Return valid JSON only.',
  ];

  return lines.join('\n');
}
