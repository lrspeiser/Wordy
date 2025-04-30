/********************************************************
 * 3solver.js
 *
 * A two-phase crossword solver for a 5×5:
 *  1) Build all 3-letter prefixes from the dictionary 
 *     and map them to the 5-letter words that start with
 *     those 3 letters. (prefix -> [fullWords]).
 *  2) Phase 1: Fill a 5×3 partial grid row by row, 
 *     making sure columns 0..2 remain valid 3-letter prefixes.
 *  3) Phase 2: Extend each row's 3-letter prefix to a 
 *     5-letter word, ensuring final columns remain valid 
 *     5-letter words from the dictionary.
 *
 * Usage:
 *   node partial_3then2_solver.js
 * 
 * Expects a file "filtered_words.txt" with lines like:
 *   hello 123.45
 *   track 678.90
 * etc. 
 *******************************************************/
const fs = require('fs').promises;

// --------------------- GLOBALS / CONFIG ---------------------
// If your dictionary is very large, you might want to 
// limit how many words you allow in the solver:
const MAX_WORDS = 999999;  // set to e.g. 1000 or 500 to reduce search

// If you want a bit of progress logging in the console:
const LOG_EVERY_N_ATTEMPTS = 10000;


// --------------------- LOADING WORDS ------------------------
async function loadFiveLetterWords(filename) {
  console.log(`[Load] Reading file: ${filename} ...`);
  let data;
  try {
    data = await fs.readFile(filename, 'utf8');
  } catch (err) {
    console.error(`[Load] ERROR reading file: ${err.message}`);
    return [];
  }

  const lines = data.split('\n');
  const result = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Each line expected: "word freq"
    // We only care about the word if it's 5 letters a-z
    const parts = trimmed.split(/\s+/);
    if (parts.length < 1) continue;
    const w = parts[0].toLowerCase();
    if (w.length === 5 && /^[a-z]+$/.test(w)) {
      result.push(w);
    }
  }

  // Possibly limit the word list:
  if (result.length > MAX_WORDS) {
    console.log(`[Load] Found ${result.length} 5-letter words. Truncating to first ${MAX_WORDS}.`);
    result.length = MAX_WORDS;
  } else {
    console.log(`[Load] Found ${result.length} 5-letter words.`);
  }
  return result;
}


// --------------------- BUILD PREFIX MAP ----------------------
function buildPrefixData(words5) {
  // We want:
  //   prefixMap:  { 'abc': ['abcde','abcrate','abchh'], ... }
  //   prefixSet:  Set of all 3-letter prefixes (for quick checking in columns)
  // 
  // For each 5-letter word:
  //   prefix = word.slice(0,3)
  //   prefixMap[prefix] = prefixMap[prefix] || []
  //   prefixMap[prefix].push(word)
  // 
  // Also store prefix in a separate set "prefixSet" so we can quickly check
  // if a 3-letter combination is valid for columns.

  const prefixMap = {};
  const prefixSet = new Set();

  for (const w of words5) {
    const pref = w.slice(0, 3); // first 3 letters
    if (!prefixMap[pref]) {
      prefixMap[pref] = [];
    }
    prefixMap[pref].push(w);
    prefixSet.add(pref);
  }

  console.log(`[PrefixData] Built prefixMap of size ${Object.keys(prefixMap).length} unique 3-letter prefixes.`);
  return { prefixMap, prefixSet };
}


// --------------------- PHASE 1: 3-LETTER PARTIAL FILL ----------------------
/**
 * We want a 5×3 partial grid (5 rows, 3 columns).
 * We'll pick for each row a 3-letter prefix (from prefixMap).
 * We'll store partialGrid[row] as an array of 3 letters.
 * 
 * We must ensure that for each column c, after placing row r, 
 * the partial vertical string (rows 0..r in column c) is 
 * also a valid prefix. 
 *
 * If we fill all 5 rows this way (r=0..4) consistently, 
 * we have a valid partial layout. We'll store it for Phase 2.
 */
function fillPartialGrid3x5(prefixMap, prefixSet) {
  // partialGrid[row][col] => a single letter
  const partialGrid = Array.from({ length: 5 }, () => Array(3).fill(''));
  // track the chosen 3-letter prefix for each row
  const chosenPrefixes = Array(5).fill(null);

  // For convenience, gather all prefix keys in an array:
  const allPrefixes = Object.keys(prefixMap);

  let solutions = [];

  let attemptCounter = 0;

  function backtrack(row) {
    if (row === 5) {
      // We filled all 5 rows in the partial 3-letter sense
      // So partialGrid is consistent.
      // We store a copy to solutions.
      // But we might only need the first solution. Or we store them all.
      // Let's store them all for demonstration.
      const copyGrid = partialGrid.map(r => r.slice());
      const copyPrefixes = chosenPrefixes.slice();
      solutions.push({ grid3: copyGrid, rowPrefixes: copyPrefixes });
      return;
    }

    // Try each known 3-letter prefix
    for (const pref of allPrefixes) {
      attemptCounter++;
      if (attemptCounter % LOG_EVERY_N_ATTEMPTS === 0) {
        console.log(`[Phase1] Attempt #${attemptCounter}, row=${row}, prefix=${pref}`);
      }

      // Place these 3 letters in partialGrid[row]
      partialGrid[row][0] = pref[0];
      partialGrid[row][1] = pref[1];
      partialGrid[row][2] = pref[2];
      chosenPrefixes[row] = pref;

      // Check columns so far
      // For each col c in [0..2], build up the vertical string from row0..row
      // and see if it's in prefixSet
      let valid = true;
      for (let c = 0; c < 3; c++) {
        let colString = '';
        for (let r = 0; r <= row; r++) {
          colString += partialGrid[r][c];
        }
        // If colString length < 3, we just need to see if there's
        // any prefix of length colString that's possible. 
        // But we're specifically storing only 3-letter prefixes in prefixSet.
        // So we do partial checking: 
        // 
        // Two ways:
        //  (A) We can store prefixSet for all lengths from 1 to 3. 
        //       Then check if colString is a prefix. 
        //  (B) Or only check the 3-letter column prefix once row=2 or more. 
        // For simplicity, let's require row >= 2 to check a full 3-letter prefix.
        // Before row=2, we skip the check or do a "sub-prefix" check if we build a bigger DAWG.
        // 
        // We'll do approach (B) below:

        if (row >= 2) {
          // now we have at least 3 letters in that column
          const colPrefix3 = colString.slice(-3); // last 3 letters
          if (!prefixSet.has(colPrefix3)) {
            valid = false;
            break;
          }
        }
      }

      if (valid) {
        // Recurse for the next row
        backtrack(row + 1);
      }
      // revert is not strictly needed, as we overwrite partialGrid[row] each time
    }
  }

  console.log("[Phase1] Starting partial fill (5×3)...");
  backtrack(0);
  console.log(`[Phase1] Completed partial fill. Found ${solutions.length} valid 3-letter partial solutions.`);

  return solutions;
}


// --------------------- PHASE 2: EXTEND TO FULL 5 LETTERS --------------------
/**
 * Now, for each partial 3×5 solution, we have rowPrefixes[r], 
 * which is a 3-letter prefix. We can only extend row r 
 * to a 5-letter word from prefixMap[rowPrefixes[r]] 
 * (the array of 5-letter words that start with that prefix).
 * 
 * We'll do a backtracking from row0..row4. For each row, pick 
 * which 5-letter word from that prefix's list we use, place 
 * letters 3 and 4 in the grid, and check columns. 
 * 
 * Then after all rows are placed, we verify that each column is 
 * also a valid 5-letter word from the dictionary. 
 */

function extendTo5Letters(partialSolution, prefixMap, wordsSet) {
  // partialSolution.grid3 is a 5×3 array of letters
  // partialSolution.rowPrefixes is an array of 5 strings of length 3

  // We'll build a finalGrid 5×5, copy the first 3 columns from partialSolution.grid3.
  const finalGrid = Array.from({ length: 5 }, () => Array(5).fill(''));

  // Copy the 3-letter portion
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 3; c++) {
      finalGrid[r][c] = partialSolution.grid3[r][c];
    }
  }

  // We'll store the chosen full word for each row
  const chosenWords = Array(5).fill(null);

  let foundSolutions = [];

  let attemptCount = 0;

  function backtrackRow(row) {
    if (row === 5) {
      // All 5 rows are extended to 5 letters
      // Check if each column is a valid 5-letter word in the dictionary
      // Build each column's string
      for (let c = 0; c < 5; c++) {
        let colString = '';
        for (let r = 0; r < 5; r++) {
          colString += finalGrid[r][c];
        }
        if (!wordsSet.has(colString)) {
          // column c is not a valid 5-letter word => fail
          return;
        }
      }
      // If we reach here, columns are also valid
      // We have a fully consistent 5x5 solution
      // Save a copy
      const solutionCopy = finalGrid.map(rowArr => rowArr.join(''));
      const rowWordsCopy = chosenWords.slice();
      foundSolutions.push({ grid: solutionCopy, rowWords: rowWordsCopy });
      return;
    }

    // For this row, get the 3-letter prefix
    const prefix3 = partialSolution.rowPrefixes[row];
    // All possible 5-letter completions for that prefix
    const candidates = prefixMap[prefix3] || []; 
    // e.g. ["trace", "track", "trawl", ...] if prefix3 = "tra"

    for (const fullWord of candidates) {
      attemptCount++;
      if (attemptCount % LOG_EVERY_N_ATTEMPTS === 0) {
        console.log(`[Phase2] Attempt #${attemptCount}, row=${row}, word=${fullWord}`);
      }

      // Place letters 3 and 4 (indexes 3,4) into the finalGrid
      finalGrid[row][3] = fullWord[3];
      finalGrid[row][4] = fullWord[4];
      chosenWords[row] = fullWord;

      // Check partial column constraints so far for columns 3 and 4:
      // We'll do a partial check row-by-row:
      //   for each newly placed column col in [3,4], 
      //   build the vertical string from row0..row
      //   see if it's still a prefix of some 5-letter word 
      //   (or if row < 4, we only have partial; if row=4, we have a 5-letter column).
      // 
      // We can do a partial prefix check if we stored prefixSet of length 1..5, 
      // but for simplicity, we do a minimal check: if row<4, we skip the final check 
      // (just assume we might find a column word). If row=4, column is complete 
      // => must be a valid 5-letter word in wordsSet.

      let valid = true;
      for (let c = 3; c < 5; c++) {
        // build partial column from row0..row
        let colString = '';
        for (let rr = 0; rr <= row; rr++) {
          colString += finalGrid[rr][c];
        }
        if (row < 4) {
          // We have a partial column colString of length row+1 in [1..4].
          // We can't fully confirm it's a 5-letter word yet. 
          // If we wanted a full prefix check, we'd need a DAWG or
          // prefixMap for partial columns. Let's skip that for brevity.
          // We only do a final check once row=4.
        } else {
          // row=4 => we have a full 5 letters in this column
          if (!wordsSet.has(colString)) {
            valid = false;
            break;
          }
        }
      }
      if (!valid) {
        continue; // skip this candidate
      }

      // If still valid, go to the next row
      backtrackRow(row + 1);
    }
  }

  backtrackRow(0);
  return foundSolutions;
}


// --------------------- MAIN "3-THEN-2" SOLVER -----------------------------
async function solveCrossword3plus2() {
  // 1) Load the 5-letter dictionary
  const all5Words = await loadFiveLetterWords('filtered_words.txt');
  if (all5Words.length === 0) {
    console.error("[Main] No 5-letter words loaded. Aborting.");
    return;
  }

  // Also build a quick set of full words for final column checks
  const wordsSet = new Set(all5Words);

  // 2) Build prefix data (3-letter => array of full 5-letter words)
  const { prefixMap, prefixSet } = buildPrefixData(all5Words);

  // 3) Phase 1: Fill the 5×3 partial grid
  console.log("\n[Main] --- PHASE 1: 3-letter partial fill ---");
  const partialSolutions = fillPartialGrid3x5(prefixMap, prefixSet);
  if (partialSolutions.length === 0) {
    console.log("[Main] No 3-letter partial solutions found. No 5×5 puzzle possible (with this approach).");
    return;
  }
  console.log(`[Main] Found ${partialSolutions.length} partial solutions. Proceeding to Phase 2...`);

  // 4) Phase 2: Extend each partial solution to full 5×5
  //    We'll collect final solutions in an array
  let allFinalSolutions = [];
  let solCount = 0;

  for (const psol of partialSolutions) {
    const extendedSolutions = extendTo5Letters(psol, prefixMap, wordsSet);
    solCount += extendedSolutions.length;
    allFinalSolutions.push(...extendedSolutions);
  }

  // 5) Print the result
  console.log(`\n[Main] PHASE 2 complete. Found ${solCount} full solutions total.`);

  if (solCount > 0) {
    // Print at least one solution
    const firstSol = allFinalSolutions[0];
    console.log("\n=== EXAMPLE SOLUTION (first) ===");
    for (let r = 0; r < 5; r++) {
      console.log(firstSol.grid[r]);
    }
    console.log("===============================");
    console.log("Row words:", firstSol.rowWords);
  } else {
    console.log("[Main] No valid 5×5 solutions after extension.");
  }
}


// --------------------- RUN IT -----------------------------
solveCrossword3plus2()
  .then(() => {
    console.log("[Main] Done.");
  })
  .catch(err => {
    console.error("[Main] Uncaught Error:", err);
  });
