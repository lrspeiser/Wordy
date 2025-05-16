// Import the 'fs' (file system) module with promises for async operations
const fs = require('fs').promises;
// Import the 'path' module (optional but good practice for handling paths)
const path = require('path');

// --- Configuration ---
const OUTPUT_WORD_LENGTH = 3; // The desired length for words

// --- Main Async Function ---
async function processFiles(inputFilePaths, outputFilePath) {
    // Use a Set to automatically handle duplicates
    const uniqueFourLetterWords = new Set();

    console.log('Starting word processing...');

    // Process each input file
    for (const inputPath of inputFilePaths) {
        console.log(`\nProcessing file: ${inputPath}`);
        try {
            // Read the file content asynchronously
            const content = await fs.readFile(inputPath, 'utf8');

            // Split the content into lines
            const lines = content.split('\n');

            // Process each line
            for (const line of lines) {
                // Trim whitespace from the start/end of the line
                const trimmedLine = line.trim();

                // Skip empty lines
                if (!trimmedLine) {
                    continue;
                }

                // Split the line by whitespace (spaces, tabs)
                // We only care about the first "word" on the line
                const tokens = trimmedLine.split(/\s+/); // \s+ matches one or more whitespace chars
                const firstToken = tokens[0];

                if (firstToken) {
                    // Clean the word: remove all periods and convert to lowercase
                    const cleanedWord = firstToken.replace(/\./g, '').toLowerCase();
                    //                        ^ ^-- '.' is the character to remove
                    //                        |--- 'g' flag means replace ALL occurrences

                    // Check if the cleaned word has the desired length
                    if (cleanedWord.length === OUTPUT_WORD_LENGTH) {
                        // Add the word to the Set (duplicates are ignored automatically)
                        uniqueFourLetterWords.add(cleanedWord);
                        // console.log(`  Found: ${cleanedWord}`); // Uncomment for debugging
                    }
                }
            }
            console.log(`Finished processing: ${inputPath}`);

        } catch (error) {
            // Handle errors like file not found or permission issues
            console.error(`Error processing file ${inputPath}: ${error.message}`);
            // Decide if you want to stop or continue processing other files
            // For now, we'll log the error and continue
        }
    }

    // Convert the Set to an array and sort it alphabetically
    const sortedWords = Array.from(uniqueFourLetterWords).sort();

    console.log(`\nFound ${sortedWords.length} unique ${OUTPUT_WORD_LENGTH}-letter words.`);

    // Prepare the output content (each word on a new line)
    const outputContent = sortedWords.join('\n');

    // Write the result to the output file
    try {
        await fs.writeFile(outputFilePath, outputContent, 'utf8');
        console.log(`\nSuccessfully wrote ${sortedWords.length} words to ${outputFilePath}`);
    } catch (error) {
        console.error(`Error writing to output file ${outputFilePath}: ${error.message}`);
        process.exit(1); // Exit with an error code if writing fails
    }
}

// --- Script Execution ---

// Get command line arguments (excluding 'node' and the script name)
const args = process.argv.slice(2);

// Check if enough arguments are provided (at least one input, one output)
if (args.length < 2) {
    console.error('Usage: node process_words.js <input_file1> [input_file2...] <output_file>');
    console.error('Example: node process_words.js words1.txt words2.txt words3.txt four_letter_words.txt');
    process.exit(1); // Exit with an error code
}

// The last argument is the output file path
const outputFilePath = args.pop();
// The remaining arguments are the input file paths
const inputFilePaths = args;

// Run the main processing function
processFiles(inputFilePaths, outputFilePath)
    .catch(err => {
        // Catch any unexpected errors during the async processing
        console.error("An unexpected error occurred:", err);
        process.exit(1);
    });