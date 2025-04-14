
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

let wordList = [];

// Fetch words from GitHub
async function fetchWords() {
  try {
    const response = await axios.get('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears-short.txt');
    wordList = response.data.split('\n').filter(word => word.length === 4);
  } catch (error) {
    console.error('Error fetching words:', error);
  }
}

function generateCrossword() {
  const grid = Array(4).fill().map(() => Array(4).fill(''));
  const usedWords = { across: [], down: [] };
  
  // Try to place words across
  for (let row = 0; row < 4; row++) {
    const availableWords = wordList.filter(word => 
      !usedWords.across.includes(word) && !usedWords.down.includes(word)
    );
    if (availableWords.length > 0) {
      const word = availableWords[Math.floor(Math.random() * availableWords.length)];
      for (let col = 0; col < 4; col++) {
        grid[row][col] = word[col];
      }
      usedWords.across.push(word);
    }
  }

  // Try to place words down
  for (let col = 0; col < 4; col++) {
    let vertical = '';
    for (let row = 0; row < 4; row++) {
      vertical += grid[row][col];
    }
    const possibleWords = wordList.filter(word => 
      !usedWords.across.includes(word) && 
      !usedWords.down.includes(word) &&
      word.split('').every((letter, i) => grid[i][col] === '' || grid[i][col] === letter)
    );
    if (possibleWords.length > 0) {
      const word = possibleWords[Math.floor(Math.random() * possibleWords.length)];
      for (let row = 0; row < 4; row++) {
        grid[row][col] = word[row];
      }
      usedWords.down.push(word);
    }
  }

  return { grid, words: usedWords };
}

app.get('/generate', (req, res) => {
  const crossword = generateCrossword();
  res.json(crossword);
});

app.listen(5000, '0.0.0.0', async () => {
  await fetchWords();
  console.log('Server running on port 5000');
});
