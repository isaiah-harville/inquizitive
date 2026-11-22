import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseBundle } from '@/services/import-export/bundle';
import { detectOptions, parseImport, selectRows } from '@/services/import-export/delimited';

const read = (name: string) => readFileSync(join(__dirname, '..', '..', 'examples', name), 'utf8');

function importWithDetection(name: string, overrides = {}) {
  const text = read(name);
  const opts = { ...detectOptions(text, name), ...overrides };
  const result = parseImport(text, opts);
  return { opts, rows: selectRows(result, { skipDuplicates: true, skipIncomplete: true }), result };
}

describe('example import files', () => {
  it('spanish-basics.tsv: tab separated, one card per line', () => {
    const { rows } = importWithDetection('spanish-basics.tsv');
    expect(rows).toHaveLength(15);
    expect(rows[0].card).toMatchObject({ front: 'hola', back: 'hello' });
  });

  it('chemistry.csv: header, quotes, multi-line values, explanation and alternatives', () => {
    const { rows, opts } = importWithDetection('chemistry.csv', { hasHeader: true });
    expect(opts).toMatchObject({ termSeparator: ',', quoted: true });
    expect(rows).toHaveLength(10);
    const oxygen = rows.find((r) => r.card.front === 'O')?.card;
    expect(oxygen?.explanation).toContain('\n');
    const water = rows.find((r) => r.card.front === 'H2O')?.card;
    expect(water?.acceptedAnswers).toEqual(['dihydrogen monoxide', 'water molecule']);
    expect(rows.find((r) => r.card.front === 'Na')?.card.explanation).toBe(
      'From the Latin "natrium"',
    );
  });

  it("custom-separators.txt: ' = ' between term and definition, ' ; ' between cards", () => {
    const { rows } = importWithDetection('custom-separators.txt', {
      termSeparator: ' = ',
      cardSeparator: ' ; ',
    });
    expect(rows).toHaveLength(8);
    expect(rows.at(-1)?.card).toMatchObject({
      front: 'Neptune',
      back: 'farthest planet from the Sun',
    });
  });

  it('biology-blocks.txt: blank-line separated blocks are detected', () => {
    const { rows, opts } = importWithDetection('biology-blocks.txt');
    expect(opts).toMatchObject({ cardSeparator: '\n\n', termSeparator: '\n' });
    expect(rows.map((r) => r.card.front)).toEqual([
      'Photosynthesis',
      'Mitochondria',
      'Osmosis',
      'Ribosome',
    ]);
    expect(rows[0].card.back).toContain('glucose');
  });

  it('math-and-code.tsv keeps Markdown and LaTeX intact', () => {
    const { rows } = importWithDetection('math-and-code.tsv');
    expect(rows).toHaveLength(7);
    expect(rows[0].card.back).toBe('$x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$');
  });

  it('example-library.json is a valid native bundle', () => {
    const bundle = parseBundle(JSON.parse(read('example-library.json')));
    expect(bundle.sets[0].cards).toHaveLength(6);
  });
});
