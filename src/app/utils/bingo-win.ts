import type { BingoCellWithDetails } from '../models/types';

const SIZE = 5;

/** Alle 12 klassischen Bingo-Linien als Zellpositionen (5 Reihen, 5 Spalten, 2 Diagonalen). */
const LINES: number[][] = [
  ...Array.from({ length: SIZE }, (_, row) => Array.from({ length: SIZE }, (_, col) => row * SIZE + col)),
  ...Array.from({ length: SIZE }, (_, col) => Array.from({ length: SIZE }, (_, row) => row * SIZE + col)),
  Array.from({ length: SIZE }, (_, i) => i * SIZE + i),
  Array.from({ length: SIZE }, (_, i) => i * SIZE + (SIZE - 1 - i)),
];

export interface BingoWinner {
  profileId: string;
  line: number[] | null; // null = kein Linien-Bingo, sondern Mehrheit (>= 13 von 25)
}

export function checkBingoWinner(cells: BingoCellWithDetails[]): BingoWinner | null {
  const claimedBy = new Map<number, string>();
  for (const cell of cells) {
    if (cell.claimed_by) claimedBy.set(cell.position, cell.claimed_by);
  }

  for (const line of LINES) {
    const owners = line.map((position) => claimedBy.get(position));
    const first = owners[0];
    if (first && owners.every((owner) => owner === first)) {
      return { profileId: first, line };
    }
  }

  const counts = new Map<string, number>();
  for (const profileId of claimedBy.values()) {
    counts.set(profileId, (counts.get(profileId) ?? 0) + 1);
  }
  for (const [profileId, count] of counts) {
    if (count >= 13) {
      return { profileId, line: null };
    }
  }

  return null;
}
