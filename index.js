
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let wordList = [];

const fs = require('fs');

// Read words from local file
async function fetchWords() {
  try {
    const data = await fs.promises.readFile('words.txt', 'utf8');
    wordList = data.split('\n').filter(word => word.length === 4);
    console.log(`Loaded ${wordList.length} four-letter words`);
  } catch (error) {
    console.error('Error reading words file:', error);
  }
}

function generateCrossword() {
  let attempts = 0;
  const maxAttempts = 1000;
  console.log('Starting crossword generation with', wordList.length, 'words');

  while (attempts < maxAttempts) {
    const grid = Array(4).fill().map(() => Array(4).fill(''));
    const usedWords = { across: [], down: [] };
    let isValid = true;
    
    // Place words across
    for (let row = 0; row < 4; row++) {
      const availableWords = wordList.filter(word => 
        word.length === 4 &&
        !usedWords.across.includes(word) && 
        !usedWords.down.includes(word)
      );
      
      if (availableWords.length === 0) {
        isValid = false;
        break;
      }
      
      const word = availableWords[Math.floor(Math.random() * availableWords.length)];
      for (let col = 0; col < 4; col++) {
        grid[row][col] = word[col];
      }
      usedWords.across.push(word);
    }

    if (!isValid) {
      attempts++;
      continue;
    }

    // Check and place words down
    for (let col = 0; col < 4; col++) {
      let verticalWord = '';
      for (let row = 0; row < 4; row++) {
        verticalWord += grid[row][col];
      }
      
      if (!wordList.includes(verticalWord)) {
        isValid = false;
        break;
      }
      
      if (!usedWords.down.includes(verticalWord)) {
        usedWords.down.push(verticalWord);
      } else {
        isValid = false;
        break;
      }
    }

    if (!isValid) {
        isValid = false;
        break;
      }

      const word = possibleWords[Math.floor(Math.random() * possibleWords.length)];
      usedWords.down.push(word);
    }

    if (isValid && usedWords.across.length === 4 && usedWords.down.length === 4) {
      console.log(`Generated valid crossword in ${attempts + 1} attempts`);
      return { grid, words: usedWords };
    }

    attempts++;
  }

  throw new Error('Could not generate valid crossword');
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
