
async function generateCrossword() {
  try {
    const response = await fetch('/generate');
    if (!response.ok) {
      throw new Error('Failed to generate crossword');
    }
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }
    
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
  } catch (error) {
    console.error('Error:', error);
    document.getElementById('words').innerHTML = `<p style="color: red">Error: ${error.message}. Please try again.</p>`;
  }
}

// Wait for page load
document.addEventListener('DOMContentLoaded', () => {
  generateCrossword();
});
