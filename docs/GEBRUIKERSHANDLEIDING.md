# Puppy Tracker: eenvoudig aan de slag

[Nederlands](GEBRUIKERSHANDLEIDING.md) · [English](USER_MANUAL.md)

Deze handleiding is voor dagelijks gebruik. Je hoeft niet te programmeren of
YAML te schrijven. De namen hieronder horen bij een Nederlandstalige Home
Assistant. In een instellingenformulier heet de bevestigingsknop soms
**Verzenden**; op de kaarten meestal **Opslaan**.

Gebruik een Home Assistant-account met beheerdersrechten om gegevens toe te
voegen of te wijzigen. Gewone gebruikers kunnen de meeste overzichten bekijken,
maar krijgen niet alle knoppen en geen toegang tot baasjesgegevens of exports.

## Waar vind ik wat?

| Ik wil… | Waar moet ik zijn? |
| --- | --- |
| Een nest aanmaken of nestgegevens wijzigen | Instellingen → Apparaten & diensten → Puppy Tracker → Configureren → Nesten en pups |
| Een pup toevoegen of aanpassen | Home → Pups, of Nesten en pups bij de instellingen |
| Wegen of groei bekijken | Groei → Wegen / Analyse; wegen kan ook bij Mobiel |
| Een nieuwe notitie, voeding of temperatuur opslaan | Logboek → Snel loggen; ook beschikbaar bij Mobiel |
| Een opgeslagen item zoeken of wijzigen | Logboek → Dossier |
| Geplande zorg uitvoeren | Zorg → Dagelijks → Zorg uitvoeren; ook beschikbaar bij Mobiel |
| Een programma of herinnering instellen | Zorg → Beheer → Zorgprogramma's / Herinneringen |
| Hoeveelheden of voedingsporties berekenen | Zorg of Mobiel → Rekentool |
| Baasjes, voorkeuren of betalingen bijhouden | De aparte kaart Baasjes |
| Een rapport of document maken | De aparte kaart Rapport & export |
| Een volledige back-up maken of terugzetten | Configureren → Data en onderhoud → Back-up en import |

De gekozen kaartindeling bepaalt welke tabbladen op jouw dashboard staan.
**Logboek** is de verzameling tabbladen; **Dossier** is het overzicht van
opgeslagen items daarin. Er is geen apart Tijdlijn-tabblad meer.

## 1. Een eerste nest en pups aanmaken

1. Open **Instellingen → Apparaten & diensten → Puppy Tracker → Configureren**.
2. Kies **Nesten en pups**. Zonder nest opent het formulier voor een nieuw nest.
3. Vul de nestnaam en de bekende gegevens van moeder en vader in. Bevestig.
4. Kies **+ Nieuwe pup toevoegen** in de lijst van dat nest.
5. Vul de roepnaam, bandkleur, bekende geboortedatum/-tijd en het geboortegewicht
   **in grammen** in. Chipnummer en andere nog onbekende gegevens kun je later aanvullen.
6. Bevestig. Je komt terug in dezelfde lijst en kunt meteen de volgende pup toevoegen.

Bij meerdere nesten kies je eerst het juiste nest. Kies **+ Nieuw nest toevoegen**
om een volgend nest aan te maken. Een ontbrekende geboortetijd kan ervoor zorgen
dat leeftijdsgebonden zorg of analyses nog niet berekend kunnen worden; vul geen
verzonnen tijd in om een melding weg te krijgen.

### Later iets aanpassen

De kortste route voor een pup is meestal **Home → Pups → potlood bij de pup**.
In **Groei → Analyse** kan dat ook met **Pup bewerken** bij de geselecteerde pup.

Voor nest- en oudergegevens open je **Nesten en pups**, kies je het nest en
vervolgens **Nestgegevens wijzigen**. Klap het gewenste onderdeel open, wijzig
het en bevestig. Je hoeft niet alle onderdelen opnieuw in te vullen.

## 2. Kaarten aan je dashboard toevoegen

1. Open je dashboard en kies **Dashboard bewerken → Kaart toevoegen**.
2. Zoek de Puppy Tracker **Workspace**-kaart.
3. Kies bijvoorbeeld **Home**, **Groei**, **Logboek**, **Zorg** of **Mobiel**.
4. Pas alleen de opties aan die je nodig hebt en sla de kaart op.
5. Voeg **Baasjes** en **Rapport & export** apart toe als je die wilt gebruiken.

Begin op een telefoon gerust met alleen Mobiel. Je kunt daar wegen, snel
loggen, zorg uitvoeren en de rekentool gebruiken. Je kunt later aparte
werkruimtes voor beheer toevoegen. De kaarten worden automatisch geladen;
zelf bestanden aan dashboardbronnen toevoegen is normaal niet nodig.

Voor een complete voorbeeldindeling en alle opties zie
[Dashboardkaarten](DASHBOARD_CARDS.md). Bij een lege installatie kan de
checklist in Home of Mobiel je door de eerste stappen helpen.

## 3. Een pup wegen

1. Open **Groei → Wegen** of **Mobiel → Wegen**.
2. Controleer het nest, de pupnaam en het rondje met de bandkleur.
3. Vul het gewicht in grammen in. Controleer het verschil met de vorige meting
   en wanneer die meting is gedaan.
4. Kies **Gewicht opslaan** en controleer de bevestiging met pupnaam en gewicht.

Wil je het hele nest wegen? Kies eerst **Start weegsessie**. Na opslaan helpt de
kaart je verder naar de volgende pup. Al gewogen pups blijven selecteerbaar.
Dezelfde sessieknop wordt **Reset sessie** om de sessie af te sluiten; eerder
opgeslagen metingen blijven bewaard.

Het ingevulde gewicht blijft staan als je een andere pup kiest. Dat is handig
als je eerst het gewicht afleest, maar controleer de pup dus altijd vóór opslaan.

Bij een opvallend verschil of een mogelijke dubbele meting vraagt de kaart om
controle. Bevestig alleen opnieuw als pup en waarde kloppen. Na een verkeerde
opslag kun je de laatste weging gedurende twee minuten **Ongedaan maken**.
Daarna gebruik je een correctie.

Een onderbroken sessie na een herstart kun je **Hervatten** of **Afsluiten**.
Opgeslagen gewichten hoef je niet opnieuw in te voeren.

### Een verkeerd gewicht corrigeren

Zoek de meting in **Dossier** en gebruik het potlood, of open **Metingen beheren**
bij Groei → Analyse. Corrigeer de waarde en bevestig. De oorspronkelijke versie
blijft in de geschiedenis staan. Voeg geen extra, tegengestelde meting toe om
het verschil te compenseren.

## 4. Een notitie, voeding of temperatuur vastleggen

1. Open **Snel loggen**.
2. Kies het nest en bij wie de registratie hoort: **Hele nest**, **Moederhond**
   of één **Pup**. Controleer bij een pup ook de bandkleur.
3. Kies het soort item, bijvoorbeeld Notitie, Voeding, Dagelijkse zorg,
   Temperatuur, Ontworming of Medicatie.
4. Vul de relevante waarden en eventueel een notitie in.
5. Laat **Herinnering afhandelen** op **Alleen loggen** staan als je alleen iets
   wilt vastleggen. Kies expliciet een herinnering als je die hiermee wilt afhandelen.
6. Sla op en controleer de bevestiging en de genoemde eigenaar.

Bij een temperatuur van de moeder kies je dus **Moederhond**. **Hele nest** is
niet hetzelfde en bewaart de registratie in een ander dossier.

**Eigenaar** betekent hier het dier of het nest bij een dossieritem. De kaart
**Baasjes** gaat over de menselijke contacten; dat is iets anders.

Voor een temperatuurcurve open je **Logboek → Temperatuur**. Gedragsobservaties
leg je vast bij **Gedrag**: scoor alleen wat je echt hebt waargenomen. Lege
scores tellen niet als nul; er moet minstens één score ingevuld zijn.

De actie **Meerdere pups** in Logboek is geschikt voor dezelfde registratie bij
meerdere pups. Controleer eerst de selectie. Bij een gedeeltelijke fout blijven
alleen de niet-opgeslagen pups over voor opnieuw proberen.

## 5. Een opgeslagen item zoeken, wijzigen of verplaatsen

1. Open **Logboek → Dossier**.
2. Kies een pup, moeder, hele nest of **Alles** voor het gecombineerde overzicht.
3. Zoek op tekst of gebruik de categorie- en datumfilters.
4. Klap **Details** open voor de volledige tekst. Gebruik het potlood om te wijzigen.
5. Sla de wijziging op. Ook vanuit **Alles** blijft het item bij zijn eigen dossier.

Via het menu met drie puntjes kun je een gewoon dossieritem **Eigenaar wijzigen**
of verwijderen. Verwijderde dossieritems zijn via de filters weer te tonen en
te herstellen. Gewichten corrigeer je apart. Zorgprogrammaresultaten kunnen
niet naar een ander dier worden verplaatst, omdat ze aan een geplande actie
voor die pup gekoppeld zijn.

**Nieuw item** werkt ook in Alles, maar vraagt je vóór opslaan bij wie het hoort.
Een lege categorie-selectie betekent bewust **geen items tonen**. Gebruik
**Filters wissen** als je iets niet kunt terugvinden.

## 6. Geplande zorg uitvoeren

1. Open **Zorg uitvoeren** bij Zorg of Mobiel.
2. Controleer de dag. Bij Vandaag kunnen ook nog openstaande acties van eerdere
   dagen staan. De bronfilters bepalen of je programma's, herinneringen en
   dossiervervolgacties ziet.
3. Open de actie voor de juiste pup of moeder.
4. Lees de instructies en controleer wat je werkelijk hebt gedaan. Pas zo nodig
   middel, hoeveelheid, resultaat, notitie of een volgende datum aan.
5. Sla de uitvoering op. Er ontstaat een nieuw dossieritem; de oorspronkelijke
   toediening of eerdere notitie blijft staan.

Kies **Gemist** als een programmamoment niet is uitgevoerd. Dat wordt niet als
gegeven medicatie of voltooide handeling geregistreerd.

Een oogje of **Gezien** markeert alleen een aandachtspunt als gezien. Het is
geen uitvoering. Het potlood bij een herinnering wijzigt het schema; de actie
voor uitvoeren legt vast wat er nu is gebeurd.

Een herinnering kun je één keer uitstellen zonder het herhaalschema te
herschrijven. Uitstellen maakt geen dossieritem. Met **Uitstel annuleren**
keer je terug naar het oorspronkelijke moment.

### Een zorgprogramma of herinnering toevoegen

- **Zorgprogramma's:** geschikt voor vaste leeftijden, zoals een eigen ENS-/ESI-
  protocol. Kies een sjabloon, controleer dagen, instructies en resultaatvelden,
  en sla het programma op voor het gekozen nest.
- **Behandeling:** voor een afgebakende reeks medicatie- of ontwormingsmomenten
  bij geselecteerde pups. Controleer pups, begin/einddatum, tijden en product.
- **Herinneringen:** voor een interval, vaste dagelijkse tijden of één moment.
  Kies eerst het juiste nest en het dossier waarvoor de herinnering bedoeld is.

Kies liefst één planning voor dezelfde handeling, zodat je geen dubbele taken
maakt. Een sjabloon is een beginpunt; controleer het voor je het gebruikt.
Veranderingen aan een sjabloon wijzigen al aangemaakte programma's niet.

**Telt mee voor aandacht** bepaalt of een programma in Aandacht verschijnt.
Uitzetten verwijdert het niet uit Zorg uitvoeren en verbergt geen
gewichtsproblemen. De meldingstijd kun je per programma/herinnering instellen;
een leeg veld gebruikt de standaard van de integratie.

### Hoeveelheid op basis van gewicht

Je kunt bij een programma of herinnering een hoeveelheid per kg, een eenheid
en de maximale leeftijd van het gebruikte gewicht instellen. De getoonde
hoeveelheid is een berekening, geen automatisch toegediende dosis. Controleer
het gewicht en voer in het uitvoerformulier in wat daadwerkelijk is gegeven.
**Gewicht te oud** vraagt om controle; ontbrekend gewicht wordt niet geraden.
Voor de moeder is deze berekening momenteel niet beschikbaar: Puppy Tracker
heeft voor haar geen afzonderlijke weeggeschiedenis voor deze berekening.

## 7. Groei en voedingsporties bekijken

Bij **Groei → Analyse** kies je de pup en de gewenste grafiek/periode.
**Groei neemt af** gaat over het groeitempo: de pup kan nog wel zwaarder worden.
Werkelijk gewichtsverlies wordt apart gemeld.

**Vergelijking met nestgenoten** toont het gewicht ten opzichte van de andere
pups op dezelfde leeftijd. 100% betekent gelijk aan hun mediaan, het middelste
gewicht. Klap de nestvergelijking open voor de achtweekse grafiek. **Weekcijfers
bekijken** en de uitleg van de berekening kun je apart openen. Kies eerdere
nesten voor een persoonlijke referentie als die gegevens beschikbaar zijn.
Dat is een vergelijking met je eigen gegevens, geen gezondheidsnorm.

De **Rekentool** heeft twee mogelijkheden:

- **Per kg:** vul zelf de hoeveelheid per kg en de eenheid in.
- **Voeding:** controleer de rekenmethode van brokken en vlees, de verdeling en
  het aantal porties van beide afzonderlijk. Eén keer brokken plus twee keer
  vlees zijn drie voedingsmomenten, geen drie gelijke gemengde porties.

Voedingsinstellingen worden per nest bewaard. Berekeningen maken geen
voedingsregistratie. Controleer de ingestelde uitgangspunten voor je ze gebruikt;
de app bepaalt niet zelf welke voeding of hoeveelheid geschikt is.

## 8. Baasjes, pupvoorkeuren en betalingen

### Een baasje toevoegen of aanpassen

1. Open de kaart **Baasjes** en kies het juiste nest.
2. Kies **Baasje toevoegen**, of klap een bestaand baasje open en gebruik het potlood.
3. Vul contactgegevens in. Open de onderdelen die je nodig hebt, zoals adres,
   plaatsing, pupvoorkeuren of financieel.
4. Sla op. Je hoeft nog geen pup te koppelen.

Contactgegevens kunnen voor meerdere nesten worden gebruikt. Voorkeuren,
betalingen en plaatsingsgegevens horen bij het afzonderlijke nestdossier.
Controleer daarom het gekozen nest vóór je die gegevens wijzigt.

**Verkocht** betekent dat de verkoop is afgesproken; **Geplaatst** betekent dat
de pup is overgedragen. Het statusfilter verbergt geplaatste/gearchiveerde
dossiers standaard. Kies **Alle dossiers** of wis filters om die terug te vinden.

### Een voorkeur of definitieve koppeling vastleggen

Vul maximaal drie pupvoorkeuren in, elk met een korte notitie. De
**Voorkeurenmatrix** helpt overlappende keuzes te bekijken. Een voorkeur
reserveert of koppelt nog niets. Gebruik de afzonderlijke actie voor het
koppelen van een baasje aan een pup voor de daadwerkelijke koppeling.

### Een betaling registreren

Er zijn twee aparte onderdelen:

- **Financieel:** de afgesproken prijs, inschrijfgeld, aanbetaling, slotbetaling
  en het werkelijk openstaande bedrag.
- **Ontvangen betalingen:** de afzonderlijke ontvangsten met bedrag, datum,
  soort betaling, betaalwijze en eventueel referentie/notitie.

Open het baasje en **Ontvangen betalingen → Ontvangst toevoegen** om een ontvangst
vast te leggen. Een foutieve ontvangst kun je met een reden intrekken; de
historie blijft zichtbaar.

**Een ontvangst toevoegen werkt het openstaande saldo niet automatisch bij.**
Houd dat ook bij onder Financieel. Bij volledige betaling kun je **Volledig
betaald registreren** gebruiken: controleer datum en betaalwijze en sla op.
Dat zet het openstaande bedrag op nul, maar maakt geen losse ontvangst aan.

## 9. Een PDF, contactlijst of document maken

### Een dossier als PDF

1. Open **Rapport & export**.
2. Kies het nest, één pup of de moeder, en de periode.
3. Open **PDF-rapport** en selecteer wat je wilt delen.
4. Controleer de samenvatting en kies **PDF downloaden**.

Een individuele pup-PDF kan ook nestnotities bevatten als je die bron bij de
dossierfilters aanzet. Moedergegevens hebben een eigen rapport. Baasjesgegevens
verschijnen alleen wanneer ze gekoppeld zijn en je die secties hebt aangezet.
De nieuwe nestvergelijkingsgrafiek staat in Groei en wordt nog niet als apart
hoofdstuk aan het PDF-dossier toegevoegd.

### Baasjes exporteren voor bijvoorbeeld Word

Gebruik **Selectie exporteren (CSV)** op de kaart Baasjes. De huidige filters
bepalen welke dossiers meegaan. Kies alle nesten en alle dossiers voor een
volledige lijst. Bij het importeren in een spreadsheet zet je telefoonnummers
en chipnummers op **Tekst**, zodat voorloopnullen niet verdwijnen.

### Een document uit een sjabloon

1. Vul je eigen gegevens in bij **Configureren → Fokkersgegevens**.
2. Zorg dat pupgegevens kloppen en de koper aan de pup gekoppeld is.
3. Open **Documenten en contracten** op Rapport & export en kies **Document uit sjabloon**.
4. Kies een sjabloon, pup en hoofdkoper. Kies voor een betalingsbewijs ook de
   betreffende ontvangen betaling.
5. Vul documentdatum en ondertekeningsplaats in. Kies **Controleren en PDF-voorbeeld**.
6. Vul ontbrekende gegevens aan en controleer het voorbeeld.
7. Kies **Document opslaan en downloaden**.

Een opgeslagen document bewaart de PDF zoals die op dat moment was. Later
wijzigen van gegevens past oude documenten niet aan. Maak voor een correctie
een nieuw document. Eigen sjablonen kunnen via JSON worden gedownload en
geïmporteerd; daarvoor is er een [uitgebreide sjabloonhandleiding](DOCUMENT_TEMPLATES.md).

## 10. Een back-up maken en herstellen

1. Open **Configureren → Data en onderhoud → Back-up en import**.
2. Kies **Back-up exporteren** en een **volledige Puppy Tracker-back-up**.
3. Download het bestand en bewaar een kopie buiten Home Assistant.

Een volledige JSON-back-up bevat ook baasjesgegevens, programma's, eigen
sjablonen en opgeslagen documenten. Een nestexport is beperkter. PDF en CSV
zijn geen herstelbare back-ups. Bewaar back-ups privé: er kunnen adressen en
betalingsgegevens in staan.

Terugzetten gaat via **Back-up importeren / herstellen**. Lees de
voorvertoning voordat je bevestigt. **Alles vervangen** vervangt je huidige
Puppy Tracker-gegevens; gebruik dit niet alleen om een oud bestand te bekijken.
Maak eerst een nieuwe back-up en volg de [herstelhandleiding](backup-restore.md).

Voor automatische back-ups is er de Home Assistant-actie
**Puppy Tracker: Backup naar bestand** in Ontwikkelaarstools → Acties. Kies een
pad onder de Home Assistant-configuratiemap, buiten `www`, en eventueel een
datum/tijd in de bestandsnaam en het aantal versies dat je wilt bewaren.
De actie plant zichzelf niet: voeg hem toe aan een automatisering als je hem
bijvoorbeeld dagelijks wilt laten uitvoeren.

## 11. Meldingen instellen

Open **Configureren → Groei en meldingen → Meldingen beheren**.
Bij **Meldingsvoorkeuren** kies je onder andere de standaardmeldingstijd en de
telefoons die meldingen mogen ontvangen. Controleer eerst een **Testmelding
versturen** voordat je automatische levering inschakelt.

Voltooien of oplossen trekt ondersteunde getagde mobiele meldingen weer in.
Uitschakelen van meldingen verwijdert de planning en dossiergegevens niet.
Zorg blijft beschikbaar op de kaarten. Zie [Meldingen](NOTIFICATIONS.md) voor
het onderscheid tussen meldingen, aandacht en geplande acties.

## Als iets niet zichtbaar is

- Controleer nest, pup/moeder, categorieën, zoektekst en periode. Alle categorieën
  uit betekent geen resultaten.
- Kijk bij Baasjes ook naar het statusfilter. Een geplaatst dossier is niet weg.
- Zorgprogramma niet op Aandacht? Controleer **Telt mee voor aandacht** en kijk
  bij **Zorg uitvoeren**, eventueel op een andere dag.
- Moeder ontbreekt? Controleer of de juiste moeder aan het nest gekoppeld is.
- Knop ontbreekt? Controleer of je als beheerder bent ingelogd.
- Na een update: herstart Home Assistant en vernieuw browser of Companion App.
- In oudere HACS-versies kan het updatepictogram ontbreken ondanks correcte
  lokale pictogrammen. Dat staat los van je fokkerslogo voor documenten.

Archiveer een oud nest als je het uit actieve overzichten wilt halen.
Permanent verwijderen is iets anders dan archiveren of het herstellen van een
verwijderd dossieritem. Gebruik verwijderen niet om alleen een lijst op te ruimen.

[Terug naar het documentatieoverzicht](README.md)
