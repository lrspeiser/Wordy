const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const { Pool } = require('pg'); // **** ADDED for PostgreSQL ****
const { v4: uuidv4 } = require('uuid'); // **** ADDED for UUIDs ****

// --- Database Configuration (Use Replit Secrets for sensitive info) ---
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // Replit provides this
  ssl: {
    rejectUnauthorized: false // Necessary for some Replit setups
  }
});

// --- Function to Initialize Database ---
async function initializeDatabase() {
  let client; // Define client outside try block for finally
  try {
    client = await pool.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS puzzles (
        id UUID PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        size INTEGER NOT NULL,
        grid_data JSONB NOT NULL,
        numbering_data JSONB NOT NULL,
        clues_data JSONB NOT NULL,
        solution_data JSONB NOT NULL, -- Store the solution grid
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('Database table "puzzles" checked/created successfully.');
  } catch (err) {
    console.error('Error initializing database table:', err);
    // Decide if you want to exit if DB setup fails
    // process.exit(1);
  } finally {
    if (client) {
        client.release(); // Release client if it was acquired
    }
  }
}


const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4.1"; // must use gpt-4.1 everywhere, don't change this comment

// --- generateClue (MODIFIED to accept theme) ---
async function generateClue(word, theme = null) { // Added theme parameter
  if (!word || typeof word !== 'string' || word.trim().length === 0) {
    console.error('generateClue called with invalid word:', word);
    return `Invalid word provided`;
  }
  console.log(`Requesting clue for: ${word}${theme ? ` (Theme: ${theme})` : ''}`); // Log theme if present

  // --- Dynamically build the prompt content ---
  // Original prompt core: Create a brief, educational crossword clue for the word "${word}".
  let promptContent = `Create a brief, educational crossword clue for the word "${word}".`;
  if (theme) {
    // Add thematic instruction if theme is provided
    promptContent += ` Try to subtly relate the clue to the puzzle's overall theme: "${theme}", if it makes sense and fits naturally. Do not force the connection if it feels awkward or too obscure.`;
  }
  // Add formatting instructions
  promptContent += ` Respond with a JSON object containing only a "clue" field. Do not include any other text, formatting, or explanation. Example for word FREE, {"clue": "Something that doesn't cost anything"}`;
  // --- End prompt building ---

  try {
    const response = await axios.post(OPENAI_API_URL, {
      model: OPENAI_MODEL, // must use gpt-4.1 everywhere
      messages: [{ role: "user", content: promptContent }], // Use constructed prompt
      response_format: { "type": "json_object" },
    }, {
      timeout: 20000,
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.choices?.[0]?.message?.content) {
        const jsonResponse = JSON.parse(response.data.choices[0].message.content);
        if (!jsonResponse.clue) {
          console.error(`Invalid JSON response format for clue '${word}':`, jsonResponse);
          return `Clue for ${word}`;
        }
        let clue = jsonResponse.clue.replace(/\*\*/g, '').trim();
        // console.log(`Cleaned clue for '${word}': ${clue}`); // Optional logging
        return clue;
    } else {
        console.error(`Unexpected response structure from OpenAI for clue '${word}':`, response.data);
        return `Clue for ${word}`; // Fallback
    }
  } catch (error) {
    // Keep original detailed error handling
    let errorMsg = `Clue for ${word}`; // Default fallback
    if (error.code === 'ECONNABORTED' || (error.message && error.message.toLowerCase().includes('timeout'))) {
        console.error(`Error generating clue for "${word}": OpenAI request timed out.`);
        errorMsg = `Timeout fetching clue for ${word}`;
    } else if (error.response) {
        console.error(`Error generating clue for "${word}" - Status:`, error.response.status);
        // Log the detailed error data from OpenAI
        console.error(`Error generating clue for "${word}" - Data:`, JSON.stringify(error.response.data, null, 2));
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

// --- **** NEW: Function to Generate Theme/Title from First Clue **** ---
// NOTE: This replaces the previous 'generateTitle' function which took all clues.
async function generateThemeTitle(firstWord, firstClue) {
  console.log(`Requesting theme title based on: Word="${firstWord}", Clue="${firstClue}"`);
  if (!firstWord || !firstClue || firstClue.toLowerCase().startsWith('error') || firstClue.toLowerCase().includes('timeout') || firstClue.toLowerCase().startsWith('api error')) {
    console.warn("Cannot generate theme title due to invalid first word or clue generation failure.");
    return "General Knowledge Puzzle"; // More descriptive fallback
  }

  const promptContent = `Based *only* on the crossword word "${firstWord}" and its clue "${firstClue}", suggest a short (4-8 word) thematic title for the entire crossword puzzle. Try to pick a theme that is based on pop culture, like movies or music, but if you can't use themes from academia. Respond with ONLY a JSON object containing a "title" field, like {"title": "Suggested Theme"}. Do not include any extra text or explanation.`;

  try {
      const response = await axios.post(OPENAI_API_URL, {
          model: OPENAI_MODEL, // must use gpt-4.1 everywhere
          messages: [{ role: "user", content: promptContent }],
          response_format: { "type": "json_object" },
      }, {
          timeout: 15000,
          headers: {
              'Authorization': `Bearer ${OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
          }
      });

      if (response.data?.choices?.[0]?.message?.content) {
          const jsonResponse = JSON.parse(response.data.choices[0].message.content);
          if (jsonResponse.title && typeof jsonResponse.title === 'string') {
              let title = jsonResponse.title.replace(/["']/g, '').trim();
              console.log(`Generated Theme Title: ${title}`);
              return title;
          } else {
              console.error("Invalid title format in GPT response for theme:", jsonResponse);
              return "Crossword Challenge"; // Fallback
          }
      } else {
          console.error("Unexpected theme title response structure from OpenAI:", response.data);
          return "Puzzle Time"; // Fallback
      }
  } catch (error) {
      if (error.response) {
            console.error(`Error generating theme title - Status:`, error.response.status);
            console.error(`Error generating theme title - Data:`, JSON.stringify(error.response.data, null, 2));
        } else {
            console.error("Error generating theme title (non-response error):", error.message);
        }
      return "My Crossword"; // Fallback on error
  }
}

// --- Function to Save Puzzle ---
// (No changes needed, keeping the original savePuzzle function)
async function savePuzzle(puzzleData) {
  const { id, title, size, grid, numbering, clues, solutionGrid } = puzzleData;
  const query = `
    INSERT INTO puzzles (id, title, size, grid_data, numbering_data, clues_data, solution_data)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id;
  `;
  const values = [
      id, title, size, JSON.stringify(grid), JSON.stringify(numbering), JSON.stringify(clues), JSON.stringify(solutionGrid)
  ];
  let client;
  try {
      client = await pool.connect();
      const result = await client.query(query, values);
      console.log(`Puzzle saved successfully with ID: ${result.rows[0].id}`);
      return result.rows[0].id;
  } catch (err) {
      console.error('Error saving puzzle to database:', err);
      throw new Error('Failed to save puzzle.');
  } finally {
      if (client) { client.release(); }
  }
}


const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let wordList = [];
let globalSize = 4;

// --- Fetch Words ---
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

// --- isValidPrefix ---
function isValidPrefix(prefix) {
    if (!prefix) return true;
    const prefixLen = prefix.length;
    if (wordList.some(word => word.length === prefixLen && word === prefix)) { return true; }
    if (prefixLen < globalSize) { return wordList.some(word => word.startsWith(prefix)); }
    return false;
}

// --- getMatchingWords ---
function getMatchingWords(pattern, availableWords, usedWordsSet) {
    const patternLength = pattern.length;
    if (!Array.isArray(availableWords)) { console.error("getMatchingWords received non-array:", availableWords); return []; }
    return availableWords.filter(word => {
      if (typeof word !== 'string' || word.length !== patternLength) return false;
      if (usedWordsSet && usedWordsSet.has(word)) return false;
      for (let i = 0; i < patternLength; i++) { if (pattern[i] !== '' && pattern[i] !== word[i]) return false; }
      return true;
    });
}

// --- isValid ---
function isValid(row, col, word, isAcross, currentGrid, availableWordsFullList, usedWordsSet) {
    const size = currentGrid.length;
    for (let i = 0; i < size; i++) {
        const charToPlace = word[i]; let r = isAcross ? row : row + i; let c = isAcross ? col + i : col;
        if (r < 0 || r >= size || c < 0 || c >= size) { console.error(`isValid bounds check failed: r=${r}, c=${c}, size=${size}`); return false; }
        if (currentGrid[r][c] !== '' && currentGrid[r][c] !== charToPlace) { return false; }
    }
    let tempGrid = currentGrid.map(r => [...r]);
    for (let i = 0; i < size; i++) { let r = isAcross ? row : row + i; let c = isAcross ? col + i : col; tempGrid[r][c] = word[i]; }
    for (let i = 0; i < size; i++) {
        let r_check = isAcross ? row : row + i; let c_check = isAcross ? col + i : col;
        let crossPattern = Array(size).fill(''); let crossingWordHasContent = false; let isCrossingWordComplete = true;
        if (isAcross) { for (let k = 0; k < size; k++) { const char = tempGrid[k][c_check] || ''; crossPattern[k] = char; if (char !== '') crossingWordHasContent = true; else isCrossingWordComplete = false; } }
        else { for (let k = 0; k < size; k++) { const char = tempGrid[r_check][k] || ''; crossPattern[k] = char; if (char !== '') crossingWordHasContent = true; else isCrossingWordComplete = false; } }
        if (crossingWordHasContent) {
            const relevantWordList = availableWordsFullList.filter(w => w.length === size);
            const potentialCrossingWords = getMatchingWords(crossPattern, relevantWordList, null);
            if (potentialCrossingWords.length === 0) { return false; }
            if (isCrossingWordComplete) {
                const completedWord = crossPattern.join('');
                if (!wordList.includes(completedWord)) { return false; }
            }
        }
    }
    return true;
}

// --- generateCrossword (MODIFIED for thematic clue generation) ---
async function generateCrossword(requestedSize = 4, attempts = 0) {
  console.log(`Starting generateCrossword with size: ${requestedSize} (attempt ${attempts + 1})`);
  const size = parseInt(requestedSize);
  globalSize = size;
  const maxAttempts = 3;

  // --- Grid initialization, word filtering, start word selection ---
  if (![4, 5, 6].includes(size)) throw new Error('Invalid grid size. Must be 4, 5, or 6.');
  const grid = Array(size).fill().map(() => Array(size).fill(''));
  const usedWords = { across: Array(size).fill(null), down: Array(size).fill(null) };
  const usedWordsSet = new Set();
  let availableSizeWords = wordList.filter(word => word.length === size);
  const requiredWords = Math.max(Math.floor(size*1.5), 8);
  if (availableSizeWords.length < requiredWords) throw new Error(`Not enough ${size}-letter words available (need ${requiredWords}, found ${availableSizeWords.length})`);
  const startWordIndex = Math.floor(Math.random() * availableSizeWords.length);
  const startWord = availableSizeWords[startWordIndex];
  console.log(`Initial word selected: ${startWord}`);
  for (let i = 0; i < size; i++) grid[0][i] = startWord[i];
  usedWords.across[0] = startWord; usedWordsSet.add(startWord);

  // --- solve FUNCTION ---
  function solve(pos = 0) { /* ... (no changes needed) ... */
    if (pos === size * 2) { return true; }
    const isAcross = pos % 2 === 0; const index = Math.floor(pos / 2);
    const start_row = isAcross ? index : 0; const start_col = isAcross ? 0 : index;
    let pattern = Array(size).fill('');
    if (isAcross) { for (let i = 0; i < size; i++) pattern[i] = grid[index][i] || ''; }
    else { for (let i = 0; i < size; i++) pattern[i] = grid[i][index] || ''; }
    const possibleWords = getMatchingWords(pattern, availableSizeWords, usedWordsSet);
    const shuffledWords = possibleWords.sort(() => Math.random() - 0.5);
    for (const word of shuffledWords) {
       const gridBackup = grid.map(innerRow => [...innerRow]);
       if (isValid(start_row, start_col, word, isAcross, grid, wordList, usedWordsSet)) {
           if (isAcross) { for (let i = 0; i < size; i++) grid[index][i] = word[i]; usedWords.across[index] = word; }
           else { for (let i = 0; i < size; i++) grid[i][index] = word[i]; usedWords.down[index] = word; }
           usedWordsSet.add(word);
           if (solve(pos + 1)) return true;
           usedWordsSet.delete(word);
           if (isAcross) usedWords.across[index] = null; else usedWords.down[index] = null;
           for (let i = 0; i < size; i++) { for (let j = 0; j < size; j++) { grid[i][j] = gridBackup[i][j]; } }
       }
    }
    return false;
  }

  // *** START THE RECURSIVE SOLVER ***
  console.log("Starting recursive solver...");
  const success = solve(1);
  const solutionGrid = grid.map(row => [...row]); // CAPTURE THE SOLUTION GRID
  if (!success) {
    console.error('Failed to place all words during the recursive solve process.');
    if (attempts < maxAttempts) {
      console.log(`Retrying crossword generation (attempt ${attempts + 2}/${maxAttempts + 1})`);
      return generateCrossword(requestedSize, attempts + 1); // Return the recursive call
    }
    throw new Error('Could not generate a valid crossword after multiple attempts.');
  }
  console.log("Recursive solver finished successfully.");

  // --- Post-generation: Numbering & Finding Final Words ---
  console.log("Numbering and finding final words...");
  const numbering = Array(size).fill().map(() => Array(size).fill(0));
  let currentNumber = 1; const starts = {}; const wordsForClues = { across: {}, down: {} };
  let firstWordDetails = null; // To store details of the first word found

  for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
          if (!solutionGrid[r][c]) continue;
          const isAcrossStart = (c === 0 || !solutionGrid[r][c - 1]);
          const isDownStart = (r === 0 || !solutionGrid[r - 1][c]);
          if (isAcrossStart || isDownStart) {
              const startKey = `${r},${c}`; let numToUse = starts[startKey];
              if (!numToUse) { numToUse = currentNumber++; numbering[r][c] = numToUse; starts[startKey] = numToUse; }
              else if (numbering[r][c] === 0) { numbering[r][c] = numToUse; }

              // Prioritize across word for number 1 if both start at [0,0]
              if (isAcrossStart && !wordsForClues.across[numToUse]) {
                  let word = ''; for (let k = c; k < size && solutionGrid[r][k]; k++) word += solutionGrid[r][k];
                  if (word.length > 1 && (usedWords.across.includes(word) || usedWords.down.includes(word) || wordList.includes(word))) {
                     wordsForClues.across[numToUse] = word;
                     // Capture the first word (number 1) preferentially if it's across
                     if (numToUse === 1) firstWordDetails = { word: word, number: numToUse, direction: 'across' };
                  } else { console.warn(`Extracted across word "${word}" at [${r},${c}] (Num ${numToUse}) not in used/word list, skipping clue gen.`); }
              }
              if (isDownStart && !wordsForClues.down[numToUse]) {
                  let word = ''; for (let k = r; k < size && solutionGrid[k][c]; k++) word += solutionGrid[k][c];
                   if (word.length > 1 && (usedWords.across.includes(word) || usedWords.down.includes(word) || wordList.includes(word))) {
                     wordsForClues.down[numToUse] = word;
                      // Capture if it's number 1 and we haven't captured an across one yet
                      if (numToUse === 1 && !firstWordDetails) firstWordDetails = { word: word, number: numToUse, direction: 'down' };
                  } else { console.warn(`Extracted down word "${word}" at [${r},${c}] (Num ${numToUse}) not in used/word list, skipping clue gen.`); }
              }
          }
      }
  }
  // --- End Numbering & Finding Final Words ---

  // *** Thematic Clue Generation Logic ***
  if (!firstWordDetails) {
      console.error("Could not identify the first word (number 1) for theme generation!");
      throw new Error("Failed to identify seed word for theme.");
  }

  console.log(`Generating initial clue for seed word: ${firstWordDetails.word}`);
  const firstClue = await generateClue(firstWordDetails.word); // NO theme for first clue

  console.log(`Generating theme title based on first word/clue.`);
  const puzzleThemeTitle = await generateThemeTitle(firstWordDetails.word, firstClue); // Use the NEW function

  const cluePromises = [];
  const finalClues = { across: [], down: [] };
  let clueCount = 0;

  // Add the first clue generated manually
  if (firstWordDetails.direction === 'across') {
      finalClues.across.push({ number: firstWordDetails.number, clue: firstClue });
  } else {
      finalClues.down.push({ number: firstWordDetails.number, clue: firstClue });
  }
  clueCount++;

  console.log("Generating remaining clues asynchronously with theme:", puzzleThemeTitle);
  // Generate clues for the REST of the words, passing the theme
  for (const numStr in wordsForClues.across) {
      const num = parseInt(numStr);
      if (num === firstWordDetails.number && firstWordDetails.direction === 'across') continue; // Skip first word
      const word = wordsForClues.across[num];
      if (word) {
          clueCount++;
          cluePromises.push(generateClue(word, puzzleThemeTitle) // PASS THEME
              .then(clue => ({ direction: 'across', number: num, clue }))
              .catch(err => ({ direction: 'across', number: num, clue: `Error fetching clue for ACROSS ${num}` }))
          );
      }
   }
   for (const numStr in wordsForClues.down) {
      const num = parseInt(numStr);
      if (num === firstWordDetails.number && firstWordDetails.direction === 'down') continue; // Skip first word
      const word = wordsForClues.down[num];
      if (word) {
          clueCount++;
          cluePromises.push(generateClue(word, puzzleThemeTitle) // PASS THEME
              .then(clue => ({ direction: 'down', number: num, clue }))
              .catch(err => ({ direction: 'down', number: num, clue: `Error fetching clue for DOWN ${num}` }))
          );
      }
   }

  // Process remaining clues
  const settledClues = await Promise.allSettled(cluePromises);
  // Start count based on first clue success
  let successfulClues = (firstClue && !firstClue.toLowerCase().startsWith('error') && !firstClue.toLowerCase().includes('timeout') && !firstClue.toLowerCase().startsWith('api error')) ? 1 : 0;

  settledClues.forEach(result => {
      if (result.status === 'fulfilled' && result.value) {
          const item = result.value;
          const isErrorClue = item.clue.toLowerCase().startsWith('error') || item.clue.toLowerCase().includes('timeout') || item.clue.toLowerCase().startsWith('no response') || item.clue.toLowerCase().startsWith('api error') || item.clue.toLowerCase().startsWith('setup error') || item.clue.toLowerCase().startsWith('clue for') || item.clue.toLowerCase().startsWith('invalid word');
          if (!isErrorClue) successfulClues++; else console.warn(`Clue generation failed/fallback for number ${item.number} (${item.direction}): ${item.clue}`);
          if (item.direction === 'across') finalClues.across.push({ number: item.number, clue: item.clue });
          else finalClues.down.push({ number: item.number, clue: item.clue });
      } else if (result.status === 'rejected') { console.error("Clue generation promise rejected:", result.reason); }
  });

  // Sort final clues lists
  finalClues.across.sort((a, b) => a.number - b.number);
  finalClues.down.sort((a, b) => a.number - b.number);
  console.log(`Thematic clue generation complete. ${successfulClues}/${clueCount} clues successfully generated.`);
  // --- End Thematic Clue Generation ---

  // --- Save Puzzle ---
  console.log("Proceeding to save puzzle...");
  let puzzleId = null;
  const displayGrid = solutionGrid.map(row => row.map(cell => cell || null));

  try {
      puzzleId = uuidv4();
      console.log("Generated Puzzle ID:", puzzleId);
      console.log("Attempting to save puzzle with ID:", puzzleId);
      await savePuzzle({
          id: puzzleId,
          title: puzzleThemeTitle, // Use the generated theme title
          size: size, grid: displayGrid, numbering: numbering,
          clues: finalClues, // Use the combined clues
          solutionGrid: solutionGrid
      });
      console.log("Puzzle save function call completed for ID:", puzzleId);
  } catch (error) {
      console.error("!!!! Error during puzzle saving:", error);
      puzzleId = puzzleId || uuidv4();
      // Keep the generated title even if save fails, or use a specific fallback?
      // puzzleThemeTitle = "Generated Crossword (Save Failed)";
      console.warn("Proceeding to return puzzle data despite save error.");
  }
  // --- End Save Puzzle ---

  // *** Return puzzle data INCLUDING THEMATIC TITLE ***
  console.log(`Returning data for puzzle ID: ${puzzleId}`);
  return {
      puzzleId: puzzleId,
      title: puzzleThemeTitle, // Return the generated theme title
      grid: displayGrid, numbering: numbering, clues: finalClues, solutionGrid: solutionGrid
  };
} // End of generateCrossword function

// --- Endpoint: /generate ---
// (No changes needed in the endpoint definition itself)
app.get('/generate', async (req, res) => {
  if (wordList.length === 0) {
    console.warn("Generate request received before word list loaded.");
    return res.status(503).json({ error: 'Word list not loaded yet. Please try again shortly.' });
  }
  try {
    const size = parseInt(req.query.size) || 4;
    console.log(`Received request to generate crossword with size ${size}`);
    const crosswordData = await generateCrossword(size); // Calls the modified function
    console.log(`Successfully generated puzzle, preparing response for ID: ${crosswordData.puzzleId}`);
    res.json(crosswordData);
  } catch (error) {
    console.error('Error during crossword generation endpoint:', error);
    res.status(500).json({ error: error.message || 'Failed to generate valid crossword.' });
  }
});

// --- Endpoint: /puzzles ---
// (No changes needed in the endpoint definition itself)
app.get('/puzzles', async (req, res) => {
    console.log("-> Request received for /puzzles endpoint");
    const limit = parseInt(req.query.limit) || 10;
    const query = `SELECT id, title, created_at FROM puzzles ORDER BY created_at DESC LIMIT $1;`;
    console.log(`  Executing query: SELECT id, title, created_at FROM puzzles ORDER BY created_at DESC LIMIT ${limit}`);
    let client;
    try {
        client = await pool.connect();
        console.log("  Database client connected for /puzzles.");
        const result = await client.query(query, [limit]);
        console.log(`  Query successful, found ${result.rows.length} puzzles.`);
        res.json(result.rows);
    } catch (err) {
        console.error('!!!! Error fetching puzzle list in /puzzles:', err);
        res.status(500).json({ error: 'Failed to fetch puzzle list.' });
    } finally {
        if (client) { client.release(); console.log("  Database client released for /puzzles."); }
        else { console.warn("  DB client was not acquired in /puzzles, cannot release."); }
         console.log("<- Request finished for /puzzles endpoint");
    }
});

// --- Endpoint: /puzzle/:id ---
// (No changes needed in the endpoint definition itself)
app.get('/puzzle/:id', async (req, res) => {
    const puzzleId = req.params.id;
    console.log(`-> Request received for /puzzle/${puzzleId}`);
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(puzzleId)) {
        console.warn(`  Invalid puzzle ID format received: ${puzzleId}`);
        return res.status(400).json({ error: 'Invalid puzzle ID format.' });
    }
    const query = `SELECT id, title, size, grid_data, numbering_data, clues_data, solution_data, created_at FROM puzzles WHERE id = $1;`;
    console.log(`  Executing query for ID: ${puzzleId}`);
    let client;
    try {
        client = await pool.connect();
        console.log(`  Database client connected for /puzzle/${puzzleId}`);
        const result = await client.query(query, [puzzleId]);
        if (result.rows.length === 0) {
            console.warn(`  Puzzle not found for ID: ${puzzleId}`);
            return res.status(404).json({ error: 'Puzzle not found.' });
        }
        const dbRow = result.rows[0];
        console.log(`  Puzzle found for ID: ${puzzleId}, Title: ${dbRow.title}`);
        res.json({
            puzzleId: dbRow.id, title: dbRow.title, size: dbRow.size, grid: dbRow.grid_data, numbering: dbRow.numbering_data,
            clues: dbRow.clues_data, solutionGrid: dbRow.solution_data, createdAt: dbRow.created_at
        });
    } catch (err) {
        console.error(`!!!! Error fetching puzzle ${puzzleId}:`, err);
        res.status(500).json({ error: 'Failed to fetch puzzle.' });
    } finally {
        if (client) { client.release(); console.log(`  Database client released for /puzzle/${puzzleId}`); }
        else { console.warn(`  DB client was not acquired for /puzzle/${puzzleId}, cannot release.`); }
         console.log(`<- Request finished for /puzzle/${puzzleId}`);
    }
});

// --- Start Server ---
// (No changes needed in the startup logic)
Promise.all([fetchWords(), initializeDatabase()])
  .then(() => {
    if (wordList.length === 0) {
        console.error("Word list is empty after attempting to load. Check words.txt.");
        process.exit(1);
    }
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
    });
}).catch(error => {
    console.error('Failed during initialization (words or database):', error);
    process.exit(1);
});