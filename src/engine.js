export const BOARD_CONFIG = Object.freeze({
  4: { boxRows: 2, boxCols: 2 },
  6: { boxRows: 2, boxCols: 3 },
  9: { boxRows: 3, boxCols: 3 },
});

export const DIFFICULTY_LABELS = Object.freeze({
  easy: "简单",
  medium: "进阶",
  hard: "高级",
});

const REMOVAL_TARGETS = Object.freeze({
  4: { easy: 6, medium: 8, hard: 10 },
  6: { easy: 14, medium: 20, hard: 25 },
  9: { easy: 36, medium: 46, hard: 54 },
});

export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [result[index], result[other]] = [result[other], result[index]];
  }
  return result;
}

export function generateSolvedBoard(size, random = Math.random) {
  const config = BOARD_CONFIG[size];
  if (!config) throw new Error(`Unsupported board size: ${size}`);

  const range = Array.from({ length: size }, (_, index) => index);
  const rows = shuffle(range.slice(0, size / config.boxRows), random)
    .flatMap((band) => shuffle(range.slice(0, config.boxRows), random).map((row) => band * config.boxRows + row));
  const columns = shuffle(range.slice(0, size / config.boxCols), random)
    .flatMap((stack) => shuffle(range.slice(0, config.boxCols), random).map((column) => stack * config.boxCols + column));
  const numbers = shuffle(range.map((value) => value + 1), random);
  const pattern = (row, column) => (config.boxCols * (row % config.boxRows) + Math.floor(row / config.boxRows) + column) % size;

  return rows.flatMap((row) => columns.map((column) => numbers[pattern(row, column)]));
}

function candidatesFor(board, size, index) {
  const { boxRows, boxCols } = BOARD_CONFIG[size];
  const row = Math.floor(index / size);
  const column = index % size;
  const used = new Set();

  for (let step = 0; step < size; step += 1) {
    used.add(board[row * size + step]);
    used.add(board[step * size + column]);
  }

  const boxStartRow = Math.floor(row / boxRows) * boxRows;
  const boxStartColumn = Math.floor(column / boxCols) * boxCols;
  for (let rowOffset = 0; rowOffset < boxRows; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < boxCols; columnOffset += 1) {
      used.add(board[(boxStartRow + rowOffset) * size + boxStartColumn + columnOffset]);
    }
  }

  return Array.from({ length: size }, (_, value) => value + 1).filter((value) => !used.has(value));
}

export function countSolutions(board, size, limit = 2) {
  const working = [...board];
  let solutions = 0;

  function solve() {
    if (solutions >= limit) return;

    let bestIndex = -1;
    let bestCandidates = null;
    for (let index = 0; index < working.length; index += 1) {
      if (working[index] !== 0) continue;
      const options = candidatesFor(working, size, index);
      if (options.length === 0) return;
      if (!bestCandidates || options.length < bestCandidates.length) {
        bestIndex = index;
        bestCandidates = options;
        if (options.length === 1) break;
      }
    }

    if (bestIndex === -1) {
      solutions += 1;
      return;
    }

    for (const value of bestCandidates) {
      working[bestIndex] = value;
      solve();
      working[bestIndex] = 0;
      if (solutions >= limit) return;
    }
  }

  solve();
  return solutions;
}

export function generatePuzzle(size = 9, difficulty = "medium", random = Math.random) {
  if (!REMOVAL_TARGETS[size]?.[difficulty]) throw new Error("Unsupported game configuration");

  const solution = generateSolvedBoard(size, random);
  const puzzle = [...solution];
  const target = REMOVAL_TARGETS[size][difficulty];
  const positions = shuffle(Array.from({ length: size * size }, (_, index) => index), random);
  let removed = 0;

  for (const index of positions) {
    if (removed >= target) break;
    const value = puzzle[index];
    puzzle[index] = 0;
    if (countSolutions(puzzle, size, 2) === 1) {
      removed += 1;
    } else {
      puzzle[index] = value;
    }
  }

  return { puzzle, solution, removed };
}

export function peersFor(index, size) {
  const { boxRows, boxCols } = BOARD_CONFIG[size];
  const row = Math.floor(index / size);
  const column = index % size;
  const peers = new Set();

  for (let step = 0; step < size; step += 1) {
    peers.add(row * size + step);
    peers.add(step * size + column);
  }

  const boxStartRow = Math.floor(row / boxRows) * boxRows;
  const boxStartColumn = Math.floor(column / boxCols) * boxCols;
  for (let rowOffset = 0; rowOffset < boxRows; rowOffset += 1) {
    for (let columnOffset = 0; columnOffset < boxCols; columnOffset += 1) {
      peers.add((boxStartRow + rowOffset) * size + boxStartColumn + columnOffset);
    }
  }

  peers.delete(index);
  return peers;
}

export function isValidSolution(board, size) {
  if (!BOARD_CONFIG[size] || board.length !== size * size || board.some((value) => value < 1 || value > size)) return false;
  const expected = Array.from({ length: size }, (_, index) => index + 1).join(",");
  const { boxRows, boxCols } = BOARD_CONFIG[size];

  for (let row = 0; row < size; row += 1) {
    if ([...board.slice(row * size, row * size + size)].sort((a, b) => a - b).join(",") !== expected) return false;
  }
  for (let column = 0; column < size; column += 1) {
    const values = Array.from({ length: size }, (_, row) => board[row * size + column]).sort((a, b) => a - b);
    if (values.join(",") !== expected) return false;
  }
  for (let startRow = 0; startRow < size; startRow += boxRows) {
    for (let startColumn = 0; startColumn < size; startColumn += boxCols) {
      const values = [];
      for (let row = 0; row < boxRows; row += 1) {
        for (let column = 0; column < boxCols; column += 1) {
          values.push(board[(startRow + row) * size + startColumn + column]);
        }
      }
      if (values.sort((a, b) => a - b).join(",") !== expected) return false;
    }
  }
  return true;
}
