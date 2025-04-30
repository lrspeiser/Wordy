// Global variable to store the solution grid
let solutionGrid = null;
let currentGridSize = 4; // Keep track of the size
let currentDirection = 'across'; // Track current typing direction

// --- Main Function to Generate and Display ---
async function generateCrossword() {
  const generateBtn = document.getElementById('generateBtn');
  const loadingMsg = document.getElementById('loadingMessage'); // Ensure this element exists in HTML if used
  const gridElement = document.getElementById('grid');
  const cluesContainer = document.getElementById('cluesContainer'); // Ensure this element exists in HTML

  // Fallback if elements are missing
  if (!gridElement || !cluesContainer) {
      console.error("Required DOM elements (grid, cluesContainer) not found.");
      return;
  }
  if (!loadingMsg && generateBtn) { // If no loading message, still disable button
      // Handle button disabling/enabling directly
  }


  try {
    console.log('Starting crossword generation');
    const gridSize = document.getElementById('gridSize')?.value || '4'; // Default to 4 if selector missing
    currentGridSize = parseInt(gridSize);
    console.log(`Selected grid size: ${gridSize}`);

    // --- UI Updates: Show loading, disable button ---
    gridElement.innerHTML = ''; // Clear previous grid
    cluesContainer.innerHTML = ''; // Clear previous clues
    if (loadingMsg) loadingMsg.style.display = 'block'; // Show loading message if exists
    if (generateBtn) generateBtn.disabled = true; // Disable button if exists
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
    if (loadingMsg) loadingMsg.style.display = 'none'; // Hide loading message if exists
    if (generateBtn) generateBtn.disabled = false; // Re-enable button if exists
  }
}

// --- Function to Render the Grid with Input Fields ---
function renderGrid(gridData, numbering) {
    const gridElement = document.getElementById('grid');
    if (!gridElement) return; // Safety check
    gridElement.innerHTML = ''; // Clear previous grid content
    const size = gridData.length;

    // Calculate cell size based on container/viewport
    const containerWidth = gridElement.parentElement?.offsetWidth || Math.min(window.innerWidth * 0.9, 800); // Use parent or window
    const maxCellSize = 60; const minCellSize = 35;
    // Approx calculation accounting for 1px gap
    let cellSize = Math.floor((containerWidth - (size - 1)) / size);
    cellSize = Math.max(minCellSize, Math.min(maxCellSize, cellSize));

    gridElement.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
    gridElement.style.gridTemplateRows = `repeat(${size}, ${cellSize}px)`; // Make cells square
    gridElement.style.width = `${size * cellSize + (size - 1) * 1}px`; // Set grid width explicitly (assuming 1px gap)

    const inputFontSize = Math.max(14, Math.floor(cellSize * 0.5)); // Dynamic font size

    gridData.forEach((row, i) => {
      row.forEach((letter, j) => {
        const cell = document.createElement('div');
        cell.className = 'cell';
        // cell.style.width = `${cellSize}px`; // Handled by grid
        // cell.style.height = `${cellSize}px`;

        if (numbering[i][j]) {
          const numberDiv = document.createElement('div');
          numberDiv.className = 'number';
          numberDiv.textContent = numbering[i][j];
          cell.appendChild(numberDiv);
        }

        if (letter) { // Assumes empty string '' or null means a block
          const input = document.createElement('input');
          input.type = 'text';
          input.maxLength = 1;
          input.dataset.row = i; input.dataset.col = j;
          input.autocomplete = 'off'; input.spellcheck = false;
          input.style.fontSize = `${inputFontSize}px`; // Set dynamic font size
          input.addEventListener('input', handleInput);
          input.addEventListener('keydown', handleKeyDown); // Add listener for arrows/backspace
          cell.appendChild(input);
        } else {
          cell.classList.add('block');
        }
        gridElement.appendChild(cell);
      });
    });
}

// --- Function to Render Clues ---
function renderClues(clues) {
    const cluesContainer = document.getElementById('cluesContainer'); // Use new ID
    if (!cluesContainer) return; // Safety check

    const hasAcrossClues = clues?.across?.length > 0;
    const hasDownClues = clues?.down?.length > 0;

    if (!hasAcrossClues && !hasDownClues) {
        cluesContainer.innerHTML = '<p style="text-align: center;">No clues available.</p>';
        return;
    }

    cluesContainer.innerHTML = `
      <div class="clues">
        ${hasAcrossClues ? `
        <div class="clue-section">
          <h3>Across</h3>
          ${clues.across.map(({number, clue}) =>
            `<p><strong>${number}.</strong> ${clue || 'Clue not available'}</p>` // Handle missing clue text
          ).join('')}
        </div>` : ''}
        ${hasDownClues ? `
        <div class="clue-section">
          <h3>Down</h3>
          ${clues.down.map(({number, clue}) =>
            `<p><strong>${number}.</strong> ${clue || 'Clue not available'}</p>` // Handle missing clue text
          ).join('')}
        </div>` : ''}
      </div>
    `;
}


// --- Function to Handle Input in Cells ---
function handleInput(event) {
    const inputElement = event.target;
    const row = parseInt(inputElement.dataset.row);
    const col = parseInt(inputElement.dataset.col);
    // Take only the first character if multiple are entered (e.g., paste)
    const enteredValue = (inputElement.value.length > 0) ? inputElement.value.charAt(0).toLowerCase() : '';

    inputElement.value = enteredValue.toUpperCase(); // Show uppercase always

    // Clear feedback if input is cleared
    if (enteredValue === '') {
        inputElement.classList.remove('correct-letter', 'incorrect-letter');
        return; // Don't check or move focus
    }

    // Check correctness
    checkInput(inputElement, row, col);

    // Move focus after a character is entered
    moveToNextCell(row, col);
}

// --- Separate function for checking the input value ---
function checkInput(inputElement, row, col) {
    const enteredValue = inputElement.value.toLowerCase(); // Check lowercase

    if (!solutionGrid || !solutionGrid[row] || typeof solutionGrid[row][col] === 'undefined') {
        console.error("Solution grid not available or invalid coordinates for checking.");
        return;
    }
    const correctAnswer = solutionGrid[row][col]?.toLowerCase(); // Use optional chaining

    if (!correctAnswer) { // Should not happen if it's an input cell, but safe check
         inputElement.classList.remove('correct-letter', 'incorrect-letter');
         return;
    }

    if (enteredValue === correctAnswer) {
        inputElement.classList.add('correct-letter');
        inputElement.classList.remove('incorrect-letter');
    } else {
        inputElement.classList.remove('correct-letter');
        inputElement.classList.add('incorrect-letter');
    }
}

// --- Function to handle Arrow Keys and Backspace ---
function handleKeyDown(event) {
    const inputElement = event.target;
    const row = parseInt(inputElement.dataset.row);
    const col = parseInt(inputElement.dataset.col);
    const size = currentGridSize;

    let nextRow = row;
    let nextCol = col;
    let moved = false;

    // Toggle direction with arrow keys
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        currentDirection = 'across';
        event.preventDefault();
        return;
    }
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        currentDirection = 'down';
        event.preventDefault();
        return;
    }

    switch (event.key) {
        case 'ArrowUp': nextRow = findNextInputCell(row, col, size, -1, 0)?.row ?? row; moved = (nextRow !== row); break;
        case 'ArrowDown': nextRow = findNextInputCell(row, col, size, 1, 0)?.row ?? row; moved = (nextRow !== row); break;
        case 'ArrowLeft': nextCol = findNextInputCell(row, col, size, 0, -1)?.col ?? col; moved = (nextCol !== col); break;
        case 'ArrowRight': nextCol = findNextInputCell(row, col, size, 0, 1)?.col ?? col; moved = (nextCol !== col); break;
        case 'Backspace':
            if (inputElement.value === '') { // If already empty, move left/up
                const prevCell = findNextInputCell(row, col, size, 0, -1, true); // Allow wrapping
                if (prevCell) { nextRow = prevCell.row; nextCol = prevCell.col; moved = true; }
            } // Otherwise, allow default backspace behavior
            break;
        case 'Enter': // Move down on enter
             const nextCell = findNextInputCell(row, col, size, 1, 0);
             if (nextCell) { nextRow = nextCell.row; nextCol = nextCell.col; moved = true; }
            break;
        default:
            // If it's not a letter, prevent input (allow only letters)
            if (!/^[a-zA-Z]$/.test(event.key) && !['Backspace', 'Delete', 'Tab'].includes(event.key) && !event.ctrlKey && !event.metaKey) {
                event.preventDefault();
            }
            return; // Don't prevent default for allowed keys
    }

    if (moved) {
        event.preventDefault();
        const nextInput = document.querySelector(`input[data-row="${nextRow}"][data-col="${nextCol}"]`);
        if (nextInput) {
            nextInput.focus();
            nextInput.select(); // Select text in next input for easy overwrite
        }
    }
}


// --- Function to move focus to the NEXT available cell (skipping blocks) ---
function moveToNextCell(currentRow, currentCol) {
    // Move based on current direction
    const nextCell = currentDirection === 'across' 
        ? findNextInputCell(currentRow, currentCol, currentGridSize, 0, 1, true) // Move right
        : findNextInputCell(currentRow, currentCol, currentGridSize, 1, 0, true); // Move down
    if (nextCell) {
        const nextInput = document.querySelector(`input[data-row="${nextCell.row}"][data-col="${nextCell.col}"]`);
        if (nextInput) {
            nextInput.focus();
            nextInput.select();
        }
    }
}

// --- Helper function to find the next cell in a given direction, skipping blocks ---
function findNextInputCell(r, c, size, dr, dc, wrap = false) {
    if (dr === 0 && dc === 0) return null; // No movement

    let nextR = r + dr;
    let nextC = c + dc;

    for (let i = 0; i < size * size; i++) { // Limit search to prevent infinite loops
        if (wrap) {
            if (nextC >= size) { nextC = 0; nextR++; }
            if (nextC < 0) { nextC = size - 1; nextR--; }
            if (nextR >= size) { nextR = 0; if (dc <= 0) nextC++; } // Wrap row, advance col if needed
            if (nextR < 0) { nextR = size - 1; if (dc >= 0) nextC--; } // Wrap row, decrement col if needed
             // Final wrap adjustment if column went out of bounds after row wrap
             if (nextC >= size) nextC = 0;
             if (nextC < 0) nextC = size - 1;

        } else {
             if (nextR < 0 || nextR >= size || nextC < 0 || nextC >= size) return null; // Out of bounds without wrap
        }

        // Check if this cell should have an input (is not a block)
        if (solutionGrid && solutionGrid[nextR]?.[nextC]) {
            // Check if the input element actually exists
            if (document.querySelector(`input[data-row="${nextR}"][data-col="${nextC}"]`)) {
                 return { row: nextR, col: nextC }; // Found next input cell
            }
        }

        // If not found or it's a block, calculate next position based on direction
         if (dr === 0) nextC += dc; // Move horizontally
         if (dc === 0) nextR += dr; // Move vertically

         // If moving diagonally (not typical but for completeness)
         if (dr !== 0 && dc !== 0) {
             nextR += dr;
             nextC += dc;
         }

         // If wrapping wasn't initially enabled but we went out, stop
         if (!wrap && (nextR < 0 || nextR >= size || nextC < 0 || nextC >= size)) return null;

    }
     console.warn("Could not find next input cell after extensive search.");
    return null; // Should not happen in a valid grid unless start/end point
}


// --- Add event listener to the button ---
// Moved inside DOMContentLoaded

// --- Initial Load ---
document.addEventListener('DOMContentLoaded', () => {
  console.log("DOM fully loaded. Setting up event listeners.");
  
  // Setup direction icon
  const directionIcon = document.getElementById('directionIcon');
  if (directionIcon) {
    directionIcon.addEventListener('click', () => {
      currentDirection = currentDirection === 'across' ? 'down' : 'across';
      directionIcon.classList.toggle('across');
      directionIcon.title = `Currently moving ${currentDirection} (click to change)`;
    });
  }

  // *** DO NOT generate crossword on initial load ***
  // generateCrossword(); // <--- REMOVED THIS LINE

  // Add event listener for the button
  const generateBtn = document.getElementById('generateBtn');
  if (generateBtn) {
      console.log("Adding click listener to Generate button.");
      generateBtn.addEventListener('click', generateCrossword);
  } else {
      console.error("Generate button not found!");
  }

  // Add event listener for grid size change to regenerate
  const gridSizeSelector = document.getElementById('gridSize');
  if (gridSizeSelector) {
      console.log("Adding change listener to Grid Size selector.");
      gridSizeSelector.addEventListener('change', generateCrossword);
  } else {
      console.error("Grid size selector not found!");
  }

  // Optionally display a placeholder message or empty grid initially
  const gridElement = document.getElementById('grid');
  const cluesContainer = document.getElementById('cluesContainer'); // Use new ID
  if (gridElement) {
      console.log("Setting initial grid placeholder.");
      gridElement.innerHTML = '<p style="text-align: center; padding: 20px;">Select grid size and click "Generate" to start.</p>';
  }
  if (cluesContainer) {
      cluesContainer.innerHTML = ''; // Start with empty clues
  }

});