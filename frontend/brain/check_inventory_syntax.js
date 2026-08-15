
import fs from 'fs';

const content = fs.readFileSync('frontend/views/Inventory.tsx', 'utf8');

function checkBalanced(text) {
    const stack = [];
    const pairs = { '(': ')', '{': '}', '[': ']' };
    const lines = text.split('\n');
    let inString = null;
    let inComment = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        for (let j = 0; j < line.length; j++) {
            const char = line[j];
            const nextChar = line[j + 1];

            if (inComment === '//') {
                break;
            }

            if (inComment === '/*') {
                if (char === '*' && nextChar === '/') {
                    inComment = null;
                    j++;
                }
                continue;
            }

            if (inString) {
                if (char === inString && line[j - 1] !== '\\') {
                    inString = null;
                }
                continue;
            }

            if (char === '/' && nextChar === '/') {
                inComment = '//';
                j++;
                continue;
            }
            if (char === '/' && nextChar === '*') {
                inComment = '/*';
                j++;
                continue;
            }

            if (char === "'" || char === '"' || char === '`') {
                inString = char;
                continue;
            }

            if (pairs[char]) {
                stack.push({ char, line: i + 1, col: j + 1 });
            } else if (Object.values(pairs).includes(char)) {
                const last = stack.pop();
                if (!last || pairs[last.char] !== char) {
                    console.log(`Unmatched closing ${char} at line ${i + 1}, col ${j + 1}`);
                }
            }
        }
        if (inComment === '//') inComment = null;
    }

    if (stack.length > 0) {
        console.log(`${stack.length} unmatched symbols remaining:`);
        stack.forEach(s => console.log(`Unmatched ${s.char} from line ${s.line}, col ${s.col}`));
    } else {
        console.log('All symbols balanced in Inventory.tsx!');
    }
}

checkBalanced(content);
