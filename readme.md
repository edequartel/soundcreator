# Audiocreator instructions

Audiocreator combines generated ElevenLabs speech with existing online MP3
files into one downloadable MP3.

## Basic workflow

1. Select a voice.
2. Set the merge gap. This is the silence between every audio part.
3. Enter text and optional audio tags.
4. Click **Produce**.
5. Use **Play** to check the result.
6. Use **Download** to save the merged MP3.

## Audio tag syntax

Text without tags is converted to speech by ElevenLabs:

```text
Dit is gewone gesproken tekst.
```

Use angle brackets for an existing Dutch speech MP3:

```text
<bal>
```

The example above loads:

```text
/sounds/nl/speech/bal.mp3
```

Separate multiple speech MP3 names with commas:

```text
<b,a,l>
```

Use curly brackets for an existing general sound MP3:

```text
{stuiter}
```

The example above loads:

```text
/sounds/general/stuiter.mp3
```

## Complete example

```text
Dit is het woord bal. <bal> {snor}
Het woord bal bestaat uit de letters <b,a,l>
Een bal maakt ook een geluid. Het stuitert {stuiter}
```

When **Produce** is clicked, this example creates and merges:

1. ElevenLabs speech: `Dit is het woord bal.`
2. Speech MP3: `/sounds/nl/speech/bal.mp3`
3. General MP3: `/sounds/general/snor.mp3`
4. ElevenLabs speech: `Het woord bal bestaat uit de letters`
5. Speech MP3: `/sounds/nl/speech/b.mp3`
6. Speech MP3: `/sounds/nl/speech/a.mp3`
7. Speech MP3: `/sounds/nl/speech/l.mp3`
8. ElevenLabs speech: `Een bal maakt ook een geluid. Het stuitert`
9. General MP3: `/sounds/general/stuiter.mp3`

## Multiple downloads

Use `#` to divide the text into separate MP3 downloads:

```text
Eerste bestand <bal> # Tweede bestand {stuiter}
```

Then use **Download # MP3s** or **Download # ZIP**.

## Notes

- Tags must match an existing online MP3 filename.
- Do not include `.mp3` inside a tag.
- Spaces around tags are optional.
- The selected merge gap is inserted between every generated or existing audio
  part.
- The ElevenLabs API key remains on the server and is never exposed in the
  browser.
