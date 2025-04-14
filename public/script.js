
async function generateCrossword() {
  try {
    console.log('Starting crossword generation');
    const gridSize = document.getElementById('gridSize').value;
    console.log(`Selected grid size: ${gridSize}`);
    document.getElementById('grid').innerHTML = 'Generating...';
    document.getElementById('words').innerHTML = '';
    
    const response = await fetch(`/generate?size=${gridSize}`);
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to generate crossword');
    }
    
    const data = await response.json();
    console.log('Received crossword data:', data);
    
    const gridElement = document.getElementById('grid');
    gridElement.innerHTML = '';
    const size = data.grid.length;
    gridElement.style.gridTemplateColumns = `repeat(${size}, ${window.innerWidth <= 600 ? '40px' : '60px'})`;
    
    data.grid.forEach((row, i) => {
      row.forEach((letter, j) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        if (data.numbering[i][j]) {
          const number = document.createElement('div');
          number.className = 'number';
          number.textContent = data.numbering[i][j];
          cell.appendChild(number);
        }
        const letterDiv = document.createElement('div');
        letterDiv.className = 'letter';
        letterDiv.textContent = letter.toUpperCase();
        cell.appendChild(letterDiv);
        gridElement.appendChild(cell);
      });
    });

    const wordsElement = document.getElementById('words');
    wordsElement.innerHTML = `
      <div class="clues">
        <div class="clue-section">
          <h3>Across</h3>
          ${data.clues.across.map(({number, clue, word}) => 
            `<p><strong>${number}.</strong> ${clue} <em>(${word})</em></p>`
          ).join('')}
        </div>
        <div class="clue-section">
          <h3>Down</h3>
          ${data.clues.down.map(({number, clue, word}) => 
            `<p><strong>${number}.</strong> ${clue} <em>(${word})</em></p>`
          ).join('')}
        </div>
      </div>
    `;
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('words').innerHTML = `<p style="color: red">Error: ${error.message}. Please try again.</p>`;
  }
}

// Wait for page load
document.addEventListener('DOMContentLoaded', () => {
  generateCrossword();
});
