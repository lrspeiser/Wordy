// Global variable to store the solution grid
let solutionGrid = null;
let currentGridSize = 4; // Keep track of the size

// --- Main Function to Generate and Display ---
async function generateCrossword() {
  const generateBtn = document.getElementById('generateBtn');
  const loadingMsg = document.getElementById('loadingMessage');
  const gridElement = document.getElementById('grid');
  const cluesContainer = document.getElementById('cluesContainer'); // Use new ID

  try {
    console.log('Starting crossword generation');
    const gridSize = document.getElementById('gridSize').value;
    currentGridSize = parseInt(gridSize); // Update global size tracker
    console.log(`Selected grid size: ${gridSize}`);

    // --- UI Updates: Show loading, disable button ---
    gridElement.innerHTML = ''; // Clear previous grid
    cluesContainer.innerHTML = ''; // Clear previous clues
    loadingMsg.style.display = 'block'; // Show loading message
    if (generateBtn) generateBtn.disabled = true; // Disable button
    solutionGrid = null; // Clear previous solution

    const response = await fetch(`/generate?size=${gridSize}`);
    if (!response.ok) {
      let errorMsg = 'Failed to generate crossword';
      try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorMsg;
      } catch (e) { /* Ignore JSON parsing error if response is not JSON */ }
      throw new Error(errorMsg);
    }

    const data = await response.json();
    console.log('Received crossword data:', data);

    // Store the solution
    solutionGrid = data.grid;

    // --- Render the Grid ---
    renderGrid(data.grid, data.numbering);

    // --- Render the Clues (without answers) ---
    renderClues(data.clues);

  } catch (error) {
    console.error('Error:', error);
    cluesContainer.innerHTML = `<p style="color: red; text-align: center;">Error: ${error.message}. Please try again.</p>`;
  } finally {
    // --- UI Updates: Hide loading, enable button ---
    loadingMsg.style.display = 'none'; // Hide loading message
    if (generateBtn) generateBtn.disabled = false; // Re-enable button
  }
}

// --- Function to Render the Grid with Input Fields ---
function renderGrid(gridData, numbering) {
    const gridElement = document.getElementById('grid');
    gridElement.innerHTML = ''; // Clear previous grid content
    const size = gridData.length;

    // Calculate cell size based on container/viewport
    const containerWidth = gridElement.offsetWidth || Math.min(window.innerWidth * 0.9, 800); // Estimate width
    const maxCellSize = 60;
    const minCellSize = 35;
    let cellSize = Math.floor(containerWidth / size) - 2; // Account for gaps/borders
    cellSize = Math.max(minCellSize, Math.min(maxCellSize, cellSize));

    gridElement.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
    gridElement.style.gridTemplateRows = `repeat(${size}, ${cellSize}px)`; // Make cells square

    gridData.forEach((row, i) => {
      row.forEach((letter, j) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.style.width = `${cellSize}px`; // Set dynamic size
        cell.style.height = `${cellSize}px`;

        // Add numbering if present
        if (numbering[i][j]) {
          const numberDiv = document.createElement('div');
          numberDiv.className = 'number';
          numberDiv.textContent = numbering[i][j];
          cell.appendChild(numberDiv);
        }

        // If it's a letter cell, add an input field
        if (letter) {
          const input = document.createElement('input');
          input.type = 'text';
          input.maxLength = 1;
          input.dataset.row = i; // Store row/col for event handling
          input.dataset.col = j;
          input.autocomplete = 'off'; // Prevent browser suggestions
          input.spellcheck = false;
          input.addEventListener('input', handleInput); // Add event listener
          cell.appendChild(input);
        } else {
          // Mark non-letter cells as blocks
          cell.classList.add('block');
        }

        gridElement.appendChild(cell);
      });
    });
}

// --- Function to Render Clues ---
function renderClues(clues) {
    const cluesContainer = document.getElementById('cluesContainer');
    cluesContainer.innerHTML = `
      <div class="clues">
        <div class="clue-section">
          <h3>Across</h3>
          ${clues.across.map(({number, clue}) =>
            `<p class="clue" data-number="${number}" data-direction="across"><strong>${number}.</strong> ${clue}</p>`
          ).join('')}
        </div>
        <div class="clue-section">
          <h3>Down</h3>
          ${clues.down.map(({number, clue}) =>
            `<p class="clue" data-number="${number}" data-direction="down"><strong>${number}.</strong> ${clue}</p>`
          ).join('')}
        </div>
      </div>
    `;

    // Add click handlers to clues
    document.querySelectorAll('.clue').forEach(clue => {
        clue.addEventListener('click', function() {
            const number = this.dataset.number;
            const direction = this.dataset.direction;
            const inputs = document.querySelectorAll('.cell input');
            
            inputs.forEach(input => {
                if (input.parentElement.querySelector('.number')?.textContent === number) {
                    const startCell = input;
                    let currentCell = startCell;

                    // Find first empty cell
                    while (currentCell && currentCell.value !== '') {
                        const row = parseInt(currentCell.dataset.row);
                        const col = parseInt(currentCell.dataset.col);
                        
                        // Find next cell based on direction
                        const nextRow = direction === 'down' ? row + 1 : row;
                        const nextCol = direction === 'across' ? col + 1 : col;
                        
                        currentCell = document.querySelector(`input[data-row="${nextRow}"][data-col="${nextCol}"]`);
                        if (!currentCell) break;
                    }

                    // Focus either the first empty cell or the start cell
                    (currentCell || startCell).focus();
                }
            });
        });
    });
}


// --- Function to Handle Input in Cells ---
function handleInput(event) {
    console.log('Input event triggered');
    const inputElement = event.target;
    const row = parseInt(inputElement.dataset.row);
    const col = parseInt(inputElement.dataset.col);
    const enteredValue = inputElement.value.toLowerCase();
    console.log(`Input at [${row},${col}]: ${enteredValue}`);

    // Skip if empty (backspace/delete)
    if (enteredValue === '') {
        console.log('Empty input, removing correct-letter class');
        inputElement.classList.remove('correct-letter');
        return;
    }

    // Get direction
    const selectedClue = document.querySelector('.clue-section p.selected');
    const direction = selectedClue ? selectedClue.dataset.direction : 'across';
    console.log(`Current direction: ${direction}`);

    if (!solutionGrid || !solutionGrid[row] || typeof solutionGrid[row][col] === 'undefined') {
        console.error("Solution grid not available or invalid coordinates.");
        return;
    }

    const correctAnswer = solutionGrid[row][col].toLowerCase();
    console.log(`Checking answer: entered=${enteredValue}, correct=${correctAnswer}`);

    if (enteredValue === correctAnswer) {
        console.log('Correct letter entered');
        inputElement.classList.add('correct-letter');
        inputElement.classList.remove('incorrect-letter');
        
        const selectedClue = document.querySelector('.clue-section p.selected');
        const direction = selectedClue ? selectedClue.dataset.direction : 'across';
        console.log(`Current direction: ${direction}`);
        
        let nextCell;
        if (direction === 'across') {
            console.log(`Looking for next cell at [${row},${col + 1}]`);
            nextCell = document.querySelector(`input[data-row="${row}"][data-col="${col + 1}"]`);
        } else {
            console.log(`Looking for next cell at [${row + 1},${col}]`);
            nextCell = document.querySelector(`input[data-row="${row + 1}"][data-col="${col}"]`);
        }
        
        if (nextCell) {
            console.log('Moving to next cell');
            nextCell.focus();
        } else {
            console.log('No next cell found');
        }
    } else {
        console.log('Incorrect letter entered');
        inputElement.classList.remove('correct-letter');
    }

    inputElement.value = enteredValue.toUpperCase();
    
    // Move to next cell
    let nextCell;
    if (direction === 'across') {
        nextCell = document.querySelector(`input[data-row="${row}"][data-col="${col + 1}"]`);
    } else {
        nextCell = document.querySelector(`input[data-row="${row + 1}"][data-col="${col}"]`);
    }
    
    if (nextCell) {
        nextCell.focus();
    }
    console.log('Input handling complete');
}

// --- Add event listener to the button ---
const generateBtn = document.getElementById('generateBtn');
if (generateBtn) {
    generateBtn.addEventListener('click', generateCrossword);
} else {
    console.error("Generate button not found!");
}


// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
  // Generate a crossword when the page loads
  generateCrossword();

  // Add event listener for grid size change to regenerate
  const gridSizeSelector = document.getElementById('gridSize');
  if (gridSizeSelector) {
      gridSizeSelector.addEventListener('change', generateCrossword);
  }
});


// --- Optional: Advanced Focus Movement (Example Structure) ---
/*
function moveToNextCell(currentRow, currentCol) {
    // This needs more logic to determine the "current word" (Across or Down)
    // and find the next empty cell within that word's boundaries.
    // For simplicity, this example just moves right, then down (basic).

    let nextCol = currentCol + 1;
    let nextRow = currentRow;

    if (nextCol >= currentGridSize) {
        nextCol = 0;
        nextRow = currentRow + 1;
        if (nextRow >= currentGridSize) {
            nextRow = 0; // Wrap around (or stop)
        }
    }

    const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${nextCol}"]`);
    if (nextInput) {
        nextInput.focus();
    }
}
*/