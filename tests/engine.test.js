import test from "node:test";
import assert from "node:assert/strict";
import { countSolutions, generatePuzzle, generateSolvedBoard, isValidSolution, peersFor } from "../src/engine.js";

for (const size of [4, 6, 9]) {
  test(`generates a valid ${size}x${size} solution`, () => {
    const board = generateSolvedBoard(size);
    assert.equal(isValidSolution(board, size), true);
  });

  for (const difficulty of ["easy", "medium", "hard"]) {
    test(`generates a unique ${size}x${size} ${difficulty} puzzle`, () => {
      const { puzzle, solution, removed } = generatePuzzle(size, difficulty);
      assert.equal(isValidSolution(solution, size), true);
      assert.equal(countSolutions(puzzle, size), 1);
      assert.ok(removed > 0);
      puzzle.forEach((value, index) => {
        if (value) assert.equal(value, solution[index]);
      });
    });
  }
}

test("peer lookup includes row, column, and box without the cell itself", () => {
  const peers = peersFor(0, 9);
  assert.equal(peers.has(0), false);
  assert.equal(peers.has(1), true);
  assert.equal(peers.has(9), true);
  assert.equal(peers.has(10), true);
  assert.equal(peers.has(40), false);
});
