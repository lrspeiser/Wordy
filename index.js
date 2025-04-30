const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const { performance } = require('perf_hooks'); // For timing

// If using dotenv, make sure it's configured here:
// require('dotenv').config();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4.1"; // You must not change this from gpt-4.1 which is the model that just came out in April 2025

console.log("Checking API Key Presence:", !!OPENAI_API_KEY);
if (!OPENAI_API_KEY) {
    console.error("FATAL ERROR: OPENAI_API_KEY environment variable is not set!");
}

// --- generateClue Function (using stricter prompt) ---
async function generateClue(word) {
  if (!word || typeof word !== 'string' || word.trim().length === 0) { console.error('generateClue called with invalid word:', word); return `Invalid word provided`; }
  if (!OPENAI_API_KEY) { console.error("Cannot call generateClue: API Key is missing."); return "API Key Missing"; }
  console.log(`Requesting clue for: ${word}`);
  try {
    const promptContent = `Generate ONLY the crossword puzzle clue text for the word "${word}". The clue should be short, clever, suitable for high schoolers (understandable references, educational nature), and directly usable in a puzzle list. Do not include quotation marks, prefixes like 'Clue:', or any text other than the clue itself.`;
    const response = await axios.post(OPENAI_API_URL,
      { model: OPENAI_MODEL, messages: [{ role: "user", content: promptContent }], temperature: 0.7 },
      { headers: { 'Authorization': `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' }, timeout: 20000 }
    );
    if (response.data?.choices?.[0]?.message?.content) {
        let clue = response.data.choices[0].message.content.trim();
        if (clue.startsWith('"') && clue.endsWith('"')) { clue = clue.substring(1, clue.length - 1); }
        if (clue.toLowerCase().startsWith('clue: ')) { clue = clue.substring(6); }
        console.log(`Received clue for '${word}': ${clue}`); return clue;
    } else { console.error(`Unexpected response structure from OpenAI for '${word}':`, JSON.stringify(response.data, null, 2)); return `Clue for ${word}`; }
  } catch (error) {
    let errorMsg = `Clue for ${word}`;
    if (error.response) { console.error(`Error generating clue for "${word}" - Status:`, error.response.status); console.error(`Error generating clue for "${word}" - API Response Data:`, JSON.stringify(error.response.data, null, 2)); errorMsg = `API Error for ${word} (${error.response.status})`; }
    else if (error.request) { console.error(`Error generating clue for "${word}" - No response received:`, error.request); errorMsg = `No response for ${word}`; }
    else if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) { console.error(`Error generating clue for "${word}": Axios request timed out.`); errorMsg = `Timeout fetching clue for ${word}`; }
    else { console.error(`Error generating clue for "${word}" - Request setup error:`, error.message); errorMsg = `Setup error for ${word}`; }
    console.error(`Returning fallback/error clue for '${word}': ${errorMsg}`); return errorMsg;
  }
}
// --- End generateClue ---

const app = express();
app.use(cors()); app.use(express.json()); app.use(express.static('public'));

// --- Structure to hold words by length ---
let wordsByLength = { 4: [], 5: [], 6: [], 7: [] };
// --- End Structure ---

// --- fetchWords Function (using debug version from previous step) ---
async function fetchWords() {
    wordsByLength = { 4: [], 5: [], 6: [], 7: [] }; // Reset
    const filesToLoad = { 'words.txt': [4], 'words-5-7.txt': [5, 6, 7] };
    let totalLoaded = 0;
    for (const filename in filesToLoad) {
        const expectedLengths = filesToLoad[filename]; let fileReadSuccess = false;
        try {
            console.log(`\n[FETCH DEBUG] Attempting to load words from ${filename}...`);
            const data = await fs.promises.readFile(filename, 'utf8'); fileReadSuccess = true;
            console.log(`[FETCH DEBUG] Successfully read ${filename}. Processing lines...`);
            const lines = data.split('\n'); let countInFile = 0; let processedLines = 0;
            lines.forEach(line => {
                processedLines++; const originalLine = line; const word = line.trim().toLowerCase(); const len = word.length;
                const isAlpha = /^[a-z]+$/.test(word); const isExpectedLength = expectedLengths.includes(len); const hasLengthArray = wordsByLength[len];
                // Optional: Reduce logging noise by commenting this out
                // if (filename === 'words-5-7.txt') { console.log(`  [DEBUG ${filename}] Line ${processedLines}: "${originalLine}" -> Trimmed/Lower: "${word}" (Len: ${len}) | IsAlpha: ${isAlpha} | IsExpectedLen (${expectedLengths.join(',')})? ${isExpectedLength} | TargetArrayExists? ${!!hasLengthArray}`); }
                if (len > 0 && isAlpha && isExpectedLength && hasLengthArray) {
                    wordsByLength[len].push(word); countInFile++;
                    // if (filename === 'words-5-7.txt') { console.log(`    -> ADDED word "${word}" to length ${len}`); } // Optional
                }
                // else if (filename === 'words-5-7.txt' && len > 0 && !isAlpha && isExpectedLength && hasLengthArray) { console.log(`    -> SKIPPED word "${word}" (from line "${originalLine}"): Failed alpha check.`); } // Optional
                // else if (filename === 'words-5-7.txt' && len > 0 && isAlpha && !isExpectedLength && wordsByLength[len]){ console.log(`    -> SKIPPED word "${word}" (from line "${originalLine}"): Length ${len} not expected in ${filename}.`); } // Optional
            });
            console.log(`[FETCH DEBUG] Finished processing ${filename}. Loaded ${countInFile} valid words from ${lines.length} lines.`);
            totalLoaded += countInFile;
        } catch (error) { console.error(`[FETCH DEBUG] Error reading words file "${filename}":`, error.message); if (filename === 'words-5-7.txt') { console.error(`[FETCH DEBUG] CRITICAL FAILURE: Could not read or process ${filename}.`); } }
        if (!fileReadSuccess && filename === 'words-5-7.txt') { console.error(`[FETCH DEBUG] CONFIRMED: Failed to read ${filename} entirely.`); }
    }
    console.log(`\n[FETCH DEBUG] Total valid words loaded across all files: ${totalLoaded}`);
    console.log("[FETCH DEBUG] Final word counts by length:");
    for (const len in wordsByLength) { console.log(`  Length ${len}: ${wordsByLength[len].length} words`); if ([4, 5, 6].includes(parseInt(len)) && wordsByLength[len].length === 0) { console.warn(`  WARNING: No words of length ${len} loaded.`); } }
}
// --- End fetchWords ---

// --- getMatchingWords Function (remains the same) ---
function getMatchingWords(pattern, availableWords, usedWordsSet) {
    const patternLength = pattern.length;
    if (!Array.isArray(availableWords) || availableWords.length === 0) { return []; }
    return availableWords.filter(word => {
      if (typeof word !== 'string' || word.length !== patternLength) return false;
      if (usedWordsSet && usedWordsSet.has(word)) return false;
      for (let i = 0; i < patternLength; i++) { if (pattern[i] !== '' && pattern[i] !== word[i]) return false; }
      return true;
    });
}
// --- End getMatchingWords ---

// --- isValid Function (using wordsByLength, with debug logging) ---
function isValid(row, col, word, isAcross, currentGrid, usedWordsSet) {
    const size = currentGrid.length; const wordListForSize = wordsByLength[size] || [];
    console.log(`  isValid CHECK: Trying word='${word}', start=[${row},${col}], isAcross=${isAcross}`); // DEBUG

    for (let i = 0; i < size; i++) { const charToPlace = word[i]; let r = isAcross ? row : row + i; let c = isAcross ? col + i : col; if (r < 0 || r >= size || c < 0 || c >= size) return false; if (currentGrid[r][c] !== '' && currentGrid[r][c] !== charToPlace) { console.log(`    isValid FAIL: Conflict at [${r},${c}] (grid='${currentGrid[r][c]}', word='${charToPlace}')`); return false; } } // DEBUG
    let tempGrid = currentGrid.map(r => [...r]);
    for (let i = 0; i < size; i++) { let r = isAcross ? row : row + i; let c = isAcross ? col + i : col; tempGrid[r][c] = word[i]; }
    for (let i = 0; i < size; i++) {
        let r_check = isAcross ? row : row + i; let c_check = isAcross ? col + i : col;
        let crossPattern = Array(size).fill(''); let crossingWordHasContent = false; let isCrossingWordComplete = true;
        let crossDirection = isAcross ? 'DOWN' : 'ACROSS'; let crossIndex = isAcross ? c_check : r_check;
        if (isAcross) { for (let k = 0; k < size; k++) { const char = tempGrid[k][c_check] || ''; crossPattern[k] = char; if (char !== '') crossingWordHasContent = true; else isCrossingWordComplete = false; } }
        else { for (let k = 0; k < size; k++) { const char = tempGrid[r_check][k] || ''; crossPattern[k] = char; if (char !== '') crossingWordHasContent = true; else isCrossingWordComplete = false; } }
        if (crossingWordHasContent) {
            const crossingPatternStr = `[${crossPattern.map(p => p || '_').join(',')}]`; // DEBUG
            console.log(`    isValid CHECK: Crossing ${crossDirection} at index ${crossIndex}. Pattern: ${crossingPatternStr}`); // DEBUG
            const potentialCrossingWords = getMatchingWords(crossPattern, wordListForSize, null); // Check ALL possibilities
            if (potentialCrossingWords.length === 0) {
                 console.log(`    isValid FAIL for '${word}': Crossing ${crossDirection} at ${crossIndex} (pattern: ${crossingPatternStr}) has NO possibilities.`); // DEBUG
                 return false;
            }
            if (isCrossingWordComplete) {
                const completedWord = crossPattern.join('');
                if (!wordListForSize.includes(completedWord)) {
                    console.log(`    isValid FAIL for '${word}': Creates invalid complete crossing ${crossDirection} word '${completedWord}'.`); // DEBUG
                    return false;
                }
            }
        }
    }
    console.log(`  isValid PASS for '${word}'`); // DEBUG
    return true;
}
// --- End isValid ---

// --- findBestSlotToFill Function (remains the same) ---
function findBestSlotToFill(grid, usedWordsAcross, usedWordsDown) {
    const size = grid.length; let bestSlot = null; let maxFilledCount = -1;
    for (let r = 0; r < size; r++) { if (usedWordsAcross[r]) continue; let filledCount = 0; let isEmpty = true; for (let c = 0; c < size; c++) { if (grid[r][c] !== '') { filledCount++; isEmpty = false; } } if (!isEmpty && filledCount < size && filledCount > maxFilledCount) { maxFilledCount = filledCount; bestSlot = { row: r, col: 0, isAcross: true, filledCount: filledCount }; } else if (isEmpty && bestSlot === null) { bestSlot = { row: r, col: 0, isAcross: true, filledCount: 0 }; } }
    for (let c = 0; c < size; c++) { if (usedWordsDown[c]) continue; let filledCount = 0; let isEmpty = true; for (let r = 0; r < size; r++) { if (grid[r][c] !== '') { filledCount++; isEmpty = false; } } if (!isEmpty && filledCount < size && filledCount > maxFilledCount) { maxFilledCount = filledCount; bestSlot = { row: 0, col: c, isAcross: false, filledCount: filledCount }; } else if (isEmpty && bestSlot === null) { bestSlot = { row: 0, col: c, isAcross: false, filledCount: 0 }; } }
    // console.log("[findBestSlot] Best slot found:", bestSlot);
    return bestSlot;
}
// --- End findBestSlotToFill ---

// --- Letter Frequency Scoring (remains the same) ---
const letterScores = { 'e': 12, 't': 9, 'a': 8, 'o': 8, 'i': 7, 'n': 7, 's': 6, 'h': 6, 'r': 6, 'd': 4, 'l': 4, 'c': 3, 'u': 3, 'm': 3, 'w': 2, 'f': 2, 'g': 2, 'y': 2, 'p': 2, 'b': 1, 'v': 1, 'k': 1, 'j': 0, 'x': 0, 'q': 0, 'z': 0 };
function scoreWordBasedOnPattern(word, pattern) { let score = 0; for (let i = 0; i < word.length; i++) { if (pattern[i] === '') { score += (letterScores[word[i]] || 0); } } return score; }
// --- End Letter Frequency Scoring ---

// --- *** SOLVER FUNCTION 1: Linear Backtracking *** ---
function solveLinear(pos, context) {
    if (context.backtrackCount > context.MAX_BACKTRACKS) { throw new Error('MAX_BACKTRACKS_EXCEEDED'); }
    const size = context.grid.length;
    if (pos === size * 2) { return true; }
    const isAcross = pos % 2 === 0; const index = Math.floor(pos / 2);
    const start_row = isAcross ? index : 0; const start_col = isAcross ? 0 : index;
    console.log(`\n--- Linear Attempt ${context.attempt} / Pos ${pos}: Trying ${isAcross ? 'ACROSS' : 'DOWN'} at index ${index} ---`);
    console.log('Current grid state:'); console.log(context.grid.map(r => r.map(c => c || '_').join(' ')).join('\n'));
    let pattern = Array(size).fill('');
    if (isAcross) { for (let i = 0; i < size; i++) pattern[i] = context.grid[index][i] || ''; }
    else { for (let i = 0; i < size; i++) pattern[i] = context.grid[i][index] || ''; }
    console.log(`Pattern: [${pattern.map(p => p || '_').join(', ')}]`);
    const possibleWords = getMatchingWords(pattern, context.availableSizeWords, context.usedWordsSet);
    console.log(`Found ${possibleWords.length} candidates.`);
    let orderedWords;
    if (context.order === 'heuristic') { orderedWords = possibleWords.sort((a, b) => scoreWordBasedOnPattern(b, pattern) - scoreWordBasedOnPattern(a, pattern)); console.log("Top 5 heuristic candidates:", orderedWords.slice(0, 5).map(w => `${w}(${scoreWordBasedOnPattern(w, pattern)})`)); }
    else { orderedWords = possibleWords.sort(() => Math.random() - 0.5); console.log("Top 5 random candidates:", orderedWords.slice(0, 5)); }
    let wordsTried = 0;
    for (const word of orderedWords) {
        if (wordsTried >= context.MAX_CANDIDATES) { console.log(`--- Linear Attempt ${context.attempt} / Pos ${pos}: Tried ${context.MAX_CANDIDATES} words...`); break; }
        wordsTried++; console.log(`  Trying word: '${word}' (${wordsTried}/${context.MAX_CANDIDATES})`); // Log attempt
        const gridBackup = context.grid.map(innerRow => [...innerRow]);
        if (isValid(start_row, start_col, word, isAcross, context.grid, context.usedWordsSet)) {
            if (isAcross) { for (let i = 0; i < size; i++) context.grid[index][i] = word[i]; context.usedWords.across[index] = word; }
            else { for (let i = 0; i < size; i++) context.grid[i][index] = word[i]; context.usedWords.down[index] = word; }
            context.usedWordsSet.add(word);
            if (solveLinear(pos + 1, context)) return true; // RECURSE
            console.log(`\n    🔄 Backtracking (Linear Attempt ${context.attempt} / Pos ${pos}), removing '${word}'`); // Log backtrack
            context.backtrackCount++; console.log(`    (Total Backtracks This Attempt: ${context.backtrackCount})`); // Log count
            context.usedWordsSet.delete(word);
            if (isAcross) context.usedWords.across[index] = null; else context.usedWords.down[index] = null;
            for (let i = 0; i < size; i++) { for (let j = 0; j < size; j++) { context.grid[i][j] = gridBackup[i][j]; } }
            console.log('    Grid restored.'); console.log(context.grid.map(r => r.map(c => c || '_').join(' ')).join('\n')); // Log restore
        }
    }
    console.log(`--- Linear Attempt ${context.attempt} / Pos ${pos}: Failed this position.`); // Log failure
    return false;
}
// --- *** END SOLVER FUNCTION 1 *** ---

// --- *** SOLVER FUNCTION 2: Most Constrained Slot Backtracking *** ---
function solveConstrained(context) {
    if (context.backtrackCount > context.MAX_BACKTRACKS) { throw new Error('MAX_BACKTRACKS_EXCEEDED'); }
    const slotToFill = findBestSlotToFill(context.grid, context.usedWords.across, context.usedWords.down);
    if (slotToFill === null) { console.log("Grid appears full."); return true; } // Base Case
    const size = context.grid.length;
    const { row: startRow, col: startCol, isAcross, filledCount } = slotToFill;
    const index = isAcross ? startRow : startCol;
    console.log(`\n--- Constrained Attempt ${context.attempt} / Slot: Trying ${isAcross ? 'ACROSS' : 'DOWN'} at index ${index} (Constraint: ${filledCount}) ---`);
    console.log('Current grid state:'); console.log(context.grid.map(r => r.map(c => c || '_').join(' ')).join('\n'));
    let pattern = Array(size).fill('');
    if (isAcross) { for (let i = 0; i < size; i++) pattern[i] = context.grid[startRow][i] || ''; }
    else { for (let i = 0; i < size; i++) pattern[i] = context.grid[i][startCol] || ''; }
    console.log(`Pattern: [${pattern.map(p => p || '_').join(', ')}]`);
    const possibleWords = getMatchingWords(pattern, context.availableSizeWords, context.usedWordsSet);
    console.log(`Found ${possibleWords.length} candidates.`);
    let orderedWords;
    if (context.order === 'heuristic') { orderedWords = possibleWords.sort((a, b) => scoreWordBasedOnPattern(b, pattern) - scoreWordBasedOnPattern(a, pattern)); console.log("Top 5 heuristic candidates:", orderedWords.slice(0, 5).map(w => `${w}(${scoreWordBasedOnPattern(w, pattern)})`)); }
    else { orderedWords = possibleWords.sort(() => Math.random() - 0.5); console.log("Top 5 random candidates:", orderedWords.slice(0, 5)); }
    let wordsTried = 0;
    for (const word of orderedWords) {
        if (wordsTried >= context.MAX_CANDIDATES) { console.log(`--- Constrained Attempt ${context.attempt} / Slot ${index} (${isAcross?'A':'D'}): Tried ${context.MAX_CANDIDATES} words...`); break; }
        wordsTried++; console.log(`  Trying word: '${word}' (${wordsTried}/${context.MAX_CANDIDATES})`); // Log attempt
        const gridBackup = context.grid.map(innerRow => [...innerRow]);
        if (isValid(startRow, startCol, word, isAcross, context.grid, context.usedWordsSet)) {
            // console.log(`    Word '${word}' passed isValid.`); // Optional log
            if (isAcross) { for (let i = 0; i < size; i++) context.grid[startRow][i] = word[i]; context.usedWords.across[startRow] = word; }
            else { for (let i = 0; i < size; i++) context.grid[i][startCol] = word[i]; context.usedWords.down[startCol] = word; }
            context.usedWordsSet.add(word);
            if (solveConstrained(context)) return true; // RECURSE
            console.log(`\n    🔄 Backtracking (Constrained Attempt ${context.attempt} / Slot ${index} ${isAcross?'A':'D'}), removing '${word}'`); // Log backtrack
            context.backtrackCount++; console.log(`    (Total Backtracks This Attempt: ${context.backtrackCount})`); // Log count
            context.usedWordsSet.delete(word);
            if (isAcross) context.usedWords.across[startRow] = null; else context.usedWords.down[startCol] = null;
            for (let i = 0; i < size; i++) { for (let j = 0; j < size; j++) { context.grid[i][j] = gridBackup[i][j]; } }
             console.log('    Grid restored to previous state:'); console.log(context.grid.map(r => r.map(c => c || '_').join(' ')).join('\n')); // Log restore
        }
    }
    console.log(`--- Constrained Attempt ${context.attempt} / Slot ${index} (${isAcross?'A':'D'}): Failed this slot.`); // Log failure
    return false;
}
// --- *** END SOLVER FUNCTION 2 *** ---

// --- Updated generateCrossword Function ---
async function generateCrossword(requestedSize = 4) {
    console.log(`Attempting crossword generation with size: ${requestedSize}`);
    const size = parseInt(requestedSize);
    if (![4, 5, 6].includes(size)) { throw new Error('Invalid grid size. Must be 4, 5, or 6.'); }

    const availableSizeWords = wordsByLength[size] || [];
    console.log(`[generateCrossword] Accessed wordsByLength[${size}]. Found ${availableSizeWords.length} words.`);
    const requiredWords = Math.max(size * 2, 10);
    if (availableSizeWords.length < requiredWords) { console.error(`[generateCrossword] Failed check...`); throw new Error(`Not enough ${size}-letter words available (found ${availableSizeWords.length}, need at least ${requiredWords})`); }

    // --- Strategy Definitions ---
    const strategies = [
        { name: 'Linear/Random', solver: solveLinear, order: 'random', startPos: 1 },
        { name: 'Linear/Heuristic', solver: solveLinear, order: 'heuristic', startPos: 1 },
        { name: 'Constrained/Random', solver: solveConstrained, order: 'random', startPos: null }, // startPos not applicable
        { name: 'Constrained/Heuristic', solver: solveConstrained, order: 'heuristic', startPos: null }
    ];

    const MAX_RETRY_ATTEMPTS_PER_STRATEGY = 10; // Reduced back from 50 for quicker testing
    const MAX_BACKTRACKS_PER_ATTEMPT = 10000; // Keep higher
    const MAX_CANDIDATES_PER_SLOT = 150; // Keep higher

    let finalGrid = null;
    let finalNumbering = null;
    let finalClues = null;
    let generationSuccess = false;
    const resultsLog = []; // Store results of each strategy run

    // --- Loop Through Strategies ---
    for (const strategy of strategies) {
        if (generationSuccess) break; // Skip remaining strategies if one succeeded
        console.log(`\n<<<<< TESTING STRATEGY: ${strategy.name} >>>>>`);
        const strategyStartTime = performance.now();
        let strategySuccess = false;
        let totalBacktracksForStrategy = 0;
        let winningAttempt = -1;

        // --- Retry Loop for THIS Strategy ---
        for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS_PER_STRATEGY; attempt++) {
            console.log(`\n===== ${strategy.name} / ATTEMPT ${attempt}/${MAX_RETRY_ATTEMPTS_PER_STRATEGY} =====`);
            const grid = Array(size).fill().map(() => Array(size).fill(''));
            const usedWords = { across: Array(size).fill(null), down: Array(size).fill(null) };
            const usedWordsSet = new Set();

            if (availableSizeWords.length === 0) { throw new Error(`Internal error: No ${size}-letter words available.`); }
            const startWordIndex = Math.floor(Math.random() * availableSizeWords.length);
            const startWord = availableSizeWords[startWordIndex];
            console.log(`Attempt ${attempt} (${strategy.name}): Initial word selected: ${startWord}`);
            for (let i = 0; i < size; i++) grid[0][i] = startWord[i];
            usedWords.across[0] = startWord; usedWordsSet.add(startWord);
            console.log(`Placed ${startWord} at A0.`);

            let context = { grid, usedWords, usedWordsSet, availableSizeWords, attempt, strategyName: strategy.name, backtrackCount: 0, MAX_BACKTRACKS: MAX_BACKTRACKS_PER_ATTEMPT, MAX_CANDIDATES: MAX_CANDIDATES_PER_SLOT, order: strategy.order };

            try {
                console.log(`Attempt ${attempt} (${strategy.name}): Starting solver...`);
                let successThisAttempt = strategy.solver === solveLinear ? solveLinear(strategy.startPos, context) : solveConstrained(context);
                totalBacktracksForStrategy += context.backtrackCount;

                if (successThisAttempt) {
                    console.log(`===== STRATEGY ${strategy.name} SUCCEEDED (Attempt ${attempt})! =====`);
                    finalGrid = grid; generationSuccess = true; strategySuccess = true; winningAttempt = attempt;
                    break; // Exit retry loop for this strategy
                } else { console.log(`Attempt ${attempt} (${strategy.name}): Solver finished without finding a solution.`); }
            } catch (error) {
                totalBacktracksForStrategy += context.backtrackCount;
                if (error.message === 'MAX_BACKTRACKS_EXCEEDED') { console.log(`Attempt ${attempt} (${strategy.name}): Failed due to backtrack limit (${context.backtrackCount}/${MAX_BACKTRACKS_PER_ATTEMPT}). Retrying...`); }
                else { console.error(`Attempt ${attempt} (${strategy.name}): Unexpected error:`, error); throw error; }
            }
        } // --- End Retry Loop for Strategy ---

        const strategyEndTime = performance.now();
        const strategyDuration = ((strategyEndTime - strategyStartTime) / 1000).toFixed(2);
        resultsLog.push({ strategy: strategy.name, success: strategySuccess, attempts: strategySuccess ? winningAttempt : MAX_RETRY_ATTEMPTS_PER_STRATEGY, totalBacktracks: totalBacktracksForStrategy, durationSeconds: strategyDuration });
        if (!strategySuccess) { console.log(`<<<<< STRATEGY ${strategy.name} FAILED after ${MAX_RETRY_ATTEMPTS_PER_STRATEGY} attempts. >>>>>`); }

    } // --- End Strategy Loop ---

    console.log("\n===== Strategy Execution Summary =====");
    resultsLog.forEach(res => { console.log(`Strategy: ${res.strategy.padEnd(25)} | Success: ${res.success ? 'YES' : 'NO '} | Attempts Used: ${res.attempts.toString().padStart(3)} | Total Backtracks: ${res.totalBacktracks.toString().padStart(6)} | Time: ${res.durationSeconds.padStart(6)}s`); });
    console.log("====================================");

    if (!generationSuccess || !finalGrid) { console.error(`All strategies failed to generate crossword.`); throw new Error(`All strategies failed to generate a valid crossword.`); }

    // --- Post-generation (Numbering, Clue Gen using finalGrid) ---
    console.log("\nCrossword grid generated successfully. Proceeding with numbering and clue generation...");
    numbering = Array(size).fill().map(() => Array(size).fill(0)); let currentNumber = 1; const starts = {}; const wordsForClues = { across: {}, down: {} };
    for (let r = 0; r < size; r++) { for (let c = 0; c < size; c++) { if (!finalGrid[r][c]) continue; const isAcrossStart = (c === 0 || !finalGrid[r][c - 1]); const isDownStart = (r === 0 || !finalGrid[r - 1][c]); if (isAcrossStart || isDownStart) { const startKey = `${r},${c}`; let numToUse = starts[startKey]; if (!numToUse) { numToUse = currentNumber++; numbering[r][c] = numToUse; starts[startKey] = numToUse; } else { if (numbering[r][c] === 0) numbering[r][c] = numToUse; } if (isAcrossStart && !wordsForClues.across[numToUse]) { let word = ''; for (let k = c; k < size && finalGrid[r][k]; k++) word += finalGrid[r][k]; wordsForClues.across[numToUse] = word; } if (isDownStart && !wordsForClues.down[numToUse]) { let word = ''; for (let k = r; k < size && finalGrid[k][c]; k++) word += finalGrid[k][c]; wordsForClues.down[numToUse] = word; } } } }
    const cluePromises = []; let clueCount = 0; console.log("Generating clues asynchronously...");
    for (const numStr in wordsForClues.across) { const num = parseInt(numStr); const word = wordsForClues.across[num]; if (word) { clueCount++; cluePromises.push(generateClue(word).then(clue => ({ direction: 'across', number: num, clue })).catch(err => ({ direction: 'across', number: num, clue: `Error fetching clue for ACROSS ${num}` }))); } }
    for (const numStr in wordsForClues.down) { const num = parseInt(numStr); const word = wordsForClues.down[num]; if (word) { clueCount++; cluePromises.push(generateClue(word).then(clue => ({ direction: 'down', number: num, clue })).catch(err => ({ direction: 'down', number: num, clue: `Error fetching clue for DOWN ${num}` }))); } }
    const settledClues = await Promise.allSettled(cluePromises);
    finalClues = { across: [], down: [] }; let successfulClues = 0;
    settledClues.forEach(result => { if (result.status === 'fulfilled' && result.value) { const item = result.value; const isErrorClue = item.clue.toLowerCase().startsWith('error') || item.clue.toLowerCase().includes('timeout') || item.clue.toLowerCase().startsWith('no response') || item.clue.toLowerCase().startsWith('api error') || item.clue.toLowerCase().startsWith('setup error') || item.clue.toLowerCase().startsWith('clue for') || item.clue.toLowerCase().startsWith('invalid word'); if (!isErrorClue) successfulClues++; else console.warn(`Clue generation failed/fallback for number ${item.number} (${item.direction}): "${item.clue}"`); if (item.direction === 'across') finalClues.across.push({ number: item.number, clue: item.clue }); else finalClues.down.push({ number: item.number, clue: item.clue }); } else if (result.status === 'rejected') { console.error("Clue generation promise rejected:", result.reason); } });
    finalClues.across.sort((a, b) => a.number - b.number); finalClues.down.sort((a, b) => a.number - b.number);
    console.log(`Clue generation complete. ${successfulClues}/${clueCount} clues successfully generated.`);

    return { grid: finalGrid, numbering, clues: finalClues };
}
// --- End Updated generateCrossword Function ---


// --- API Endpoint (remains the same) ---
app.get('/generate', async (req, res) => {
  const anyWordsLoaded = Object.values(wordsByLength).some(list => list.length > 0);
  if (!anyWordsLoaded) { return res.status(503).json({ error: 'Word lists could not be loaded. Check server logs and word files.' }); }
  try {
    const size = parseInt(req.query.size) || 4;
    console.log(`Received request to generate crossword with size ${size}`);
    const crosswordData = await generateCrossword(size); // Call the updated function
    console.log("Successfully generated crossword data for request.");
    res.json(crosswordData);
  } catch (error) {
    console.error('Error during crossword generation endpoint:', error);
    res.status(500).json({ error: error.message || 'Failed to generate valid crossword. Please try again.' });
  }
});

// --- Server Start (remains the same) ---
fetchWords().then(() => {
  const anyWordsLoaded = Object.values(wordsByLength).some(list => list.length > 0);
  if (!anyWordsLoaded) { console.error("Word lists are empty after attempting to load."); process.exit(1); }
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, '0.0.0.0', () => { console.log(`Server running on port ${PORT}`); });
}).catch(error => { console.error('Failed to fetch words or start server:', error); process.exit(1); });