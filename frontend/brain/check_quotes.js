
import fs from 'fs';

const content = fs.readFileSync('frontend/components/items/ItemModal/ItemModal.tsx', 'utf8');

function checkQuotes(text) {
    let doubleQuotes = 0;
    let singleQuotes = 0;
    let backticks = 0;
    let inString = null;
    let inComment = null;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i+1];

        if (inComment === '//') {
            if (char === '\n') inComment = null;
            continue;
        }
        if (inComment === '/*') {
            if (char === '*' && nextChar === '/') {
                inComment = null;
                i++;
            }
            continue;
        }

        if (inString) {
            if (char === inString && text[i-1] !== '\\') {
                inString = null;
            }
            continue;
        }

        if (char === '/' && nextChar === '/') {
            inComment = '//';
            i++;
            continue;
        }
        if (char === '/' && nextChar === '*') {
            inComment = '/*';
            i++;
            continue;
        }

        if (char === '"') {
            doubleQuotes++;
            inString = '"';
        } else if (char === "'") {
            singleQuotes++;
            inString = "'";
        } else if (char === '`') {
            backticks++;
            inString = '`';
        }
    }

    console.log(`Double Quotes: ${doubleQuotes}`);
    console.log(`Single Quotes: ${singleQuotes}`);
    console.log(`Backticks: ${backticks}`);
    if (inString) console.log(`Unclosed string type: ${inString}`);
}

checkQuotes(content);
