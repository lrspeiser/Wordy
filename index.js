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
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error('Error generating clue:', error);
    return `Clue for ${word}`; // Fallback clue
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let wordList = [];

// const fs = require('fs'); // Already moved to top

async function fetchWords() {
  try {
    const data = await fs.promises.readFile('words.txt', 'utf8');
    // Filter out empty lines and trim whitespace
    wordList = data.split('\n').map(word => word.trim().toLowerCase()).filter(word => word.length > 0);
    console.log(`Loaded ${wordList.length} words`);
  } catch (error) {
    console.error('Error reading words file:', error);
  }
}

function isValidPrefix(prefix) {
  // Optimization: If prefix is empty, it's trivially valid
  if (!prefix) return true;
  // Optimization: If prefix length equals word length, check for exact match
  if (prefix.length > 0 && prefix.length === wordList.find(w => w.length === prefix.length)?.length) {
      return wordList.some(word => word === prefix);
  }
  // Original check for prefix
  return wordList.some(word => word.startsWith(prefix));
}


function getMatchingWords(pattern, availableWords, usedWordsSet) {
    // Filter from availableWords instead of the full wordList for efficiency
    return availableWords.filter(word => {
      if (word.length !== pattern.length) return false; // Should already be filtered, but good check
      if (usedWordsSet.has(word)) return false; // Skip already used words efficiently
      for (let i = 0; i < word.length; i++) {
        // Allow empty pattern slots (''), or match existing letters
        if (pattern[i] !== '' && pattern[i] !== word[i]) return false;
      }
      return true;
    });
  }

async function generateCrossword(size = 4) {
  console.log(`Starting generateCrossword with size: ${size}`);
  size = parseInt(size);
  if (![4, 5, 6].includes(size)) {
    console.log(`Invalid size requested: ${size}`);
    throw new Error('Invalid grid size. Must be 4, 5, or 6.');
  }

  console.log('Initializing grid and usedWords');
  const grid = Array(size).fill().map(() => Array(size).fill(''));
  const usedWords = { across: [], down: [] };
  const usedWordsSet = new Set(); // Faster lookup for used words

  // Filter words for correct length
  console.log(`Filtering words for length ${size}`);
  // Keep the original filter logic but maybe assign to a mutable variable if needed
  let sizeWords = wordList.filter(word => word.length === size && /^[a-z]+$/.test(word));
  console.log(`Found ${sizeWords.length} words of length ${size}`);

  if (sizeWords.length < size * 2) { // Need at least enough for one pass
    console.log(`Insufficient words: only ${sizeWords.length} words available`);
    throw new Error(`Not enough ${size}-letter words available to create a crossword`);
  }

  // Start with a random word for the first row (ACROSS)
  console.log('Selecting initial random word for the first row');
  const startWordIndex = Math.floor(Math.random() * sizeWords.length);
  const startWord = sizeWords[startWordIndex];

  if (!startWord) {
      console.error("Failed to select a starting word. sizeWords might be empty or filtered incorrectly.");
      throw new Error("Could not select an initial word.");
  }
  console.log(`Initial word selected: ${startWord}`);

  for (let i = 0; i < size; i++) {
    grid[0][i] = startWord[i];
  }
  usedWords.across[0] = startWord; // Assign directly to index 0
  usedWordsSet.add(startWord);

  // Remove the used starting word from the pool to avoid immediate reuse conflicts
  sizeWords.splice(startWordIndex, 1);
  console.log(`Removed ${startWord} from available pool. Pool size now: ${sizeWords.length}`);


  // NOTE: The 'isValid' function below has potential issues.
  // It modifies the grid directly during checking, which can interfere with backtracking.
  // It also only checks prefixes, not necessarily if placing a letter makes a crossing word impossible.
  // A more robust 'isValid' would check hypothetically without altering the grid passed to it.
  function isValid(row, col, word, isAcross, currentGrid) {
     // Check if word fits and doesn't immediately invalidate crossing words/prefixes
     // This is a simplified check; a full check would be more complex.
     for (let i = 0; i < size; i++) {
         const charToPlace = word[i];
         let r = isAcross ? row : row + i;
         let c = isAcross ? col + i : col;

         // Check conflict with existing letter
         if (currentGrid[r][c] !== '' && currentGrid[r][c] !== charToPlace) {
             return false;
         }

         // Check prefix validity in the crossing direction
         let prefix = '';
         if (isAcross) { // Check vertical prefix downwards
             for (let k = 0; k <= r; k++) {
                 prefix += (k === r) ? charToPlace : currentGrid[k][c];
             }
             // Only check prefix if it's more than one letter OR if it completes the word
             if (prefix.length > 1 && !isValidPrefix(prefix)) return false;
         } else { // Check horizontal prefix rightwards
             for (let k = 0; k <= c; k++) {
                 prefix += (k === c) ? charToPlace : currentGrid[r][k];
             }
             // Only check prefix if it's more than one letter OR if it completes the word
             if (prefix.length > 1 && !isValidPrefix(prefix)) return false;
         }
     }
     return true; // Word seems valid based on conflicts and prefixes
   }

  function solve(pos = 0) {
    if (pos === size * 2) {
      console.log('Successfully placed all required word slots!');
      console.log('Final grid:');
      console.log(grid.map(row => row.join(' ')).join('\n'));
      return true;
    }

    // Early exit if we detect an impossible pattern
    const isAcross = pos % 2 === 0;
    const index = Math.floor(pos / 2);
    const pattern = Array(size).fill('');
    if (isAcross) {
      for (let i = 0; i < size; i++) {
        pattern[i] = grid[index][i] || '';
      }
    } else {
      for (let i = 0; i < size; i++) {
        pattern[i] = grid[i][index] || '';
      }
    }

    // Quick check if pattern has any possible matches before trying words
    const hasValidWords = sizeWords.some(word => {
      if (usedWordsSet.has(word)) return false;
      for (let i = 0; i < size; i++) {
        if (pattern[i] && pattern[i] !== word[i]) return false;
      }
      return true;
    });

    if (!hasValidWords) return false;

    console.log(`Position ${pos}: Trying to place ${isAcross ? 'ACROSS' : 'DOWN'} word at ${isAcross ? `row ${index}` : `col ${index}`}`);
    console.log('Current grid state:');
    console.log(grid.map(r => r.join(' ') || ' ').join('\n')); // Display grid better

    console.log(`Pattern to match: [${pattern.join(', ')}]`);

    // Find words matching the pattern from the AVAILABLE pool, excluding already used words
    const possibleWords = getMatchingWords(pattern, sizeWords, usedWordsSet);
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
      const gridBackup = grid.map(row => [...row]);
      // Check if the word is valid to place (based on conflicts and prefixes)
      // Pass the current grid state to isValid
      if (isValid(index, index, word, isAcross, grid)) { // Simplified call assuming row=index, col=index based on pos logic
                                                        // Might need adjustment if row/col logic changes
          console.log(`Word ${word} seems valid, placing it.`);
          // Place the word
          if (isAcross) {
              for (let i = 0; i < size; i++) grid[index][i] = word[i];
              usedWords.across[index] = word; // Store by index
              usedWordsSet.add(word);
          } else {
              for (let i = 0; i < size; i++) grid[i][index] = word[i];
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
          } else {
              usedWords.down[index] = undefined; // Clear the word slot
          }
          // Restore the grid correctly using the backup and the 'size' variable
          for (let i = 0; i < size; i++) { // Use dynamic size
              for (let j = 0; j < size; j++) { // Use dynamic size
                  grid[i][j] = gridBackup[i][j];
              }
          }
          console.log('Grid restored to previous state:');
          console.log(grid.map(r => r.join(' ') || ' ').join('\n')); // Log restored grid
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
          if (grid[r][c] === '') continue; // Skip empty cells

          const isAcrossStart = (c === 0 || grid[r][c-1] === '');
          const isDownStart = (r === 0 || grid[r-1][c] === '');

          if (isAcrossStart || isDownStart) {
              numbering[r][c] = currentNumber;
              starts[`${r},${c}`] = currentNumber;

              if (isAcrossStart && usedWords.across[r]) { // Check if an across word actually exists for this row
                  finalWords.across[currentNumber] = usedWords.across[r];
              }
              if (isDownStart && usedWords.down[c]) { // Check if a down word actually exists for this col
                  finalWords.down[currentNumber] = usedWords.down[c];
              }
              currentNumber++;
          }
      }
  }

  // Generate clues for the identified words
  for (const num in finalWords.across) {
      const word = finalWords.across[num];
      const clue = await generateClue(word);
      clues.across.push({ number: parseInt(num), clue, word });
  }
  for (const num in finalWords.down) {
      const word = finalWords.down[num];
      const clue = await generateClue(word);
      clues.down.push({ number: parseInt(num), clue, word });
  }

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