# SocialHub — Plan wdrożenia VIRAL ENGINE

Data: 2026-03-18

## Status wykonania

### Wykonane i potwierdzone na 2026-03-18

- wykonano migrację `migrations/0005_social_hub_viral_engine.sql` przez `npm run db:push`
- `drizzle-kit push` zakończył się statusem `Changes applied`
- model danych w `src/db/schema.ts` zawiera pola VIRAL ENGINE dla `sh_settings`, `sh_content_briefs`, `sh_generated_copy` i `sh_media_assets`
- runtime i typy VIRAL ENGINE istnieją w:
- `src/lib/sh-viral-engine-types.ts`
- `src/lib/sh-viral-engine.ts`
- backend settings SocialHub obsługuje `viralEngine` w:
- `src/lib/sh-settings.ts`

### Krótki log wykonania

1. Odczytano połączenie DB z `.env.local` przez `DATABASE_URL`.
2. Zweryfikowano, że `db:push` mapuje się na `drizzle-kit push`.
3. Uruchomiono `npm run db:push`.
4. Migracja została zastosowana poprawnie do bazy.

## Cel

Wdrożyć w module SocialHub pełny mechanizm `VIRAL ENGINE`, konfigurowalny z poziomu `Settings`, który:

- działa jako obowiązkowa warstwa strategiczna przed generacją treści,
- wpływa na prompty wysyłane do modelu AI,
- wspiera dwa typy outputu: `written` i `video`,
- dla treści pisanych stosuje `Process Communication Model` w pełnym zakresie 5 punktów,
- dla video umożliwia wybór formatów i narzuca format do promptu generacji,
- ma tryb `enabled / disabled`,
- ma tryb `personalized`,
- zostawia ślad audytowy w briefie, wygenerowanej copy i media.

Ten dokument jest oparty na aktualnej strukturze SocialHub w repo.

## Aktualny stan SocialHub

### Główne punkty wejścia

- `src/pages/admin/social-hub/index.astro`
- `src/pages/admin/social-hub/new.astro`
- `src/pages/admin/social-hub/[briefId].astro`
- `src/pages/admin/social-hub/settings.astro`

### Główne endpointy

- `src/pages/api/social-hub/briefs/index.ts`
- `src/pages/api/social-hub/briefs/[id]/generate-copy.ts`
- `src/pages/api/social-hub/briefs/[id]/render.ts`
- `src/pages/api/social-hub/briefs/[id]/publish.ts`
- `src/pages/api/social-hub/settings.ts`
- `src/pages/api/social-hub/repurpose.ts`
- `src/pages/api/social-hub/queue.ts`

### Główne usługi i joby

- `src/lib/sh-settings.ts`
- `src/lib/sh-source-loader.ts`
- `src/lib/sh-copywriter-job.ts`
- `src/lib/sh-video-job.ts`
- `src/lib/sh-queue-processor.ts`
- `src/lib/sh-distributor.ts`
- `scripts/sh-copywriter.ts`
- `scripts/sh-video-render.ts`

### Aktualny flow

1. User tworzy brief w `new.astro`.
2. `POST /api/social-hub/briefs` zapisuje `sh_content_briefs`.
3. `POST /api/social-hub/briefs/[id]/generate-copy` odpala `scripts/sh-copywriter.ts`.
4. Copy zapisuje się do `sh_generated_copy`.
5. `POST /api/social-hub/briefs/[id]/render` generuje image albo startuje video render.
6. Media zapisuje się do `sh_media_assets`.
7. `POST /api/social-hub/briefs/[id]/publish` publikuje przez `sh-distributor.ts`.

Wniosek: najlepszy punkt integracji `VIRAL ENGINE` to etap pomiędzy `source brief` a `LLM prompt`, z dodatkowym wpływem na etap renderowania video.

## Założenie architektoniczne

`VIRAL ENGINE` nie może być tylko opcją UI. Musi stać się warstwą domenową, która:

- przygotowuje strategię viralową dla briefu,
- zapisuje ją do bazy,
- wstrzykuje ją do promptów copy/video,
- steruje też wyborem formatów video,
- może być wyłączona globalnie albo per brief,
- może być personalizowana globalnie i per brief.

## Definicja docelowa VIRAL ENGINE

### Poziomy konfiguracji

1. Globalny: `Social Hub Settings`
2. Per brief: override przy tworzeniu posta
3. Per repurpose group: inherited z briefu bazowego

### Tryby

- `disabled`
- `enabled_default`
- `enabled_personalized`

### Zakres działania

#### Written content

Silnik musi generować i przekazywać do promptu 5 elementów PCM:

1. `core_audience_state`
2. `dominant_psychological_need`
3. `channel_of_communication`
4. `preferred_tone_and_language`
5. `call_to_action_style`

Dodatkowo prompt ma wymuszać, by copy:

- było zgodne z wybranym profilem PCM,
- unikało języka sprzecznego z profilem,
- zawierało hook, rozwinięcie i CTA zgodne z potrzebą psychologiczną,
- zachowywało brand voice i source fidelity.

#### Video content

Silnik musi dodawać do promptu:

- `selected_video_format`
- `format_reason`
- `opening_pattern`
- `visual_rhythm`
- `scene_structure`
- `cta_pattern`

User musi móc wybrać format video z ustawień i nadpisać go przy briefie.

## Docelowe formaty video

Minimalny zestaw do wdrożenia:

- `talking_head_authority`
- `problem_agitation_solution`
- `storytime_confession`
- `contrarian_hot_take`
- `listicle_fast_cuts`
- `myth_vs_reality`
- `screen_demo_explainer`
- `ugc_testimonial_style`

Każdy format powinien mieć:

- nazwę,
- opis,
- platform fit,
- hook pattern,
- pacing recommendation,
- scene template,
- CTA style,
- constraints dla renderu.

## Główna luka w obecnym kodzie

Obecnie `scripts/sh-copywriter.ts` buduje prompt na podstawie:

- `sourceSnapshot`,
- `suggestionPrompt`,
- `targetPlatforms`,
- brand voice z `public/llms-full.txt`.

Brakuje:

- warstwy strategii viralowej,
- analizy/persony PCM,
- śladu audytowego promptu viralowego,
- rozróżnienia promptów `written vs video`,
- bibliotek formatów video,
- możliwości wyłączenia i personalizacji.

## Architektura docelowa

## 1. Model domenowy

Należy dodać osobny moduł:

- `src/lib/sh-viral-engine.ts`
- `src/lib/sh-viral-engine-types.ts`
- `src/lib/sh-viral-engine-prompts.ts`

### Odpowiedzialność

- walidacja ustawień VIRAL ENGINE,
- budowa runtime config,
- generowanie instrukcji do promptu AI,
- wybór PCM dla written,
- wybór video format dla video,
- merge global settings + brief overrides,
- serializacja do audytu.

## 2. Warstwa danych

### Rozszerzenie `sh_settings.config`

Dodać sekcję:

```ts
viralEngine: {
  enabled: boolean;
  mode: 'default' | 'personalized';
  personalizationLabel: string;
  personalizationNotes: string;
  written: {
    enabled: boolean;
    pcmProfileMode: 'manual' | 'auto';
    defaultPcmProfile: 'harmonizer' | 'thinker' | 'persister' | 'rebel' | 'promoter' | 'imaginer';
    enforceFivePoints: boolean;
    hookIntensity: 'low' | 'medium' | 'high';
    ctaIntensity: 'soft' | 'medium' | 'hard';
  };
  video: {
    enabled: boolean;
    formatMode: 'manual' | 'auto';
    defaultFormats: string[];
    preferredPrimaryFormat: string;
    pacing: 'calm' | 'medium' | 'fast';
    visualDensity: 'low' | 'medium' | 'high';
  };
}
```

### Rozszerzenie `sh_content_briefs`

Dodać kolumny:

- `viral_engine_enabled boolean`
- `viral_engine_mode varchar(30)`
- `viral_engine_profile jsonb`
- `viral_engine_prompt text`
- `video_format_slug varchar(100)`
- `updated_at timestamp`

Cel:

- override per brief,
- snapshot ustawień użytych przy generacji,
- możliwość odtworzenia promptu.

### Rozszerzenie `sh_generated_copy`

Dodać:

- `viral_engine_snapshot jsonb`
- `pcm_profile jsonb`
- `content_angle varchar(100)`
- `video_format_slug varchar(100)`

### Rozszerzenie `sh_media_assets`

Dodać:

- `video_format_slug varchar(100)`
- `viral_engine_snapshot jsonb`

## 3. Settings UI

Plik docelowy:

- `src/pages/admin/social-hub/settings.astro`

### Nowa sekcja: VIRAL ENGINE

Sekcja musi zawierać:

- master toggle `Enable VIRAL ENGINE`
- toggle `Allow personalization`
- textarea `Personalization context`
- written settings
- video settings

### Written settings

- toggle `Use VIRAL ENGINE for written content`
- select `PCM profile mode`: auto / manual
- select `Default PCM profile`
- toggle `Enforce all 5 PCM points`
- select `Hook intensity`
- select `CTA intensity`
- textarea `Additional written rules`

### Video settings

- toggle `Use VIRAL ENGINE for video`
- select `Video format mode`: auto / manual
- multi-select `Allowed video formats`
- select `Preferred primary format`
- select `Pacing`
- select `Visual density`
- textarea `Additional video rules`

### Wymaganie UX

Jeżeli engine jest wyłączony:

- UI ma jasno pokazywać, że prompt idzie bez warstwy viralowej,
- brief detail ma pokazywać badge `Viral Engine Off`.

## 4. New Brief UI

Plik docelowy:

- `src/pages/admin/social-hub/new.astro`

### Zmiany

Dodać nowy krok albo sekcję w kroku 4/5:

- toggle `Use VIRAL ENGINE for this brief`
- select `Mode`: default / personalized
- textarea `Brief-specific personalization`
- dla `outputFormat = video`: select `Video Format`
- dla `outputFormat = text/image`: select `PCM profile override`

### Zasada dziedziczenia

- domyślnie brief dziedziczy global settings,
- user może ustawić override,
- override zapisuje snapshot do briefu.

## 5. API

### `GET/PUT /api/social-hub/settings`

Rozszerzyć walidację i payload o `viralEngine`.

### `POST /api/social-hub/briefs`

Payload ma przyjąć:

- `viralEngineEnabled`
- `viralEngineMode`
- `viralEnginePersonalization`
- `pcmProfileOverride`
- `videoFormatSlug`

### `POST /api/social-hub/briefs/[id]/generate-copy`

Przed startem joba endpoint musi:

- pobrać settings,
- zbudować `viral engine runtime config`,
- przekazać go przez env albo lepiej przez DB snapshot + `briefId`.

### `POST /api/social-hub/briefs/[id]/render`

Dla video renderu endpoint musi:

- pobrać `videoFormatSlug`,
- dodać format do pipeline,
- dla video uruchomić prompt/script z format-specific instructions.

## 6. Copywriter pipeline

Plik krytyczny:

- `scripts/sh-copywriter.ts`

### Zmiana obowiązkowa

`VIRAL ENGINE` musi być jawnie w promptach modelu AI.

To oznacza:

- system prompt rozszerzony o blok viralowy,
- user prompt rozszerzony o blok wykonawczy,
- zapis finalnego promptu do audytu.

### Docelowy układ promptu

#### System prompt

- rola copywritera,
- brand voice,
- source fidelity,
- viral engine strategy block,
- PCM block dla written,
- format block dla video,
- constraints output JSON.

#### User prompt

- source snapshot,
- suggestion prompt,
- target platforms,
- brief viral overrides,
- explicit instruction: `Apply VIRAL ENGINE before writing final variants`.

### Wymaganie wykonawcze

Jeśli `viralEngineEnabled = true`, model nie może dostać promptu bez tej sekcji.

## 7. Video pipeline

Pliki krytyczne:

- `scripts/sh-video-render.ts`
- `src/lib/sh-video-gen.ts`
- opcjonalnie nowy `scripts/sh-video-scriptwriter.ts`

### Problem obecny

Video opiera się na `videoScript` zapisanym w `sh_generated_copy`, ale bez strategii formatu.

### Docelowy model

Wariant A, rekomendowany:

- `sh-copywriter.ts` generuje również `videoScript` już zgodny z `videoFormatSlug`.

Wariant B, opcjonalny etap 2:

- osobny `video script refiner`, który przed renderem przepuszcza `videoScript` przez format-specific prompt.

### Minimalny scope wdrożenia

- rozszerzyć generację copy o `videoFormatSlug`,
- generować `videoScript` zgodnie z formatem,
- zapisywać format w `sh_generated_copy`,
- przekazywać format do render joba.

## 8. Proces Communication Model dla written

Implementacja musi być pełna, nie symboliczna.

### Wymagane 5 punktów w runtime snapshot

```ts
pcmSnapshot: {
  profile: string;
  coreAudienceState: string;
  dominantPsychologicalNeed: string;
  channelOfCommunication: string;
  preferredToneAndLanguage: string;
  callToActionStyle: string;
}
```

### Tryby

#### Manual

User wybiera profil PCM w settings albo per brief.

#### Auto

Engine wylicza profil na podstawie:

- source type,
- source metadata,
- platform,
- suggestion prompt,
- optional personalization notes.

### Zasada bezpieczeństwa

Na etapie 1 auto mode może używać rule-based mapping, bez dodatkowego LLM.

## 9. Personalizacja

`Personalization` musi działać na dwóch poziomach:

### Globalna

Opisuje markę i preferowany styl viralowy, np.:

- jaki typ hooków jest akceptowalny,
- czego nie wolno robić,
- jaki poziom prowokacji jest dopuszczalny,
- jakie emocje są pożądane.

### Per brief

Opisuje specyfikę konkretnej treści, np.:

- bardziej edukacyjnie,
- bardziej kontrowersyjnie,
- mocniej pod TikTok,
- bez clickbaitu.

### Reguła merge

- brief override > global personalization > defaults

## 10. Wyłączenie engine

`VIRAL ENGINE` musi mieć dwa poziomy wyłączenia:

- global off w settings,
- off per brief.

### Zachowanie po wyłączeniu

- prompt nie zawiera viral instructions,
- UI pokazuje `disabled`,
- snapshot w briefie zapisuje, że engine był off,
- generation działa dalej bez błędu.

To jest ważne dla A/B testów i bezpiecznego rollbacku.

## 11. Repo-specific punkty integracji

### `src/lib/sh-settings.ts`

Rozszerzyć typ `ShSettingsConfig`, defaults i `buildShEnv`.

### `src/pages/api/social-hub/settings.ts`

Rozszerzyć walidację JSON.

### `src/pages/api/social-hub/briefs/index.ts`

Przy tworzeniu briefu zapisać snapshot VIRAL ENGINE.

### `src/pages/api/social-hub/briefs/[id]/generate-copy.ts`

Przekazać viral config do joba.

### `scripts/sh-copywriter.ts`

Najważniejsza zmiana promptowa i zapis audytu.

### `src/pages/api/social-hub/briefs/[id]/render.ts`

Obsługa `videoFormatSlug`.

### `scripts/sh-video-render.ts`

Obsługa danych formatu, minimum w logach i snapshotach.

### `src/pages/admin/social-hub/[briefId].astro`

Pokazać:

- badge engine on/off,
- PCM profile,
- video format,
- personalization summary,
- prompt snapshot link/accordion.

## 12. Migracje DB

Nowa migracja powinna:

- rozszerzyć `sh_settings.config` bez niszczenia istniejącego JSONB,
- dodać kolumny do `sh_content_briefs`,
- dodać kolumny do `sh_generated_copy`,
- dodać kolumny do `sh_media_assets`,
- dodać `updated_at` do `sh_content_briefs`, jeśli jeszcze nie jest fizycznie w DB.

### Zasada kompatybilności

Migracja ma być backward compatible:

- stare briefy muszą działać,
- brak danych viralowych nie może psuć UI,
- defaults muszą być stosowane automatycznie.

## 13. Proponowany rollout

### Faza 1

- data model
- settings UI
- brief overrides
- prompt injection do `sh-copywriter.ts`
- audit trail

### Faza 2

- video format library
- video-specific script shaping
- brief detail UI
- analytics flags

### Faza 3

- A/B comparison
- effectiveness tracking per format / PCM profile
- recommendations engine

## 14. Kryteria akceptacji

### Functional

- można włączyć/wyłączyć VIRAL ENGINE globalnie,
- można ustawić personalizację globalną,
- można zrobić override per brief,
- written prompts zawierają pełny 5-point PCM block,
- video prompts zawierają selected video format,
- wygenerowana copy zapisuje snapshot viralowy,
- wygenerowane media zapisują format,
- przy wyłączonym engine generacja nadal działa.

### Technical

- brak regresji dla istniejących briefów,
- settings API jest zgodne wstecz,
- promptUsed zawiera viral block gdy engine jest włączony,
- promptUsed nie zawiera go gdy engine jest wyłączony,
- TypeScript przechodzi,
- ręczne smoke testy przechodzą dla text/image/video.

### UX

- user widzi, czy engine jest on/off,
- user widzi jaki PCM profile i video format zostały użyte,
- settings są czytelne i nieprzeładowane.

## 15. Plan implementacji krok po kroku

### Etap A. Kontrakt domenowy

1. Dodać typy `ShViralEngineConfig`, `ShViralEngineRuntime`, `ShPcmSnapshot`, `ShVideoFormat`.
2. Dodać defaults i helper merge dla settings + brief override.
3. Zdefiniować bibliotekę video formats i PCM profiles.

### Etap B. Baza danych

1. Rozszerzyć `schema.ts`.
2. Dodać migrację SQL.
3. Zaktualizować odczyt/zapis settings.

### Etap C. Settings UI

1. Rozbudować `settings.astro`.
2. Dodać load/save pól viralowych.
3. Walidować zależności pól.

### Etap D. Brief creation

1. Rozszerzyć `new.astro`.
2. Zapisać viral snapshot w `POST /briefs`.
3. Ustawić sensowne defaults z global settings.

### Etap E. Prompt injection

1. Dodać `sh-viral-engine-prompts.ts`.
2. Zmienić `scripts/sh-copywriter.ts`.
3. Zapisać prompt snapshot i viral snapshot do DB.

### Etap F. Video format enforcement

1. Dodać `videoFormatSlug` do brief/render/copy.
2. Zmodyfikować `render.ts` i `sh-video-render.ts`.
3. Wymusić format w `videoScript`.

### Etap G. Detail UI + audit

1. Rozbudować `[briefId].astro`.
2. Pokazać użyte profile i formaty.
3. Pokazać engine on/off.

### Etap H. Testy i rollout

1. Smoke tests manual.
2. Testy integracyjne prompt buildera.
3. Testy regresji settings API.

## 16. Taski dla agentów autonomicznych

Poniżej taski są rozpisane tak, żeby można było delegować je równolegle z minimalnym konfliktem plików.

### Agent 1 — Data model i migracje

Zakres:

- `src/db/schema.ts`
- `migrations/*`

Zadania:

1. Dodać nowe pola viralowe do `sh_settings`, `sh_content_briefs`, `sh_generated_copy`, `sh_media_assets`.
2. Dodać `updated_at` do `sh_content_briefs`, jeśli nie ma pełnej zgodności z DB.
3. Przygotować migrację idempotentną.
4. Upewnić się, że stare rekordy są kompatybilne.

Definition of done:

- schema kompiluje się,
- migracja jest spójna z Drizzle,
- brak breaking change dla istniejących rekordów.

### Agent 2 — Settings backend + config helper

Zakres:

- `src/lib/sh-settings.ts`
- `src/pages/api/social-hub/settings.ts`
- nowe `src/lib/sh-viral-engine-types.ts`

Zadania:

1. Rozszerzyć `ShSettingsConfig`.
2. Dodać defaults VIRAL ENGINE.
3. Dodać walidację payloadu settings.
4. Dodać merge helper global config -> runtime config.

Definition of done:

- `GET/PUT settings` obsługują viralEngine,
- `buildShEnv` lub alternatywny runtime builder zawiera pola viralowe,
- brak regresji dotychczasowych ustawień.

### Agent 3 — Settings UI

Zakres:

- `src/pages/admin/social-hub/settings.astro`

Zadania:

1. Dodać sekcję VIRAL ENGINE.
2. Dodać pola written/video/personalization.
3. Dodać logikę load/save.
4. Dodać stany disabled i conditional rendering.

Definition of done:

- user może zapisać pełny config viralowy,
- UI poprawnie odtwarza zapisane settings,
- nic nie psuje istniejących sekcji settings.

### Agent 4 — Brief creation + overrides

Zakres:

- `src/pages/admin/social-hub/new.astro`
- `src/pages/api/social-hub/briefs/index.ts`

Zadania:

1. Dodać pola override VIRAL ENGINE do wizarda.
2. Obsłużyć zapis override do briefu.
3. Obsłużyć default inheritance z settings.
4. Dodać walidację dla `videoFormatSlug` i `pcmProfileOverride`.

Definition of done:

- nowy brief zapisuje snapshot viralowy,
- można wyłączyć engine dla pojedynczego briefu,
- można ustawić personalizację per brief.

### Agent 5 — Core VIRAL ENGINE + prompt builder

Zakres:

- `src/lib/sh-viral-engine.ts`
- `src/lib/sh-viral-engine-prompts.ts`
- `scripts/sh-copywriter.ts`

Zadania:

1. Zaimplementować runtime builder.
2. Zaimplementować PCM 5-point mapper.
3. Zaimplementować video format instruction builder.
4. Wstrzyknąć VIRAL ENGINE do promptów copywritera.
5. Zapisać snapshot i final prompt do DB.

Definition of done:

- prompt zawsze zawiera viral block gdy engine jest on,
- prompt nie zawiera viral block gdy engine jest off,
- zapis audytowy jest kompletny.

### Agent 6 — Video pipeline

Zakres:

- `src/pages/api/social-hub/briefs/[id]/render.ts`
- `scripts/sh-video-render.ts`
- `src/lib/sh-video-gen.ts`

Zadania:

1. Dodać obsługę `videoFormatSlug`.
2. Dodać format metadata do assetu.
3. Upewnić się, że `videoScript` jest zgodny z formatem.
4. Dodać logowanie formatu w jobie renderu.

Definition of done:

- video render zna wybrany format,
- asset zapisuje format i snapshot,
- render flow nie psuje image flow.

### Agent 7 — Brief detail UI i audyt

Zakres:

- `src/pages/admin/social-hub/[briefId].astro`

Zadania:

1. Pokazać `Viral Engine On/Off`.
2. Pokazać PCM profile i 5-point snapshot.
3. Pokazać video format.
4. Dodać panel prompt/audit summary.

Definition of done:

- user widzi, jaka strategia viralowa została użyta,
- UI nie łamie obecnego flow approve/render/publish.

### Agent 8 — QA / integracja / smoke tests

Zakres:

- testy manualne i ewentualnie lekkie testy utili

Zadania:

1. Sprawdzić settings save/load.
2. Sprawdzić brief with engine on/off.
3. Sprawdzić written content z PCM.
4. Sprawdzić video z różnymi formatami.
5. Sprawdzić rollback przy disabled engine.

Definition of done:

- spisana lista testów i wyników,
- wykryte regresje mają reprodukcję i rekomendację fixu.

## 16A. Granularny backlog wykonawczy dla agentów

Poniższa sekcja jest przygotowana do realnego odhaczania podczas implementacji. Każdy task ma:

- checkbox statusu,
- krótki kontekst biznesowo-techniczny,
- konkretne pliki,
- wynik oczekiwany.

Statusy:

- `[ ]` nie ruszone
- `[~]` w toku
- `[x]` wykonane

### Agent 1 — Data model i migracje

#### A1-T01 — Rozszerzenie typu `sh_settings.config`

- [x] Status
- Kontekst: settings SocialHub są dziś trzymane w `jsonb config`, więc VIRAL ENGINE powinien wejść tam bez łamania obecnego modelu.
- Pliki:
- `src/db/schema.ts`
- Wynik:
- `shSettings.config` zawiera pełny blok `viralEngine`
- typy Drizzle są zgodne z docelowym kontraktem

#### A1-T02 — Dodanie pól viralowych do `sh_content_briefs`

- [x] Status
- Kontekst: brief musi przechowywać snapshot ustawień i override, bo generacja nie może polegać tylko na bieżących settings globalnych.
- Pliki:
- `src/db/schema.ts`
- Wynik:
- dodane pola `viral_engine_enabled`, `viral_engine_mode`, `viral_engine_profile`, `viral_engine_prompt`, `video_format_slug`, `updated_at`

#### A1-T03 — Dodanie pól viralowych do `sh_generated_copy`

- [x] Status
- Kontekst: copy ma mieć audyt tego, z jakim profilem i strategią powstało.
- Pliki:
- `src/db/schema.ts`
- Wynik:
- dodane pola `viral_engine_snapshot`, `pcm_profile`, `content_angle`, `video_format_slug`

#### A1-T04 — Dodanie pól viralowych do `sh_media_assets`

- [x] Status
- Kontekst: media asset musi wiedzieć, jaki format video i jaka strategia były użyte.
- Pliki:
- `src/db/schema.ts`
- Wynik:
- dodane pola `video_format_slug`, `viral_engine_snapshot`

#### A1-T05 — Migracja SQL

- [x] Status
- Kontekst: migracja musi być bezpieczna dla istniejących rekordów SocialHub.
- Pliki:
- `migrations/*`
- `migrations/meta/*`
- Wynik:
- migracja dodaje pola bez destrukcji danych
- stare rekordy pozostają czytelne
- Notatka wykonawcza:
- `migrations/0005_social_hub_viral_engine.sql` została wykonana przez `npm run db:push` w dniu `2026-03-18`
- Drizzle zwrócił `Changes applied`

#### A1-T06 — Sanity check kompatybilności

- [x] Status
- Kontekst: UI i API nie mogą wybuchać na starych briefach bez pól viralowych.
- Pliki:
- `src/db/schema.ts`
- Wynik:
- nullable/defaults ustawione tak, by stare rekordy działały

### Agent 2 — Settings backend i kontrakty

#### A2-T01 — Rozszerzenie `ShSettingsConfig`

- [x] Status
- Kontekst: obecny config nie zna VIRAL ENGINE, więc backend nie ma jak go zapisać/odczytać.
- Pliki:
- `src/lib/sh-settings.ts`
- Wynik:
- interfejs `ShSettingsConfig` zawiera pełny blok viralowy

#### A2-T02 — Defaults dla VIRAL ENGINE

- [x] Status
- Kontekst: system musi działać także dla fresh install i starych danych.
- Pliki:
- `src/lib/sh-settings.ts`
- Wynik:
- `SH_SETTINGS_DEFAULTS` ma sensowne defaults dla engine on/off, written i video

#### A2-T03 — Helper merge global settings -> runtime config

- [x] Status
- Kontekst: trzeba centralnie składać konfigurację, zamiast powielać merge w API i skryptach.
- Pliki:
- `src/lib/sh-settings.ts`
- `src/lib/sh-viral-engine.ts`
- Wynik:
- istnieje jeden helper budujący runtime config

#### A2-T04 — Walidacja `GET/PUT /api/social-hub/settings`

- [ ] Status
- Kontekst: settings API ma przyjmować poprawny blok viralowy i odrzucać zły payload.
- Pliki:
- `src/pages/api/social-hub/settings.ts`
- Wynik:
- endpoint zwraca i zapisuje `viralEngine`
- błędne enumy/falsy payloady są sanityzowane

#### A2-T05 — Env/runtime propagation

- [x] Status
- Kontekst: job generacji musi dostać config viralowy.
- Pliki:
- `src/lib/sh-settings.ts`
- `src/pages/api/social-hub/briefs/[id]/generate-copy.ts`
- Wynik:
- config viralowy dociera do joba przez env albo przez odczyt z DB snapshotu

### Agent 3 — Settings UI

#### A3-T01 — Master toggle i mode

- [ ] Status
- Kontekst: user musi mieć globalny przełącznik oraz wybór default/personalized.
- Pliki:
- `src/pages/admin/social-hub/settings.astro`
- Wynik:
- UI ma pola `Enable VIRAL ENGINE`, `Mode`, `Allow personalization`

#### A3-T02 — Written settings panel

- [ ] Status
- Kontekst: PCM dla written ma być konfigurowalny.
- Pliki:
- `src/pages/admin/social-hub/settings.astro`
- Wynik:
- UI ma pola dla `pcmProfileMode`, `defaultPcmProfile`, `enforceFivePoints`, `hookIntensity`, `ctaIntensity`

#### A3-T03 — Video settings panel

- [ ] Status
- Kontekst: video formats muszą być wybieralne globalnie.
- Pliki:
- `src/pages/admin/social-hub/settings.astro`
- Wynik:
- UI ma pola `formatMode`, `allowedFormats`, `preferredPrimaryFormat`, `pacing`, `visualDensity`

#### A3-T04 — Personalization inputs

- [ ] Status
- Kontekst: silnik ma wspierać markę i styl, nie tylko suche ustawienia.
- Pliki:
- `src/pages/admin/social-hub/settings.astro`
- Wynik:
- UI ma pola `personalizationLabel`, `personalizationNotes`, `additionalWrittenRules`, `additionalVideoRules`

#### A3-T05 — Load/save wiring

- [ ] Status
- Kontekst: settings UI musi czytać i zapisywać nowe pola bez ręcznego JSON hackowania.
- Pliki:
- `src/pages/admin/social-hub/settings.astro`
- Wynik:
- nowe pola ładują się z API
- zapisują się poprawnie do API

#### A3-T06 — UX disabled states

- [ ] Status
- Kontekst: wyłączenie engine musi jasno dezaktywować zależne pola.
- Pliki:
- `src/pages/admin/social-hub/settings.astro`
- Wynik:
- sekcje written/video reagują na `engine enabled`

### Agent 4 — Brief creation i override

#### A4-T01 — Dodanie sekcji VIRAL ENGINE do `new.astro`

- [ ] Status
- Kontekst: user ma móc nadpisać globalne settings dla konkretnego briefu.
- Pliki:
- `src/pages/admin/social-hub/new.astro`
- Wynik:
- wizard zawiera sekcję override engine

#### A4-T02 — Toggle per brief `enabled/disabled`

- [ ] Status
- Kontekst: potrzebny A/B test i awaryjne wyłączenie dla jednego posta.
- Pliki:
- `src/pages/admin/social-hub/new.astro`
- `src/pages/api/social-hub/briefs/index.ts`
- Wynik:
- brief może zapisać `viralEngineEnabled = false`

#### A4-T03 — Personalization per brief

- [ ] Status
- Kontekst: pojedynczy brief może potrzebować innego stylu niż globalna marka.
- Pliki:
- `src/pages/admin/social-hub/new.astro`
- `src/pages/api/social-hub/briefs/index.ts`
- Wynik:
- brief zapisuje brief-specific personalization text

#### A4-T04 — PCM override dla written

- [ ] Status
- Kontekst: user powinien móc ręcznie narzucić profil PCM dla wpisu pisanego.
- Pliki:
- `src/pages/admin/social-hub/new.astro`
- `src/pages/api/social-hub/briefs/index.ts`
- Wynik:
- brief zapisuje `pcmProfileOverride`

#### A4-T05 — Video format override dla video

- [ ] Status
- Kontekst: video musi dostać konkretny format jeszcze przed copy generation.
- Pliki:
- `src/pages/admin/social-hub/new.astro`
- `src/pages/api/social-hub/briefs/index.ts`
- Wynik:
- brief zapisuje `videoFormatSlug`

#### A4-T06 — Snapshot global+override do briefu

- [ ] Status
- Kontekst: generacja ma korzystać z zamrożonego snapshotu, a nie z aktualnego settings po czasie.
- Pliki:
- `src/pages/api/social-hub/briefs/index.ts`
- `src/lib/sh-viral-engine.ts`
- Wynik:
- brief dostaje `viral_engine_profile` ze zmergowaną konfiguracją runtime

### Agent 5 — Core VIRAL ENGINE i prompt builder

#### A5-T01 — Typy domenowe VIRAL ENGINE

- [x] Status
- Kontekst: bez wspólnych typów implementacja rozjedzie się między UI, API i skryptami.
- Pliki:
- `src/lib/sh-viral-engine-types.ts`
- Wynik:
- istnieją typy `ShViralEngineConfig`, `ShViralEngineRuntime`, `ShPcmSnapshot`, `ShVideoFormatDefinition`

#### A5-T02 — Biblioteka PCM profiles

- [x] Status
- Kontekst: written content wymaga pełnego 5-point PCM snapshotu.
- Pliki:
- `src/lib/sh-viral-engine.ts`
- Wynik:
- istnieje mapping profilu -> 5 punktów

#### A5-T03 — Biblioteka video formats

- [x] Status
- Kontekst: video prompt musi znać strukturę formatu, a nie tylko slug.
- Pliki:
- `src/lib/sh-viral-engine.ts`
- Wynik:
- istnieje katalog formatów video z opisem wykonawczym

#### A5-T04 — Runtime builder dla written

- [x] Status
- Kontekst: dla text/image engine ma wygenerować spójny blok do promptu.
- Pliki:
- `src/lib/sh-viral-engine.ts`
- Wynik:
- helper zwraca gotowy `pcmSnapshot` i `written strategy block`

#### A5-T05 — Runtime builder dla video

- [x] Status
- Kontekst: dla video engine ma dobrać lub odczytać format i zbudować instrukcję.
- Pliki:
- `src/lib/sh-viral-engine.ts`
- Wynik:
- helper zwraca `selectedVideoFormat` i `video strategy block`

#### A5-T06 — Prompt block generator

- [ ] Status
- Kontekst: prompt injection musi być spójny i testowalny.
- Pliki:
- `src/lib/sh-viral-engine-prompts.ts`
- Wynik:
- istnieją funkcje generujące sekcje promptu dla written/video/off

#### A5-T07 — Integracja z `scripts/sh-copywriter.ts`

- [ ] Status
- Kontekst: to najważniejsze miejsce faktycznego użycia engine.
- Pliki:
- `scripts/sh-copywriter.ts`
- Wynik:
- system prompt i user prompt zawierają jawny blok VIRAL ENGINE

#### A5-T08 — Audit trail promptu

- [ ] Status
- Kontekst: trzeba móc sprawdzić, czy engine był faktycznie użyty.
- Pliki:
- `scripts/sh-copywriter.ts`
- `src/db/schema.ts`
- Wynik:
- finalny prompt i snapshot są zapisane do DB

#### A5-T09 — Zachowanie przy `engine off`

- [ ] Status
- Kontekst: wyłączenie nie może łamać generacji.
- Pliki:
- `scripts/sh-copywriter.ts`
- `src/lib/sh-viral-engine-prompts.ts`
- Wynik:
- prompt działa poprawnie także bez viral block

### Agent 6 — Video pipeline

#### A6-T01 — Przekazanie `videoFormatSlug` do render endpointu

- [ ] Status
- Kontekst: render musi znać wybrany format, nie tylko `format=image|video`.
- Pliki:
- `src/pages/api/social-hub/briefs/[id]/render.ts`
- Wynik:
- endpoint czyta `videoFormatSlug` z briefu lub body

#### A6-T02 — Persist formatu do assetu

- [ ] Status
- Kontekst: asset powinien mieć zapisane źródło swojej struktury video.
- Pliki:
- `src/pages/api/social-hub/briefs/[id]/render.ts`
- `scripts/sh-video-render.ts`
- Wynik:
- `sh_media_assets` zapisuje `video_format_slug`

#### A6-T03 — Snapshot viralowy dla assetu

- [ ] Status
- Kontekst: audyt video nie może kończyć się na copy.
- Pliki:
- `src/pages/api/social-hub/briefs/[id]/render.ts`
- `scripts/sh-video-render.ts`
- Wynik:
- `sh_media_assets` zapisuje `viral_engine_snapshot`

#### A6-T04 — Format-aware `videoScript`

- [ ] Status
- Kontekst: video script ma odzwierciedlać strukturę wybranego formatu.
- Pliki:
- `scripts/sh-copywriter.ts`
- `scripts/sh-video-render.ts`
- Wynik:
- `videoScript` jest generowany zgodnie z wybranym formatem

#### A6-T05 — Logowanie formatu w jobie video

- [ ] Status
- Kontekst: debug renderu będzie trudny bez informacji o formacie.
- Pliki:
- `scripts/sh-video-render.ts`
- `src/lib/sh-video-job.ts`
- Wynik:
- logi renderu pokazują, jaki format był użyty

### Agent 7 — Brief detail UI i audyt

#### A7-T01 — Badge `Viral Engine On/Off`

- [ ] Status
- Kontekst: user musi od razu widzieć, czy brief był generowany z engine.
- Pliki:
- `src/pages/admin/social-hub/[briefId].astro`
- Wynik:
- brief detail pokazuje badge on/off

#### A7-T02 — Wyświetlenie PCM snapshotu

- [ ] Status
- Kontekst: dla written user ma widzieć 5 punktów, nie tylko nazwę profilu.
- Pliki:
- `src/pages/admin/social-hub/[briefId].astro`
- Wynik:
- UI pokazuje profil i 5-point summary

#### A7-T03 — Wyświetlenie video format

- [ ] Status
- Kontekst: dla video user ma widzieć wybrany format w detailu briefu i assetu.
- Pliki:
- `src/pages/admin/social-hub/[briefId].astro`
- Wynik:
- UI pokazuje `videoFormatSlug` i label formatu

#### A7-T04 — Panel personalization summary

- [ ] Status
- Kontekst: personalizacja jest ważna biznesowo i musi być widoczna w audycie.
- Pliki:
- `src/pages/admin/social-hub/[briefId].astro`
- Wynik:
- UI pokazuje global/brief personalization summary

#### A7-T05 — Prompt/audit panel

- [ ] Status
- Kontekst: potrzebny szybki wgląd, czy engine był naprawdę w promptach.
- Pliki:
- `src/pages/admin/social-hub/[briefId].astro`
- Wynik:
- accordion/panel pokazuje skrócony audit promptu

### Agent 8 — QA, smoke tests, kontrola wykonania

#### A8-T01 — Smoke test settings

- [ ] Status
- Kontekst: settings save/load to pierwszy punkt awarii po rozbudowie JSON config.
- Zakres:
- settings page
- settings API
- Wynik:
- zapis i odczyt nowych pól działa

#### A8-T02 — Smoke test brief with engine on

- [ ] Status
- Kontekst: trzeba sprawdzić happy path dla written.
- Zakres:
- new brief
- generate copy
- Wynik:
- prompt i copy zawierają snapshot viralowy

#### A8-T03 — Smoke test brief with engine off

- [ ] Status
- Kontekst: rollback path musi pozostać bezpieczny.
- Zakres:
- new brief
- generate copy
- Wynik:
- generacja działa bez sekcji viralowej

#### A8-T04 — Smoke test video format selection

- [ ] Status
- Kontekst: format video to nowa krytyczna gałąź logiki.
- Zakres:
- new brief
- render video
- Wynik:
- wybrany format jest zapisany i widoczny w assetach/logach

#### A8-T05 — Prompt diff audit

- [ ] Status
- Kontekst: trzeba potwierdzić rzeczywisty wpływ engine na prompt.
- Zakres:
- compare promptUsed for on/off
- Wynik:
- różnica jest jednoznaczna i zgodna ze specyfikacją

#### A8-T06 — Checklista finalna wdrożenia

- [ ] Status
- Kontekst: końcowy review powinien być prosty do odhaczenia przed merge.
- Wynik:
- wszystkie taski krytyczne A1-A7 oznaczone jako `[x]`
- znane ograniczenia spisane w osobnej notce

## 16B. Globalna checklista wdrożenia

### Krytyczne

- [x] Migracje DB gotowe
- [x] `ShSettingsConfig` rozszerzony
- [ ] Settings UI zapisuje VIRAL ENGINE
- [ ] New brief obsługuje override
- [ ] `scripts/sh-copywriter.ts` używa VIRAL ENGINE w promptach
- [x] PCM 5-point działa dla written
- [x] Video format selection działa dla video
- [ ] Brief detail pokazuje audit danych viralowych

### Ważne

- [ ] Prompt snapshot zapisuje się do DB
- [ ] Asset snapshot zapisuje się do DB
- [ ] Engine off działa bez regresji
- [ ] Legacy briefs nadal się otwierają

### QA

- [ ] Smoke test text
- [ ] Smoke test image
- [ ] Smoke test video
- [ ] Smoke test dry-run/test mode
- [ ] Manual review promptUsed on/off

## 17. Ryzyka

### Ryzyko 1

Zbyt duży prompt po dodaniu brand voice + viral block + source snapshot.

Mitigacja:

- limitować długość personalization notes,
- kompresować source snapshot,
- budować zwięzłe prompt blocks.

### Ryzyko 2

Niespójność między `outputFormat`, `videoScript` i `videoFormatSlug`.

Mitigacja:

- walidacja backendowa,
- centralny runtime builder,
- explicit fallback defaults.

### Ryzyko 3

Engine stanie się tylko dekoracją promptu bez realnego wpływu.

Mitigacja:

- wymusić jawne instrukcje wykonawcze,
- zapisywać final prompt,
- dodać smoke tests porównujące on/off.

## 18. Rekomendacja implementacyjna

Najpierw wdrożyć solidne Fazy A-E, bo tam powstaje rzeczywista wartość:

- model danych,
- settings,
- brief overrides,
- prompt injection,
- audyt.

Dopiero potem dopracować warstwę video renderu i UI audytowe.

## 19. Finalny rezultat biznesowy

Po wdrożeniu SocialHub będzie miał:

- centralnie sterowany viral layer,
- jawny mechanizm personalizacji,
- pełny PCM dla written content,
- wybór formatów video,
- możliwość A/B testów dzięki trybowi off,
- audyt tego, czy VIRAL ENGINE był faktycznie użyty w promptach AI.

## 20. Następne kroki

Najbliższe realne kroki po wykonanej migracji i wdrożeniu kontraktów backendowych:

1. Dokończyć `GET/PUT /api/social-hub/settings`, tak żeby payload `viralEngine` był w pełni czytany i zapisywany przez endpoint.
2. Rozbudować `src/pages/admin/social-hub/settings.astro`, żeby UI umiało edytować pełną konfigurację VIRAL ENGINE.
3. Dodać override VIRAL ENGINE do `src/pages/admin/social-hub/new.astro` oraz zapisać snapshot do briefu w `src/pages/api/social-hub/briefs/index.ts`.
4. Wstrzyknąć VIRAL ENGINE do promptów w `scripts/sh-copywriter.ts` i zapisywać audit trail do `sh_generated_copy`.
5. Spiąć `videoFormatSlug` z render pipeline w `src/pages/api/social-hub/briefs/[id]/render.ts` oraz `scripts/sh-video-render.ts`.
6. Uzupełnić `src/pages/admin/social-hub/[briefId].astro` o widok audytu: engine on/off, PCM snapshot, video format i personalization summary.
7. Wykonać smoke testy dla trzech ścieżek: engine on, engine off, video format override.
