# Wordy - AI-Powered Thematic Crossword Generator

## Purpose

Wordy is a web application that automatically generates playable themed crossword puzzles.  While the original version only produced 4x4 grids, the generator now supports any size from **3x3** up to **7x7**.  It leverages the power of OpenAI's GPT‑4.1 language model to create unique, educational clues and thematic titles for each puzzle, offering a fresh experience every time. Generated puzzles are saved, allowing users to revisit and play them later.

## Features

*   **Automatic Grid Generation:** Creates solvable crossword grids using a backtracking algorithm and a provided word list (`words.txt`). Grid sizes from 3x3 to 7x7 are supported.
*   **Thematic Puzzles:** Generates a theme based on the first word and clue of the puzzle, then attempts to subtly relate subsequent clues to that theme.
*   **AI Clue Generation:** Uses OpenAI's GPT-4.1 API to generate educational clues for the words in the grid.
*   **AI Title Generation:** Uses OpenAI's GPT-4.1 API to generate a thematic title based on the first word/clue pair.
*   **Puzzle Persistence:** Saves generated puzzles (grid, clues, solution, title) to a PostgreSQL database.
*   **Puzzle Listing:** Displays a list of recently generated puzzles for users to select and play.
*   **Interactive Play:**
    *   Provides an interactive grid for users to input answers.
    *   Validates answers against the solution in real-time, providing visual feedback (green for correct, red for incorrect).
    *   Automatic cursor advancement to the next available cell (skipping correct cells) in the current word's direction (Across/Down).
    *   Automatic advancement to the next incomplete word upon completing the current one.
*   **Completion Tracking:** Remembers which puzzles have been successfully completed using the browser's Local Storage and visually marks them in the list.
*   **Success Indicator:** Displays a visual confirmation (fading checkmark) upon puzzle completion.
*   **Responsive Design:** Basic responsiveness for usability on different screen sizes.

## Technology Stack

*   **Backend:** Node.js, Express.js
*   **Database:** PostgreSQL (using `pg` library)
*   **AI:** OpenAI API (specifically `gpt-4.1` model)
*   **HTTP Client:** Axios (for OpenAI API calls)
*   **Frontend:** HTML5, CSS3, Vanilla JavaScript
*   **Other:** `uuid` (for generating unique puzzle IDs)

## Setup and Running

1.  **Prerequisites:**
    *   Node.js and npm (or yarn) installed.
    *   Access to a PostgreSQL database.
    *   An OpenAI API key.

2.  **Clone the Repository:**
    ```bash
    git clone <repository_url>
    cd <repository_directory>
    ```

3.  **Install Dependencies:**
    ```bash
    npm install
    ```
    *(This installs Express, Axios, pg, uuid, cors, etc.)*

4.  **Environment Variables:**
    Create a `.env` file in the project root (or use your environment's secret management, like Replit Secrets) with the following variables:
    ```dotenv
    DATABASE_URL=postgresql://user:password@host:port/database?sslmode=require # Your PostgreSQL connection string
    OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx # Your OpenAI API key
    ```
    *   **Important:** Add `.env` to your `.gitignore` file to avoid committing secrets.
    *   The `DATABASE_URL` format might vary slightly depending on your provider (e.g., Neon).

5.  **Word List:**
    *   Ensure a file named `words.txt` exists in the project root directory. This file should contain one word per line, used by the backend to generate the puzzle grid. Words should ideally be lowercase and contain only letters.

6.  **Database Initialization:**
    *   The backend server (`index.js`) includes a function (`initializeDatabase`) that attempts to automatically create the necessary `puzzles` table if it doesn't exist when the server starts.

7.  **Run the Server:**
    ```bash
    npm start
    ```
    *(Or click the "Run" button if using Replit).*
    The server will typically start on port 5000 unless specified otherwise by the `PORT` environment variable.

8.  **Access the Application:** Open your web browser and navigate to `http://localhost:5000` (or your Replit URL).
    *To generate a puzzle larger than 4×4, pass a `size` parameter to the `/generate` endpoint. For example, visiting `http://localhost:5000/generate?size=5` will return a 5×5 crossword.*

## How it Works

### Backend (`index.js`)

1.  **Initialization:** Loads words from `words.txt`, connects to the database, and ensures the `puzzles` table exists.
2.  **`/generate` Endpoint:**
    *   Receives a request to generate a crossword grid. Specify the desired size using the `size` query parameter (e.g. `/generate?size=5`). Valid sizes range from 3 to 7.
    *   Uses a backtracking algorithm (`solve` function) combined with validity checks (`isValid`) against the `wordList` to fill the grid structure.
    *   Captures the filled grid as the `solutionGrid`.
    *   Numbers the grid cells where words start (`numbering`).
    *   Identifies the final words used and their locations (`wordsForClues`).
    *   **Thematic Generation:**
        *   Identifies the word for clue #1 (`firstWordDetails`).
        *   Calls `generateClue(firstWord)` **without** a theme to get the initial clue.
        *   Calls `generateThemeTitle(firstWord, firstClue)` which prompts GPT-4.1 for a thematic title based *only* on this pair.
        *   Calls `generateClue(otherWord, puzzleThemeTitle)` for all *remaining* words, passing the generated theme to guide the clue generation.
    *   Collects all generated clues (`finalClues`).
    *   Generates a unique `puzzleId` using `uuid`.
    *   Calls `savePuzzle` to store the `puzzleId`, thematic `title`, grid structure (`grid_data`), `numbering_data`, `clues_data`, and the full `solution_data` in the PostgreSQL database.
    *   Returns the complete puzzle data (including ID, title, grid, numbering, clues, and solution) to the frontend.
3.  **`/puzzles` Endpoint:** Queries the database for the most recent puzzles (ID and title) and returns them as a list.
4.  **`/puzzle/:id` Endpoint:** Queries the database for the full data of a specific puzzle ID and returns it.

### Frontend (`script.js`)

1.  **Initialization (`DOMContentLoaded`):**
    *   Fetches the list of recent puzzles via `/puzzles` and populates the `#savedPuzzlesList`.
    *   Checks the URL for a `?puzzle=<id>` parameter.
    *   If a valid ID is found, calls `loadSpecificPuzzle(id)`.
    *   Otherwise, calls `showInitialView()` to display the welcome prompt.
2.  **Loading/Generating:**
    *   `loadSpecificPuzzle(id)`: Fetches full puzzle data from `/puzzle/:id`, stores the `solutionGrid`, renders the grid and clues using `renderGrid` and `renderClues`, and displays the puzzle area.
    *   `generateNewCrossword()`: Calls the backend `/generate` endpoint, receives the new puzzle data, stores the `solutionGrid`, renders the puzzle, updates the browser URL using `history.pushState`, and refreshes the puzzle list.
3.  **Gameplay (`handleInput`, `handleKeyDown`):**
    *   Listens for input and keydown events on grid cells.
    *   `handleInput`:
        *   Checks the entered letter against the `solutionGrid`.
        *   Applies `correct-letter` or `incorrect-letter` CSS classes.
        *   If correct:
            *   Checks for overall puzzle completion. If complete, calls `markPuzzleAsCompleted` and shows the success indicator.
            *   If puzzle not complete, checks if the *current word* is complete using `getInputsForWord` and `isWordComplete`.
            *   If the word is complete, finds the next incomplete word using `findNextIncompleteWordClue` and simulates a click on its clue to advance focus.
            *   If the word is *not* complete, finds the next focusable cell (empty or incorrect) in the current direction using `findNextFocusableInput` and moves focus there.
    *   `handleKeyDown`: Handles Backspace/Delete logic, clearing the current cell or moving to the previous cell and clearing it.
4.  **Clue Interaction:** Clicking a clue highlights it and focuses the first available (empty or incorrect) cell in the corresponding word using logic within the `renderClues` event listener.
5.  **Completion Tracking:**
    *   `markPuzzleAsCompleted(id)`: Adds the puzzle ID to a `Set` stored in `localStorage` under the key `crosswordCompletedPuzzles`.
    *   `loadSavedPuzzlesList`: Retrieves the completed set from `localStorage` and adds the `.completed` CSS class to corresponding list items.

## OpenAI Integration Details

*   **Model:** `gpt-4.1` is used for all interactions (as specified in `index.js`).
*   **API Calls:** Made using `axios.post` from the Node.js backend.
*   **JSON Mode:** Relies on `response_format: { "type": "json_object" }` to ensure GPT responds with parseable JSON containing the requested field (`clue` or `title`).

### Prompt Examples:

1.  **Generating a Clue (No Theme):**
    *(Sent by `generateClue` when `theme` is null)*
    ```text
    Create a brief, educational crossword clue for the word "PLANET". Respond with a JSON object containing only a "clue" field. Do not include any other text, formatting, or explanation. Example for word FREE, {"clue": "Something that doesn't cost anything"}
    ```
    *Expected Response Format:* `{"clue": "Celestial body orbiting a star"}`

2.  **Generating a Clue (With Theme):**
    *(Sent by `generateClue` when a theme is provided)*
    ```text
    Create a brief, educational crossword clue for the word "MOON". Try to subtly relate the clue to the puzzle's overall theme: "Solar System Objects", if it makes sense and fits naturally. Do not force the connection if it feels awkward or too obscure. Respond with a JSON object containing only a "clue" field. Do not include any other text, formatting, or explanation. Example for word FREE, {"clue": "Something that doesn't cost anything"}
    ```
    *Expected Response Format:* `{"clue": "Earth's natural satellite, often seen at night"}` (potentially influenced by theme)

3.  **Generating a Thematic Title:**
    *(Sent by `generateThemeTitle`)*
    ```text
    Based *only* on the crossword word "SUN" and its clue "Star providing light and heat to Earth", suggest a short (4-8 word) thematic title for the entire crossword puzzle. Try to pick a theme that is based on pop culture, like movies or music, but if you can't use themes from academia. Respond with ONLY a JSON object containing a "title" field, like {"title": "Suggested Theme"}. Do not include any extra text or explanation.
    ```
    *Expected Response Format:* `{"title": "Our Star and its Neighbors"}`