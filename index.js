const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs'); // Moved fs require to top

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4";

async function generateClue(word) {
  try {
    const response = await axios.post(OPENAI_API_URL, {
      model: OPENAI_MODEL,
      messages: [{
        role: "user",
        content: `These are crosswords for high schoolers, so it should be a reference that they can understand, but also is educational in nature. Generate a short, clever crossword puzzle clue for the word "${word}".`
      }],
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    // Basic check for valid response structure
    if (response.data && response.data.choices && response.data.choices.length > 0 && response.data.choices[0].message) {
        return response.data.choices[0].message.content.trim();
    } else {
        console.error('Unexpected response structure from OpenAI:', response.data);
        return `Clue for ${word}`; // Fallback
    }
  } catch (error) {
    // Log more detailed error information if available
    if (error.response) {
        // The request was made and the server responded with a status code
        // that falls out of the range of 2xx
        console.error('Error generating clue - Status:', error.response.status);
        console.error('Error generating clue - Data:', error.response.data);
    } else if (error.request) {
        // The request was made but no response was received
        console.error('Error generating clue - No response received:', error.request);
    } else {
        // Something happened in setting up the request that triggered an Error
        console.error('Error generating clue - Request setup error:', error.message);
    }
    return `Clue for ${word}`; // Fallback clue
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let wordList = [];
let globalSize = 4; // Default size, will be updated by generateCrossword

async function fetchWords() {
  try {
    const data = await fs.promises.readFile('words.txt', 'utf8');
    // Filter out empty lines and trim whitespace, ensure lowercase
    wordList = data.split('\n').map(word => word.trim().toLowerCase()).filter(word => word.length > 0 && /^[a-z]+$/.test(word));
    console.log(`Loaded ${wordList.length} words`);
  } catch (error) {
    console.error('Error reading words file:', error);
  }
}

function isValidPrefix(prefix) {
  // Optimization: If prefix is empty, it's trivially valid
  if (!prefix) return true;
  // Find words of the same length as the prefix for potential full match check
  const relevantLengthWords = wordList.filter(w => w.length === prefix.length);
  if (relevantLengthWords.length > 0 && relevantLengthWords.some(word => word === prefix)) {
      return true; // Exact match found
  }
  // Original check for prefix for incomplete words
  // Only check if prefix length is less than the grid size
  if (prefix.length < globalSize) {
      return wordList.some(word => word.startsWith(prefix));
  }
  // If prefix length equals grid size, it must be a full word match (already checked)
  return false;
}


function getMatchingWords(pattern, availableWords, usedWordsSet) {
    const patternLength = pattern.length;
    // Filter from availableWords instead of the full wordList for efficiency
    return availableWords.filter(word => {
      if (word.length !== patternLength) return false; // Ensure correct length
      if (usedWordsSet.has(word)) return false; // Skip already used words efficiently
      for (let i = 0; i < patternLength; i++) {
        // Allow empty pattern slots (''), or match existing letters
        if (pattern[i] !== '' && pattern[i] !== word[i]) return false;
      }
      return true;
    });
  }

// *** NEW/IMPROVED isValid FUNCTION ***
function isValid(row, col, word, isAcross, currentGrid, availableWords, usedWordsSet) {
    const size = currentGrid.length; // Get size from grid

    // Check if the word itself conflicts with existing letters (basic check)
    for (let i = 0; i < size; i++) {
        const charToPlace = word[i];
        let r = isAcross ? row : row + i;
        let c = isAcross ? col + i : col;
        if (currentGrid[r][c] !== '' && currentGrid[r][c] !== charToPlace) {
            // This check should ideally be redundant if getMatchingWords works correctly,
            // but it's a safety measure.
            // console.log(`Conflict detected in isValid at [${r},${c}] for word ${word}`);
            return false;
        }
    }

    // Create a temporary grid to test the placement
    let tempGrid = currentGrid.map(r => [...r]);
    for (let i = 0; i < size; i++) {
        let r = isAcross ? row : row + i;
        let c = isAcross ? col + i : col;
        tempGrid[r][c] = word[i];
    }

    // Now, for each cell affected by the placed word, check the crossing word's possibility
    for (let i = 0; i < size; i++) {
        let r_check = isAcross ? row : row + i;     // Row of the cell being checked
        let c_check = isAcross ? col + i : col;     // Column of the cell being checked

        let crossPattern = Array(size).fill('');
        let crossingWordHasContent = false;
        let isCrossingWordComplete = true;

        if (isAcross) {
            // We placed ACROSS, check the vertical (DOWN) word at column c_check
            for (let k = 0; k < size; k++) {
                const char = tempGrid[k][c_check] || '';
                crossPattern[k] = char;
                if (char !== '') crossingWordHasContent = true;
                else isCrossingWordComplete = false; // If any char is empty, it's not complete
            }
        } else {
            // We placed DOWN, check the horizontal (ACROSS) word at row r_check
            for (let k = 0; k < size; k++) {
                const char = tempGrid[r_check][k] || '';
                crossPattern[k] = char;
                if (char !== '') crossingWordHasContent = true;
                else isCrossingWordComplete = false; // If any char is empty, it's not complete
            }
        }

        // Perform the check if the crossing word has letters in it
        if (crossingWordHasContent) {
            // Use getMatchingWords to see if *any* valid word fits the crossing pattern.
            // Pass the *full* original word list for checking possibilities.
            // Exclude words already definitively placed on the board.
            const potentialCrossingWords = getMatchingWords(crossPattern, wordList, usedWordsSet);

            // If NO words can possibly fit this crossing pattern now, the placement is invalid.
            if (potentialCrossingWords.length === 0) {
                 // console.log(`Placing '${word}' invalidates crossing word at ${isAcross ? `col ${c_check}` : `row ${r_check}`} (pattern: [${crossPattern.join(', ')}]). No possibilities found.`);
                 return false;
            }

            // If the crossing word is now complete, check if it's a valid word itself
            // (This check might be slightly redundant if getMatchingWords works perfectly, but adds robustness)
            if (isCrossingWordComplete) {
                const completedWord = crossPattern.join('');
                if (!wordList.includes(completedWord)) {
                    // console.log(`Placing '${word}' creates invalid complete crossing word '${completedWord}' at ${isAcross ? `col ${c_check}` : `row ${r_check}`}.`);
                    return false;
                }
            }
        }
    }

    // If all crossing words are still possible after placing the word, it's valid.
    return true;
}


async function generateCrossword(requestedSize = 4) {
  console.log(`Starting generateCrossword with size: ${requestedSize}`);
  const size = parseInt(requestedSize); // Ensure it's a number
  globalSize = size; // Update global size for isValidPrefix

  if (![4, 5, 6].includes(size)) {
    console.log(`Invalid size requested: ${size}`);
    throw new Error('Invalid grid size. Must be 4, 5, or 6.');
  }

  console.log('Initializing grid and usedWords');
  const grid = Array(size).fill().map(() => Array(size).fill(''));
  const usedWords = { across: Array(size).fill(undefined), down: Array(size).fill(undefined) }; // Use arrays initialized with undefined
  const usedWordsSet = new Set(); // Faster lookup for used words

  // Filter words for correct length from the master list
  console.log(`Filtering words for length ${size}`);
  // Make a copy of the wordList filtered by size for this generation attempt
  let availableSizeWords = wordList.filter(word => word.length === size);
  console.log(`Found ${availableSizeWords.length} words of length ${size}`);

  if (availableSizeWords.length < size * 2) { // Need at least enough for one pass
    console.log(`Insufficient words: only ${availableSizeWords.length} words available`);
    throw new Error(`Not enough ${size}-letter words available to create a crossword`);
  }

  // Start with a random word for the first row (ACROSS)
  console.log('Selecting initial random word for the first row');
  if (availableSizeWords.length === 0) {
      console.error("No words of the required size available to start.");
      throw new Error(`No ${size}-letter words found in the list.`);
  }
  const startWordIndex = Math.floor(Math.random() * availableSizeWords.length);
  const startWord = availableSizeWords[startWordIndex];

  console.log(`Initial word selected: ${startWord}`);

  for (let i = 0; i < size; i++) {
    grid[0][i] = startWord[i];
  }
  usedWords.across[0] = startWord; // Assign directly to index 0
  usedWordsSet.add(startWord);

  // Remove the used starting word from the *local available pool* for this generation
  availableSizeWords.splice(startWordIndex, 1);
  console.log(`Removed ${startWord} from available pool. Pool size now: ${availableSizeWords.length}`);

  function solve(pos = 0) { // Default pos=0 is fine for recursion itself
    //console.log(`\n=== Solve attempt at position: ${pos} ===`); // Keep this log if useful
    if (pos === size * 2) { // Base case: filled all slots (size ACROSS + size DOWN)
      console.log('Successfully placed all required word slots!');
      console.log('Final grid:');
      console.log(grid.map(row => row.join(' ')).join('\n'));
      //console.log('Used words object:', usedWords); // Log the object structure if needed
      return true; // Successfully filled the grid
    }

    // Determine orientation and position based on 'pos'
    // This assumes ACROSS 0, DOWN 0, ACROSS 1, DOWN 1, ...
    const isAcross = pos % 2 === 0;
    const index = Math.floor(pos / 2); // Which row (if Across) or col (if Down)

    // Define row/col based on orientation and index
    const row = isAcross ? index : 0; // Starting row (fixed for DOWN)
    const col = isAcross ? 0 : index; // Starting column (fixed for ACROSS)

    console.log(`Position ${pos}: Trying to place ${isAcross ? 'ACROSS' : 'DOWN'} word at ${isAcross ? `row ${index}` : `col ${index}`}`);
    console.log('Current grid state:');
    console.log(grid.map(r => r.map(c => c || '_').join(' ')).join('\n')); // Display grid better with '_' for empty

    // Get pattern for current position from the grid
    let pattern = Array(size).fill('');
    if (isAcross) {
      for (let i = 0; i < size; i++) {
        pattern[i] = grid[index][i] || ''; // Use index for row, iterate columns
      }
    } else {
      for (let i = 0; i < size; i++) {
        pattern[i] = grid[i][index] || ''; // Use index for col, iterate rows
      }
    }
    console.log(`Pattern to match: [${pattern.map(p => p || '_').join(', ')}]`);

    // Find words matching the pattern from the AVAILABLE pool, excluding already used words
    const possibleWords = getMatchingWords(pattern, availableSizeWords, usedWordsSet);
    console.log(`Found ${possibleWords.length} possible words matching pattern (and not already used).`);

    // Shuffle possible words for variety
    const shuffledWords = possibleWords.sort(() => Math.random() - 0.5);

    for (const word of shuffledWords) {
      // Double check: Skip if already used (should be handled by getMatchingWords now)
      // if (usedWordsSet.has(word)) {
      //   console.log(`Skipping already used word (should not happen?): ${word}`);
      //   continue;
      // }

      //console.log(`\nAttempting word: ${word} at pos ${pos}`); // Verbose logging

      // Save current state BEFORE trying the word
      const gridBackup = grid.map(innerRow => [...innerRow]); // Deep copy

      // Check if the word is valid to place (checks conflicts and crossing word possibilities)
      // *** UPDATED isValid CALL ***
      if (isValid(index, index, word, isAcross, grid, availableSizeWords, usedWordsSet)) {
      // The row/col for isValid might need adjustment depending on how you define it,
      // using 'index' for both assumes the word starts at [index, index] which isn't
      // always true with the row=isAcross?index:0 logic. Let's use the correct start row/col.
      // Corrected call:
      // if (isValid(isAcross ? index : 0, isAcross ? 0 : index, word, isAcross, grid, availableSizeWords, usedWordsSet)) { // Use start row/col
      // Let's rethink. The 'isValid' function itself calculates the r, c based on isAcross and loop index 'i'.
      // It needs the *start* row/col of the word being placed.
      // If isAcross, word starts at row=`index`, col=0.
      // If !isAcross (Down), word starts at row=0, col=`index`.
      // So the parameters passed should be `isValid(start_row, start_col, ...)`

          if (isValid(isAcross ? index : 0, isAcross ? 0 : index, word, isAcross, grid, availableSizeWords, usedWordsSet)) { // Corrected start row/col
              console.log(`Word ${word} seems valid, placing it.`);
              // Place the word
              if (isAcross) {
                  for (let i = 0; i < size; i++) grid[index][i] = word[i]; // Place in row 'index'
                  usedWords.across[index] = word; // Store by index
                  usedWordsSet.add(word);
              } else {
                  for (let i = 0; i < size; i++) grid[i][index] = word[i]; // Place in column 'index'
                  usedWords.down[index] = word; // Store by index
                  usedWordsSet.add(word);
              }

              // Recurse to the next position
              if (solve(pos + 1)) return true; // Success! Propagate upwards

              // --- Backtracking ---
              console.log(`\n🔄 Backtracking from position ${pos}, removing word: ${word}`);
              usedWordsSet.delete(word); // Remove from used set
              if (isAcross) {
                  usedWords.across[index] = undefined; // Clear the word slot
                  // Must clear the grid letters only if they weren't part of an existing crossing word
                  for (let i = 0; i < size; i++) {
                      // Check if the crossing (down) word at this column index exists
                      if (!usedWords.down[i]) { // If no down word uses this cell yet
                          grid[index][i] = ''; // Clear the cell
                      } else {
                          // If a down word exists, restore the original letter from backup
                          grid[index][i] = gridBackup[index][i];
                      }
                  }

              } else { // Backtracking a DOWN word
                  usedWords.down[index] = undefined; // Clear the word slot
                   for (let i = 0; i < size; i++) {
                      // Check if the crossing (across) word at this row index exists
                      if (!usedWords.across[i]) { // If no across word uses this cell yet
                           grid[i][index] = ''; // Clear the cell
                      } else {
                           // Restore from backup if an across word exists
                           grid[i][index] = gridBackup[i][index];
                      }
                   }
              }
              // Restore the grid state precisely (simpler than conditional clearing)
              for (let i = 0; i < size; i++) {
                  for (let j = 0; j < size; j++) {
                      grid[i][j] = gridBackup[i][j];
                  }
              }

              console.log('Grid restored to previous state:');
              console.log(grid.map(r => r.map(c => c || '_').join(' ')).join('\n')); // Log restored grid
          } else {
              // console.log(`Word ${word} is not valid according to isValid check.`); // Optional log
          }
      } // End loop through shuffledWords

      console.log(`Failed to find a suitable word for position ${pos}. Backtracking further.`);
      return false; // Failed to find a word for this position
  }

  // *** START THE RECURSIVE SOLVER ***
  // Start from position 1 because position 0 (first ACROSS) was pre-filled.
  console.log("Starting recursive solver from position 1 (attempting first DOWN word)...");
  const success = solve(1); // Call solve starting from the first DOWN word slot

  if (!success) {
    console.error('Failed to place all words during the recursive solve process.');
    // Consider trying again with a different start word or relaxing constraints
    throw new Error('Could not generate a valid crossword with the current word list and constraints.');
  }

  // --- Post-generation: Generate Clues and Numbering ---
  console.log("Crossword grid generated successfully. Generating clues and numbering...");
  const numbering = Array(size).fill().map(() => Array(size).fill(0));
  const clues = { across: [], down: [] };
  let currentNumber = 1;
  const starts = {}; // Keep track of starts: "row,col" -> number

  const finalWords = { across: {}, down: {} }; // Store final words with their numbers

  // Number the squares and identify word starts
  for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
          // A cell gets a number if a word starts there (ACROSS or DOWN)
          // Condition for ACROSS start: It's the first column OR the cell to the left is empty/null. AND the cell itself is not empty.
          const isAcrossStart = grid[r][c] && (c === 0 || !grid[r][c - 1]);
          // Condition for DOWN start: It's the first row OR the cell above is empty/null. AND the cell itself is not empty.
          const isDownStart = grid[r][c] && (r === 0 || !grid[r - 1][c]);

          if (isAcrossStart || isDownStart) {
              if (!starts[`${r},${c}`]) { // Assign number only if not already assigned
                  numbering[r][c] = currentNumber;
                  starts[`${r},${c}`] = currentNumber;

                  // Find the word associated with this start position
                  if (isAcrossStart) {
                      let word = '';
                      for (let k = c; k < size && grid[r][k]; k++) {
                          word += grid[r][k];
                      }
                       // Check if this word length matches grid size and is actually used
                       if (word.length === size && usedWords.across.includes(word)) {
                           finalWords.across[currentNumber] = word;
                       } else if (word.length > 1) { // Handle partial words or ensure it's a real word start
                            // This might need refinement if partial words are allowed.
                            // For now, assume only full-size words are intended.
                            if (usedWords.across.includes(word)) { // Double check if it's in our list
                                finalWords.across[currentNumber] = word;
                            }
                       }
                  }
                  if (isDownStart) {
                      let word = '';
                      for (let k = r; k < size && grid[k][c]; k++) {
                          word += grid[k][c];
                      }
                       if (word.length === size && usedWords.down.includes(word)) {
                           finalWords.down[currentNumber] = word;
                       } else if (word.length > 1) {
                           if (usedWords.down.includes(word)) {
                               finalWords.down[currentNumber] = word;
                           }
                       }
                  }
                  currentNumber++;
              } else {
                 // If number exists, still check if this position ALSO starts another word direction
                 const existingNumber = starts[`${r},${c}`];
                 if (isAcrossStart && !finalWords.across[existingNumber]) {
                     let word = '';
                     for (let k = c; k < size && grid[r][k]; k++) { word += grid[r][k]; }
                     if (usedWords.across.includes(word)) finalWords.across[existingNumber] = word;
                 }
                 if (isDownStart && !finalWords.down[existingNumber]) {
                      let word = '';
                      for (let k = r; k < size && grid[k][c]; k++) { word += grid[k][c]; }
                      if (usedWords.down.includes(word)) finalWords.down[existingNumber] = word;
                 }
              }
          }
      }
  }


  // Generate clues for the identified words async
  const generateAllClues = async () => {
    const cluePromises = [];
    for (const num in finalWords.across) {
        const word = finalWords.across[num];
        cluePromises.push(
            generateClue(word).then(clue => ({ direction: 'across', number: parseInt(num), clue, word }))
        );
    }
    for (const num in finalWords.down) {
        const word = finalWords.down[num];
        cluePromises.push(
            generateClue(word).then(clue => ({ direction: 'down', number: parseInt(num), clue, word }))
        );
    }
    return await Promise.all(cluePromises);
  };

  // Wait for all clues to be generated
  const generatedClues = await generateAllClues();

  // Populate the clues object
  generatedClues.forEach(item => {
      if (item.direction === 'across') {
          clues.across.push({ number: item.number, clue: item.clue, word: item.word });
      } else {
          clues.down.push({ number: item.number, clue: item.clue, word: item.word });
      }
  });


  // Sort clues by number
  clues.across.sort((a, b) => a.number - b.number);
  clues.down.sort((a, b) => a.number - b.number);


  console.log("Clue generation complete.");
  return {
    grid,
    // words: usedWords, // Might be less useful now with finalWords
    numbering,
    clues
  };
}

app.get('/generate', async (req, res) => {
  if (wordList.length === 0) {
    console.warn("Generate request received before word list loaded.");
    return res.status(503).json({ error: 'Word list not loaded yet. Please try again shortly.' });
  }

  try {
    const size = parseInt(req.query.size) || 4; // Default to 4x4
    console.log(`Received request to generate crossword with size ${size}`);
    const crossword = await generateCrossword(size);
    console.log("Successfully generated crossword for request.");
    res.json(crossword);
  } catch (error) {
    console.error('Error during crossword generation:', error);
    // Send back the specific error message from the generator if available
    res.status(500).json({ error: error.message || 'Failed to generate valid crossword. Please try again.' });
  }
});

// Load words first, then start server
fetchWords().then(() => {
  if (wordList.length === 0) {
      console.error("Word list is empty after attempting to load. Check words.txt.");
      // Optionally exit or prevent server start
      process.exit(1); // Exit if words are critical
  }
  const PORT = process.env.PORT || 5000; // Use environment variable for port if available
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}).catch(error => {
  console.error('Failed to fetch words or start server:', error);
  process.exit(1); // Exit if essential setup fails
});