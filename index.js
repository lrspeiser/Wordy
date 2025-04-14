
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let wordList = [];

const fs = require('fs');

async function fetchWords() {
  try {
    const data = await fs.promises.readFile('words.txt', 'utf8');
    wordList = data.split('\n').filter(word => word.length === 4);
    console.log(`Loaded ${wordList.length} four-letter words`);
  } catch (error) {
    console.error('Error reading words file:', error);
  }
}

function isValidPrefix(prefix) {
  return wordList.some(word => word.startsWith(prefix));
}

function getMatchingWords(pattern) {
  return wordList.filter(word => {
    for (let i = 0; i < 4; i++) {
      if (pattern[i] !== '' && pattern[i] !== word[i]) {
        return false;
      }
    }
    return true;
  });
}

function generateCrossword() {
  const grid = Array(4).fill().map(() => Array(4).fill(''));
  const usedWords = { across: [], down: [] };
  
  function isValid(row, col, word, isAcross) {
    // Check if word fits and creates valid prefixes in crossing direction
    for (let i = 0; i < 4; i++) {
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
    if (pos === 8) return true; // All words placed

    const row = Math.floor(pos / 2);
    const col = Math.floor(pos / 2);
    const isAcross = pos % 2 === 0;

    // Get pattern for current position
    let pattern = Array(4).fill('');
    if (isAcross) {
      for (let i = 0; i < 4; i++) {
        pattern[i] = grid[row][i] || '';
      }
    } else {
      for (let i = 0; i < 4; i++) {
        pattern[i] = grid[i][col] || '';
      }
    }

    const possibleWords = getMatchingWords(pattern);
    
    for (const word of possibleWords) {
      if (usedWords.across.includes(word) || usedWords.down.includes(word)) continue;

      // Save current state
      const gridBackup = grid.map(row => [...row]);
      
      if (isValid(row, col, word, isAcross)) {
        // Place the word
        if (isAcross) {
          for (let i = 0; i < 4; i++) grid[row][i] = word[i];
          usedWords.across.push(word);
        } else {
          for (let i = 0; i < 4; i++) grid[i][col] = word[i];
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
  return { grid, words: usedWords };
}

app.get('/generate', (req, res) => {
  if (wordList.length === 0) {
    return res.status(503).json({ error: 'Word list not loaded yet. Please try again.' });
  }
  
  try {
    const crossword = generateCrossword();
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
