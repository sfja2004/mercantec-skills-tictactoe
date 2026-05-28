import type { Symbol } from "./protocol";

type Coord = { x: number; y: number };

const DIRS: Coord[] = [
    { x: 1, y: 0 }, // horizontal
    { x: 0, y: 1 }, // vertical
    { x: 1, y: 1 }, // diag down-right
    { x: 1, y: -1 }, // diag up-right
];

function key(x: number, y: number): string {
    return `${x},${y}`;
}

// Scan the 4 axes through (x,y) for a run of `winLength` of the same symbol.
// Returns the winning line or null. O(winLength) per call.
export function findWinLine(
    board: Map<string, Symbol>,
    x: number,
    y: number,
    symbol: Symbol,
    winLength: number,
): Coord[] | null {
    for (const d of DIRS) {
        const line: Coord[] = [{ x, y }];
        // walk forward
        for (let i = 1; i < winLength; i++) {
            const nx = x + d.x * i;
            const ny = y + d.y * i;
            if (board.get(key(nx, ny)) !== symbol) break;
            line.push({ x: nx, y: ny });
        }
        // walk backward
        for (let i = 1; i < winLength; i++) {
            const nx = x - d.x * i;
            const ny = y - d.y * i;
            if (board.get(key(nx, ny)) !== symbol) break;
            line.unshift({ x: nx, y: ny });
        }
        if (line.length >= winLength) return line.slice(0, winLength);
    }
    return null;
}
