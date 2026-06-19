# Audiocreator-instructies

Audiocreator combineert door ElevenLabs gegenereerde spraak met bestaande
online MP3-bestanden tot één downloadbaar MP3-bestand.

## Stappen

1. Selecteer een stem.
2. Stel de pauze tussen de fragmenten in.
3. Voer tekst en eventueel audiolabels in.
4. Klik op **Maken**.
5. Gebruik **Afspelen** om het resultaat te controleren.
6. Gebruik **Downloaden** om het samengevoegde MP3-bestand op te slaan.

## Audiolabels gebruiken

Tekst zonder labels wordt door ElevenLabs omgezet in spraak:

```text
Dit is gewone gesproken tekst.
```

Gebruik punthaken voor een bestaand Nederlands spraakbestand:

```text
<bal>
```

Het bovenstaande voorbeeld laadt:

```text
/sounds/nl/speech/bal.mp3
```

Scheid meerdere namen van spraakbestanden met komma's:

```text
<b,a,l>
```

Gebruik accolades voor een bestaand algemeen geluidsbestand:

```text
{stuiter}
```

Het bovenstaande voorbeeld laadt:

```text
/sounds/general/stuiter.mp3
```

## Volledig voorbeeld

```text
Dit is het woord bal. <bal> {snor}
Het woord bal bestaat uit de letters <b,a,l>
Een bal maakt ook een geluid. Het stuitert {stuiter}
```

Als op **Maken** wordt geklikt, maakt en combineert dit voorbeeld:

1. ElevenLabs-spraak: `Dit is het woord bal.`
2. Spraakbestand: `/sounds/nl/speech/bal.mp3`
3. Algemeen geluidsbestand: `/sounds/general/snor.mp3`
4. ElevenLabs-spraak: `Het woord bal bestaat uit de letters`
5. Spraakbestand: `/sounds/nl/speech/b.mp3`
6. Spraakbestand: `/sounds/nl/speech/a.mp3`
7. Spraakbestand: `/sounds/nl/speech/l.mp3`
8. ElevenLabs-spraak: `Een bal maakt ook een geluid. Het stuitert`
9. Algemeen geluidsbestand: `/sounds/general/stuiter.mp3`

## Meerdere downloads

Gebruik `#` om de tekst over afzonderlijke MP3-downloads te verdelen:

```text
Eerste bestand <bal> # Tweede bestand {stuiter}
```

Gebruik daarna **MP3-bestanden maken en downloaden** of
**ZIP-bestand maken en downloaden**.

## Opmerkingen

- Labels moeten overeenkomen met de naam van een bestaand online MP3-bestand.
- Plaats `.mp3` niet in een label.
- Spaties rond labels zijn optioneel.
- De ingestelde pauze wordt tussen elk gegenereerd of bestaand audiofragment geplaatst.
- De ElevenLabs-API-sleutel blijft op de server en wordt nooit in de browser getoond.
