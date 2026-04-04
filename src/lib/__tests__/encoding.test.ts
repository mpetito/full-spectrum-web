/** Tests for filament hex encoding/decoding. */
import { describe, it, expect } from 'vitest';
import {
  type BisectionNode,
  FILAMENT_HEX_TABLE,
  decodeBisectionTree,
  encodeBisectionTree,
  equalNodes,
  filamentToHex,
  hexToFilament,
  isSubPainted,
  leafNode,
  splitNode,
} from '../encoding';

describe('hexToFilament', () => {
  const entries = Object.entries(FILAMENT_HEX_TABLE).map(
    ([k, v]) => [v, Number(k)] as [string, number],
  );

  it.each(entries)('decodes %s → %d', (hex, expected) => {
    expect(hexToFilament(hex)).toBe(expected);
  });

  it.each(['0c', '1c', '2c', '3c', '4c', '5c', '6c', '7c'])(
    'is case-insensitive: %s',
    (hex) => {
      expect(hexToFilament(hex)).toBe(hexToFilament(hex.toUpperCase()));
    },
  );

  it('rejects sub-painted hex', () => {
    expect(() => hexToFilament('0C1C2C')).toThrow('Sub-painted');
  });

  it('rejects unknown code', () => {
    expect(() => hexToFilament('FF')).toThrow('Invalid filament hex code');
  });
});

describe('filamentToHex', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])('round-trips filament %d', (f) => {
    expect(hexToFilament(filamentToHex(f))).toBe(f);
  });

  it.each([0, 11, -1, 100])('rejects out-of-range %d', (f) => {
    expect(() => filamentToHex(f)).toThrow('out of range');
  });
});

describe('isSubPainted', () => {
  it.each([
    ['4', false],
    ['8', false],
    ['0C', false],
    ['0C1C', true],
    ['0C1C2C', true],
  ] as [string, boolean][])('isSubPainted(%s) → %s', (hex, expected) => {
    expect(isSubPainted(hex)).toBe(expected);
  });
});

describe('BisectionNode construction', () => {
  it('creates leaf node', () => {
    const leaf = leafNode(1);
    expect(leaf.kind).toBe('leaf');
    expect(leaf.state).toBe(1);
  });

  it('creates leaf with state 0', () => {
    expect(leafNode(0).state).toBe(0);
  });

  it('creates leaf with state 15', () => {
    expect(leafNode(15).state).toBe(15);
  });

  it('rejects negative leaf state', () => {
    expect(() => leafNode(-1)).toThrow('0–15');
  });

  it('rejects leaf state > 15', () => {
    expect(() => leafNode(16)).toThrow('0–15');
  });

  it('leaf equality', () => {
    expect(equalNodes(leafNode(1), leafNode(1))).toBe(true);
    expect(equalNodes(leafNode(1), leafNode(2))).toBe(false);
  });

  it('creates split node', () => {
    const node = splitNode(1, 0, [leafNode(1), leafNode(2)]);
    expect(node.kind).toBe('split');
    expect(node.splitSides).toBe(1);
    expect(node.specialSide).toBe(0);
    expect(node.children.length).toBe(2);
  });

  it('rejects invalid special_side', () => {
    expect(() => splitNode(1, 3, [leafNode(0), leafNode(0)])).toThrow('special_side');
  });

  it('rejects wrong child count', () => {
    expect(() => splitNode(1, 0, [leafNode(0)])).toThrow('children');
  });
});

// Worked examples matching the Python test suite exactly
const WORKED_EXAMPLES: [string, BisectionNode, string][] = [
  ['Whole triangle Ext1', leafNode(1), '4'],
  ['Whole triangle Ext2', leafNode(2), '8'],
  ['Whole triangle default', leafNode(0), '0'],
  ['Whole triangle Ext3 (extended)', leafNode(3), '0C'],
  ['Whole triangle Ext15', leafNode(15), 'CC'],
  [
    '1-split edge 0 [Ext1, Ext2]',
    splitNode(1, 0, [leafNode(1), leafNode(2)]),
    '481',
  ],
  [
    '1-split edge 1 [Ext1, Ext2]',
    splitNode(1, 1, [leafNode(1), leafNode(2)]),
    '485',
  ],
  [
    '1-split edge 2 [Ext1, Ext2]',
    splitNode(1, 2, [leafNode(1), leafNode(2)]),
    '489',
  ],
  [
    'Nested 2-level',
    splitNode(1, 0, [
      leafNode(1),
      splitNode(1, 1, [leafNode(1), leafNode(2)]),
    ]),
    '44851',
  ],
  [
    '2-split edge 0 [Ext1, Ext2, default]',
    splitNode(2, 0, [leafNode(1), leafNode(2), leafNode(0)]),
    '4802',
  ],
  [
    '2-split edge 1 [Ext1, Ext2, default]',
    splitNode(2, 1, [leafNode(1), leafNode(2), leafNode(0)]),
    '4806',
  ],
  [
    '2-split edge 2 [Ext1, Ext2, default]',
    splitNode(2, 2, [leafNode(1), leafNode(2), leafNode(0)]),
    '480A',
  ],
  [
    '3-split [Ext1, Ext2, default, Ext1]',
    splitNode(3, 0, [leafNode(1), leafNode(2), leafNode(0), leafNode(1)]),
    '48043',
  ],
];

describe('encodeBisectionTree', () => {
  it.each(WORKED_EXAMPLES)('%s → %s', (_desc, tree, expectedHex) => {
    expect(encodeBisectionTree(tree)).toBe(expectedHex);
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(
    'extended state %d produces 2 hex chars',
    (state) => {
      const hex = encodeBisectionTree(leafNode(state));
      expect(hex.length).toBe(2);
      expect(hex[1]).toBe('C'); // sentinel is rightmost in reversed string
    },
  );

  it.each([0, 1, 2])('edge index %d encodes correctly', (edge) => {
    const hex = encodeBisectionTree(splitNode(1, edge, [leafNode(0), leafNode(0)]));
    const rootNibble = parseInt(hex[hex.length - 1], 16);
    expect(rootNibble).toBe((edge << 2) | 1);
  });
});

describe('decodeBisectionTree', () => {
  it.each(WORKED_EXAMPLES)('%s from %s', (_desc, expectedTree, hex) => {
    expect(equalNodes(decodeBisectionTree(hex), expectedTree)).toBe(true);
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])(
    'extended state %d round-trips',
    (state) => {
      const hex = encodeBisectionTree(leafNode(state));
      expect(equalNodes(decodeBisectionTree(hex), leafNode(state))).toBe(true);
    },
  );

  it('rejects empty string', () => {
    expect(() => decodeBisectionTree('')).toThrow('Empty');
  });

  it('rejects trailing data', () => {
    expect(() => decodeBisectionTree('40')).toThrow('Trailing');
  });
});

describe('bisection round-trip', () => {
  it.each(WORKED_EXAMPLES)('%s encode→decode', (_desc, tree, _hex) => {
    expect(equalNodes(decodeBisectionTree(encodeBisectionTree(tree)), tree)).toBe(true);
  });

  it.each(WORKED_EXAMPLES)('%s decode→encode', (_desc, _tree, hex) => {
    expect(encodeBisectionTree(decodeBisectionTree(hex))).toBe(hex);
  });

  it('deep nested round-trip', () => {
    const tree = splitNode(1, 2, [
      splitNode(1, 0, [leafNode(0), leafNode(5)]),
      splitNode(1, 1, [leafNode(1), leafNode(2)]),
    ]);
    const hex = encodeBisectionTree(tree);
    expect(equalNodes(decodeBisectionTree(hex), tree)).toBe(true);
  });
});
