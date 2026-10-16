# KRIYA data sources and acquisition record

Data selection favors licensed, relevant knowledge with provenance. No model training corpus or video library was bulk downloaded.

| Source | Status in repository | Usage |
| --- | --- | --- |
| Wikidata structured entities | **Acquired:** 15 reviewed English labels/descriptions, CC0 | Glossary retrieval; source revision and response hash on every record |
| Original KRIYA guidance | **Authored:** 30 CC0 records | Timeline, pacing, audio, delivery, storage, rights and tool-boundary knowledge |
| MDN media and storage guides | Reference links only | Supporting documentation; article prose was not scraped or bundled |
| FFmpeg official manuals | Reference links only | Codec, filtering and audio-analysis references; no automatic command execution |
| W3C accessibility guidance | Reference links only | Caption and contrast references |
| Blender manual | Reference links only | Editing concepts; no manual text or movie assets bundled |
| Wikimedia Commons | Optional future acquisition | Each media file has its own license/attribution requirements; check the file page |
| Freesound | Optional future acquisition | Licenses vary by recording; select CC0 or verify attribution/commercial permissions individually |
| User-owned briefs and style guides | Import through Knowledge tab | Private records stored in Convex with explicit rights acknowledgment; not public bundle data |

The new JSON data in `editor.json` is original project-authored guidance dedicated to CC0-1.0. Its supporting links do not imply a license to redistribute those sites' full articles. `wikidata.json` uses Wikidata's CC0 structured data, not copyrighted project-page prose. This data license does not relicense the entire KRIYA codebase.

Refresh: `bun run data:refresh`. Verify the edited output, then run `bun test` and rebuild. The pinned entities eliminate initial search-name collisions but do not guarantee future source correctness. Keep retrieval tests representative of actual questions. For a larger corpus, add only needed, licensed chunks and evaluate retrieval quality before raising storage or model-context limits.

Useful references: [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing), [MDN media formats](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats), [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html), [W3C captions](https://www.w3.org/WAI/media/av/captions/), [Blender manual](https://docs.blender.org/manual/en/latest/), [Commons reuse](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia), [Freesound licensing FAQ](https://freesound.org/help/faq/#licenses).
