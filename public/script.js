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
            const cell = document.querySelector(`.cell input[data-number="${number}"]`);
            
            if (cell) {
                currentDirection = direction;
                // Find first empty cell in the word
                let currentCell = cell;
                while (currentCell && currentCell.value) {
                    const row = parseInt(currentCell.dataset.row);
                    const col = parseInt(currentCell.dataset.col);
                    const nextCell = findNextInputCell(
                        row, 
                        col, 
                        currentGridSize,
                        direction === 'down' ? 1 : 0,  // Move down if direction is down
                        direction === 'across' ? 1 : 0  // Move right if direction is across
                    );
                    if (!nextCell) break;
                    currentCell = document.querySelector(`input[data-row="${nextCell.row}"][data-col="${nextCell.col}"]`);
                }
                if (currentCell) {
                    currentCell.focus();
                }
            }
        });
    });
}


// --- Function to Handle Input in Cells ---
function handleInput(event) {
    const inputElement = event.target;
    const row = parseInt(inputElement.dataset.row);
    const col = parseInt(inputElement.dataset.col);
    const enteredValue = inputElement.value.toLowerCase(); // Ensure lowercase for comparison

    // Clear previous feedback if input is cleared
    if (enteredValue === '') {
        inputElement.classList.remove('correct-letter');
        // Potentially add 'incorrect-letter' class removal here too if you implement that
        return;
    }

    // Make sure we have the solution grid
    if (!solutionGrid || !solutionGrid[row] || typeof solutionGrid[row][col] === 'undefined') {
        console.error("Solution grid not available or invalid coordinates.");
        return;
    }

    const correctAnswer = solutionGrid[row][col].toLowerCase();

    // Check if the entered letter is correct
    if (enteredValue === correctAnswer) {
        inputElement.classList.add('correct-letter');
        inputElement.classList.remove('incorrect-letter'); // Remove incorrect if previously marked
        // Optionally move focus to the next input cell here (advanced)
        // moveToNextCell(row, col);
    } else {
        inputElement.classList.remove('correct-letter');
        // Optionally add an 'incorrect-letter' class for visual feedback
        // inputElement.classList.add('incorrect-letter');
    }

    // Keep input uppercase visually
    inputElement.value = enteredValue.toUpperCase();
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