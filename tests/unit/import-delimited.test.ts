import { describe, expect, it } from 'vitest';
import {
  DEFAULT_IMPORT_OPTIONS,
  detectOptions,
  type ImportOptions,
  parseImport,
  selectRows,
  unescapeSeparator,
} from '@/services/import-export/delimited';

const opts = (o: Partial<ImportOptions>): ImportOptions => ({ ...DEFAULT_IMPORT_OPTIONS, ...o });

describe('pasted text import', () => {
  it('parses tab-separated lines', () => {
    const r = parseImport('perro\tdog\ngato\tcat\n', opts({}));
    expect(r.rows.map((x) => [x.card.front, x.card.back])).toEqual([
      ['perro', 'dog'],
      ['gato', 'cat'],
    ]);
    expect(r.rows.every((x) => x.issues.length === 0)).toBe(true);
  });

  it('splits only at the first term separator so definitions may contain it', () => {
    const r = parseImport('fruit, apple, banana, cherry', opts({ termSeparator: ',' }));
    expect(r.rows[0].card).toMatchObject({ front: 'fruit', back: 'apple, banana, cherry' });
  });

  it("supports custom separators like ' - ' and ';'", () => {
    const r = parseImport(
      'H - hydrogen;He - helium;Li - lithium',
      opts({ termSeparator: ' - ', cardSeparator: ';' }),
    );
    expect(r.rows.map((x) => x.card.back)).toEqual(['hydrogen', 'helium', 'lithium']);
  });

  it('supports blank-line separated cards with multiline definitions', () => {
    const text = 'Photosynthesis\nPlants turn light\ninto sugar\n\nMitosis\nCell division';
    const r = parseImport(text, opts({ termSeparator: '\n', cardSeparator: '\n\n' }));
    expect(r.rows.map((x) => x.card)).toMatchObject([
      { front: 'Photosynthesis', back: 'Plants turn light\ninto sugar' },
      { front: 'Mitosis', back: 'Cell division' },
    ]);
  });

  it('handles Windows line endings, BOM and blank lines', () => {
    const r = parseImport('\uFEFFa\tb\r\n\r\nc\td\r\n', opts({}));
    expect(r.rows.map((x) => x.card.front)).toEqual(['a', 'c']);
  });

  it('flags missing definitions and duplicates, and can skip them', () => {
    const r = parseImport('a\t1\nb\nA\t1\n\tonly back', opts({}), [{ front: 'z', back: '26' }]);
    expect(r.rows.map((x) => x.issues)).toEqual([
      [],
      ['missing_back'],
      ['duplicate'],
      ['missing_front'],
    ]);
    expect(
      selectRows(r, { skipDuplicates: true, skipIncomplete: true }).map((x) => x.card.front),
    ).toEqual(['a']);
    expect(selectRows(r, { skipDuplicates: false, skipIncomplete: false })).toHaveLength(4);
  });

  it('detects duplicates of cards already in the set', () => {
    const r = parseImport('z\t26', opts({}), [{ front: 'Z', back: '26' }]);
    expect(r.rows[0].issues).toEqual(['duplicate_existing']);
  });

  it('can swap term and definition', () => {
    const r = parseImport('dog\tperro', opts({ swap: true }));
    expect(r.rows[0].card).toMatchObject({ front: 'perro', back: 'dog' });
  });

  it('keeps Unicode intact', () => {
    const r = parseImport('日本\tJapan 🇯🇵\nñandú\tрея', opts({}));
    expect(r.rows.map((x) => x.card.front)).toEqual(['日本', 'ñandú']);
    expect(r.rows[1].card.back).toBe('рея');
  });

  it('turns typed escapes into separators', () => {
    expect(unescapeSeparator('\\t')).toBe('\t');
    expect(unescapeSeparator('\\n\\n')).toBe('\n\n');
  });
});

describe('CSV / TSV import', () => {
  it('honours quotes containing separators and newlines', () => {
    const csv =
      'term,definition\n"Paris, France","Capital city,\nfamous for the ""Eiffel"" Tower"\nRome,Italy';
    const r = parseImport(csv, opts({ termSeparator: ',', quoted: true, hasHeader: true }));
    expect(r.rows.map((x) => x.card)).toMatchObject([
      { front: 'Paris, France', back: 'Capital city,\nfamous for the "Eiffel" Tower' },
      { front: 'Rome', back: 'Italy' },
    ]);
  });

  it('maps extra columns to explanation and accepted answers', () => {
    const csv = 'Q,A,Note,Alts,Junk\ncolour,color,US spelling,colour|colr,x';
    const r = parseImport(
      csv,
      opts({
        termSeparator: ',',
        quoted: true,
        hasHeader: true,
        columns: ['front', 'back', 'explanation', 'accepted', 'ignore'],
      }),
    );
    expect(r.rows[0].card).toEqual({
      front: 'colour',
      back: 'color',
      explanation: 'US spelling',
      acceptedAnswers: ['colour', 'colr'],
    });
    expect(r.columnCount).toBe(5);
  });

  it('reports malformed quoting instead of failing silently', () => {
    const r = parseImport(
      '"unterminated,field\nnext,row',
      opts({ termSeparator: ',', quoted: true }),
    );
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('handles hundreds of rows', () => {
    const text = Array.from({ length: 800 }, (_, i) => `term ${i}\tdefinition ${i}`).join('\n');
    const r = parseImport(text, opts({}));
    expect(r.rows).toHaveLength(800);
    expect(selectRows(r, { skipDuplicates: true, skipIncomplete: true })).toHaveLength(800);
  });
});

describe('detectOptions', () => {
  it('detects tabs, commas, dashes and colons', () => {
    expect(detectOptions('a\tb\nc\td').termSeparator).toBe('\t');
    expect(detectOptions('a,b\nc,d').termSeparator).toBe(',');
    expect(detectOptions('a - b\nc - d').termSeparator).toBe(' - ');
    expect(detectOptions('a: b\nc: d').termSeparator).toBe(':');
  });

  it('treats .csv files with quotes as quoted CSV and maps wide rows', () => {
    const o = detectOptions('"a","b","c"\n"d","e","f"', 'cards.csv');
    expect(o).toMatchObject({ termSeparator: ',', quoted: true });
    expect(o.columns).toEqual(['front', 'back', 'explanation']);
  });

  it('detects semicolon-separated cards on one line', () => {
    expect(detectOptions('H - Hydrogen;He - Helium;Li - Lithium')).toMatchObject({
      cardSeparator: ';',
      termSeparator: ' - ',
    });
    expect(detectOptions('a,1;b,2;c,3;d,4')).toMatchObject({
      cardSeparator: ';',
      termSeparator: ',',
    });
  });

  it('detects blank-line separated cards', () => {
    const o = detectOptions(
      'Term one\nDefinition one\n\nTerm two\nDefinition two\n\nTerm three\nDefinition three',
    );
    expect(o).toMatchObject({ cardSeparator: '\n\n', termSeparator: '\n' });
  });
});

describe('round trip', () => {
  it('re-imports its own CSV and TSV export unchanged', async () => {
    const { cardsToDelimited } = await import('@/services/import-export/export-text');
    const cards = [
      { front: 'Say "hi"', back: 'a, b\nc', explanation: 'note', acceptedAnswers: ['x', 'y'] },
      { front: 'tab\there', back: 'plain', explanation: '', acceptedAnswers: [] },
    ].map((c, i) => ({
      ...c,
      id: String(i),
      setId: 's',
      position: i,
      media: [],
      createdAt: 0,
      updatedAt: 0,
    }));
    for (const sep of [',', '\t'] as const) {
      const text = cardsToDelimited(cards, sep);
      const parsed = parseImport(
        text,
        opts({
          termSeparator: sep,
          quoted: true,
          hasHeader: true,
          columns: ['front', 'back', 'explanation', 'accepted'],
        }),
      );
      expect(parsed.rows.map((r) => r.card)).toEqual([
        { front: 'Say "hi"', back: 'a, b\nc', explanation: 'note', acceptedAnswers: ['x', 'y'] },
        { front: 'tab\there', back: 'plain', explanation: '', acceptedAnswers: [] },
      ]);
    }
  });
});
