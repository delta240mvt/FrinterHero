import { ApifyClient } from 'apify-client';
import OpenAI from 'openai';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Ładujemy zmienne środowiskowe z .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const apifyToken = process.env.APIFY_API_TOKEN;
const openRouterApiKey = process.env.OPENROUTER_API_KEY;

if (!apifyToken) {
    console.error("❌ Brak APIFY_API_TOKEN w .env.local!");
    process.exit(1);
}

if (!openRouterApiKey || openRouterApiKey.includes('placeholder')) {
    console.error("❌ Brak poprawnego OPENROUTER_API_KEY w .env.local! Upewnij się, że masz klucz od OpenRouter.");
    process.exit(1);
}

const client = new ApifyClient({
    token: apifyToken,
});

// Używamy biblioteki OpenAI, ale podpinamy ją pod OpenRouter
const openai = new OpenAI({
    baseURL: "https://openrouter.ai/api/v1",
    apiKey: openRouterApiKey,
});

// Pobieranie niszy (np. subreddita) od użytkownika w terminalu
const args = process.argv.slice(2);
const searchTopic = args[0];

if (!searchTopic) {
    console.log(`
🚀 Sposób użycia:
npm run scrape:reddit "nazwa niszy lub subreddita"

Przykłady:
npm run scrape:reddit "seo"
npm run scrape:reddit "digitalmarketing"
    `);
    process.exit(1);
}

async function start() {
    console.log(`\n🔍 Rozpoczynam radar na Reddicie dla niszy: "${searchTopic}"...\n`);

    try {
        // 1. Zlecamy zadanie do Apify (Aktor: trudax/reddit-scraper)
        console.log("⏳ Zlecam pobieranie danych do Apify (to może potrwać od kilku do kilkudziesięciu sekund)...");
        
        // Zależnie od struktury Aktora (używamy standardowego)
        const input = {
            searches: [searchTopic], // Możemy podać po prostu słowa do wyszukiwarki reddit
            type: "post",
            sort: "new",          // Szukamy najświeższych problemów
            time: "month",        // Z ostatniego miesiąca
            maxItems: 30,         // 30 najnowszych postów wystarczy do zbadania trendu
        };

        // Odpalamy scraper (używamy wersji lite, która nie wymaga miesięcznego wynajmu, darmowe kredyty działają)
        const run = await client.actor("trudax/reddit-scraper-lite").call(input);
        
        console.log(`✅ Pobieranie z Reddita zakończone (Run ID: ${run.id}). Pobieranie wyników...`);

        // 2. Pobieramy JSON z wynikami
        const { items } = await client.dataset(run.defaultDatasetId).listItems();
        
        if (!items || items.length === 0) {
            console.log("😕 Nie znaleziono żadnych postów dla tego zapytania.");
            // Spróbujmy innej metody - wyszukiwania bezpośrednio w subreddicie, jeśli "searches" nie zadziałało:
            console.log("Spróbuj podać pełny url jako argument, np. https://www.reddit.com/r/seo/");
            return;
        }

        console.log(`📥 Zebrano ${items.length} potężnych postów. Przekazuję do AI do analizy...`);

        // 3. Sklejamy treść do analizy dla AI, wyciągając tylko Tytuł i Zawartość posta
        let textToAnalyze = items.map((item: any, index: number) => {
            return `POST ${index + 1}:\nTytuł: ${item.title || item.parsedTitle || 'Brak tytułu'}\nTreść: ${item.text || item.body || item.content || 'Brak treści'}\nUpvotes: ${item.upvotes || 0}\n---\n`;
        }).join('\n');

        // OpenAI ma limit tokenów, upewnijmy się, że nie przekażemy mu nieskończonej ściany tekstu
        // (ok 30 postów powinno wejść spokojnie, ale ucinamy na wszelki wypadek)
        textToAnalyze = textToAnalyze.substring(0, 30000); 

        // 4. Analiza przez OpenRouter - Prompt do wyciagania bóli i problemów
        const aiResponse = await openai.chat.completions.create({
            model: "anthropic/claude-sonnet-4-6", // Model Claude (Sonnet 4.6) przez OpenRouter
            temperature: 0.7,
            messages: [
                { 
                    role: "system", 
                    content: `Jesteś ekspertem ds. badań rynkowych i analitykiem zachowań konsumentów. 
Twoim zadaniem jest czytanie surowych narzekań i postów ludzi z internetu (konkretnie z Reddita) na dany temat.
Następnie musisz zsyntetyzować te dane i przygotować strategiczny raport.

Oczekiwany format:
1. 🔴 GŁÓWNE BÓLE I PROBLEMY: Znajdź 3 najczęstsze frustracje/problemy/narzekania. 
2. 💡 POMYSŁY NA ARTYKUŁY: Zaproponuj 3 chwytliwe (w stylu "clickbaitowym, ale wartościowym") nagłówki artykułów blogowych, które rozwiązują znalezione problemy, idealnych do FrinterHero.
3. 🎯 SŁOWNICTWO: Jakich konkretnych "żywych" słów lub fraz używają ci ludzie do opisywania swojego problemu? Wyciągnij kilka powtarzających się sformułowań.`
                },
                { 
                    role: "user", 
                    content: `Zbadaj te świeże posty z Reddita na temat: "${searchTopic}":\n\n${textToAnalyze}` 
                }
            ],
            max_tokens: 1500,
        });

        const insights = aiResponse.choices[0].message.content;

        // 5. Zwracamy piękny wynik w konsoli
        console.log("\n===============================================");
        console.log("       🧠 WYNIKI ANALIZY PRZEZ AI (GEMINI/LLM)  ");
        console.log("===============================================\n");
        console.log(insights);
        console.log("\n===============================================\n");
        console.log("✨ Scrape'owanie i analiza we FrinterHero zakończone!");

    } catch (err: any) {
        console.error("❌ Wystąpił błąd podczas scrappowania lub łączenia z AI!");
        console.error(err.message || err);
        if(err.message?.includes('does not exist')) {
            console.log("\n💡 Wskazówka: Wygląda na to, że użyto niepoprawnego Id Aktora. Upewnij się, że używasz `trudax/reddit-scraper`.");
        }
    }
}

start();
