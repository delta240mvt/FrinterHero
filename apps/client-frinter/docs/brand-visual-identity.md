# FRINTER UIX Brand Identity

Version: 1.1  
Scope: UIX only  
Reference implementation: `apps/astro/src/pages/en/index.astro`

## Purpose

This file defines the FRINTER visual identity only.

It covers:

- colors
- typography
- layout language
- component styling
- gradient identity
- retro / pixel-art identity
- animation identity
- icon identity

It does not cover:

- copywriting
- tone of voice
- messaging
- brand narrative

---

## UIX Core Principles

FRINTER UI must feel like one continuous system across landing page and app.

The user should feel:

- continuity
- precision
- clarity
- controlled energy
- product-grade polish

The interface should never feel:

- generic SaaS
- startup-template
- noisy gamer UI
- soft wellness aesthetic
- overdecorated marketing page

Core UIX traits:

- clean surfaces
- strong typographic hierarchy
- asymmetric rhythm
- brand gradients used as signals
- retro pixel motion as a system layer
- restrained premium feeling

---

## Visual DNA

FRINTER UIX is built from 4 layers:

1. Neutral structural UI
2. Three-color brand system
3. Gradient signal layer
4. Retro pixel-system layer

These layers must coexist without fighting each other.

Rule:

- neutral structure is the base
- color provides meaning
- gradients provide signature
- retro animation provides distinction

---

## Color Identity

## Main Brand Colors

```txt
Teal:  #4a8d83
Mauve: #8a4e64
Gold:  #d6b779
```

## Category Mapping

```txt
Flourishing   -> #4a8d83
Relationships -> #8a4e64
Deep Work     -> #d6b779
```

## Accent Variants

```txt
Teal accent:  #7bc4ba
Mauve accent: #c47fa0
Gold accent:  #d6b779
```

## Role of Each Color

### Teal

Used for:

- flourishing category
- energy-positive states
- recovery and life-force indicators
- selected interface highlights

### Mauve

Used for:

- relationships category
- secondary emotional emphasis
- softer highlighted states

### Gold

Used for:

- deep work category
- premium emphasis
- key focus / high-value states
- retro energy highlights

## Neutral Colors

### Light Mode

```txt
Background:      #ffffff
Panel:           #f9fafb
Panel strong:    #ffffff
Text primary:    #111827
Text secondary:  #6b7280
Text faint:      #9ca3af
Border:          #e5e7eb
Border strong:   #d1d5db
```

### Dark Mode

```txt
Background:      #030712
Panel:           rgba(15, 23, 42, 0.74)
Panel strong:    #0f172a
Text primary:    #f9fafb
Text secondary:  #cbd5e1
Text faint:      #94a3b8
Border:          #1f2937
Border strong:   #374151
```

## Color Rules

- The UI base must stay neutral.
- Brand colors should carry semantic meaning, not random decoration.
- One component should not use all three colors unless it is a signature brand element.
- Gradients are reserved for key identity moments.

---

## Gradient Identity

Gradient is one of the core FRINTER UI signatures.

It must be used intentionally.

## Primary Brand Gradient

```css
linear-gradient(90deg, #4a8d83, #8a4e64, #d6b779)
```

## Reversed Gradient

Used in the animated separator bar:

```css
linear-gradient(90deg, #d6b779, #8a4e64, #4a8d83)
```

## Approved Gradient Use Cases

- logo dot in `frinter.`
- animated gradient bar
- CTA border
- active nav underline
- selected premium / highlighted interface states
- small glowing status markers

## Forbidden Gradient Use Cases

- body text fills
- long blocks of UI background
- decorative backgrounds with no semantic purpose
- multiple competing gradients in one viewport

Rule:

Gradient must feel like a signal.

---

## Typography Identity

## Font System

```txt
Poppins       -> headings, logo, buttons, labels
Roboto        -> body text, descriptions, supporting text
Courier Prime -> retro labels, pixel UI overlays, energy/battle text
```

## Usage Rules

### Poppins

Use for:

- logo
- H1 / H2 / H3
- buttons
- navigation
- section labels

Visual effect:

- strong
- modern
- confident
- product-first

### Roboto

Use for:

- descriptive text
- paragraph copy
- footer support text
- subtitles

Visual effect:

- calm
- readable
- efficient

### Courier Prime

Use for:

- sphere labels in portal
- battle text like `FIGHT!`
- energy labels
- retro system markers
- pixel-art supportive interface details

Visual effect:

- tactical
- digital
- retro-systemic

## Typography Behavior

- large type should feel decisive
- body type should feel lighter and airier
- monospace must appear only as a system accent
- logo remains bold, minimal, stable

---

## Layout Identity

## Core Layout Language

- asymmetry with control
- wide breathing space
- left-heavy information anchors
- strong section pacing
- big visual transitions between narrative blocks

## Signature Layout Structures

### Hero

- left-dominant content
- animated portal on right
- battle strip above headline

### Problem Section

- split 2-column structure
- one statement column
- one explanation column

### Features

- broken 3-column grid
- staggered vertical card offsets

### Quote

- centered statement moment
- giant faded quotation marks
- atmospheric gradient background

### Footer

- product-like, clean, grid-based

## Layout Rule

The page must never feel like stacked generic centered sections.

It should feel paced and composed.

---

## Header UI Identity

The header must feel like app chrome, not website chrome.

## Header Characteristics

- sticky
- product-like height
- blurred surface
- subtle border
- stable logo left
- controls right
- capsule controls
- animated register CTA border

## Header Visual Details

### Height

```txt
80px
```

### Logo

- `frinter` in bold Poppins
- gradient dot only
- no extra mark
- no slogan in header

### Language Switch

- capsule
- border + neutral fill
- globe icon acceptable
- should feel like control, not decoration

### Register CTA

- animated gradient border
- neutral inner fill
- bold text
- should feel connected to the app

### Mobile Header

- compact capsule language switch
- single clean menu toggle
- panel slides/open state should remain simple

---

## Footer UI Identity

The footer should feel like the bottom of the product, not a different marketing system.

## Footer Characteristics

- neutral surface
- large spacing
- 3-column structure
- same logo treatment as header
- Roboto for descriptive/supporting text
- subtle animated heart

## Footer Rules

- keep hierarchy quiet
- do not overload with badges or graphics
- legal/support links must remain clean and simple
- heart pulse must stay restrained

---

## Card Identity

FRINTER cards should feel:

- clean
- structured
- slightly premium
- precise

## Card Rules

- rounded corners
- thin border
- soft shadow
- neutral fill
- color appears via accents, not full-card saturation

## Feature Cards

Feature cards are one of the core brand UI blocks.

They include:

- rounded large container
- top animation frame
- title
- mechanism label
- goal label

Feature cards should feel like product modules, not blog cards.

---

## Signature UI Elements

## 1. Gradient Dot

The dot in `frinter.` is a permanent brand marker.

### Rules

- always gradient
- never flat color
- never replaced with icon

## 2. Animated Gradient Bar

This is a major FRINTER signature element.

### Structure

- full-width
- 64px height
- animated brand gradient
- moving white shine overlay

### Core Animation

Base layer:

```css
background-size: 200% 100%;
animation: gradientShift 10s linear infinite;
```

Shine overlay:

```css
animation: shineSweep 3s ease-in-out infinite;
```

### Identity Meaning

- energy flow
- system continuity
- transition between states/sections

## 3. Scanline Overlay

Used as subtle retro-tech texture.

### Approved Areas

- hero battle strip
- energy panel
- pixel-art panels

### Rules

- low opacity only
- texture, not noise
- should be felt, not loudly seen

## 4. Portal Capsule Label

Used inside hero portal.

### Characteristics

- rounded full capsule
- soft blur
- border
- monospace uppercase label
- category color changes with portal cycle

---

## Retro / Pixel-Art Identity

Retro is a core UI identity layer.

It is not decorative nostalgia.

It is a visual language for:

- state
- measurement
- energy
- category symbolism
- internal system tension

## Retro UI Rules

- pixel-art should stay symbolic and minimal
- sprites must remain clean silhouettes
- category colors must drive sprite coloring
- pair pixel visuals with modern clean containers
- retro visuals should enhance system feeling, not overpower layout

---

## Main Pixel-Art Icons

These are the 3 primary symbolic icons of FRINTER.

## 1. Tree

Category:

- Flourishing

Colors:

```txt
Primary: #4a8d83
Accent:  #7bc4ba
```

Meaning in UI:

- growth
- regeneration
- compounding vitality

Use in:

- feature cards
- hero battle
- portal cycle
- category visualization

## 2. Heart

Category:

- Relationships

Colors:

```txt
Primary: #8a4e64
Accent:  #c47fa0
```

Meaning in UI:

- human investment
- emotional priority
- relational time

Use in:

- feature cards
- hero battle
- portal cycle
- relationship states

## 3. Brain

Category:

- Deep Work

Colors:

```txt
Primary: #d6b779
Accent:  #d6b779
```

Meaning in UI:

- cognition
- strategic effort
- focused creation

Use in:

- feature cards
- hero battle
- portal cycle
- premium focus states

---

## Supporting Pixel-Art and Retro Elements

These belong to the same identity system.

## Crown

Use:

- winner marker in hero battle

Meaning:

- active dominant sphere
- temporary category supremacy

## VS / Sword Marker

Use:

- center of hero battle strip

Meaning:

- tension between life spheres
- optimization through tradeoffs

## Health Bars

Use:

- under battle icons

Meaning:

- measurable state
- game-logic visualization of energy/priority

## Pixel Stars

Use:

- battle background ambience

Meaning:

- subtle energy in the system layer

## Pixel Badge Star

Use:

- `New` marker near Energy Bar area

Meaning:

- highlight
- update
- elevated attention

## Energy Segments

Use:

- energy panel

Meaning:

- battery reserve
- visible physiological state

## Retro Labels

Examples:

- `FIGHT!`
- `DEEP WORK WINS!`
- `ENERGY LEVEL`
- sphere labels

Rules:

- always sparse
- always uppercase or system-like
- always secondary to the main clean UI hierarchy

---

## Animation Identity

Animation is a major part of FRINTER UI identity.

Motion should feel:

- precise
- controlled
- readable
- premium
- state-driven

Not:

- playful for no reason
- bouncy by default
- decorative noise

---

## Animation Categories

## 1. Gradient Motion

Used for:

- animated gradient bar
- CTA gradient borders
- active underlines
- gradient signal surfaces

### Behavior

- slow
- fluid
- continuous
- linear

### Identity Effect

- creates living system energy
- makes the brand feel active, not static

## 2. Section Entrance Motion

Used for:

- hero content reveal
- section reveal
- card reveal

### Behavior

- fade-in-up
- short travel distance
- easy, smooth arrival
- staggered only when hierarchy benefits

Reference pattern:

```css
opacity: 0 -> 1
transform: translateY(16px) -> translateY(0)
duration: ~0.55s
```

## 3. Pixel Motion

Used for:

- floating sprites
- ambient particle drift
- portal cycle
- hero battle transitions

### Behavior

- horizontal drift
- sine-wave bobbing
- low-res feel
- state-based change

### Identity Effect

- makes FRINTER visually ownable
- turns categories into living systems

## 4. State Impact Motion

Used for:

- battle hit shake
- winner bounce
- pulsing stars
- footer heart pulse

### Behavior

- short
- visible
- energetic but not chaotic

---

## Animation Signature Elements

## Animated Gradient Bar Identity

This element must remain recognizable across FRINTER surfaces.

### Anatomy

- full-width color motion
- 3-color blend
- shimmer pass
- clean edges

### UI Meaning

- transition
- energy transfer
- signature brand pulse

## Hero Portal Identity

The circular portal is a major signature.

### It contains

- circular border shell
- full pixel-art field
- vignette
- category cycle
- floating label

### Motion behavior

- cycles category every ~4s
- transitions label color with category
- feels like an engine or chamber

## Hero Battle Identity

This is a key differentiator in the UIX system.

### It contains

- two smaller competing category sprites
- one central winner sprite
- health bars
- `VS`
- weapon symbol
- phase text

### Phases

- enter
- attack
- win

### Effects

- enemy hit shake
- winner motion
- state text reveal

### UI Meaning

- the 3 life spheres are dynamic, not static
- the system measures emphasis and tension

---

## Pixel Animation Technical Identity

## Standard Canvas Sizes

```txt
Portal: 192 x 192
Bar:    192 x 64
Sprint: 192 x 96
```

## Standard Pixel Animation Ingredients

Each canvas-based retro panel may include:

- category sprite
- ambient particles
- floor line
- grid ticks
- scanlines
- bobbing movement

## Rules

- sprites must stay readable at a glance
- movement should loop cleanly
- color remains category-based
- background noise must remain subtle

---

## UIX Consistency Checklist

Use this checklist when creating any new FRINTER page or component.

- Does the UI feel like the app, not just a website?
- Are the 3 category colors used correctly?
- Is the gradient used only for signature emphasis?
- Is Poppins / Roboto / Courier Prime usage correct?
- Are pixel-art elements meaningful and category-driven?
- Is motion controlled and state-based?
- Does the header feel like product chrome?
- Does the footer feel like part of the same system?
- Are scanlines and retro textures subtle?
- Does the page avoid generic SaaS styling?

If the answer is no to any of the above, the UI is off-brand.

---

## Quick Reference

## Main Colors

```txt
Teal:  #4a8d83
Mauve: #8a4e64
Gold:  #d6b779
```

## Fonts

```txt
Poppins
Roboto
Courier Prime
```

## Main Pixel Icons

```txt
Tree   -> Flourishing
Heart  -> Relationships
Brain  -> Deep Work
```

## Signature UI Elements

```txt
Gradient dot
Animated gradient bar
App-style sticky header
Circular portal
Hero battle strip
Scanlines
Energy segments
Product-style footer
```

## Signature Animation Families

```txt
Gradient motion
Fade-in-up reveal
Portal category cycle
Pixel drift + bobbing
Battle hit / win states
Subtle pulse accents
```

---

## Design Tokens

This section defines implementation-grade UI tokens derived from the current FRINTER visual system.

## Color Tokens

### Brand Tokens

```css
--color-brand-teal: #4a8d83;
--color-brand-mauve: #8a4e64;
--color-brand-gold: #d6b779;

--color-brand-teal-accent: #7bc4ba;
--color-brand-mauve-accent: #c47fa0;
--color-brand-gold-accent: #d6b779;
```

### Semantic Sphere Tokens

```css
--color-sphere-flourishing: #4a8d83;
--color-sphere-relationships: #8a4e64;
--color-sphere-deep-work: #d6b779;

--color-sphere-flourishing-accent: #7bc4ba;
--color-sphere-relationships-accent: #c47fa0;
--color-sphere-deep-work-accent: #d6b779;
```

### Light Surface Tokens

```css
--color-bg: #ffffff;
--color-panel: #f9fafb;
--color-panel-strong: #ffffff;
--color-text-primary: #111827;
--color-text-secondary: #6b7280;
--color-text-faint: #9ca3af;
--color-border: #e5e7eb;
--color-border-strong: #d1d5db;
```

### Dark Surface Tokens

```css
--color-bg-dark: #030712;
--color-panel-dark: rgba(15, 23, 42, 0.74);
--color-panel-strong-dark: #0f172a;
--color-text-primary-dark: #f9fafb;
--color-text-secondary-dark: #cbd5e1;
--color-text-faint-dark: #94a3b8;
--color-border-dark: #1f2937;
--color-border-strong-dark: #374151;
```

### Gradient Tokens

```css
--gradient-brand: linear-gradient(90deg, #4a8d83, #8a4e64, #d6b779);
--gradient-brand-reverse: linear-gradient(90deg, #d6b779, #8a4e64, #4a8d83);
--gradient-shine-overlay: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
```

## Typography Tokens

```css
--font-heading: 'Poppins', sans-serif;
--font-body: 'Roboto', sans-serif;
--font-system: 'Courier Prime', monospace;
```

### Font Weight Tokens

```css
--font-weight-light: 300;
--font-weight-regular: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;
--font-weight-black: 900;
```

### Type Scale Tokens

```css
--text-hero-max: clamp(3.6rem, 7vw, 8rem);
--text-section-title: clamp(2.8rem, 4vw, 4.5rem);
--text-h3: 1.5rem;
--text-body-lg: 1.125rem;
--text-body: 1rem;
--text-body-sm: 0.95rem;
--text-label: 0.75rem;
--text-micro: 0.875rem;
--text-system-xs: 0.75rem;
```

## Radius Tokens

```css
--radius-sm: 0.75rem;
--radius-md: 1rem;
--radius-lg: 1.5rem;
--radius-xl: 2rem;
--radius-pill: 999px;
```

## Spacing Tokens

```css
--space-2: 0.5rem;
--space-3: 0.75rem;
--space-4: 1rem;
--space-6: 1.5rem;
--space-8: 2rem;
--space-12: 3rem;
--space-16: 4rem;
--space-20: 5rem;
--space-24: 6rem;
--space-32: 8rem;
```

## Shadow Tokens

```css
--shadow-soft: 0 14px 30px rgba(15, 23, 42, 0.07);
--shadow-card: 0 18px 44px rgba(15, 23, 42, 0.06);
--shadow-strong: 0 24px 60px rgba(15, 23, 42, 0.12);
--shadow-portal: 0 24px 60px rgba(15, 23, 42, 0.12);
--shadow-overlay-dark: 0 24px 60px rgba(0, 0, 0, 0.35);
```

## Layout Tokens

```css
--container-max: 1400px;
--container-narrow: 768px;
--header-height: 80px;
--gradient-bar-height: 64px;
--hero-min-height: 90vh;
--portal-max-size: 500px;
--energy-panel-max: 64rem;
```

---

## Animation Tokens

These are standard timing and motion tokens for FRINTER UIX.

## Duration Tokens

```css
--motion-duration-fast: 0.2s;
--motion-duration-base: 0.25s;
--motion-duration-reveal: 0.55s;
--motion-duration-pulse: 1.2s;
--motion-duration-shine: 3s;
--motion-duration-portal-cycle: 4s;
--motion-duration-gradient-loop: 5s;
--motion-duration-gradient-bar: 10s;
--motion-duration-battle-phase: 2.2s;
--motion-duration-heartbeat: 2s;
```

## Easing Tokens

```css
--motion-ease-standard: ease;
--motion-ease-out: ease-out;
--motion-ease-in-out: ease-in-out;
--motion-ease-linear: linear;
```

## Reveal Tokens

```css
--motion-reveal-y: 16px;
--motion-reveal-opacity-from: 0;
--motion-reveal-opacity-to: 1;
```

Reference:

```css
opacity: 0 -> 1;
transform: translateY(16px) -> translateY(0);
duration: 0.55s;
ease: ease-out;
```

## Gradient Motion Tokens

```css
--motion-gradient-bg-size: 200% 100%;
--motion-gradient-direction-start: 100% 50%;
--motion-gradient-direction-mid: 0% 50%;
--motion-gradient-direction-end: 100% 50%;
```

## Shine Motion Tokens

```css
--motion-shine-start-x: -100%;
--motion-shine-end-x: 100%;
```

## Pulse Tokens

```css
--motion-pulse-opacity-min: 0.4;
--motion-pulse-opacity-max: 1;
--motion-pulse-scale-base: 1;
--motion-pulse-scale-peak: 1.2;
```

## Battle Motion Tokens

```css
--motion-battle-hit-x-forward: 8px;
--motion-battle-hit-x-back: -4px;
--motion-battle-winner-translate-x-left: -6px;
--motion-battle-winner-translate-x-right: 6px;
--motion-battle-winner-translate-y-up: -6px;
--motion-battle-winner-scale-peak: 1.15;
```

## Portal Motion Tokens

```css
--motion-portal-category-interval: 4s;
--motion-portal-scale-static: 1;
```

## Heartbeat Tokens

```css
--motion-heartbeat-scale-base: 1;
--motion-heartbeat-scale-peak: 1.2;
--motion-heartbeat-duration: 2s;
```

---

## Pixel-Art Tokens

This section defines the implementation tokens for the pixel-art system.

## Pixel Grid Tokens

```css
--pixel-unit-xs: 1px;
--pixel-unit-sm: 2px;
--pixel-unit-md: 4px;
--pixel-unit-lg: 8px;
```

## Canvas Tokens

```css
--pixel-canvas-width: 192;
--pixel-canvas-height-portal: 192;
--pixel-canvas-height-bar: 64;
--pixel-canvas-height-sprint: 96;
```

## Pixel Surface Tokens

```css
--pixel-floor-height: 4px;
--pixel-grid-spacing: 24px;
--pixel-scanline-row-height: 4px;
--pixel-scanline-opacity-light: 0.05;
--pixel-scanline-opacity-dark: 0.10;
```

## Pixel Ambient Tokens

```css
--pixel-bg-particle-size-sm: 1px;
--pixel-bg-particle-size-md: 2px;
--pixel-bg-particle-speed-min: 0.05;
--pixel-bg-particle-speed-max: 0.10;
--pixel-sprite-speed-min: 0.10;
--pixel-sprite-speed-max: 0.25;
--pixel-bob-amplitude: 2px;
```

## Pixel Count Tokens By Variant

```txt
bar:
  spriteCount: 4
  bgCount: 8

sprint:
  spriteCount: 10
  bgCount: 20

portal:
  spriteCount: 12
  bgCount: 25
```

## Pixel Color Tokens

### Flourishing Pixel Tokens

```css
--pixel-flourishing-primary: #4a8d83;
--pixel-flourishing-accent: #7bc4ba;
```

### Relationships Pixel Tokens

```css
--pixel-relationships-primary: #8a4e64;
--pixel-relationships-accent: #c47fa0;
```

### Deep Work Pixel Tokens

```css
--pixel-deep-work-primary: #d6b779;
--pixel-deep-work-accent: #d6b779;
```

## Pixel UI Tokens

```css
--pixel-health-unit-size-desktop: 8px;
--pixel-health-unit-size-mobile: 6px;
--pixel-health-gap: 2px;
--pixel-energy-segment-height: 18px;
--pixel-energy-segment-gap: 3px;
--pixel-battle-label-size: 7px;
--pixel-battle-label-size-mobile: 6px;
--pixel-winner-label-size: 8px;
```

## Pixel Sprite Tokens

The FRINTER pixel system is based on symbolic sprite matrices.

### Primary Sprite Tokens

```txt
--sprite-tree
--sprite-heart
--sprite-brain
```

### Supporting Sprite Tokens

```txt
--sprite-crown
--sprite-energy-badge-star
```

These may exist as:

- matrix arrays
- SVG pixel constructions
- grid-based primitives

but must preserve the same silhouette logic.

## Pixel Sprite Matrix Tokens

### Tree Matrix Token

```txt
10x10 battle matrix
12x12 ambient matrix
```

### Heart Matrix Token

```txt
8x9 battle matrix
11x13 ambient matrix
```

### Brain Matrix Token

```txt
9x10 battle matrix
9x12 ambient matrix
```

---

## Exact Pixel Matrices

Matrix legend:

```txt
0 = transparent
1 = primary color
2 = accent / highlight color
```

These matrices are the exact current FRINTER sprite definitions used in implementation.

## Main Battle Sprites

### Tree Battle Matrix

```txt
[
  [0,0,0,0,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,0,0,0],
  [0,0,1,1,2,2,1,1,0,0],
  [0,1,1,2,2,2,1,1,1,0],
  [0,0,1,1,1,1,1,1,0,0],
  [0,0,1,1,2,1,1,1,0,0],
  [0,0,0,1,1,1,1,0,0,0],
  [0,0,0,0,1,1,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0],
  [0,0,0,1,1,1,1,0,0,0]
]
```

### Heart Battle Matrix

```txt
[
  [0,1,1,0,0,0,1,1,0],
  [1,1,1,1,0,1,1,1,1],
  [1,2,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1],
  [0,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,1,0,0],
  [0,0,0,1,1,1,0,0,0],
  [0,0,0,0,1,0,0,0,0]
]
```

### Brain Battle Matrix

```txt
[
  [0,0,1,1,1,1,1,1,0,0],
  [0,1,1,1,1,1,1,1,1,0],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,2,1,1,1,1,2,1,1],
  [1,1,1,1,1,1,1,1,1,1],
  [1,1,2,2,2,1,1,1,1,1],
  [0,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,0,0,1,1,0,0],
  [0,0,0,1,0,0,0,1,0,0]
]
```

## Ambient / Canvas Sprites

### Tree Ambient Matrix

```txt
[
  [0,0,0,0,1,1,1,1,0,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,1,2,2,1,1,1,1,1,0],
  [1,1,1,1,2,2,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,2,2,1,1,1],
  [0,1,1,1,1,1,1,2,2,1,1,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,0,1,1,0,0,0,0,0,0],
  [0,0,0,1,1,1,1,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,0,0,0]
]
```

### Heart Ambient Matrix

```txt
[
  [0,0,1,1,1,0,0,0,1,1,1,0,0],
  [0,1,1,1,1,1,0,1,1,1,1,1,0],
  [1,1,1,2,2,1,1,1,1,1,1,1,1],
  [1,1,1,2,2,1,1,1,1,1,1,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1],
  [0,1,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,1,1,1,1,1,1,0,0],
  [0,0,0,1,1,1,1,1,1,1,0,0,0],
  [0,0,0,0,1,1,1,1,1,0,0,0,0],
  [0,0,0,0,0,1,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,1,0,0,0,0,0,0]
]
```

### Brain Ambient Matrix

```txt
[
  [0,0,0,1,1,1,1,1,1,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,0,0],
  [0,1,1,2,2,1,1,1,2,2,1,0],
  [1,1,1,2,2,1,1,1,2,2,1,1],
  [1,1,1,1,1,1,1,1,1,1,1,1],
  [1,1,1,2,2,2,2,1,1,1,1,1],
  [0,1,1,1,1,1,1,1,1,1,1,0],
  [0,0,1,1,1,0,0,1,1,1,0,0],
  [0,0,0,1,1,0,0,1,1,0,0,0]
]
```

## Badges and Supporting Pixel Shapes

### Energy Badge Star Matrix

Used in the `New` badge near the Energy Bar.

```txt
[
  [0,0,1,1,1],
  [0,1,1,1,0],
  [0,1,1,0,0],
  [1,1,1,1,1],
  [0,0,1,1,0],
  [0,0,1,1,0],
  [0,0,0,1,0],
  [0,0,0,1,0]
]
```

This corresponds to the rendered SVG rect pattern:

```txt
Row 0: ..###
Row 1: .###.
Row 2: .##..
Row 3: #####
Row 4: ..##.
Row 5: ..##.
Row 6: ...#.
Row 7: ...#.
```

### Health Bar Unit Token

The health bar is not a sprite matrix but a repeatable pixel badge unit.

```txt
unit:
  width: 8px
  height: 8px
mobile:
  width: 6px
  height: 6px
gap: 2px
count: 10
```

### Energy Segment Token

The Energy Bar is built from repeated pixel-like segments.

```txt
segment:
  height: 18px
  gap: 3px
  totalCount: 20
activeLowCount: 8
activeHighCount: 8
inactiveCount: 4
```

### Crown Token

The crown is currently represented as a symbolic emoji marker rather than a matrix sprite:

```txt
👑
```

If a future matrix version is introduced, it should be stored as:

```txt
--sprite-crown-matrix
```

### VS / Sword Token

The center battle icon is currently represented as:

```txt
⚔️
```

If converted into pixel-art later, it should be stored as:

```txt
--sprite-sword-matrix
```

## Pixel Rendering Tokens

```css
--pixel-rendering-mode: pixelated;
--pixel-highlight-color: #ffffff80;
--pixel-floor-opacity: 10%;
--pixel-grid-opacity: 40%;
--pixel-particle-opacity-layer: 30%;
```

## Pixel Motion Tokens

```css
--pixel-motion-bob-frequency-factor: 0.002;
--pixel-motion-position-factor: 0.1;
--pixel-motion-offset-step: 0.2;
```

## Pixel Battle Tokens

```css
--pixel-battle-panel-height: 110px;
--pixel-battle-winner-min-width: 110px;
--pixel-battle-winner-min-width-mobile: 84px;
--pixel-battle-crown-size: 16px;
--pixel-battle-vs-size: 11px;
--pixel-battle-overlay-fight-size: 14px;
--pixel-battle-overlay-win-size: 12px;
```

## Pixel Portal Tokens

```css
--pixel-portal-border-width: 6px;
--pixel-portal-label-letter-spacing: 0.32em;
--pixel-portal-label-letter-spacing-mobile: 0.24em;
--pixel-portal-label-font-size: 0.875rem;
--pixel-portal-label-font-size-mobile: 0.72rem;
```

## Pixel Energy Tokens

```css
--pixel-energy-value-size: 2rem;
--pixel-energy-label-letter-spacing: 0.3em;
--pixel-energy-scale-size: 10px;
--pixel-energy-scale-opacity: 0.56;
```

---

## Token Usage Rules

- Tokens must be reused, not visually approximated.
- Pixel-art tokens must stay category-bound.
- Gradient tokens must remain reserved for signature states.
- Motion tokens must remain calm and consistent across surfaces.
- If a new FRINTER surface uses different values without reason, it is off-system.
