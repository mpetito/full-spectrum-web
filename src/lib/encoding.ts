/** Filament hex encode/decode for 3MF per-triangle attributes. */

export const MAX_FILAMENTS = 10;

export const FILAMENT_HEX_TABLE: Record<number, string> = {
    1: '4', 2: '8', 3: '0C', 4: '1C', 5: '2C',
    6: '3C', 7: '4C', 8: '5C', 9: '6C', 10: '7C',
};

export const HEX_FILAMENT_TABLE: Record<string, number> = Object.fromEntries(
    Object.entries(FILAMENT_HEX_TABLE).map(([k, v]) => [v.toUpperCase(), Number(k)]),
);

export function hexToFilament(hexStr: string): number {
    const normalized = hexStr.trim().toUpperCase();
    if (normalized.length > 2) {
        throw new Error(`Sub-painted triangle detected: '${hexStr}'`);
    }
    const filament = HEX_FILAMENT_TABLE[normalized];
    if (filament === undefined) {
        throw new Error(`Invalid filament hex code: '${hexStr}'`);
    }
    return filament;
}

export function filamentToHex(filament: number): string {
    const hexStr = FILAMENT_HEX_TABLE[filament];
    if (hexStr === undefined) {
        throw new Error(`Filament index ${filament} out of range (must be 1–10)`);
    }
    return hexStr;
}

export function isSubPainted(hexStr: string): boolean {
    return hexStr.trim().length > 2;
}

// Bisection tree data structures

export interface LeafNode {
    kind: 'leaf';
    state: number; // 0–15
}

export interface SplitNode {
    kind: 'split';
    splitSides: number;
    specialSide: number; // 0–2
    children: BisectionNode[];
}

export type BisectionNode = LeafNode | SplitNode;

export function leafNode(state: number): LeafNode {
    if (state < 0 || state > 15) {
        throw new Error(`LeafNode state must be 0–15, got ${state}`);
    }
    return { kind: 'leaf', state };
}

export function splitNode(splitSides: number, specialSide: number, children: BisectionNode[]): SplitNode {
    if (specialSide !== 0 && specialSide !== 1 && specialSide !== 2) {
        throw new Error(`SplitNode special_side must be 0–2, got ${specialSide}`);
    }
    const expected = splitSides + 1;
    if (children.length !== expected) {
        throw new Error(`SplitNode with split_sides=${splitSides} expects ${expected} children, got ${children.length}`);
    }
    return { kind: 'split', splitSides, specialSide, children };
}

function collectNibbles(node: BisectionNode, nibbles: number[]): void {
    if (node.kind === 'leaf') {
        if (node.state <= 2) {
            nibbles.push(node.state << 2);
        } else {
            nibbles.push(0xC);
            nibbles.push(node.state - 3);
        }
    } else if (node.kind === 'split') {
        nibbles.push((node.specialSide << 2) | node.splitSides);
        for (let i = node.children.length - 1; i >= 0; i--) {
            collectNibbles(node.children[i], nibbles);
        }
    } else {
        throw new TypeError(`Unknown node type: ${(node as Record<string, unknown>).kind}`);
    }
}

const HEX_CHARS = '0123456789ABCDEF';

export function encodeBisectionTree(node: BisectionNode): string {
    const nibbles: number[] = [];
    collectNibbles(node, nibbles);
    const chars: string[] = [];
    for (let i = nibbles.length - 1; i >= 0; i--) {
        chars.push(HEX_CHARS[nibbles[i]]);
    }
    return chars.join('');
}

export function decodeBisectionTree(hexStr: string): BisectionNode {
    if (!hexStr) {
        throw new Error('Empty hex string');
    }
    const chars = hexStr.toUpperCase().split('');
    let pos = chars.length - 1;
    // Max recursion depth (actual tree depth), not total node count.
    // Depth 20 allows trees with up to 3^20 ≈ 3.5 billion leaves.
    const maxRecursionDepth = 20;

    function read(depth: number): BisectionNode {
        if (depth > maxRecursionDepth) {
            throw new Error(`Tree too deep (>${maxRecursionDepth}); possibly malformed input`);
        }
        if (pos < 0) {
            throw new Error('Unexpected end of hex string while decoding');
        }
        const nibble = parseInt(chars[pos], 16);
        pos -= 1;
        const yy = nibble & 0x03;
        const xx = (nibble >> 2) & 0x03;
        if (yy === 0) {
            if (xx === 3) {
                if (pos < 0) {
                    throw new Error('Unexpected end of hex string reading extended state');
                }
                const extNibble = parseInt(chars[pos], 16);
                pos -= 1;
                return leafNode(extNibble + 3);
            }
            return leafNode(xx);
        }
        const splitSidesVal = yy;
        const specialSideVal = xx;
        const numChildren = splitSidesVal + 1;
        const children: BisectionNode[] = [];
        for (let i = 0; i < numChildren; i++) {
            children.push(read(depth + 1));
        }
        children.reverse();
        return splitNode(splitSidesVal, specialSideVal, children);
    }

    const root = read(0);
    if (pos >= 0) {
        throw new Error(`Trailing data after decoding: ${hexStr.slice(0, pos + 1)}`);
    }
    return root;
}

export function equalNodes(a: BisectionNode, b: BisectionNode): boolean {
    if (a.kind !== b.kind) return false;
    if (a.kind === 'leaf' && b.kind === 'leaf') {
        return a.state === b.state;
    }
    if (a.kind === 'split' && b.kind === 'split') {
        if (a.splitSides !== b.splitSides) return false;
        if (a.specialSide !== b.specialSide) return false;
        if (a.children.length !== b.children.length) return false;
        for (let i = 0; i < a.children.length; i++) {
            if (!equalNodes(a.children[i], b.children[i])) return false;
        }
        return true;
    }
    return false;
}
