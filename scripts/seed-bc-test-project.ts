/**
 * seed-bc-test-project.ts — Seeds a test Brand Clarity project for local development.
 *
 * Creates a bcProjects row with mock data + sets status to 'channels_pending'
 * so you can immediately test the channels UI without running the LP parser.
 *
 * Usage: npx tsx scripts/seed-bc-test-project.ts
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { db } from '../src/db/client';
import { bcProjects, bcTargetChannels, bcTargetVideos, bcExtractedPainPoints } from '../src/db/schema';
import { eq } from 'drizzle-orm';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

async function run() {
  console.log('[SEED] Creating test Brand Clarity project...');

  // Clean up any existing test project
  const existing = await db.select().from(bcProjects).where(eq(bcProjects.name, '[TEST] Frinter App'));
  if (existing.length) {
    console.log(`[SEED] Removing existing test project (id=${existing[0].id})`);
    await db.delete(bcProjects).where(eq(bcProjects.id, existing[0].id));
  }

  // Create project
  const [project] = await db.insert(bcProjects).values({
    name: '[TEST] Frinter App',
    founderDescription: 'Frinter is a focus OS for high performers. It measures focus sprints (Frints), tracks energy and recovery, and helps you optimize deep work, relationships, and wellbeing through hard data.',
    projectDocumentation: `# Frinter App
## What is it?
Frinter is a WholeBeing performance platform for High Performers.
It optimizes three spheres: Flourishing (You), Relationships (Loved Ones), Deep Work (The World).

## Core Feature: Focus Sprint (Frint)
A Focus Sprint measures depth, length, and frequency of focus sessions.
Correlated with sleep and recovery data.

## FRINT Check-in (Weekly)
F - Flow: Deep absorption
R - Relationships: Quality interactions
I - Inner Balance: Emotional acceptance
N - Nourishment: Physical energy
T - Transcendence: Meaningful action`,
    lpRawInput: `<section class="hero">
  <h1>Stop Burning Out. Start Performing.</h1>
  <p>Frinter is the Focus OS for High Performers who want hard data on their energy, focus, and life balance.</p>
  <a href="#signup">Start Your First Frint →</a>
</section>
<section class="problem">
  <h2>The problem with productivity apps</h2>
  <p>Most productivity apps track tasks. Frinter tracks YOU. Your focus depth. Your energy. Your relationships. Your life balance.</p>
</section>
<section class="features">
  <h2>What Frinter does</h2>
  <ul>
    <li>Focus Sprints (Frints) — measure deep work sessions</li>
    <li>Energy Bars — track daily energy and recovery</li>
    <li>FRINT Check-in — weekly WholeBeing evaluation</li>
    <li>Relationship Tracker — intentional social connections</li>
  </ul>
</section>`,
    founderVision: 'Build a system that makes high performance sustainable without sacrificing life quality.',
    nicheKeywords: ['focus', 'deep work', 'high performance', 'productivity', 'burnout prevention'],
    lpStructureJson: {
      headline: 'Stop Burning Out. Start Performing.',
      subheadline: 'The Focus OS for High Performers',
      targetAudience: 'High performers who want data-driven life optimization',
      corePromise: 'Sustainable high performance without burnout',
      problemStatement: 'Most productivity apps track tasks, not the human doing them',
      solutionMechanism: 'WholeBeing OS that measures focus, energy, relationships, and inner balance',
      features: [
        { name: 'Focus Sprints (Frints)', description: 'Measure depth, length, and frequency of focus sessions' },
        { name: 'Energy Bars', description: 'Track daily energy and recovery patterns' },
        { name: 'FRINT Check-in', description: 'Weekly evaluation of 5 WholeBeing spheres' },
      ],
      benefitStatements: [
        'Know exactly when your peak performance hours are',
        'Catch burnout before it happens',
        'Improve focus depth week over week',
      ],
      socialProof: [],
      primaryCTA: 'Start Your First Frint →',
      secondaryCTA: null,
      toneKeywords: ['direct', 'data-driven', 'empowering'],
      brandVoiceNotes: 'Direct, evidence-based, speaks to high achievers who value data over motivation',
      sectionOrder: ['hero', 'problem', 'features', 'cta'],
      nicheKeywords: ['focus', 'deep work', 'high performance', 'productivity', 'burnout prevention'],
      founderVision: 'Build a system that makes high performance sustainable without sacrificing life quality.',
      sectionWeaknesses: {
        hero: 'Headline lacks specificity — no quantifiable transformation or target persona called out',
        problem: 'Problem statement is abstract — no emotional hook or relatable scenario',
        solution: null,
        features: 'Feature list is dry — no outcome-oriented language',
        social_proof: 'No social proof at all — major conversion blocker',
        cta: 'CTA lacks urgency and clarity on what happens next',
      },
    },
    status: 'channels_pending',
  }).returning();

  console.log(`[SEED] Created project "${project.name}" (id=${project.id})`);

  // Seed 3 test channels
  const channels = await db.insert(bcTargetChannels).values([
    {
      projectId: project.id,
      channelId: 'UCZXtpXAG2LQX9uSAvJwWAkg',
      channelHandle: 'hubermanlab',
      channelName: 'Andrew Huberman',
      channelUrl: 'https://www.youtube.com/@hubermanlab',
      subscriberCount: 5200000,
      description: 'Neuroscience, performance, and health optimization',
      discoveryMethod: 'auto',
      isConfirmed: true,
      sortOrder: 0,
    },
    {
      projectId: project.id,
      channelId: 'UCnUYZLuoy1rq1aVMwx4aTzw',
      channelHandle: 'aliabdaal',
      channelName: 'Ali Abdaal',
      channelUrl: 'https://www.youtube.com/@aliabdaal',
      subscriberCount: 5100000,
      description: 'Productivity, deep work, and creator economy',
      discoveryMethod: 'auto',
      isConfirmed: true,
      sortOrder: 1,
    },
    {
      projectId: project.id,
      channelId: 'UCJ24N4O0bP7LpQlpF_-03Fg',
      channelHandle: 'mattdavella',
      channelName: 'Matt D\'Avella',
      channelUrl: 'https://www.youtube.com/@mattdavella',
      subscriberCount: 4100000,
      description: 'Slow living, minimalism, and sustainable habits',
      discoveryMethod: 'auto',
      isConfirmed: false,
      sortOrder: 2,
    },
  ]).returning();

  console.log(`[SEED] Created ${channels.length} test channels`);

  // Seed 2 test videos for channel 0
  const videos = await db.insert(bcTargetVideos).values([
    {
      projectId: project.id,
      channelId: channels[0].id,
      videoId: 'dQw4w9WgXcQ',
      videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      title: 'How to Optimize Your Focus and Productivity',
      viewCount: 2500000,
      commentCount: 8500,
      relevanceScore: 0.95,
    },
    {
      projectId: project.id,
      channelId: channels[1].id,
      videoId: 'abc123test',
      videoUrl: 'https://www.youtube.com/watch?v=abc123test',
      title: 'I Tried Deep Work for 30 Days',
      viewCount: 1800000,
      commentCount: 6200,
      relevanceScore: 0.82,
    },
  ]).returning();

  console.log(`[SEED] Created ${videos.length} test videos`);

  // Seed 3 test pain points
  const painPoints = await db.insert(bcExtractedPainPoints).values([
    {
      projectId: project.id,
      painPointTitle: 'Cannot sustain deep focus for more than 30 minutes',
      painPointDescription: 'High performers report that despite wanting to do deep work, they constantly get pulled out of focus states. Notifications, mental fatigue, and unclear priorities make sustained focus feel impossible.',
      emotionalIntensity: 9,
      frequency: 47,
      vocabularyQuotes: ['I lose focus after 20 minutes', 'my brain just gives up', 'I start scrolling without realizing'],
      category: 'focus',
      customerLanguage: 'They describe focus loss as something that "just happens" — passive loss of control, not active distraction',
      desiredOutcome: 'To enter and sustain a flow state for 2+ hours on their most important work',
      status: 'approved',
      sourceVideoIds: [videos[0].id],
    },
    {
      projectId: project.id,
      painPointTitle: 'High output leads to weekend crashes and recovery debt',
      painPointDescription: 'After intense work weeks, high performers experience total energy crashes on weekends. They feel unable to enjoy rest because they are too depleted, creating a cycle of guilt and performance anxiety.',
      emotionalIntensity: 8,
      frequency: 31,
      vocabularyQuotes: ['I crash every Friday', 'I work hard all week but feel nothing on weekends', 'recovery takes days'],
      category: 'energy',
      customerLanguage: 'They use "crash" and "debt" metaphors — describing energy as a finite resource they are constantly overdrawing',
      desiredOutcome: 'To have sustainable high output across the full week without sacrificing weekends',
      status: 'approved',
      sourceVideoIds: [videos[1].id],
    },
    {
      projectId: project.id,
      painPointTitle: 'No system to measure if deep work is actually improving',
      painPointDescription: 'Users track tasks completed but have no visibility into whether the quality and depth of their focus sessions is improving over time. They feel like they are working hard but cannot prove it to themselves.',
      emotionalIntensity: 7,
      frequency: 22,
      vocabularyQuotes: ['how do I know if I\'m getting better', 'I can\'t see my progress', 'there\'s no data on this'],
      category: 'systems',
      customerLanguage: 'They use "data" and "metrics" language — they want proof, not just feelings',
      desiredOutcome: 'A dashboard showing focus depth trends over weeks and months',
      status: 'pending',
      sourceVideoIds: [videos[0].id],
    },
  ]).returning();

  console.log(`[SEED] Created ${painPoints.length} test pain points`);
  console.log(`\n[SEED] Done! Test project ready:`);
  console.log(`  Admin URL: /admin/brand-clarity/${project.id}/channels`);
  console.log(`  Project ID: ${project.id}`);
  console.log(`  Status: ${project.status}`);
  console.log(`  Confirmed channels: ${channels.filter(c => c.isConfirmed).length}/${channels.length}`);
  console.log(`  Approved pain points: ${painPoints.filter(p => p.status === 'approved').length}/${painPoints.length}`);
}

run().catch((e) => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
