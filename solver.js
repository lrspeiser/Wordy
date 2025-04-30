/*******************************************************
 * crossword_5x5_solver.js
 * 
 * COMPLETE STANDALONE SCRIPT WITH PROGRESS LOGGING:
 *  1) Reads "filtered_words.txt" and extracts 5-letter words.
 *  2) Precomputes a pairwise compatibility table.
 *  3) Runs a backtracking solver to find a 5x5 crossword
 *     arrangement of 5 distinct row words and 5 distinct
 *     column words that match letter by letter.
 *  4) Logs the result.
 *  5) Includes a 'once-every-N' console log to show progress.
 *******************************************************/

const fs = require('fs').promises;

/*******************************************************
 * USER SETTINGS FOR LOGGING
 *******************************************************/
// If your backtracking tries many candidates, you can control
// how often to log a short message. 
// e.g. once every 10,000 attempts:
const LOG_EVERY_N = 10000;

/*******************************************************
 * 1. WORD TRANSFORM
 *    - Convert letters 'a'..'z' to 0..25 for fast matching
 *******************************************************/
function wordToNumericArray(word) {
  // Maps each letter 'a'..'z' to 0..25.
  const base = 'a'.charCodeAt(0);
  const arr = [];
  for (let i = 0; i < word.length; i++) {
    arr.push(word.charCodeAt(i) - base);
  }
  return arr;
}

function numericArrayToWord(arr) {
  // Convert back from [0..25] to letters for debugging.
  const base = 'a'.charCodeAt(0);
  return arr.map(num => String.fromCharCode(base + num)).join('');
}

/*******************************************************
 * 2. PAIRWISE COMPATIBILITY
 *    - Build a table indicating which letters line up
 *******************************************************/
function buildCompatibilityTable(numericWords) {
  /*
    compatTable[i][j] will be a 5x5 boolean matrix:

    compatTable[i][j][r][c] = true if and only if
      numericWords[i][c] === numericWords[j][r].

    Interpreting:
     - numericWords[i] is the "row" word
     - numericWords[j] is the "column" word
     - If row i's c-th letter must match col j's r-th letter,
       we set matrix[r][c] = true if they match, false otherwise.
  */
  console.log("[Compat] Building pairwise table...");
  const N = numericWords.length;

  // We'll create an NxN array of 5x5 sub-arrays (boolean).
  const compatTable = new Array(N);

  for (let i = 0; i < N; i++) {
    compatTable[i] = new Array(N);
    for (let j = 0; j < N; j++) {
      // 5x5 matrix of booleans:
      const matrix = Array.from({ length: 5 }, () => Array(5).fill(false));
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          matrix[r][c] = (numericWords[i][c] === numericWords[j][r]);
        }
      }
      compatTable[i][j] = matrix;
    }
    // Optional: Log progress if big
    if (i % 500 === 0 && i > 0) {
      console.log(`[Compat] Processed row ${i} of ${N}`);
    }
  }

  console.log("[Compat] Done building table.");
  return compatTable;
}

/*******************************************************
 * 3. BACKTRACKING SOLVER FOR 5x5
 *    - We want rowWords[0..4] and colWords[0..4]
 *    - With minimal console spam
 *******************************************************/
function solveCrossword5x5(fiveLetterWords) {
  console.log("[Solver] Preparing data for 5x5 solver...");

  // 1) Convert all words to numeric arrays
  const numericWords = fiveLetterWords.map(w => wordToNumericArray(w));

  // 2) Build the big compatibility table
  const compatTable = buildCompatibilityTable(numericWords);

  // We'll store the chosen indices for each row & column:
  const rows = Array(5).fill(-1); // each will be an index in [0..numericWords.length-1]
  const cols = Array(5).fill(-1);
  // A set to ensure we pick distinct words:
  const used = new Set();

  let foundSolution = null; // We'll store the solution object here if found

  // We'll track how many total attempts we've made in backtracking:
  let attemptCounter = 0;

  // Helper to check row candidate vs already chosen columns
  function isCompatibleRow(rowIndex, candidateWordIndex) {
    for (let c = 0; c < 5; c++) {
      if (cols[c] === -1) continue; // not chosen yet, skip
      if (!compatTable[candidateWordIndex][cols[c]][rowIndex][c]) {
        return false;
      }
    }
    return true;
  }

  // Helper to check column candidate vs already chosen rows
  function isCompatibleCol(colIndex, candidateWordIndex) {
    for (let r = 0; r < 5; r++) {
      if (rows[r] === -1) continue; // not chosen yet
      if (!compatTable[rows[r]][candidateWordIndex][r][colIndex]) {
        return false;
      }
    }
    return true;
  }

  // The backtracking function:
  // We'll fill row0..row4 first, then col0..col4 => total 10 steps
  function backtrack(step = 0) {
    // For each recursive call, we may attempt multiple candidates:
    // Each attempt is a "try" of a candidate in a slot, so let's
    // increment in the candidate loops below.

    if (step === 10) {
      // All 5 rows & 5 cols assigned
      foundSolution = {
        rows: rows.map(idx => fiveLetterWords[idx]),
        cols: cols.map(idx => fiveLetterWords[idx]),
      };
      return true; // success
    }

    if (step < 5) {
      // Fill row # step
      const rowIndex = step;
      for (let candidate = 0; candidate < numericWords.length; candidate++) {
        attemptCounter++;

        // Log progress every LOG_EVERY_N attempts
        if (attemptCounter % LOG_EVERY_N === 0) {
          console.log(`[Solver] Attempt #${attemptCounter}, step=${step} (Row ${rowIndex}), candidateIdx=${candidate}`);
        }

        if (used.has(candidate)) continue; // must be distinct
        if (isCompatibleRow(rowIndex, candidate)) {
          rows[rowIndex] = candidate;
          used.add(candidate);

          if (backtrack(step + 1)) return true;

          // revert
          rows[rowIndex] = -1;
          used.delete(candidate);
        }
      }
    } else {
      // Fill column #(step - 5)
      const colIndex = step - 5;
      for (let candidate = 0; candidate < numericWords.length; candidate++) {
        attemptCounter++;

        if (attemptCounter % LOG_EVERY_N === 0) {
          console.log(`[Solver] Attempt #${attemptCounter}, step=${step} (Col ${colIndex}), candidateIdx=${candidate}`);
        }

        if (used.has(candidate)) continue;
        if (isCompatibleCol(colIndex, candidate)) {
          cols[colIndex] = candidate;
          used.add(candidate);

          if (backtrack(step + 1)) return true;

          // revert
          cols[colIndex] = -1;
          used.delete(candidate);
        }
      }
    }
    return false; // no solution found with current path
  }

  console.log("[Solver] Starting the backtracking search...");
  backtrack(0);

  if (foundSolution) {
    console.log(`[Solver] Found a solution after ${attemptCounter} total attempts!`);
    return foundSolution;
  } else {
    console.log(`[Solver] No solution found after ${attemptCounter} total attempts.`);
    return null;
  }
}

/*******************************************************
 * 4. MAIN LOGIC
 *    - Load 5-letter words from filtered_words.txt
 *    - Solve
 *******************************************************/
async function loadFiveLetterWords(filename) {
  console.log(`\n[Main] Loading 5-letter words from "${filename}"...`);
  let lines;
  try {
    const data = await fs.readFile(filename, 'utf8');
    lines = data.split('\n');
  } catch (err) {
    console.error("[Main] ERROR reading file:", err);
    return [];
  }

  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Expect each line: WORD FREQUENCY
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) continue;
    const w = parts[0].toLowerCase();
    if (w.length === 5 && /^[a-z]+$/.test(w)) {
      result.push(w);
    }
  }
  console.log(`[Main] Found ${result.length} total 5-letter words in file.`);
  return result;
}

(async function main() {
  try {
    // 1) Load all 5-letter words from your existing file
    const all5Words = await loadFiveLetterWords('filtered_words.txt');

    // Optionally reduce the list to speed up testing:
    // const all5Words = (await loadFiveLetterWords('filtered_words.txt')).slice(0, 500);

    // 2) Solve the crossword
    const solution = solveCrossword5x5(all5Words);

    // 3) If there's a solution, print it in a nice format
    if (solution) {
      const { rows, cols } = solution;
      console.log("\n================ CROSSWORD SOLUTION ================");
      console.log("Row words:", rows);
      console.log("Col words:", cols);
      console.log("====================================================");

      // Optional: Print a grid-like layout
      console.log("\nConstructed grid:\n");
      for (let r = 0; r < 5; r++) {
        let rowStr = "";
        for (let c = 0; c < 5; c++) {
          rowStr += rows[r][c] + " ";
        }
        console.log(rowStr);
      }
      console.log("");
    } else {
      console.log("\n[Main] No 5x5 solution found with these words.");
    }

  } catch (err) {
    console.error("[Main] An unexpected error occurred:", err);
  }
})();
