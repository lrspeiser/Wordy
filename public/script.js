
async function generateCrossword() {
  const response = await fetch('/generate');
  const data = await response.json();
  
  const gridElement = document.getElementById('grid');
  gridElement.innerHTML = '';
  
  data.grid.forEach(row => {
    row.forEach(letter => {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.textContent = letter.toUpperCase();
      gridElement.appendChild(cell);
    });
  });

  const wordsElement = document.getElementById('words');
  wordsElement.innerHTML = `
    <h3>Across</h3>
    <p>${data.words.across.join(', ')}</p>
    <h3>Down</h3>
    <p>${data.words.down.join(', ')}</p>
  `;
}

// Generate initial crossword
generateCrossword();
