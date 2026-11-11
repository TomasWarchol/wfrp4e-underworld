# Nowy interfejs: „Księga Kompanii”

Dokument projektowy przebudowy interfejsu modułu. Assety powstają według `ART-BIBLE.md`.

## Diagnoza obecnego interfejsu

- **Styl:** nowoczesny panel webowy (kolorowe kapsułki, zielone i czerwone plakietki, czcionka Segoe UI, zaokrąglone przyciski) na pergaminie. Nie wygląda jak Stary Świat.
- **Brak tożsamości:** pięć typów kompanii wygląda tak samo. Herb, barwy i miernik presji nie mają formy graficznej.
- **Długie listy:** zlecenia (do 18 w mieście), rozkazy (39 kart) i członkowie to przewijane listy. Najważniejsze decyzje („kto dziś idzie gdzie”) wymagają wielu kliknięć i okien.
- **Ikony:** wyłącznie Font Awesome, nowoczesne i nie w klimacie.
- **Zasoby:** morale, zapasy, skarbiec i presja to małe liczby w nagłówku, a nie wskaźniki, które da się odczytać jednym spojrzeniem.

## Kierunek artystyczny

**Księga wojenna ze Starego Świata:** oprawa z ciemnej skóry i żelaza, karty z pergaminu, nagłówki gotyckie, ilustracje w stylu drzeworytu (jak niemieckie druki z XVI wieku: Landsknechci, kroniki, ulotki). Ponuro, ale czytelnie.

- **Czcionki z systemu WFRP4e (niczego nie pobieramy):** Nodesto Caps Condensed na nagłówki, Caslon Antique na nazwy i akcenty, Adobe Caslon Pro na tekst, only-skulls jako ozdobnik.
- **Tła i ramki:** pergamin, ramki i pieczęcie z systemu WFRP4e, a własne ornamenty jako SVG.
- **Kolor:** atrament, umbra i żelazo jako baza; pergamin jako tło kart; jeden kolor akcentu na typ kompanii.
- **Ikony:** własny zestaw w stylu drzeworytu, jednokolorowy (`currentColor`), więc kolorujemy je w CSS według typu i stanu.
- **Bez własności Games Workshop:** żadnych logo, komety, gwiazdy Chaosu ani herbów z podręczników. Motywy ogólne dla wczesnonowożytnych Niemiec.

### Tożsamość typów

| Typ | Akcent | Herb | Miernik presji |
|---|---|---|---|
| Szajka | czerwień sadzy | sztylet i klucz na krzyż | list gończy |
| Banda Banitów | zieleń leśna | łuk i liść dębu | róg myśliwski łowców |
| Zbrojna Kompania | karmazyn i stal | halabardy na krzyż pod chorągwią | pęknięta tarcza |
| Flotylla Przemytników | zieleń rzeczna | kotwica z liną | pieczęć celna |
| Siatka Informatorów | indygo atramentu | oko nad piórem | otwarte oko |
| Sekretne Bractwo | fiolet i czerń | zakapturzona świeca | stos |

## Układ okna

```
┌───────────────────────────────────────────────────────────────┐
│ [herb]  NAZWA KOMPANII (gotyk)         ╔ Morale: chorągiewka ╗ │
│         ~ motto na wstędze ~           ║ Zapasy: worki       ║ │
│  Dowódca • teren (sylwetka w tle)      ║ Skarbiec: monety    ║ │
│                                        ╚ Presja: 5 pieczęci  ╝ │
├──┬────────────────────────────────────────────────────────────┤
│▌ │                                                            │
│▌ │   KARTA ZAKŁADKI (pergamin z ornamentem w narożnikach)     │
│▌ │                                                            │
│▌ │                                                            │
│▌ │                                                            │
└──┴────────────────────────────────────────────────────────────┘
  zakładki-wstążki z ikonami po lewej (jak w księdze)
```

- **Nagłówek-chorągiew:** herb typu na tarczy, nazwa gotykiem, motto na wstędze. Za nagłówkiem sylwetka terenu (miasto, wieś, las, góry) jak w drzeworycie.
- **Wskaźniki zasobów:** morale jako 10 proporczyków, zapasy jako worki, skarbiec jako stosy monet (ZK, s, p), presja jako 5 pieczęci z ikoną typu. Każdy zmienia się widocznie, a nie tylko cyfrą.
- **Nawigacja z boku:** pionowe wstążki-zakładki z ikonami i licznikami. Zwalniają wysokość i wyglądają jak zakładki w księdze.

## Zakładki

1. **Kronika (Informacje):** karta tożsamości. Herb do wyboru (godło i barwy tarczy), patron jako karta postaci z pieczęcią relacji, kodeks na zwoju i kronika jako oś czasu wpisów.
2. **Obóz:** scena nocy. Trzy ilustrowane kafle schronienia, sloty na wartowników (przeciągnij portret), zapasy na sakwach, wielki przycisk „Rozbij obóz” z pieczęcią.
3. **Rejestr (Świta):** rejestr zaciężnych jako siatka kart. Portret w drzeworytowej ramce, herb roli, pagony rangi, pasek DO, cechy jako małe symbole z podpowiedzią, a stan jako pieczęć woskowa (Gotowy, Zajęty, Ranny, Areszt, Poległy).
4. **Plan dnia (Przydziały):** tablica zleceń jak przypięte kartki, pogrupowana według kategorii. Każda karta ma ikonę, próg, ryzyko (czaszki), nagrodę jako ikony i miejsce na członka. Portret przeciąga się na kartę, a dotychczasowe okno zostaje jako zapas. Na górze trzy sloty Świty.
5. **Skrzynia (Łupy):** siatka przedmiotów z ikoną kategorii, wartością i płomieniem „gorący”. Kupiec jako karta z aktualną stawką.
6. **Rozkazy (Taktyka):** talia kart rozkazów. Odblokowane są na wierzchu jako karty z ikoną i kosztem w żetonach Przewagi, a zablokowane zwinięte w jedną listę.

## Czat

- **Karta zlecenia:** pasek pergaminu z herbem typu, ikoną zlecenia, wynikiem jako pieczęcią (zielony wosk: sukces, czerwony: porażka, złoty: SL 3+), nagrodą jako ikonami i notatką drzeworytową czcionką.
- **Karta postoju:** nocny pejzaż terenu w nagłówku, wydarzenie jako cytat na zwoju.
- **Karta rozkazu:** karta rozkazu z ikoną i stemplem „wydany”.

## Zasady UX

- Najważniejsza decyzja (kto idzie gdzie) dostępna jednym przeciągnięciem; okna dialogowe zostają jako zapas i dla klawiatury.
- Każda liczba ma ikonę i podpowiedź z regułą.
- Kolor nigdy nie jest jedynym nośnikiem stanu: pieczęć ma też ikonę i podpis.
- Ciemny i jasny wariant motywu Foundry; kontrast tekstu co najmniej 4.5:1.
- Gracz bez uprawnień MG widzi to samo, ale bez przycisków MG.
- Animacje krótkie (do 200 ms) i wyłączane przy `prefers-reduced-motion`.

## Technika

- **Ikony jako sprite:** wszystkie ikony trafiają do jednego pliku `assets/ui/sprite.svg` z symbolami `role-*`, `job-*`, `order-*`, `ui-*`, `crest-*`. Szablony wstawiają je pomocnikiem Handlebars `{{uwIcon "job-scout"}}`, który zwraca `<svg><use href="…#job-scout"/></svg>`. Jedno pobranie pliku, kolor z CSS (`currentColor`).
- **Mapy ikon w danych:** zlecenia, role i rozkazy dostają pole `glyph` obok dotychczasowej ikony Font Awesome. Brak glifu oznacza zapas na Font Awesome, więc nowe zlecenia nie psują widoku.
- **Motywy typów:** okno dostaje atrybut `data-company-type`, a zmienne CSS (`--uw-accent`, `--uw-accent-ink`, herb, ikona presji) zmieniają się według typu. Jeden arkusz stylów, bez kopii.
- **Czcionki z systemu:** `@font-face` wskazuje pliki w `systems/wfrp4e/fonts/`. Moduł i tak wymaga systemu WFRP4e.
- **Przełącznik:** ustawienie świata „Wygląd: Księga Kompanii / klasyczny”. Na czas przebudowy oba wyglądy działają obok siebie; klasyczny znika, gdy nowy pokryje wszystkie zakładki.
- **Logika bez zmian:** przebudowa dotyczy szablonów, CSS i pomocników widoku. Akcje (`data-action`) i nazwy pól formularza zostają, więc testy logiki dalej obowiązują.
- **Przeciąganie:** natywne HTML5 drag and drop (portret członka na kartę zlecenia albo slot warty); upuszczenie wywołuje te same metody co dzisiejsze okna.

## Stan assetów (etap 1)

- **Gotowe:** 196 plików SVG w `assets/ui/` (31 ról, 42 zlecenia, 39 rozkazów, 60 ikon interfejsu, 13 ornamentów, 6 herbów, 4 sylwetki terenów), sprite `assets/ui/sprite.svg` (195 symboli) i galeria `assets/ui/preview.html`. Podgląd w `docs/ui/podglad/`.
- **Kontrola:** `node tools/build-ui-assets.mjs` sprawdza reguły biblii stylu i buduje sprite oraz galerię; obecnie 0 błędów.
- **Kto co robił:** ikony rysował Sonnet w siedmiu paczkach plus dwie rundy poprawek, ornamenty, herby i sylwetki Opus, a narzędzie kontroli, sprite i galerię Haiku.
- **Poprawione w etapie 6** (przerysowane ręcznie, nowe motywy tam, gdzie dłonie były nieczytelne): getaway, trip, payoff, resupply, snare, wagonwall (rozkazy); category_influence, loot_documents, token_lead (interfejs); pickpocket, cache, contract, requisition, buy_secret (zlecenia); helmsman, boatman (role). Herb w tarczy powiększony w CSS do 78% szerokości.
- **Charakter drzeworytu:** ikony są płaskie; chropowatą, ręcznie ciętą krawędź doda wspólny filtr SVG (`feTurbulence` + `feDisplacementMap`) w etapie 2, jednakowo dla całego zestawu.

## Etapy wdrożenia

1. **Assety** (ten etap): ikony, ornamenty, herby, sylwetki terenów, podgląd.
2. **Fundament stylu** (zrobiony 2026-11-11, sprawdzony w DEV-test): zmienne CSS, czcionki z systemu, motywy typów, okno, nagłówek, nawigacja z boku. Bez zmian w logice.
3. **Rejestr i Plan dnia** (zrobiony 2026-11-11, sprawdzony w DEV-test): karty członków, tablica zleceń z przeciąganiem.
4. **Obóz, Skrzynia, Kronika** (zrobiony 2026-11-11, sprawdzony w DEV-test): nowe układy zakładek.
5. **Rozkazy i czat** (zrobiony 2026-11-11, sprawdzony w DEV-test): talia rozkazów, nowe karty czatu. Sanitizer Foundry wycina `<svg>` z treści wiadomości, więc karty czatu niosą tylko `data-uw-glyph="…"`, a ikonę dokłada hook `renderChatMessageHTML`. Reguły czatu w `ledger.css` mają prefiks `:is(html, #uw)`, żeby wygrać ze specyficznością `underworld.css`.
6. **Szlif** (zrobiony 2026-11-11, sprawdzony w DEV-test): dostępność (role tablist/tab, strzałki między zakładkami, Enter i Spacja na klikalnych elementach `[data-action]`, etykiety ARIA dla przycisków z samą ikoną, złota obwódka `:focus-visible`), kontrast chipów do 4.5:1 (audyt skryptem w przeglądarce), poświata zmierzchu za sylwetką terenu, większy herb w tarczy, szersza kolumna zakładek, 16 przerysowanych ikon, zrzuty w `docs/screenshots/` i w README. Księga ma własną paletę, więc wygląda tak samo w jasnym i ciemnym motywie Foundry.
