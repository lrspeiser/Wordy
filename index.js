
const express = require('express');
const axios = require('axios');
const cors = require('cors');
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
    return `Clue for ${word}`;
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let wordList = [];

const fs = require('fs');

async function fetchWords() {
  try {
    const data = await fs.promises.readFile('words.txt', 'utf8');
    wordList = data.split('\n');
    console.log(`Loaded ${wordList.length} words`);
  } catch (error) {
    console.error('Error reading words file:', error);
  }
}

function isValidPrefix(prefix) {
  return wordList.some(word => word.startsWith(prefix));
}

function getMatchingWords(pattern) {
  const size = pattern.length;
  return wordList.filter(word => 
    word.length === size && 
    word.split('').every((letter, i) => pattern[i] === '' || pattern[i] === letter)
  );
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
  
  // Filter words for correct length
  console.log(`Filtering words for length ${size}`);
  const sizeWords = wordList.filter(word => word.length === size && /^[a-z]+$/.test(word));
  console.log(`Found ${sizeWords.length} words of length ${size}`);
  
  if (sizeWords.length < size * 2) {
    console.log(`Insufficient words: only ${sizeWords.length} words available`);
    throw new Error(`Not enough ${size}-letter words available to create a crossword`);
  }
  
  // Start with a random word
  console.log('Selecting initial random word');
  const startWord = sizeWords[Math.floor(Math.random() * sizeWords.length)];
  for (let i = 0; i < size; i++) {
    grid[0][i] = startWord[i];
  }
  usedWords.across.push(startWord);
  
  function isValid(row, col, word, isAcross) {
    // Check if word fits and creates valid prefixes in crossing direction
    for (let i = 0; i < size; i++) {
      if (isAcross) {
        grid[row][i] = word[i];
        let verticalPrefix = '';
        for (let j = 0; j <= row; j++) {
          verticalPrefix += grid[j][i];
        }
        if (!isValidPrefix(verticalPrefix)) {
          return false;
        }
      } else {
        grid[i][col] = word[i];
        let horizontalPrefix = '';
        for (let j = 0; j <= col; j++) {
          horizontalPrefix += grid[i][j];
        }
        if (!isValidPrefix(horizontalPrefix)) {
          return false;
        }
      }
    }
    return true;
  }

  function solve(pos = 0) {
    console.log(`\nSolve attempt at position: ${pos}`);
    if (pos === size * 2) {
      console.log('Successfully placed all words!');
      return true; // All words placed
    }

    const row = Math.floor(pos / 2);
    const col = Math.floor(pos / 2);
    const isAcross = pos % 2 === 0;
    console.log(`Trying to place ${isAcross ? 'across' : 'down'} word at row:${row}, col:${col}`);

    // Get pattern for current position
    let pattern = Array(size).fill('');
    if (isAcross) {
      for (let i = 0; i < size; i++) {
        pattern[i] = grid[row][i] || '';
      }
    } else {
      for (let i = 0; i < size; i++) {
        pattern[i] = grid[i][col] || '';
      }
    }

    const possibleWords = getMatchingWords(pattern);
    
    for (const word of possibleWords) {
      if (usedWords.across.includes(word) || usedWords.down.includes(word)) continue;

      // Save current state
      const gridBackup = grid.map(row => [...row]);
      
      console.log(`Trying word: ${word}`);
      if (isValid(row, col, word, isAcross)) {
        console.log(`Word ${word} is valid, placing it`);
        // Place the word
        if (isAcross) {
          for (let i = 0; i < size; i++) grid[row][i] = word[i];
          usedWords.across.push(word);
        } else {
          for (let i = 0; i < size; i++) grid[i][col] = word[i];
          usedWords.down.push(word);
        }

        if (solve(pos + 1)) return true;

        // Backtrack
        if (isAcross) {
          usedWords.across.pop();
        } else {
          usedWords.down.pop();
        }
        for (let i = 0; i < 4; i++) {
          for (let j = 0; j < 4; j++) {
            grid[i][j] = gridBackup[i][j];
          }
        }
      }
    }
    return false;
  }

  const success = solve();
  if (!success) {
    throw new Error('Could not generate valid crossword');
  }

  // Generate clues and numbering
  const numbering = Array(4).fill().map(() => Array(4).fill(0));
  const clues = { across: [], down: [] };
  let currentNumber = 1;

  // Number the squares and generate clues
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const isAcrossStart = j === 0;
      const isDownStart = i === 0;
      
      if (isAcrossStart || isDownStart) {
        numbering[i][j] = currentNumber;
        if (isAcrossStart) {
          const clue = await generateClue(usedWords.across[i]);
          clues.across.push({ number: currentNumber, clue, word: usedWords.across[i] });
        }
        if (isDownStart) {
          const clue = await generateClue(usedWords.down[j]);
          clues.down.push({ number: currentNumber, clue, word: usedWords.down[j] });
        }
        if (isAcrossStart !== isDownStart) currentNumber++;
        else if (isAcrossStart) currentNumber++;
      }
    }
  }

  return { 
    grid, 
    words: usedWords,
    numbering,
    clues
  };
}

app.get('/generate', async (req, res) => {
  if (wordList.length === 0) {
    return res.status(503).json({ error: 'Word list not loaded yet. Please try again.' });
  }
  
  try {
    const size = parseInt(req.query.size) || 4;
    const crossword = await generateCrossword(size);
    res.json(crossword);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate valid crossword. Please try again.' });
  }
});

// Load words first, then start server
fetchWords().then(() => {
  app.listen(5000, '0.0.0.0', () => {
    console.log('Server running on port 5000');
  });
}).catch(error => {
  console.error('Failed to start server:', error);
});
