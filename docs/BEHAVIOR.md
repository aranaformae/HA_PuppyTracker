# Gedragsobservaties

De gedragsmodule helpt om terugkerende observaties per pup op dezelfde manier
vast te leggen. Gebruik hiervoor het tabblad **Gedrag** in de Logboek- of
Mobiel-workspace. Kies een pup, vul de context en observator in en scoor alleen
de punten die tijdens dat moment werkelijk zijn waargenomen.

## Scoreschaal

Iedere score beschrijft hoe zichtbaar of sterk het gedrag tijdens die ene
observatie was:

| Score | Betekenis |
| --- | --- |
| 1 | Nauwelijks zichtbaar |
| 2 | Licht zichtbaar |
| 3 | Gemiddeld zichtbaar |
| 4 | Duidelijk zichtbaar |
| 5 | Zeer duidelijk zichtbaar |

Een hoge of lage score is niet automatisch goed of slecht. De module is een
registratiehulpmiddel en geen gevalideerde gedragstest, selectieadvies of
veterinaire diagnose. Leeftijd, vermoeidheid, omgeving, begeleider en de
gebruikte prikkel kunnen een score sterk beinvloeden. Noteer die context daarom
waar relevant en vergelijk vooral meerdere observaties van dezelfde pup.

## Observatiepunten

De eerste groep volgt praktische reacties en herstel:

- oppakken en vasthouden;
- rechtop houden;
- op de rug houden;
- voetzoolprikkel;
- koude ondergrond;
- herstelsnelheid na een prikkel;
- geluidsgevoeligheid;
- nieuwsgierigheid;
- zelfvertrouwen;
- doorzettingsvermogen;
- mensgerichtheid en contact zoeken;
- rust kunnen terugvinden.

De tweede groep legt de algemene indruk op dat moment vast:

- zacht, stoer, rustig en pittig;
- mensgericht en zelfstandig;
- gevoelig en ondernemend;
- meegaand en eigenwijs.

Een observatie mag gedeeltelijk worden ingevuld. Niet-waargenomen criteria
blijven leeg en tellen niet als nul. Minimaal een criterium moet een score
hebben voordat de observatie kan worden opgeslagen.

## Profiel en eindscore

De kaart toont per criterium het gemiddelde, de laatste score en het aantal
observaties. De groepsscores zijn het gemiddelde van de ingevulde criteria in
die groep. De **profielscore** is het gemiddelde van alle beschikbare
criteriumgemiddelden. Daardoor krijgt een criterium dat vaker is ingevuld niet
automatisch meer gewicht dan een ander criterium.

Dit is een actueel samenvattend profiel, geen definitieve keuringsuitslag. Een
nieuwe observatie werkt het profiel direct bij. De volledige geschiedenis blijft
beschikbaar om ontwikkeling en context terug te kunnen zien.

## Rapport en backup

De Report-kaart heeft een zelfstandige sectie **Gedragsprofiel**. Deze kan los
van gewone dossieritems en zorgprogrammaresultaten aan of uit. Een individueel
puppyrapport bevat de samenvatting per criterium en, wanneer aanwezig, de
observatiegeschiedenis met datum, leeftijd, observator, context en notitie. Het
rapportperiodefilter geldt ook voor deze observaties.

Gedragsobservaties zijn puppy-dossierrecords en worden daarom automatisch
meegenomen in volledige JSON-backups. Ze kunnen niet naar het nest- of
moederdossier worden verplaatst; corrigeren naar een andere pup blijft mogelijk.

## Workspace-opties

De gedragsmodule gebruikt het tabblad `behavior`. De volgende geavanceerde
opties kunnen onder `tab_config.behavior` worden ingesteld:

```yaml
type: custom:puppy-tracker-workspace-card
preset: journal
tab_config:
  behavior:
    show_profile: true
    show_history: true
    max_items: 20
```

`show_profile` toont de afgeleide gemiddelden, `show_history` de losse
observatiemomenten en `max_items` begrenst de zichtbare geschiedenis. De Mobile-
workspace toont standaard wel het profiel maar niet de langere geschiedenis.
