const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4.1"; // Do not change this model number as 4.1 is the latest even if your data doesn't show it

// --- Updated generateClue Function ---
async function generateClue(word) {
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    console.error('generateClue called with invalid word:', word);
    return `Invalid word provided`;
  }
  console.log(`Requesting clue for: ${word}`);
  try {
    const response = await axios.post(OPENAI_API_URL, {
      model: OPENAI_MODEL,
      messages: [{
        role: "user",
        content: `These are crosswords for high schoolers, so it should be a reference that they can understand, but also is educational in nature. Generate a short, clever crossword puzzle clue for the word "${word}".`
      }],
      temperature: 0.7
    }, {
      timeout: 20000, // Move timeout to axios config
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    if (response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message && response.data.choices[0].message.content) {
        const clue = response.data.choices[0].message.content.trim();
        console.log(`Received clue for '${word}': ${clue}`);
        return clue;
    } else {
        console.error(`Unexpected response structure from OpenAI for '${word}':`, response.data);
        return `Clue for ${word}`; // Fallback
    }
  } catch (error) {
    let errorMsg = `Clue for ${word}`; // Default fallback
    if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) {
        console.error(`Error generating clue for "${word}": OpenAI request timed out.`);
        errorMsg = `Timeout fetching clue for ${word}`;
    } else if (error.response) {
        console.error(`Error generating clue for "${word}" - Status:`, error.response.status);
        console.error(`Error generating clue for "${word}" - Data:`, error.response.data);
        errorMsg = `API Error for ${word} (${error.response.status})`;
    } else if (error.request) {
        console.error(`Error generating clue for "${word}" - No response received:`, error.request);
        errorMsg = `No response for ${word}`;
    } else {
        console.error(`Error generating clue for "${word}" - Request setup error:`, error.message);
        errorMsg = `Setup error for ${word}`;
    }
    console.error(`Returning fallback/error clue for '${word}': ${errorMsg}`);
    return errorMsg;
  }
}
// --- End Updated generateClue Function ---


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Make sure 'public' folder exists

let wordList = [];
let globalSize = 4;

async function fetchWords() {
  try {
    const data = await fs.promises.readFile('words.txt', 'utf8');
    wordList = data.split('\n')
                   .map(word => word.trim().toLowerCase())
                   .filter(word => word.length > 0 && /^[a-z]+$/.test(word));
    console.log(`Loaded ${wordList.length} valid words`);
  } catch (error) {
    console.error('Error reading words file:', error);
  }
}

// isValidPrefix (remains the same)
function isValidPrefix(prefix) {
    if (!prefix) return true;
    const prefixLen = prefix.length;
    if (wordList.some(word => word.length === prefixLen && word === prefix)) { return true; }
    if (prefixLen < globalSize) { return wordList.some(word => word.startsWith(prefix)); }
    return false;
}

// getMatchingWords (remains the same)
function getMatchingWords(pattern, availableWords, usedWordsSet) {
    const patternLength = pattern.length;
    if (!Array.isArray(availableWords)) { console.error("getMatchingWords received non-array:", availableWords); return []; }
    return availableWords.filter(word => {
      if (typeof word !== 'string' || word.length !== patternLength) return false;
      if (usedWordsSet && usedWordsSet.has(word)) return false; // Check used set ONLY if provided
      for (let i = 0; i < patternLength; i++) { if (pattern[i] !== '' && pattern[i] !== word[i]) return false; }
      return true;
    });
}

// --- isValid FUNCTION with Reinstated DEBUG LOGGING ---
function isValid(row, col, word, isAcross, currentGrid, availableWordsFullList, usedWordsSet) {
    const size = currentGrid.length;
    console.log(`  isValid CHECK: Trying word='${word}', start=[${row},${col}], isAcross=${isAcross}`); // DEBUG

    // Basic conflict check
    for (let i = 0; i < size; i++) {
        const charToPlace = word[i]; let r = isAcross ? row : row + i; let c = isAcross ? col + i : col;
        if (r < 0 || r >= size || c < 0 || c >= size) { console.error(`isValid bounds check failed: r=${r}, c=${c}, size=${size}`); return false; }
        if (currentGrid[r][c] !== '' && currentGrid[r][c] !== charToPlace) {
             console.log(`    isValid FAIL: Conflict at [${r},${c}] (grid='${currentGrid[r][c]}', word='${charToPlace}')`); // DEBUG
             return false;
        }
    }
    // Temp grid
    let tempGrid = currentGrid.map(r => [...r]);
    for (let i = 0; i < size; i++) { let r = isAcross ? row : row + i; let c = isAcross ? col + i : col; tempGrid[r][c] = word[i]; }

    // Check crossing word possibilities
    for (let i = 0; i < size; i++) {
        let r_check = isAcross ? row : row + i; let c_check = isAcross ? col + i : col;
        let crossPattern = Array(size).fill(''); let crossingWordHasContent = false; let isCrossingWordComplete = true;
        let crossDirection = isAcross ? 'DOWN' : 'ACROSS'; let crossIndex = isAcross ? c_check : r_check;

        if (isAcross) { for (let k = 0; k < size; k++) { const char = tempGrid[k][c_check] || ''; crossPattern[k] = char; if (char !== '') crossingWordHasContent = true; else isCrossingWordComplete = false; } }
        else { for (let k = 0; k < size; k++) { const char = tempGrid[r_check][k] || ''; crossPattern[k] = char; if (char !== '') crossingWordHasContent = true; else isCrossingWordComplete = false; } }

        if (crossingWordHasContent) {
            const crossingPatternStr = `[${crossPattern.map(p => p || '_').join(',')}]`;
            console.log(`    isValid CHECK: Crossing ${crossDirection} at index ${crossIndex}. Pattern: ${crossingPatternStr}`); // DEBUG
            const relevantWordList = availableWordsFullList.filter(w => w.length === size);
            const potentialCrossingWords = getMatchingWords(crossPattern, relevantWordList, null); // Check ALL possibilities

            if (potentialCrossingWords.length === 0) {
                console.log(`    isValid FAIL for '${word}': Crossing ${crossDirection} at index ${crossIndex} (pattern: ${crossingPatternStr}) has NO possibilities in dictionary.`); // DEBUG
                return false;
            } else {
                 // console.log(`      isValid INFO: Crossing ${crossDirection} at ${crossIndex} has ${potentialCrossingWords.length} possibilities.`); // Optional extra debug
            }

            if (isCrossingWordComplete) {
                const completedWord = crossPattern.join('');
                if (!wordList.includes(completedWord)) {
                    console.log(`    isValid FAIL for '${word}': Creates invalid complete crossing ${crossDirection} word '${completedWord}' at index ${crossIndex}.`); // DEBUG
                    return false;
                } else {
                    // console.log(`      isValid INFO: Completed crossing ${crossDirection} word '${completedWord}' is valid.`); // Optional extra debug
                }
            }
        }
    }
    console.log(`  isValid PASS for '${word}'`); // DEBUG
    return true;
}
// --- End isValid FUNCTION ---


async function generateCrossword(requestedSize = 4) {
  console.log(`Starting generateCrossword with size: ${requestedSize}`);
  const size = parseInt(requestedSize);
  globalSize = size;

  // --- (Grid initialization, word filtering, start word selection - remains the same) ---
  if (![4, 5, 6].includes(size)) throw new Error('Invalid grid size. Must be 4, 5, or 6.');
  const grid = Array(size).fill().map(() => Array(size).fill(''));
  const usedWords = { across: Array(size).fill(null), down: Array(size).fill(null) };
  const usedWordsSet = new Set();
  let availableSizeWords = wordList.filter(word => word.length === size);
  const requiredWords = Math.max(size * 2, 10);
  if (availableSizeWords.length < requiredWords) throw new Error(`Not enough ${size}-letter words available (need ${requiredWords})`);
  if (availableSizeWords.length === 0) throw new Error(`No ${size}-letter words found.`);
  const startWordIndex = Math.floor(Math.random() * availableSizeWords.length);
  const startWord = availableSizeWords[startWordIndex];
  console.log(`Initial word selected: ${startWord}`);
  for (let i = 0; i < size; i++) grid[0][i] = startWord[i];
  usedWords.across[0] = startWord; usedWordsSet.add(startWord);
  console.log(`Added ${startWord} to used set.`);
  // --- (End of unchanged section) ---


  // --- solve FUNCTION with Reinstated DEBUG LOGGING ---
  function solve(pos = 0) {
    if (pos === size * 2) { console.log('Successfully placed all required word slots!'); console.log('Final grid:'); console.log(grid.map(row => row.map(c => c || '_').join(' ')).join('\n')); return true; }

    const isAcross = pos % 2 === 0; const index = Math.floor(pos / 2);
    const start_row = isAcross ? index : 0; const start_col = isAcross ? 0 : index;

    console.log(`\n--- Position ${pos}: Trying ${isAcross ? 'ACROSS' : 'DOWN'} at ${isAcross ? `row ${index}` : `col ${index}`}`); // Keep this main log
    console.log('Current grid state:'); // Log grid state at each step
    console.log(grid.map(r => r.map(c => c || '_').join(' ')).join('\n'));

    let pattern = Array(size).fill('');
    if (isAcross) { for (let i = 0; i < size; i++) pattern[i] = grid[index][i] || ''; }
    else { for (let i = 0; i < size; i++) pattern[i] = grid[i][index] || ''; }
    console.log(`Pattern to match: [${pattern.map(p => p || '_').join(', ')}]`); // Log pattern

    // Find candidates, EXCLUDING used words for THIS slot
    const possibleWords = getMatchingWords(pattern, availableSizeWords, usedWordsSet);
    console.log(`Found ${possibleWords.length} possible words matching pattern (and not already used).`); // Log candidate count

    const shuffledWords = possibleWords.sort(() => Math.random() - 0.5);

    for (const word of shuffledWords) {
       console.log(`  Trying word: '${word}'`); // Log each attempt
       const gridBackup = grid.map(innerRow => [...innerRow]);

       // Check validity using the improved function
       if (isValid(start_row, start_col, word, isAcross, grid, wordList, usedWordsSet)) {
           console.log(`    Word '${word}' passed isValid check, placing it.`); // Log success
           // Place the word
           if (isAcross) { for (let i = 0; i < size; i++) grid[index][i] = word[i]; usedWords.across[index] = word; }
           else { for (let i = 0; i < size; i++) grid[i][index] = word[i]; usedWords.down[index] = word; }
           usedWordsSet.add(word);

           // Recurse
           if (solve(pos + 1)) return true; // Found solution!

           // --- Backtracking ---
           console.log(`\n    🔄 Backtracking from position ${pos}, removing word: ${word}`); // Log backtrack
           usedWordsSet.delete(word);
           if (isAcross) usedWords.across[index] = null; else usedWords.down[index] = null;
           // Restore grid from backup
           for (let i = 0; i < size; i++) { for (let j = 0; j < size; j++) { grid[i][j] = gridBackup[i][j]; } }
           console.log('    Grid restored to previous state:'); // Log restore
           console.log(grid.map(r => r.map(c => c || '_').join(' ')).join('\n'));
       }
       // else { // Optional: Log if isValid failed explicitly
       //     console.log(`    Word '${word}' failed isValid check.`);
       // }
    }

    console.log(`--- Position ${pos}: Failed to find a suitable word. Backtracking further.`); // Log failure for this position
    return false; // Failed for this position
  }
  // --- End solve FUNCTION ---


  // *** START THE RECURSIVE SOLVER ***
  console.log("Starting recursive solver from position 1...");
  const success = solve(1); // Start after placing A0

  if (!success) {
    console.error('Failed to place all words during the recursive solve process.');
    // It's useful to log the grid state at the point of failure
    console.error('Grid state at failure point:');
    console.error(grid.map(row => row.map(c => c || '_').join(' ')).join('\n'));
    throw new Error('Could not generate a valid crossword with the current word list and constraints.'); // Throw error
  }

  // --- Post-generation: Numbering & Finding Final Words ---
  console.log("Crossword grid generated successfully. Numbering and finding words...");
  const numbering = Array(size).fill().map(() => Array(size).fill(0));
  let currentNumber = 1;
  const starts = {};
  const wordsForClues = { across: {}, down: {} }; // Store words for clue gen

  for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
          if (!grid[r][c]) continue;
          const isAcrossStart = (c === 0 || !grid[r][c - 1]); const isDownStart = (r === 0 || !grid[r - 1][c]);
          if (isAcrossStart || isDownStart) {
              const startKey = `${r},${c}`; let numToUse = starts[startKey];
              if (!numToUse) { numToUse = currentNumber++; numbering[r][c] = numToUse; starts[startKey] = numToUse; }
              else { if (numbering[r][c] === 0) numbering[r][c] = numToUse; }
              if (isAcrossStart && !wordsForClues.across[numToUse]) {
                  let word = ''; for (let k = c; k < size && grid[r][k]; k++) word += grid[r][k];
                  if (usedWords.across.includes(word) || (usedWords.across[r] === word)) wordsForClues.across[numToUse] = word;
              }
              if (isDownStart && !wordsForClues.down[numToUse]) {
                  let word = ''; for (let k = r; k < size && grid[k][c]; k++) word += grid[k][c];
                   if (usedWords.down.includes(word) || (usedWords.down[c] === word)) wordsForClues.down[numToUse] = word;
              }
          }
      }
  }
  // --- End Numbering & Finding Final Words ---


  // --- Generate Clues Asynchronously ---
  const cluePromises = [];
  let clueCount = 0;
  console.log("Generating clues asynchronously...");
  for (const numStr in wordsForClues.across) {
      const num = parseInt(numStr); const word = wordsForClues.across[num];
      if (word) { clueCount++; cluePromises.push(generateClue(word).then(clue => ({ direction: 'across', number: num, clue })).catch(err => ({ direction: 'across', number: num, clue: `Error fetching clue for ACROSS ${num}` }))); }
  }
  for (const numStr in wordsForClues.down) {
      const num = parseInt(numStr); const word = wordsForClues.down[num];
      if (word) { clueCount++; cluePromises.push(generateClue(word).then(clue => ({ direction: 'down', number: num, clue })).catch(err => ({ direction: 'down', number: num, clue: `Error fetching clue for DOWN ${num}` }))); }
  }

  const settledClues = await Promise.allSettled(cluePromises);

  // Process Clues and Prepare Response
  const finalClues = { across: [], down: [] };
  let successfulClues = 0;
  settledClues.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
          const item = result.value;
          const isErrorClue = item.clue.toLowerCase().startsWith('error') || item.clue.toLowerCase().includes('timeout') || item.clue.toLowerCase().startsWith('no response') || item.clue.toLowerCase().startsWith('api error') || item.clue.toLowerCase().startsWith('setup error') || item.clue.toLowerCase().startsWith('clue for') || item.clue.toLowerCase().startsWith('invalid word');
          if (!isErrorClue) successfulClues++; else console.warn(`Clue generation failed/fallback for number ${item.number} (${item.direction}): ${item.clue}`);
          if (item.direction === 'across') finalClues.across.push({ number: item.number, clue: item.clue });
          else finalClues.down.push({ number: item.number, clue: item.clue });
      } else if (result.status === 'rejected') { console.error("Clue generation promise rejected:", result.reason); }
  });

  finalClues.across.sort((a, b) => a.number - b.number);
  finalClues.down.sort((a, b) => a.number - b.number);
  console.log(`Clue generation complete. ${successfulClues}/${clueCount} clues successfully generated.`);

  // *** Return grid, numbering, and clues (without words) ***
  return { grid, numbering, clues: finalClues };
  // --- End Clue Generation and Response Preparation ---
}


app.get('/generate', async (req, res) => {
  if (wordList.length === 0) {
    console.warn("Generate request received before word list loaded.");
    return res.status(503).json({ error: 'Word list not loaded yet. Please try again shortly.' });
  }
  try {
    const size = parseInt(req.query.size) || 4;
    console.log(`Received request to generate crossword with size ${size}`);
    const crosswordData = await generateCrossword(size); // Call generateCrossword
    console.log("Successfully generated crossword data for request.");
    res.json(crosswordData); // Send the object { grid, numbering, clues }
  } catch (error) {
    console.error('Error during crossword generation endpoint:', error);
    // Log the grid state if the error came from generateCrossword failure
    if (error.message.startsWith('Could not generate')) {
         console.error("Crossword generation failed. See logs above for details.");
    }
    res.status(500).json({ error: error.message || 'Failed to generate valid crossword. Please try again.' });
  }
});

// Load words first, then start server
fetchWords().then(() => {
  if (wordList.length === 0) {
      console.error("Word list is empty after attempting to load. Check words.txt.");
      process.exit(1);
  }
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(error => {
  console.error('Failed to fetch words or start server:', error);
  process.exit(1);
});