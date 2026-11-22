# Data formats

## Importing text (paste or .txt/.csv/.tsv)

The importer turns text into cards with two separators you choose:

| Setting | Presets | Custom |
|---|---|---|
| Between term and definition | Tab, Comma, Dash (` - `), Colon | any text; `\t` and `\n` are understood |
| Between cards | New line, Semicolon, Blank line | any text |

Rules:

- Each card is split at the **first** term separator, so definitions may contain it
  (`fruit, apple, banana` gives the term `fruit` and the definition `apple, banana`).
- **Values in quotes** turns on CSV rules: `"a, b"` is one value, `""` is a literal quote,
  and quoted values can span lines.
- **First row is a header** skips column titles.
- **Columns:** with three or more columns, map each one to *Term*, *Definition*,
  *Explanation*, *Alt. answers* (several separated by `|`) or *Ignore*.
- **Swap** exchanges terms and definitions.
- The preview flags rows with no term or definition, duplicates within the paste, and
  duplicates of cards already in the target set. By default duplicates are skipped;
  incomplete rows are optional.
- Windows line endings, a UTF-8 byte-order mark and any Unicode text are handled.

The format is detected automatically when you paste or pick a file, and you can
change anything. Exports from other flashcard apps that use custom separators
(for example `term = definition` with `;` between cards) import directly. Anki
"Notes in plain text" exports are tab-separated.

See [`examples/`](../examples) for sample files.

## CSV/TSV export

A header row `term,definition,explanation,accepted_answers`, with alternative answers
joined by `|`. Re-importing it reproduces the cards exactly; this round trip is tested.

## Native archive (`*.inquizitive.zip`)

A ZIP containing:

```
library.json      the bundle (below)
media/<uuid>.png  every image referenced by a card
README.txt
```

A bare `library.json` can be imported too (without images).

### `library.json`, format version 1

```jsonc
{
  "format": "inquizitive.library",   // required, constant
  "version": 1,                      // newer versions are rejected with a clear message
  "exportedAt": 1795329000000,       // Unix ms
  "folders": [{ "id": "uuid", "name": "Biology", "parentId": null }],
  "sets": [
    {
      "id": "uuid",                  // preserved on import when not already present
      "folderId": "uuid | null",
      "title": "Cell structure",
      "description": "",
      "tags": ["biology"],
      "createdAt": 0, "updatedAt": 0, "archivedAt": null,
      "cards": [
        {
          "id": "uuid",
          "front": "mitochondria",          // Markdown + LaTeX ($…$) allowed
          "back": "powerhouse of the cell",
          "explanation": "",
          "position": 1,
          "acceptedAnswers": ["the mitochondrion"],
          "media": [{ "side": "front", "path": "<uuid>.png", "mimeType": "image/png" }]
        }
      ]
    }
  ],
  // Optional, when exported "with progress":
  "progress": [{ "cardId": "uuid", "starred": false, "known": true, "reviewCount": 3, "lapses": 0,
                 "fsrsState": 2, "stability": 8.2, "difficulty": 4.9, "lastReviewedAt": 0,
                 "nextReviewAt": 0, "schedulingState": "{…FSRS card JSON…}" }],
  "reviews":  [{ "cardId": "uuid", "reviewedAt": 0, "rating": 3, "responseTimeMs": 2100, "scheduledDays": 4 }]
}
```

### Import guarantees

- Everything is validated (types, lengths, counts, image file names) before anything
  is written. Malformed files are rejected with the first problem found.
- Imports run in a single transaction: all or nothing.
- **Nothing is overwritten.** Ids are kept when free, so restoring a backup into an
  empty library is exact. A set or card whose id already exists is imported as a copy
  with a new id. Folders you already have are reused.
- Image files are restored under their original names and never replace an existing
  file. Paths with directories or other file types are ignored.

## Desktop storage

The desktop library is `inquizitive.db` (SQLite, WAL mode) in the OS app-data folder:

| OS | Location |
|---|---|
| macOS | `~/Library/Application Support/org.inquizitive.app/` |
| Windows | `%APPDATA%\org.inquizitive.app\` |
| Linux | `~/.local/share/org.inquizitive.app/` |

Images are in `media/` next to it. Before applying a schema upgrade, the app writes
`inquizitive.v<old>.bak.db` alongside the database.
