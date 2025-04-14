
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
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    const grid = Array(4).fill().map(() => Array(4).fill(''));
    const usedWords = { across: [], down: [] };
    let isValid = true;
    
    // Place words across
    for (let row = 0; row < 4; row++) {
      const availableWords = wordList.filter(word => 
        !usedWords.across.includes(word) && !usedWords.down.includes(word)
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
      let vertical = '';
      for (let row = 0; row < 4; row++) {
        vertical += grid[row][col];
      }
      
      const possibleWords = wordList.filter(word => 
        !usedWords.across.includes(word) && 
        !usedWords.down.includes(word) &&
        word.split('').every((letter, i) => letter === grid[i][col])
      );

      if (possibleWords.length === 0) {
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
  try {
    const crossword = generateCrossword();
    res.json(crossword);
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate valid crossword. Please try again.' });
  }
});

app.listen(5000, '0.0.0.0', async () => {
  await fetchWords();
  console.log('Server running on port 5000');
});
