// Global variable to store the solution grid
let solutionGrid = null;
// let currentGridSize = 4; // Keep track of size (REMOVED - Size is fixed to 4x4 for generation, loadSpecificPuzzle will update based on loaded data)
let currentGridSize = 4; // Keep track of size (generation fixed at 4, but can load others) - Reinstated for clarity in renderGrid
let currentPuzzleId = null; // Keep track of the currently loaded/generated puzzle ID

// --- Local Storage Key ---
const COMPLETED_PUZZLES_KEY = 'crosswordCompletedPuzzles'; // ADDED for completion tracking

// --- UI Elements ---
const generateBtn = document.getElementById('generateBtn');
const loadingMsg = document.getElementById('loadingMessage');
const gridElement = document.getElementById('grid');
const cluesContainer = document.getElementById('cluesContainer');
const puzzleTitleElement = document.getElementById('puzzleTitle');
const savedPuzzlesListElement = document.getElementById('savedPuzzlesList');
const loadingSavedPuzzlesMsg = document.getElementById('loadingSavedPuzzles');
const noSavedPuzzlesMsg = document.getElementById('noSavedPuzzles');
// const gridSizeSelector = document.getElementById('gridSize'); // REMOVED - Size is fixed to 4x4 for generation
const puzzleDisplayArea = document.getElementById('puzzleDisplayArea'); // ADDED: Container for grid/clues
const initialPrompt = document.getElementById('initialPrompt');     // ADDED: Initial message area
const successIndicator = document.getElementById('successIndicator'); // **** ADDED Success Indicator Element ****


// --- View Management Functions --- ADDED ---
function showPuzzleView() {
    // Shows the puzzle grid/clues area and hides the initial prompt.
    // The saved list and controls remain visible below in their original DOM order.
    if (puzzleDisplayArea) puzzleDisplayArea.style.display = 'block';
    if (initialPrompt) initialPrompt.style.display = 'none';
    if (successIndicator) successIndicator.classList.remove('show'); // **** ADDED: Hide checkmark when showing puzzle ****
    // Title will be set by the loading/generation function
}

function showInitialView() {
    // Hides the puzzle grid/clues area and shows the initial prompt.
    // The saved list and controls remain visible below the prompt.
    if (puzzleDisplayArea) puzzleDisplayArea.style.display = 'none';
    if (initialPrompt) initialPrompt.style.display = 'block';
    if (puzzleTitleElement) puzzleTitleElement.textContent = 'Wordy'; // Reset main title
    if (successIndicator) successIndicator.classList.remove('show'); // **** ADDED: Hide checkmark ****
    gridElement.innerHTML = ''; // Clear grid content if any
    cluesContainer.innerHTML = ''; // Clear clues content if any
    solutionGrid = null;
    currentPuzzleId = null;
    hideLoading(); // Ensure loading indicator is hidden
}
// --- End View Management Functions ---

// --- Clear UI (Modified to clear only puzzle content and hide indicator) ---
function clearPuzzleAreaContent() { // Renamed for clarity in previous step, kept name
    gridElement.innerHTML = '';
    cluesContainer.innerHTML = '';
    solutionGrid = null;
    if (successIndicator) successIndicator.classList.remove('show'); // **** ADDED: Hide checkmark ****
    // currentPuzzleId = null; // Reset ID only when starting load/generate
    document.querySelectorAll('.clue.selected').forEach(c => c.classList.remove('selected'));
}

// --- Display Loading State (MODIFIED) ---
function showLoading(message = 'Loading...') {
    showPuzzleView(); // Make sure the puzzle display area is visible
    clearPuzzleAreaContent(); // Clears grid/clues and hides checkmark
    loadingMsg.textContent = message;
    loadingMsg.style.display = 'block'; // Show loading message within display area
    if (generateBtn) generateBtn.disabled = true;
    // if (gridSizeSelector) gridSizeSelector.disabled = true; // REMOVED
}

// --- Hide Loading State (MODIFIED) ---
function hideLoading() {
    loadingMsg.style.display = 'none'; // Just hide the loading message
    if (generateBtn) generateBtn.disabled = false;
    // if (gridSizeSelector) gridSizeSelector.disabled = false; // REMOVED
}

// --- Display Error (MODIFIED) ---
function displayError(error, container = cluesContainer) {
     console.error('Error:', error);
     const errorMessage = error?.message || (typeof error === 'string' ? error : 'An unknown error occurred');
     showPuzzleView(); // Ensure puzzle area is visible for the error message
     container.innerHTML = `<p style="color: red; text-align: center;">Error: ${errorMessage}. Please try again or select another puzzle.</p>`;
     if (successIndicator) successIndicator.classList.remove('show'); // **** ADDED: Ensure checkmark hidden on error ****
     hideLoading(); // Ensure loading is hidden on error
}

// --- Local Storage Helpers --- ADDED ---
function getCompletedPuzzles() {
    const completed = localStorage.getItem(COMPLETED_PUZZLES_KEY);
    try {
        return completed ? new Set(JSON.parse(completed)) : new Set();
    } catch (e) {
        console.error("Error parsing completed puzzles from Local Storage:", e);
        return new Set();
    }
}

function markPuzzleAsCompleted(puzzleId) {
    if (!puzzleId) return;
    const completedSet = getCompletedPuzzles();
    if (!completedSet.has(puzzleId)) {
        completedSet.add(puzzleId);
        try {
            localStorage.setItem(COMPLETED_PUZZLES_KEY, JSON.stringify(Array.from(completedSet)));
            console.log(`Puzzle ${puzzleId} marked as completed.`);
            // Update the list view immediately
            const listItemLink = savedPuzzlesListElement.querySelector(`a[data-puzzle-id="${puzzleId}"]`);
            if (listItemLink && listItemLink.parentElement) {
                listItemLink.parentElement.classList.add('completed');
            }
        } catch (e) {
            console.error("Error saving completed puzzles to Local Storage:", e);
        }
    }
}
// --- End Local Storage Helpers ---

// --- HELPER: Find next input cell, skipping correct ones --- ADDED ---
function findNextFocusableInput(startRow, startCol, direction) {
    let r = parseInt(startRow);
    let c = parseInt(startCol);
    const size = currentGridSize;

    while (true) {
        if (direction === 'across') {
            c++;
        } else { // 'down'
            r++;
        }

        // Check bounds
        if (r < 0 || r >= size || c < 0 || c >= size) {
            // console.log(`findNextFocusableInput: Reached grid boundary at [${r},${c}]`);
            return null; // Reached edge of the grid
        }

        // Find the input element at the new coordinates
        const nextInput = document.querySelector(`#grid input[data-row="${r}"][data-col="${c}"]`);

        if (nextInput) {
            // Found an input cell. Check if it's focusable.
            // It's focusable if it's empty OR it has an incorrect letter.
            if (nextInput.value === '' || nextInput.classList.contains('incorrect-letter')) {
                // console.log(`findNextFocusableInput: Found focusable input at [${r},${c}]`);
                return nextInput;
            } else {
                // console.log(`findNextFocusableInput: Skipping filled correct cell at [${r},${c}]`);
                // Continue the loop to check the *next* cell
            }
        } else {
            // console.log(`findNextFocusableInput: Hit a block or non-input cell at [${r},${c}]`);
            // Hit a block cell or the end of the word in this direction
            return null;
        }
    }
}

// --- HELPER: Get all input elements for a given word start --- ADDED ---
function getInputsForWord(startRow, startCol, direction) {
    const inputs = [];
    let r = parseInt(startRow);
    let c = parseInt(startCol);
    const size = currentGridSize;

    while (r >= 0 && r < size && c >= 0 && c < size) {
        const currentInput = document.querySelector(`#grid input[data-row="${r}"][data-col="${c}"]`);
        if (currentInput) {
            inputs.push(currentInput);
            // Move to next cell in the word
            if (direction === 'across') c++;
            else r++;
        } else {
            // Hit a block or edge
            break;
        }
    }
    return inputs;
}

// --- HELPER: Find the next clue element corresponding to an incomplete word --- ADDED ---
function findNextIncompleteWordClue(currentNumber, currentDirection) {
    const allClues = Array.from(document.querySelectorAll('.clue[data-number][data-direction]'));
    allClues.sort((a, b) => {
        const dirCompare = a.dataset.direction.localeCompare(b.dataset.direction);
        if (dirCompare !== 0) return dirCompare;
        return parseInt(a.dataset.number) - parseInt(b.dataset.number);
    });

    let foundCurrent = false;
    let startIndex = 0;
    for(let i = 0; i < allClues.length; i++){
        if(allClues[i].dataset.number === String(currentNumber) && allClues[i].dataset.direction === currentDirection){
            startIndex = i; foundCurrent = true; break;
        }
    }
    if (!foundCurrent) { startIndex = 0; console.warn("findNextIncompleteWordClue: Current clue not found..."); }
    else { startIndex = (startIndex + 1) % allClues.length; }

    // Function to check if a word for a given clue is complete
    const isWordComplete = (clueElement) => {
        const num = clueElement.dataset.number;
        const dir = clueElement.dataset.direction;
        let startInputForWord = null;

         // Find the actual starting input for this numbered clue
         const allGridInputs = document.querySelectorAll('#grid .cell input'); // Get all inputs
         for(const input of allGridInputs){ // Loop through all inputs
             const numberDiv = input.parentElement.querySelector('.number');
             // Check if this input's parent cell has a number div matching the clue number
             if(numberDiv && numberDiv.textContent === num){
                 startInputForWord = input;
                 break; // Found the starting input
             }
         }

        if (!startInputForWord) {
            console.warn(`isWordComplete: Could not find start input for ${dir} ${num}`);
            return true; // Treat as complete/error if start not found
        }

        // Now get the specific inputs for this word starting from the found input
        const wordSpecificInputs = getInputsForWord(startInputForWord.dataset.row, startInputForWord.dataset.col, dir);
        // A word is complete if it has inputs AND all inputs have correct letters
        return wordSpecificInputs.length > 0 && wordSpecificInputs.every(inp => inp.value !== '' && inp.classList.contains('correct-letter'));
    };

    // Iterate through the sorted clues starting from the one after the current, wrapping around
    for (let i = 0; i < allClues.length; i++) {
        const clueIndex = (startIndex + i) % allClues.length;
        const clue = allClues[clueIndex];

        // Stop if we've checked every clue after wrapping and are back at the start
        if (i > 0 && clueIndex === startIndex && foundCurrent) {
             console.log("findNextIncompleteWordClue: Wrapped full circle.");
             break;
        }

        if (!isWordComplete(clue)) {
             console.log(`findNextIncompleteWordClue: Found next incomplete: ${clue.dataset.direction} ${clue.dataset.number}`);
             return clue; // Found the next incomplete word
        }
    }

    console.log("findNextIncompleteWordClue: No further incomplete words found in the list.");
    return null; // No more incomplete words found
}


// --- Render Grid ---
// (No internal changes needed, uses currentGridSize which is updated by load/generate)
function renderGrid(gridData, numbering) {
    gridElement.innerHTML = '';
    if (!gridData || gridData.length === 0) {
        console.error("RenderGrid called with invalid gridData");
        gridElement.innerHTML = '<p style="color: red;">Error rendering grid: Invalid data.</p>';
        return;
    }
    const size = gridData.length;
    currentGridSize = size; // Update size based on loaded/generated puzzle

    const containerWidth = gridElement.parentElement?.clientWidth || document.body.clientWidth;
    const availableWidth = containerWidth * 0.9; // Use a bit more of the container width
    const maxCellSize = 50; const minCellSize = 30;
    let cellSize = Math.floor(availableWidth / size);
     // Clamp cell size within min/max
    cellSize = Math.max(minCellSize, Math.min(maxCellSize, cellSize));


    gridElement.style.gridTemplateColumns = `repeat(${size}, ${cellSize}px)`;
    gridElement.style.gridTemplateRows = `repeat(${size}, ${cellSize}px)`;

    gridData.forEach((row, i) => {
      if (!Array.isArray(row)) { console.error(`Grid data row ${i} not an array`); return; }
      row.forEach((cellData, j) => {
        const cellElement = document.createElement('div');
        cellElement.className = 'cell';
        cellElement.style.width = `${cellSize}px`; cellElement.style.height = `${cellSize}px`;
        if (numbering?.[i]?.[j]) { const nd = document.createElement('div'); nd.className='number'; nd.textContent=numbering[i][j]; cellElement.appendChild(nd); }
        if (cellData !== null) { // Check for null (black square)
          const input = document.createElement('input');
          input.type = 'text'; input.maxLength = 1; input.dataset.row = i; input.dataset.col = j;
          input.autocomplete = 'off'; input.spellcheck = false;
          input.addEventListener('input', handleInput);
          input.addEventListener('keydown', handleKeyDown);
          cellElement.appendChild(input);
        } else { cellElement.classList.add('block'); }
        gridElement.appendChild(cellElement);
      });
    });
}

// --- Render Clues ---
// (Modified clue click handler)
function renderClues(clues) {
     if (!clues || (!clues.across?.length && !clues.down?.length)) {
        cluesContainer.innerHTML = '<p>No clues available.</p>';
        return;
    }
     cluesContainer.innerHTML = `
      <div class="clues">
        <div class="clue-section">
          <h3>Across</h3>
          ${(clues.across || []).map(({number, clue}) => `<p class="clue" data-number="${number}" data-direction="across"><strong>${number}.</strong> ${clue}</p>`).join('')}
        </div>
        <div class="clue-section">
          <h3>Down</h3>
          ${(clues.down || []).map(({number, clue}) => `<p class="clue" data-number="${number}" data-direction="down"><strong>${number}.</strong> ${clue}</p>`).join('')}
        </div>
      </div>`;

    document.querySelectorAll('.clue').forEach(clue => {
        clue.addEventListener('click', function() {
            const number = this.dataset.number; const direction = this.dataset.direction;
            document.querySelectorAll('.clue').forEach(c => c.classList.remove('selected')); this.classList.add('selected');
             let firstInputForClue = null; const inputs = document.querySelectorAll('#grid .cell input'); // Scope query
             // Find the input associated with the clicked clue number
             for (const input of inputs) {
                 const numberDiv = input.parentElement.querySelector('.number');
                 // Check if numberDiv exists and its textContent matches the clue number
                 if (numberDiv && numberDiv.textContent === number) {
                     firstInputForClue = input;
                     break; // Found the starting input
                 }
             }

            if (firstInputForClue) {
                // When a clue is clicked, find the first *empty* or *incorrect* input in that word
                let currentCell = firstInputForClue;
                let cellToFocus = firstInputForClue; // Default to the start cell
                // Loop through the word to find the first available cell
                while (currentCell) {
                    // Check if the current cell is the one to focus (empty or incorrect)
                    if (currentCell.value === '' || currentCell.classList.contains('incorrect-letter')) {
                        cellToFocus = currentCell;
                        break; // Found the first focusable cell
                    }

                    // Get next cell coordinates
                    const row = parseInt(currentCell.dataset.row);
                    const col = parseInt(currentCell.dataset.col);
                    const size = currentGridSize;
                    let nextRow = direction === 'down' ? row + 1 : row;
                    let nextCol = direction === 'across' ? col + 1 : col;

                     if (nextRow < 0 || nextRow >= size || nextCol < 0 || nextCol >= size) {
                        break; // Reached grid edge
                    }
                    const nextCellInput = document.querySelector(`#grid input[data-row="${nextRow}"][data-col="${nextCol}"]`);
                    if (!nextCellInput) break; // Hit a block or end of word inputs
                    currentCell = nextCellInput;
                }
                cellToFocus.focus(); // Focus the determined cell
            } else {
                 console.warn(`Could not find starting input cell for clue ${direction} ${number}`);
            }
        });
    });
}


// --- handleKeyDown ---
// (No internal changes needed)
function handleKeyDown(event) {
    const inputElement = event.target; const r = parseInt(inputElement.dataset.row); const c = parseInt(inputElement.dataset.col); const val = inputElement.value;
    if (event.key !== 'Backspace' && event.key !== 'Delete') return;
    const selClue = document.querySelector('.clue.selected'); const dir = selClue ? selClue.dataset.direction : 'across'; // Default to across if no clue selected

    if (val !== '') {
        inputElement.value = ''; inputElement.classList.remove('correct-letter', 'incorrect-letter'); event.preventDefault();
    } else {
        event.preventDefault(); let prevR = r; let prevC = c;
        if (dir === 'across') { if (c > 0) prevC = c - 1; else return; } else { if (r > 0) prevR = r - 1; else return; }
        const prevInput = document.querySelector(`#grid input[data-row="${prevR}"][data-col="${prevC}"]`);
        if (prevInput) { prevInput.value = ''; prevInput.classList.remove('correct-letter', 'incorrect-letter'); prevInput.focus(); }
    }
}


// --- handleInput (MODIFIED for skipping, word completion, and advancing) ---
function handleInput(event) {
    const inputElement = event.target;
    const row = parseInt(inputElement.dataset.row);
    const col = parseInt(inputElement.dataset.col);
    const enteredValue = inputElement.value.toLowerCase();

    // --- 1. Handle Empty Input ---
    if (enteredValue === '') {
        inputElement.classList.remove('correct-letter', 'incorrect-letter');
        return;
    }

    // --- 2. Check Correctness ---
    if (!solutionGrid?.[row]?.[col]) {
        console.error(`Solution grid data missing for cell [${row},${col}]`);
        inputElement.value = enteredValue.toUpperCase();
        inputElement.classList.add('incorrect-letter');
        return;
    }
    const correctAnswer = solutionGrid[row][col].toLowerCase();
    let isCorrect = false;

    if (enteredValue === correctAnswer) {
        inputElement.classList.add('correct-letter');
        inputElement.classList.remove('incorrect-letter');
        isCorrect = true;
    } else {
        inputElement.classList.add('incorrect-letter');
        inputElement.classList.remove('correct-letter');
        isCorrect = false;
        inputElement.value = enteredValue.toUpperCase(); // Keep incorrect input visible
        return; // Stop processing if incorrect
    }

    inputElement.value = enteredValue.toUpperCase(); // Show correct input as uppercase

    // --- 3. Check Puzzle Completion (Overall) ---
    const allGridInputs = document.querySelectorAll('#grid .cell input');
    const isPuzzleComplete = Array.from(allGridInputs).every(inp => {
        const r = parseInt(inp.dataset.row); const c = parseInt(inp.dataset.col);
        return solutionGrid?.[r]?.[c] && inp.value.toLowerCase() === solutionGrid[r][c].toLowerCase();
    });

    if (isPuzzleComplete && currentPuzzleId) {
        console.log("Puzzle complete!"); markPuzzleAsCompleted(currentPuzzleId);
        if (successIndicator) {
            successIndicator.classList.add('show');
            setTimeout(() => { successIndicator?.classList.remove('show'); }, 1500);
        } else { alert('Congratulations! You solved the puzzle!'); }
        return; // Stop further focus movement
    }

    // --- 4. Handle Word Completion and Advancement ---
    const selectedClueElement = document.querySelector('.clue.selected');
    if (isCorrect && selectedClueElement) { // Only check word completion if correct & clue selected
        const currentDirection = selectedClueElement.dataset.direction;
        const currentNumber = selectedClueElement.dataset.number;
        let startInputForWord = null;
        const allInputsInGrid = document.querySelectorAll('#grid .cell input'); // Get all inputs again for this check
        for(const input of allInputsInGrid){
            const numberDiv = input.parentElement.querySelector('.number');
            if(numberDiv && numberDiv.textContent === currentNumber){
                startInputForWord = input; break;
            }
        }

        if(startInputForWord){
            const wordInputs = getInputsForWord(startInputForWord.dataset.row, startInputForWord.dataset.col, currentDirection);
            const isWordDone = wordInputs.length > 0 && wordInputs.every(inp => inp.value !== '' && inp.classList.contains('correct-letter'));

            if (isWordDone) {
                console.log(`Word complete: ${currentDirection} ${currentNumber}. Finding next.`);
                const nextClue = findNextIncompleteWordClue(currentNumber, currentDirection);
                if (nextClue) {
                    console.log(`Advancing to: ${nextClue.dataset.direction} ${nextClue.dataset.number}`);
                    nextClue.click(); // Simulates click to select clue and focus first available cell
                    return; // Advanced to new word, stop further processing here
                } else {
                    console.log("Word complete, no more incomplete words.");
                    inputElement.blur(); // No more words, remove focus
                    return;
                }
            }
        } // else: Couldn't find start input, proceed to regular focus movement
    }

    // --- 5. Handle Regular Focus Movement (Skip Correctly Filled) ---
    // Reached if: correct input, puzzle incomplete, word incomplete OR no clue selected
    if (isCorrect) {
        const currentDirection = selectedClueElement ? selectedClueElement.dataset.direction : 'across'; // Default direction if needed
        const nextFocusable = findNextFocusableInput(row, col, currentDirection);

        if (nextFocusable) {
            setTimeout(() => nextFocusable.focus(), 0);
        } else {
            // console.log("No next focusable cell in this direction.");
            // If no next focusable cell in this direction, focus stays put.
            // Might happen if the word is now full but the 'isWordDone' check above didn't trigger yet,
            // or if user was at the very end of the grid in that direction.
        }
    }
}

// --- Load Saved Puzzles List (MODIFIED for completion state) ---
async function loadSavedPuzzlesList() {
    if (!savedPuzzlesListElement || !loadingSavedPuzzlesMsg || !noSavedPuzzlesMsg) return;
    loadingSavedPuzzlesMsg.style.display = 'list-item'; noSavedPuzzlesMsg.style.display = 'none';
    Array.from(savedPuzzlesListElement.querySelectorAll('li:not(#loadingSavedPuzzles):not(#noSavedPuzzles)')).forEach(li => li.remove());
    const completedSet = getCompletedPuzzles(); // Get completed IDs
    try {
        const response = await fetch('/puzzles?limit=15');
        if (!response.ok) { /*...*/ throw new Error(/*...*/); }
        const puzzles = await response.json();
        loadingSavedPuzzlesMsg.style.display = 'none';
        if (puzzles?.length > 0) {
            noSavedPuzzlesMsg.style.display = 'none';
            puzzles.forEach(puzzle => {
                const li = document.createElement('li'); const a = document.createElement('a');
                a.href = `/?puzzle=${puzzle.id}`; a.textContent = puzzle.title || 'Untitled'; a.dataset.puzzleId = puzzle.id;
                if (completedSet.has(puzzle.id)) li.classList.add('completed');
                a.addEventListener('click', (e) => {
                    e.preventDefault(); const puzId = e.target.dataset.puzzleId;
                    if (puzId !== currentPuzzleId) { loadSpecificPuzzle(puzId); history.pushState({ puzzleId: puzId }, e.target.textContent, e.target.href); }
                });
                li.appendChild(a); savedPuzzlesListElement.insertBefore(li, loadingSavedPuzzlesMsg);
            });
        } else { noSavedPuzzlesMsg.style.display = 'list-item'; }
    } catch (error) {
        console.error("Error loading saved puzzles list:", error);
        loadingSavedPuzzlesMsg.style.display = 'none'; noSavedPuzzlesMsg.style.display = 'none';
        const errorLi = document.createElement('li'); errorLi.textContent = 'Could not load puzzle list.'; errorLi.style.color = 'red';
        savedPuzzlesListElement.insertBefore(errorLi, loadingSavedPuzzlesMsg);
    }
}

// --- Load Specific Saved Puzzle (MODIFIED to manage view) ---
async function loadSpecificPuzzle(puzzleId) {
    if (!puzzleId || typeof puzzleId !== 'string' || !/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(puzzleId)) {
        console.error(`Attempted to load invalid puzzle ID: ${puzzleId}`);
        displayError(new Error("Invalid Puzzle ID requested."));
        history.replaceState({}, document.title, window.location.pathname); // Clear invalid ID from URL
        return;
    }
    console.log(`Loading puzzle: ${puzzleId}`);
    showLoading('Loading saved puzzle...'); // Calls showPuzzleView & clearPuzzleAreaContent
    currentPuzzleId = puzzleId; // Set ID *before* potential errors clear it
    try {
        const response = await fetch(`/puzzle/${puzzleId}`);
        if (!response.ok) {
             let errorMsg = `Failed to load puzzle (${response.status})`;
             try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch(e) { /* ignore */ }
            throw new Error(errorMsg);
        }
        const data = await response.json(); console.log('Loaded data:', data);
        if (!data.grid || !data.numbering || !data.clues || !data.solutionGrid) {
             throw new Error("Received incomplete puzzle data from server.");
        }
        // showPuzzleView(); // Already called by showLoading
        if (puzzleTitleElement) puzzleTitleElement.textContent = data.title || 'Crossword Puzzle';
        solutionGrid = data.solutionGrid;
        renderGrid(data.grid, data.numbering); renderClues(data.clues); // Updates currentGridSize
        const completedSet = getCompletedPuzzles();
        if (completedSet.has(puzzleId)) console.log("Loaded puzzle is already marked as completed.");
         // Clear selected clue after loading a puzzle
        document.querySelectorAll('.clue.selected').forEach(c => c.classList.remove('selected'));
        hideLoading();
    } catch (error) { displayError(error); currentPuzzleId = null; }
}

// --- Generate New Crossword (MODIFIED for fixed size and view management) ---
async function generateNewCrossword() {
    const fixedSize = 4;
    console.log(`Generating new ${fixedSize}x${fixedSize} crossword`);
    showLoading(`Generating ${fixedSize}x${fixedSize} puzzle...`); // Calls showPuzzleView & clearPuzzleAreaContent
    currentPuzzleId = null; // Reset current ID for new puzzle
    try {
        const response = await fetch(`/generate?size=${fixedSize}`);
        if (!response.ok) {
            let errorMsg = 'Failed to generate crossword';
            try { const errorData = await response.json(); errorMsg = errorData.error || errorMsg; } catch (e) { /* Ignore */ }
            throw new Error(errorMsg);
        }
        const data = await response.json(); console.log('Received data:', data);
        if (!data.puzzleId || !data.grid || !data.numbering || !data.clues || !data.solutionGrid) {
            throw new Error("Received incomplete data after generation.");
         }
        // showPuzzleView(); // Already called by showLoading
        currentPuzzleId = data.puzzleId; solutionGrid = data.solutionGrid;
        if (puzzleTitleElement) puzzleTitleElement.textContent = data.title || 'Crossword Puzzle';
        renderGrid(data.grid, data.numbering); renderClues(data.clues); // Updates currentGridSize
         // Clear selected clue after generating a puzzle
        document.querySelectorAll('.clue.selected').forEach(c => c.classList.remove('selected'));
        hideLoading();
        const newUrl = `/?puzzle=${data.puzzleId}`; const newTitle = data.title || 'Generated';
        history.pushState({ puzzleId: data.puzzleId }, newTitle, newUrl);
        loadSavedPuzzlesList(); // Refresh list
    } catch (error) { // **** THIS CATCH BLOCK WAS MISSING ****
       displayError(error);
       currentPuzzleId = null; // Ensure ID is null on error
       // Optionally revert to initial view on failure:
       // showInitialView();
    }
} // **** END OF generateNewCrossword function ****

// --- Event Listener for Generate Button ---
if (generateBtn) {
    generateBtn.addEventListener('click', generateNewCrossword);
} else {
    console.error("Generate button not found!");
}

// --- Handle Back/Forward Browser Navigation ---
window.addEventListener('popstate', (event) => {
    const statePuzzleId = event.state?.puzzleId;
    console.log("Popstate event:", event.state);

    if (statePuzzleId && statePuzzleId !== currentPuzzleId) {
        console.log(`History state change detected, loading puzzle: ${statePuzzleId}`);
        loadSpecificPuzzle(statePuzzleId); // Handles showing puzzle view
    } else if (!statePuzzleId) {
        // Back to initial state (no puzzle ID)
        console.log("History state lost puzzleId, showing initial view.");
        showInitialView(); // Show the prompt, hide puzzle area
    } else {
        // State might match current (e.g., refresh) or be invalid
        console.log("Popstate matches current puzzle or is invalid, ensuring correct view.");
        if(currentPuzzleId) showPuzzleView(); else showInitialView();
    }
});

// --- Initial Load Logic (MODIFIED - No auto-generate) ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM Content Loaded. Initializing...");
    loadSavedPuzzlesList(); // Load the list first

    const urlParams = new URLSearchParams(window.location.search);
    const puzzleIdFromUrl = urlParams.get('puzzle');
    console.log(`Checking URL params: puzzle=${puzzleIdFromUrl}`);

    if (puzzleIdFromUrl && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(puzzleIdFromUrl)) {
        console.log(`Found valid puzzle ID in URL: ${puzzleIdFromUrl}. Loading specific puzzle.`);
        loadSpecificPuzzle(puzzleIdFromUrl); // Handles showing puzzle view
        // Use replaceState for the initial load from URL to avoid polluting history
        history.replaceState({ puzzleId: puzzleIdFromUrl }, document.title, window.location.href);
    } else {
        // No specific puzzle requested, or ID format is invalid
        console.log("No valid puzzle ID in URL. Showing initial prompt.");
        if (puzzleIdFromUrl) { // If there was an ID but it was invalid
             history.replaceState({}, document.title, window.location.pathname); // Clean URL
        }
        showInitialView(); // **** Explicitly show the initial view ****
        // **** DO NOT auto-generate ****
    }
});