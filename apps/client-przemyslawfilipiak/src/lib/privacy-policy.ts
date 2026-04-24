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

const controllerLinePl = 'Administratorem danych osobowych jest Przemyslaw Filipiak, kontakt: hello@frinter.app.';
const controllerLineEn = 'The controller of personal data is Przemyslaw Filipiak, contact: hello@frinter.app.';

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
    title: 'Polityka prywatnosci',
    lead: 'Niniejsza Polityka prywatnosci opisuje zasady przetwarzania danych osobowych w zwiazku z ta strona internetowa i publicznym blogiem.',
    lastUpdatedLabel: `Ostatnia aktualizacja: ${LAST_UPDATED}`,
    languageSwitchLabel: 'Read the English version',
    languageSwitchHref: '/privacy-policy',
    sections: [
      {
        title: '1. Administrator danych',
        paragraphs: [
          controllerLinePl,
          'W sprawach dotyczacych prywatnosci oraz w celu wykonania praw wynikajacych z RODO mozna skontaktowac sie pod adresem hello@frinter.app.',
        ],
      },
      {
        title: '2. Zakres polityki',
        paragraphs: [
          'Polityka dotyczy osob odwiedzajacych publiczna strone, czytelnikow bloga oraz osob kontaktujacych sie z administratorem mailowo.',
          'Na podstawie przegladu aktualnego kodu publiczna czesc strony nie uzywa opcjonalnych cookies analitycznych ani marketingowych. Serwis uzywa natomiast niezbednego cookies sesyjnego do logowania do panelu administracyjnego.',
        ],
      },
      {
        title: '3. Kategorie przetwarzanych danych',
        bullets: [
          'dane techniczne, takie jak adres IP, dane przegladarki, dane urzadzenia, metadane zadan i logi bezpieczenstwa;',
          'adres e-mail i tresc wiadomosci, jezeli uzytkownik kontaktuje sie bezposrednio mailowo;',
          'inne dane dobrowolnie przekazane przez uzytkownika w korespondencji.',
        ],
      },
      {
        title: '4. Cele i podstawy prawne przetwarzania',
        bullets: [
          'prowadzenie i zabezpieczenie strony: art. 6 ust. 1 lit. f RODO;',
          'odpowiadanie na wiadomosci i prowadzenie komunikacji: art. 6 ust. 1 lit. f RODO lub art. 6 ust. 1 lit. b RODO;',
          'prowadzenie logow, przeciwdzialanie naduzyciom oraz dochodzenie lub obrona roszczen: art. 6 ust. 1 lit. f RODO;',
          'wypelnianie obowiazkow prawnych: art. 6 ust. 1 lit. c RODO;',
          'przetwarzanie na podstawie zgody, gdy zgoda jest wyraznie wymagana: art. 6 ust. 1 lit. a RODO.',
        ],
      },
      {
        title: '5. Cookies',
        paragraphs: [
          'Publiczna czesc strony, wedlug aktualnie przeanalizowanej implementacji, nie korzysta z opcjonalnych cookies analitycznych ani reklamowych.',
          'Niezbedne cookie sesyjne `session` moze byc uzywane wylacznie wtedy, gdy w gre wchodzi dostep do chronionej funkcji administracyjnej. Cookie to sluzy do uwierzytelniania i bezpieczenstwa i przy uzyciu wylacznie do tych celow nie wymaga zgody.',
        ],
      },
      {
        title: '6. Odbiorcy danych i podmioty przetwarzajace',
        paragraphs: [
          'Dane osobowe moga byc przetwarzane przez dostawcow wykorzystywanych do hostowania, zabezpieczenia i technicznego utrzymania strony internetowej, a takze przez dostawcow poczty elektronicznej, ale wylacznie w zakresie niezbednym do dzialania strony i obslugi korespondencji.',
        ],
        bullets: [
          'dostawcy hostingu i infrastruktury;',
          'dostawcy poczty i komunikacji, jezeli korespondencja jest obslugiwana mailowo;',
          'dostawcy technicznych zabezpieczen, jezeli sa potrzebni do utrzymania dostepnosci i bezpieczenstwa strony.',
        ],
      },
      {
        title: '7. Transfery poza EOG',
        paragraphs: [
          'Czesc dostawcow uslug moze przetwarzac dane poza Europejskim Obszarem Gospodarczym. W takim przypadku transfer powinien odbywac sie z wykorzystaniem wlasciwego mechanizmu zgodnego z RODO, np. decyzji stwierdzajacej odpowiedni stopien ochrony albo odpowiednich zabezpieczen.',
        ],
      },
      {
        title: '8. Okres przechowywania danych',
        bullets: [
          'logi serwerowe i bezpieczenstwa sa przechowywane tak dlugo, jak jest to potrzebne do celow bezpieczenstwa, diagnostyki i dzialania systemu;',
          'korespondencja mailowa jest przechowywana przez okres niezbedny do obslugi sprawy i dalszej komunikacji;',
          'dane moga byc przechowywane dluzej, jesli wymaga tego prawo albo jest to konieczne do ustalenia, dochodzenia lub obrony roszczen.',
        ],
      },
      {
        title: '9. Prawa osoby, ktorej dane dotycza',
        paragraphs: [
          'Z zastrzezeniem warunkow wynikajacych z RODO, przysluguje Ci prawo dostepu do danych, ich sprostowania, usuniecia, ograniczenia przetwarzania, sprzeciwu wobec przetwarzania, przenoszenia danych, cofniecia zgody w dowolnym momencie, jezeli przetwarzanie odbywa sie na podstawie zgody, oraz wniesienia skargi do Prezesa Urzedu Ochrony Danych Osobowych.',
          'Serwis nie jest przeznaczony do podejmowania wobec osob decyzji opartych wylacznie na zautomatyzowanym przetwarzaniu, ktore wywoluja skutki prawne lub w podobny sposob istotnie wplywaja na osobe.',
        ],
      },
      {
        title: '10. Bezpieczenstwo danych',
        paragraphs: [
          'Stosowane sa odpowiednie srodki techniczne i organizacyjne sluzace ochronie danych osobowych przed nieuprawnionym dostepem, ujawnieniem, zmiana i zniszczeniem. Zaden system internetowy nie gwarantuje jednak pelnego bezpieczenstwa.',
        ],
      },
      {
        title: '11. Kontakt i zmiany polityki',
        paragraphs: [
          'Pytania, zadania i zgloszenia dotyczace prywatnosci nalezy kierowac na adres hello@frinter.app.',
          'Polityka prywatnosci moze byc okresowo aktualizowana. Aktualna wersja bedzie publikowana na tej stronie.',
        ],
      },
    ],
  };
}
