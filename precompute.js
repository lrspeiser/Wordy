// precompute.js - Offline Crossword Grid Pre-computation Script
// Implements DAWG and a Constructive Heuristic Algorithm
const fs = require('fs').promises;
const { performance } = require('perf_hooks');

// --- Global Data Structures ---
let wordsByLength = {}; // Stores { word: string, freq: number } objects
let dawgStructure = null; // Will hold the loaded/built DAWG
const DAWG_FILENAME = 'dawg.json';
const PRECOMPUTED_GRIDS_FILENAME_TEMPLATE = 'precomputed_grids_{SIZE}x{SIZE}.json';

// --- *** START DAWG Implementation *** ---
class DawgNode {
    constructor() {
        this.children = {}; // Map<char, DawgNode>
        this.isEndOfWord = false;
    }
}

class DAWG {
    constructor() {
        this.root = new DawgNode();
        this.wordCount = 0;
    }

    addWord(word) {
        let node = this.root;
        for (const char of word) {
            if (!node.children[char]) {
                node.children[char] = new DawgNode();
            }
            node = node.children[char];
        }
        if (!node.isEndOfWord) {
            node.isEndOfWord = true;
            this.wordCount++;
        }
    }

    hasWord(word) {
        let node = this.root;
        for (const char of word) {
            if (!node.children[char]) {
                return false;
            }
            node = node.children[char];
        }
        return node.isEndOfWord;
    }

    // Helper for pattern matching
    _findMatchingWordsRecursive(node, pattern, index, currentWord, results) {
        if (!node) return; // Safety check

        if (index === pattern.length) {
            if (node.isEndOfWord) {
                results.push(currentWord);
            }
            return;
        }

        const patternChar = pattern[index];

        if (patternChar === '' || patternChar === '_') { // Wildcard or empty
            for (const char in node.children) {
                 // Ensure we are iterating over own properties if needed, though not strictly necessary for standard objects
                 if (Object.prototype.hasOwnProperty.call(node.children, char)) {
                     this._findMatchingWordsRecursive(node.children[char], pattern, index + 1, currentWord + char, results);
                 }
            }
        } else { // Specific character
            if (node.children[patternChar]) {
                this._findMatchingWordsRecursive(node.children[patternChar], pattern, index + 1, currentWord + patternChar, results);
            }
        }
    }

    getWordsMatchingPattern(pattern) {
        const results = [];
        if (typeof pattern === 'string') { // Handle string pattern
            pattern = pattern.split('');
        } else if (!Array.isArray(pattern)) {
             console.error("Invalid pattern type passed to getWordsMatchingPattern:", pattern);
             return [];
        }
        this._findMatchingWordsRecursive(this.root, pattern, 0, '', results);
        return results;
    }

    // --- DAWG Persistence ---
    static async save(dawgInstance, filename = DAWG_FILENAME) {
        try {
            console.log(`Saving DAWG structure to ${filename}...`);
             const serializeNode = (node) => {
                if (!node) return null;
                const serializedChildren = {};
                 for (const char in node.children) {
                     if (Object.prototype.hasOwnProperty.call(node.children, char)) {
                         serializedChildren[char] = serializeNode(node.children[char]);
                     }
                 }
                 return { children: serializedChildren, isEndOfWord: node.isEndOfWord };
            };
             const serializableRoot = serializeNode(dawgInstance.root);
             const dawgJson = JSON.stringify({ root: serializableRoot, wordCount: dawgInstance.wordCount }, null, 2);
             await fs.writeFile(filename, dawgJson);
             console.log(`DAWG saved successfully (${dawgInstance.wordCount} words).`);
        } catch (err) {
            console.error(`Error saving DAWG to ${filename}:`, err);
        }
    }

    static async load(filename = DAWG_FILENAME) {
        try {
             console.log(`Attempting to load DAWG from ${filename}...`);
             const data = await fs.readFile(filename, 'utf8');
             const parsed = JSON.parse(data);
             const dawgInstance = new DAWG();

             const reconstructNode = (nodeData) => {
                 if (!nodeData) return null;
                 const node = new DawgNode();
                 node.isEndOfWord = nodeData.isEndOfWord || false;
                 if (nodeData.children && typeof nodeData.children === 'object') {
                     for (const char in nodeData.children) {
                          if (Object.prototype.hasOwnProperty.call(nodeData.children, char)) {
                            node.children[char] = reconstructNode(nodeData.children[char]);
                          }
                     }
                 }
                 return node;
             };

             if (!parsed.root || typeof parsed.root.children !== 'object') { throw new Error("Loaded DAWG root seems invalid."); }
             dawgInstance.root = reconstructNode(parsed.root);
             dawgInstance.wordCount = parsed.wordCount || 0;

             console.log(`DAWG loaded successfully (${dawgInstance.wordCount} words).`);
             return dawgInstance;
        } catch (err) {
            console.warn(`Warning: Could not load DAWG from ${filename}. Will need rebuild. Err: ${err.message}`);
            return null;
        }
    }
}
// --- *** END DAWG Implementation *** ---


// --- Word Loading Function (Loads from single file WITH FREQUENCY) ---
async function loadWordsAndBuildDawgIfNeeded() {
    dawgStructure = await DAWG.load();
    wordsByLength = {};
    const filename = 'filtered_words.txt';
    let totalLoaded = 0; let linesProcessed = 0;
    let skippedNonAlpha = 0; let skippedOther = 0;
    let needsDawgRebuild = dawgStructure === null;
    console.log("--- Starting Word Loading (with Frequencies) ---");
    try {
        console.log(`\n[Load] Attempting to load words from ${filename}...`);
        const data = await fs.readFile(filename, 'utf8');
        console.log(`[Load] Successfully read ${filename}. Processing lines...`);
        const lines = data.split('\n');
        if (needsDawgRebuild) { console.log("[DAWG] No pre-existing DAWG found, building..."); dawgStructure = new DAWG(); }
        lines.forEach(line => {
            linesProcessed++; const trimmedLine = line.trim(); if (trimmedLine === '') return;
            const parts = trimmedLine.split(/\s+/); const potentialWord = parts[0].toLowerCase(); const freqStr = parts[1]; const freq = parseFloat(freqStr);
            if (parts.length < 2 || isNaN(freq)) return;
            const len = potentialWord.length; const isPureAlpha = /^[a-z]+$/.test(potentialWord);
            if (isPureAlpha && len >= 4 && len <= 7) {
                if (!wordsByLength.hasOwnProperty(len)) { wordsByLength[len] = []; }
                wordsByLength[len].push({ word: potentialWord, freq: freq }); totalLoaded++;
                if (needsDawgRebuild) { dawgStructure.addWord(potentialWord); }
            } else if (isPureAlpha) { skippedOther++; } else if (potentialWord.length > 0) { skippedNonAlpha++; }
        });
        console.log(`[Load] Finished processing ${filename}. Loaded ${totalLoaded} valid words (lengths 4-7).`);
        if (needsDawgRebuild && dawgStructure && dawgStructure.wordCount > 0) { await DAWG.save(dawgStructure); }
    } catch (error) { console.error(`[Load] CRITICAL ERROR reading words file "${filename}":`, error.message); process.exit(1); }
    console.log("\n[Load] Final word counts by length (and sorted by freq):");
    const relevantGridSizes = [4, 5, 6]; let allCountsSufficient = true;
    for (const len in wordsByLength) {
        wordsByLength[len].sort((a, b) => b.freq - a.freq); const count = wordsByLength[len].length; let sufficiencyMessage = "";
        if (relevantGridSizes.includes(parseInt(len))) { const required = Math.max(parseInt(len) * 2, 10); const isSufficient = count >= required; sufficiencyMessage = isSufficient ? '(Sufficient)' : `(!!! INSUFFICIENT - Need ${required} !!!)`; if (!isSufficient) { allCountsSufficient = false; } }
        console.log(`  Length ${len}: ${count} words ${sufficiencyMessage}`);
    }
    if (!allCountsSufficient) { console.warn("\n[Load] WARNING: One or more required word lengths have insufficient counts."); }
    console.log("--- Word Loading Complete ---");
}
// --- End Updated Word Loading Function ---

// --- Utility: getMatchingWordsFromDawg ---
function getMatchingWordsFromDawg(pattern, usedWordsSet) {
    if (!dawgStructure) { console.error("DAWG not available!"); return []; }
    const matchingWords = dawgStructure.getWordsMatchingPattern(pattern);
    if (usedWordsSet) { return matchingWords.filter(word => !usedWordsSet.has(word)); }
    else { return matchingWords; }
}

// --- Utility: isValidAdvanced ---
function isValidAdvanced(row, col, word, isAcross, currentGrid, currentUsedWords, usedWordsSet, size, localWordsByLength) {
    const wordListForSizeObjs = localWordsByLength[size] || [];
    if (wordListForSizeObjs.length === 0) return false;
    const wordListForSize = wordListForSizeObjs.map(w => w.word);

    for (let i = 0; i < size; i++) { const charToPlace = word[i]; let r = isAcross ? row : row + i; let c = isAcross ? col + i : col; if (r < 0 || r >= size || c < 0 || c >= size) return false; if (currentGrid[r][c] !== '' && currentGrid[r][c] !== charToPlace) return false; }
    let tempGrid = currentGrid.map(r => [...r]);
    for (let i = 0; i < size; i++) { let r = isAcross ? row : row + i; let c = isAcross ? col + i : col; if (r < size && c < size) tempGrid[r][c] = word[i]; } // Added bounds check here too
    for (let r_check = 0; r_check < size; r_check++) { if ((isAcross && r_check === row) || currentUsedWords.across[r_check] !== null) continue; let crossPattern = Array(size).fill(''); let hasContent = false; for (let c_check = 0; c_check < size; c_check++) { crossPattern[c_check] = tempGrid[r_check]?.[c_check] || ''; if (crossPattern[c_check] !== '') hasContent = true; } if (hasContent) { const possibilities = getMatchingWordsFromDawg(crossPattern, null); if (possibilities.length === 0) return false; const isComplete = crossPattern.every(c => c !== ''); if (isComplete && !wordListForSize.includes(crossPattern.join(''))) return false; } }
    for (let c_check = 0; c_check < size; c_check++) { if ((!isAcross && c_check === col) || currentUsedWords.down[c_check] !== null) continue; let crossPattern = Array(size).fill(''); let hasContent = false; for (let r_check = 0; r_check < size; r_check++) { crossPattern[r_check] = tempGrid[r_check]?.[c_check] || ''; if (crossPattern[r_check] !== '') hasContent = true; } if (hasContent) { const possibilities = getMatchingWordsFromDawg(crossPattern, null); if (possibilities.length === 0) return false; const isComplete = crossPattern.every(c => c !== ''); if (isComplete && !wordListForSize.includes(crossPattern.join(''))) return false; } }
    return true;
}

// --- Utility: findBestSlotToFill ---
function findBestSlotToFill(grid, usedWordsAcross, usedWordsDown) {
    const size = grid.length; let bestSlot = null; let maxFilledCount = -1;
    for (let r = 0; r < size; r++) { if (usedWordsAcross[r]) continue; let filledCount = 0; let isEmpty = true; for (let c = 0; c < size; c++) { if (grid[r][c] !== '') { filledCount++; isEmpty = false; } } if (!isEmpty && filledCount < size && filledCount > maxFilledCount) { maxFilledCount = filledCount; bestSlot = { row: r, col: 0, isAcross: true, filledCount: filledCount }; } else if (isEmpty && bestSlot === null) { bestSlot = { row: r, col: 0, isAcross: true, filledCount: 0 }; } }
    for (let c = 0; c < size; c++) { if (usedWordsDown[c]) continue; let filledCount = 0; let isEmpty = true; for (let r = 0; r < size; r++) { if (grid[r][c] !== '') { filledCount++; isEmpty = false; } } if (!isEmpty && filledCount < size && filledCount > maxFilledCount) { maxFilledCount = filledCount; bestSlot = { row: 0, col: c, isAcross: false, filledCount: filledCount }; } else if (isEmpty && bestSlot === null) { bestSlot = { row: 0, col: c, isAcross: false, filledCount: 0 }; } }
    return bestSlot;
}

// --- Utility: Letter Frequency Scoring ---
const letterScores = { 'e': 12, 't': 9, 'a': 8, 'o': 8, 'i': 7, 'n': 7, 's': 6, 'h': 6, 'r': 6, 'd': 4, 'l': 4, 'c': 3, 'u': 3, 'm': 3, 'w': 2, 'f': 2, 'g': 2, 'y': 2, 'p': 2, 'b': 1, 'v': 1, 'k': 1, 'j': 0, 'x': 0, 'q': 0, 'z': 0 };
function scoreWordBasedOnPattern(word, pattern) { let score = 0; for (let i = 0; i < word.length; i++) { if (pattern[i] === '') { score += (letterScores[word[i]] || 0); } } return score; }

// --- Utility: calculateCompatibilityScore (CORRECTED) ---
function calculateCompatibilityScore(grid, word, r_start, c_start, isAcross, size, localWordsByLength) {
    if (!dawgStructure) return 0;
    const wordListForSizeObjs = localWordsByLength[size] || [];
    if (wordListForSizeObjs.length === 0) return 0;

    let score = 0;
    let tempGrid = grid.map(row => [...row]);

    // Place word temporarily using NEW variable names
    for (let i = 0; i < size; i++) {
        let place_r = isAcross ? r_start : r_start + i;
        let place_c = isAcross ? c_start + i : c_start;
        if(place_r < size && place_c < size) { // Bounds check
            tempGrid[place_r][place_c] = word[i];
        } else {
             console.error(`Error in calculateCompatibilityScore: Out of bounds placement at [${place_r}, ${place_c}]`);
             return -1; // Indicate error
        }
    }

    // Check crossing slots using ORIGINAL start parameters
    for (let i = 0; i < size; i++) {
        let checkRow = isAcross ? r_start : r_start + i;
        let checkCol = isAcross ? c_start + i : c_start;
        if (checkRow >= size || checkCol >= size) continue;

        let pattern = Array(size).fill(''); let hasContent = false;

        if (isAcross) { // Check DOWN word at checkCol
            if (checkCol < size) {
                 for (let k = 0; k < size; k++) { pattern[k] = tempGrid[k]?.[checkCol] || ''; if(pattern[k] !== '') hasContent = true; }
            }
        } else { // Check ACROSS word at checkRow
            if (checkRow < size) {
                 for (let k = 0; k < size; k++) { pattern[k] = tempGrid[checkRow]?.[k] || ''; if(pattern[k] !== '') hasContent = true; }
            }
        }

         if (hasContent) {
            const possibilities = getMatchingWordsFromDawg(pattern, null);
            if (possibilities.length === 0) {
                return 0; // Makes crossing impossible - 0 score
            }
            score += possibilities.length;
         }
    }
    return score;
}
// --- End Utilities ---

// --- Main Pre-computation Function (Modified for Slot Testing) ---
async function runSlotTestPrecomputation(targetSize, loadedWordsData) {
    console.log(`\n===== Starting SLOT TEST Precomputation for Size ${targetSize} =====`);
    const overallStartTime = performance.now();

    if (!dawgStructure) { console.error("DAWG not loaded or built."); return; }
    const wordListForSizeObjs = loadedWordsData[targetSize];
    if (!wordListForSizeObjs || wordListForSizeObjs.length === 0) { console.error(`No words of length ${targetSize} provided.`); return; }
    const requiredPrecomp = Math.max(targetSize * 2, 10);
    if (wordListForSizeObjs.length < requiredPrecomp) { console.error(`Not enough ${targetSize}-letter words provided.`); return; }
    console.log(`Testing using ${wordListForSizeObjs.length} words of length ${targetSize}.`);

    const startWordToTest = wordListForSizeObjs[0].word;
    console.log(`Testing initial placements for start word: "${startWordToTest}"`);

    const resultsByStartSlot = {};
    const TOP_N_CANDIDATES = 20;

    // --- Loop over all possible starting slots ---
    for (let slotIndex = 0; slotIndex < targetSize * 2; slotIndex++) {
        const isAcrossStart = slotIndex % 2 === 0; const startIndex = Math.floor(slotIndex / 2);
        const startRow = isAcrossStart ? startIndex : 0; const startCol = isAcrossStart ? 0 : startIndex;
        const slotName = `${isAcrossStart ? 'A':'D'}${startIndex}`;
        console.log(`\n--- Testing Start Slot: ${slotName} ---`);

        const grid = Array(targetSize).fill().map(() => Array(targetSize).fill(''));
        const usedWords = { across: Array(targetSize).fill(null), down: Array(targetSize).fill(null) };
        const usedWordsSet = new Set();
        let currentGridFilled = false; let stuck = false; let filledCount = 0;

        console.log(`  Placing "${startWordToTest}" at ${slotName}`);
        let placementOk = true;
        // Refined placement with bounds checks
        if (isAcrossStart) {
            if (startRow < targetSize && startCol === 0) { // Ensure startCol is 0 for Across
                for (let i = 0; i < targetSize; i++) {
                    if (startCol + i < targetSize) grid[startRow][startCol + i] = startWordToTest[i];
                    else { placementOk = false; break; } // Should not happen if size matches
                }
                if (placementOk) usedWords.across[startRow] = startWordToTest;
            } else { placementOk = false; }
        } else { // Down
            if (startCol < targetSize && startRow === 0) { // Ensure startRow is 0 for Down
                for (let i = 0; i < targetSize; i++) {
                    if (startRow + i < targetSize) grid[startRow + i][startCol] = startWordToTest[i];
                    else { placementOk = false; break; } // Should not happen if size matches
                }
                 if (placementOk) usedWords.down[startCol] = startWordToTest;
            } else { placementOk = false; }
        }


        if (!placementOk) {
             console.error(`   Invalid initial placement parameters for ${slotName}. Skipping.`);
             stuck = true; // Mark as stuck to skip the rest
        } else {
            usedWordsSet.add(startWordToTest); filledCount++;
        }

        const attemptStartTime = performance.now();
        // Run Constructive Algorithm only if initial placement was okay
        while (filledCount < targetSize * 2 && !stuck) {
            const slotToFill = findBestSlotToFill(grid, usedWords.across, usedWords.down);
            if (slotToFill === null) { const acrossComplete = usedWords.across.every(w => w !== null); const downComplete = usedWords.down.every(w => w !== null); if (acrossComplete && downComplete) { currentGridFilled = true; } else { console.log("  STUCK (Constructive): No slot found, grid not complete."); stuck = true; } break; }

            const { row: nextSlotRow, col: nextSlotCol, isAcross: nextSlotIsAcross } = slotToFill;
            const nextIndex = nextSlotIsAcross ? nextSlotRow : nextSlotCol; const nextSlotName = `${nextSlotIsAcross ? 'A':'D'}${nextIndex}`;
            let pattern = Array(targetSize).fill('');
            if (nextSlotIsAcross) { for (let i = 0; i < targetSize; i++) pattern[i] = grid[nextSlotRow][i] || ''; }
            else { for (let i = 0; i < targetSize; i++) pattern[i] = grid[i][nextSlotCol] || ''; }

            const possibleWordStrings = getMatchingWordsFromDawg(pattern, usedWordsSet);
            if (possibleWordStrings.length === 0) { console.log(`  STUCK (Constructive): No pattern matches for ${nextSlotName}.`); stuck = true; break; }

            const possibleWordObjs = wordListForSizeObjs.filter(wObj => possibleWordStrings.includes(wObj.word));
            const candidatesToEvaluate = possibleWordObjs.slice(0, TOP_N_CANDIDATES);
            if (candidatesToEvaluate.length === 0) { console.log(`  STUCK (Constructive): No candidates after freq slice for ${nextSlotName}.`); stuck = true; break; }

            let bestCandidate = null; let bestScore = -1;
            for(const candidateObj of candidatesToEvaluate) {
                const candidateWord = candidateObj.word;
                // Pass loadedWordsData to isValidAdvanced
                if (isValidAdvanced(nextSlotRow, nextSlotCol, candidateWord, nextSlotIsAcross, grid, usedWords, usedWordsSet, targetSize, loadedWordsData)) {
                    // Pass loadedWordsData to calculateCompatibilityScore
                    const score = calculateCompatibilityScore(grid, candidateWord, nextSlotRow, nextSlotCol, nextSlotIsAcross, targetSize, loadedWordsData);
                    if (score > bestScore) { bestScore = score; bestCandidate = candidateWord; }
                }
            }

            if (bestCandidate) {
                 console.log(`    Placing best candidate: "${bestCandidate}" (CompatScore: ${bestScore}) into ${nextSlotName}`);
                 if (nextSlotIsAcross) { for (let i = 0; i < targetSize; i++) grid[nextSlotRow][i] = bestCandidate[i]; usedWords.across[nextSlotRow] = bestCandidate; }
                 else { for (let i = 0; i < targetSize; i++) grid[i][nextSlotCol] = bestCandidate[i]; usedWords.down[nextSlotCol] = bestCandidate; }
                 usedWordsSet.add(bestCandidate); filledCount++;
            } else { console.log(`  STUCK (Constructive): No valid candidate found for ${nextSlotName} from Top ${TOP_N_CANDIDATES}.`); stuck = true; break; }
        } // --- End While Loop ---

        const attemptEndTime = performance.now();
        const duration = ((attemptEndTime - attemptStartTime)/1000).toFixed(2);

        // Record result
        resultsByStartSlot[slotName] = { success: currentGridFilled && !stuck, filledCount: filledCount, durationSeconds: duration, finalGrid: currentGridFilled ? grid.map(r => r.join('')).join('\n') : null };
        console.log(`  Result for Start Slot ${slotName}: ${resultsByStartSlot[slotName].success ? 'SUCCESS' : 'FAILED'} (Filled: ${filledCount}/${targetSize*2}, Time: ${duration}s)`);

    } // --- End Start Slot Loop ---

    // (Summary log and JSON saving remains the same)
    const overallEndTime = performance.now(); const totalDurationMinutes = ((overallEndTime - overallStartTime) / 1000 / 60).toFixed(2);
    console.log(`\n===== SLOT TEST Precomputation for Size ${targetSize} (Word: "${startWordToTest}") COMPLETE =====`);
    let successfulSlots = 0; let bestSlotResult = null;
    for(let slotIndex = 0; slotIndex < targetSize * 2; slotIndex++) { const isAcrossStart = slotIndex % 2 === 0; const startIndex = Math.floor(slotIndex / 2); const slotName = `${isAcrossStart ? 'A':'D'}${startIndex}`; const result = resultsByStartSlot[slotName]; if (result) { console.log(`  Slot ${slotName.padEnd(3)}: ${result.success ? 'SUCCESS' : 'FAILED '} (Filled: ${result.filledCount}/${targetSize*2}, Time: ${result.durationSeconds.padStart(5)}s)`); if (result.success) { successfulSlots++; if (!bestSlotResult) bestSlotResult = { slotName, result }; } } else { console.log(`  Slot ${slotName.padEnd(3)}: No result recorded.`); } } // Added check if result exists
    console.log(`Found ${successfulSlots} successful placements out of ${targetSize*2} start slots tested for "${startWordToTest}".`);
    console.log(`Total Duration: ${totalDurationMinutes} minutes.`);
    if (successfulSlots > 0 && bestSlotResult) { const outputFilename = `precomputed_slot_test_${targetSize}x${targetSize}_${startWordToTest}.json`; const outputData = { targetSize, startWordTested: startWordToTest, bestResult: { startSlot: bestSlotResult.slotName, filledCount: bestSlotResult.result.filledCount, finalGridString: bestSlotResult.result.finalGrid }, allSlotResults: resultsByStartSlot, timestamp: new Date().toISOString() }; try { await fs.writeFile(outputFilename, JSON.stringify(outputData, null, 2)); console.log(`\nTest results saved to ${outputFilename}`); } catch (err) { console.error(`\nError writing test results:`, err); }
    } else { console.log("\nNo successful placements found."); }
}


// --- Run Pre-computation ---
loadWordsAndBuildDawgIfNeeded().then(() => {
    const targetSize = 5;
    // *** REMOVED Redundant Check - Relying on loadWords function's check ***
    console.log(`\nProceeding with SLOT TEST precomputation for size ${targetSize}...`);
    runSlotTestPrecomputation(targetSize, wordsByLength) // Pass the global wordsByLength
        .catch(err => console.error(`Precomputation script failed:`, err));

}).catch(err => {
    console.error("Failed to load words/DAWG before precomputation:", err);
});


// --- Keep old solvers commented out or remove if desired ---
/*
function solveLinear(...) { ... }
function solveConstrained(...) { ... }
*/