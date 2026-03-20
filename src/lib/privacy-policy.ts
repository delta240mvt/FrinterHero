export type PrivacyPolicyLocale = 'pl' | 'en';

export interface PrivacyPolicySection {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface PrivacyPolicyDocument {
  title: string;
  lead: string;
  lastUpdatedLabel: string;
  languageSwitchLabel: string;
  languageSwitchHref: string;
  sections: PrivacyPolicySection[];
}

const LAST_UPDATED = '2026-03-20';

const controllerLinePl = 'Administratorem danych osobowych jest Przemysław Filipiak, kontakt: hello@frinter.app.';
const controllerLineEn = 'The controller of personal data is Przemysław Filipiak, contact: hello@frinter.app.';

export function getPrivacyPolicyDocument(locale: PrivacyPolicyLocale): PrivacyPolicyDocument {
  if (locale === 'en') {
    return {
      title: 'Privacy Policy',
      lead: 'This Privacy Policy describes how personal data is processed in connection with this website and its public blog.',
      lastUpdatedLabel: `Last updated: ${LAST_UPDATED}`,
      languageSwitchLabel: 'Read the Polish version',
      languageSwitchHref: '/polityka-prywatnosci',
      sections: [
        {
          title: '1. Controller',
          paragraphs: [
            controllerLineEn,
            'If you have any questions about privacy or want to exercise your GDPR rights, please contact hello@frinter.app.',
          ],
        },
        {
          title: '2. Scope of this policy',
          paragraphs: [
            'This policy applies to visitors of the public website, blog readers, and people contacting the controller by email.',
            'Based on the current codebase review, the public-facing pages do not use optional analytics or marketing cookies. The service does, however, use a strictly necessary session cookie for authenticated admin access.',
          ],
        },
        {
          title: '3. Categories of personal data',
          bullets: [
            'technical data such as IP address, browser data, device data, request metadata, and security logs;',
            'email address and message content if you contact the controller directly by email;',
            'other data voluntarily provided by the user in correspondence.',
          ],
        },
        {
          title: '4. Purposes and legal bases',
          bullets: [
            'operating and securing the website: Article 6(1)(f) GDPR;',
            'responding to enquiries and business communication: Article 6(1)(f) GDPR or Article 6(1)(b) GDPR;',
            'maintaining records, preventing abuse, and defending legal claims: Article 6(1)(f) GDPR;',
            'complying with legal obligations: Article 6(1)(c) GDPR;',
            'processing based on consent, where consent is specifically requested: Article 6(1)(a) GDPR.',
          ],
        },
        {
          title: '5. Cookies',
          paragraphs: [
            'The public-facing website does not currently use optional analytics or advertising cookies based on the reviewed implementation.',
            'A strictly necessary session cookie named `session` may be used only where access to protected administrative functionality is involved. This cookie is used for authentication and security and does not require consent when used strictly for those purposes.',
          ],
        },
        {
          title: '6. Recipients and processors',
          paragraphs: [
            'Personal data may be processed by providers used to host, secure, and technically operate the website, such as hosting, infrastructure, and email service providers, but only to the extent necessary for the website to function and for correspondence to be handled.',
          ],
          bullets: [
            'hosting and infrastructure providers;',
            'email and communication providers, where correspondence is handled by email;',
            'technical security providers, where needed to keep the website available and secure.',
          ],
        },
        {
          title: '7. International transfers',
          paragraphs: [
            'Some service providers may process data outside the European Economic Area. Where this happens, data transfers should rely on a valid GDPR transfer mechanism, such as an adequacy decision or appropriate safeguards.',
          ],
        },
        {
          title: '8. Retention',
          bullets: [
            'server and security logs are retained only for as long as needed for security, diagnostics, and operational purposes;',
            'email correspondence is retained for as long as reasonably necessary to handle the request and any follow-up;',
            'data may be retained longer where required by law or needed to establish, exercise, or defend legal claims.',
          ],
        },
        {
          title: '9. Your rights under the GDPR',
          paragraphs: [
            'Subject to the conditions set out in the GDPR, you have the right to access your data, rectify it, erase it, restrict processing, object to processing, request data portability, withdraw consent at any time where processing is based on consent, and lodge a complaint with the President of the Personal Data Protection Office (UODO) in Poland.',
            'The service is not intended to make decisions based solely on automated processing that produce legal or similarly significant effects on individuals.',
          ],
        },
        {
          title: '10. Data security',
          paragraphs: [
            'Appropriate technical and organisational measures are used to protect personal data against unauthorised access, disclosure, alteration, and destruction. However, no internet-based system can be guaranteed to be completely secure.',
          ],
        },
        {
          title: '11. Contact and updates',
          paragraphs: [
            'Questions, requests, and privacy-related notices should be sent to hello@frinter.app.',
            'This Privacy Policy may be updated from time to time. The latest version will be published on this page.',
          ],
        },
      ],
    };
  }

  return {
    title: 'Polityka prywatności',
    lead: 'Niniejsza Polityka prywatności opisuje zasady przetwarzania danych osobowych w związku z tą stroną internetową i publicznym blogiem.',
    lastUpdatedLabel: `Ostatnia aktualizacja: ${LAST_UPDATED}`,
    languageSwitchLabel: 'Read the English version',
    languageSwitchHref: '/privacy-policy',
    sections: [
      {
        title: '1. Administrator danych',
        paragraphs: [
          controllerLinePl,
          'W sprawach dotyczących prywatności oraz w celu wykonania praw wynikających z RODO można skontaktować się pod adresem hello@frinter.app.',
        ],
      },
      {
        title: '2. Zakres polityki',
        paragraphs: [
          'Polityka dotyczy osób odwiedzających publiczną stronę, czytelników bloga oraz osób kontaktujących się z administratorem mailowo.',
          'Na podstawie przeglądu aktualnego kodu publiczna część strony nie używa opcjonalnych cookies analitycznych ani marketingowych. Serwis używa natomiast niezbędnego cookies sesyjnego do logowania do panelu administracyjnego.',
        ],
      },
      {
        title: '3. Kategorie przetwarzanych danych',
        bullets: [
          'dane techniczne, takie jak adres IP, dane przeglądarki, dane urządzenia, metadane żądań i logi bezpieczeństwa;',
          'adres e-mail i treść wiadomości, jeżeli użytkownik kontaktuje się bezpośrednio mailowo;',
          'inne dane dobrowolnie przekazane przez użytkownika w korespondencji.',
        ],
      },
      {
        title: '4. Cele i podstawy prawne przetwarzania',
        bullets: [
          'prowadzenie i zabezpieczenie strony: art. 6 ust. 1 lit. f RODO;',
          'odpowiadanie na wiadomości i prowadzenie komunikacji: art. 6 ust. 1 lit. f RODO lub art. 6 ust. 1 lit. b RODO;',
          'prowadzenie logów, przeciwdziałanie nadużyciom oraz dochodzenie lub obrona roszczeń: art. 6 ust. 1 lit. f RODO;',
          'wypełnianie obowiązków prawnych: art. 6 ust. 1 lit. c RODO;',
          'przetwarzanie na podstawie zgody, gdy zgoda jest wyraźnie wymagana: art. 6 ust. 1 lit. a RODO.',
        ],
      },
      {
        title: '5. Cookies',
        paragraphs: [
          'Publiczna część strony, według aktualnie przeanalizowanej implementacji, nie korzysta z opcjonalnych cookies analitycznych ani reklamowych.',
          'Niezbędne cookie sesyjne `session` może być używane wyłącznie wtedy, gdy w grę wchodzi dostęp do chronionej funkcji administracyjnej. Cookie to służy do uwierzytelniania i bezpieczeństwa i przy użyciu wyłącznie do tych celów nie wymaga zgody.',
        ],
      },
      {
        title: '6. Odbiorcy danych i podmioty przetwarzające',
        paragraphs: [
          'Dane osobowe mogą być przetwarzane przez dostawców wykorzystywanych do hostowania, zabezpieczenia i technicznego utrzymania strony internetowej, a także przez dostawców poczty elektronicznej, ale wyłącznie w zakresie niezbędnym do działania strony i obsługi korespondencji.',
        ],
        bullets: [
          'dostawcy hostingu i infrastruktury;',
          'dostawcy poczty i komunikacji, jeżeli korespondencja jest obsługiwana mailowo;',
          'dostawcy technicznych zabezpieczeń, jeżeli są potrzebni do utrzymania dostępności i bezpieczeństwa strony.',
        ],
      },
      {
        title: '7. Transfery poza EOG',
        paragraphs: [
          'Część dostawców usług może przetwarzać dane poza Europejskim Obszarem Gospodarczym. W takim przypadku transfer powinien odbywać się z wykorzystaniem właściwego mechanizmu zgodnego z RODO, np. decyzji stwierdzającej odpowiedni stopień ochrony albo odpowiednich zabezpieczeń.',
        ],
      },
      {
        title: '8. Okres przechowywania danych',
        bullets: [
          'logi serwerowe i bezpieczeństwa są przechowywane tak długo, jak jest to potrzebne do celów bezpieczeństwa, diagnostyki i działania systemu;',
          'korespondencja mailowa jest przechowywana przez okres niezbędny do obsługi sprawy i dalszej komunikacji;',
          'dane mogą być przechowywane dłużej, jeśli wymaga tego prawo albo jest to konieczne do ustalenia, dochodzenia lub obrony roszczeń.',
        ],
      },
      {
        title: '9. Prawa osoby, której dane dotyczą',
        paragraphs: [
          'Z zastrzeżeniem warunków wynikających z RODO, przysługuje Ci prawo dostępu do danych, ich sprostowania, usunięcia, ograniczenia przetwarzania, sprzeciwu wobec przetwarzania, przenoszenia danych, cofnięcia zgody w dowolnym momencie, jeżeli przetwarzanie odbywa się na podstawie zgody, oraz wniesienia skargi do Prezesa Urzędu Ochrony Danych Osobowych.',
          'Serwis nie jest przeznaczony do podejmowania wobec osób decyzji opartych wyłącznie na zautomatyzowanym przetwarzaniu, które wywołują skutki prawne lub w podobny sposób istotnie wpływają na osobę.',
        ],
      },
      {
        title: '10. Bezpieczeństwo danych',
        paragraphs: [
          'Stosowane są odpowiednie środki techniczne i organizacyjne służące ochronie danych osobowych przed nieuprawnionym dostępem, ujawnieniem, zmianą i zniszczeniem. Żaden system internetowy nie gwarantuje jednak pełnego bezpieczeństwa.',
        ],
      },
      {
        title: '11. Kontakt i zmiany polityki',
        paragraphs: [
          'Pytania, żądania i zgłoszenia dotyczące prywatności należy kierować na adres hello@frinter.app.',
          'Polityka prywatności może być okresowo aktualizowana. Aktualna wersja będzie publikowana na tej stronie.',
        ],
      },
    ],
  };
}
