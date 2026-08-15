
const fs = require('fs');
const content = fs.readFileSync('components/items/ItemModal/ItemModal.tsx', 'utf8');
const lines = content.split('\n');

let balance = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '{') balance++;
        if (char === '}') balance--;
    }
    
    if (i >= 238 && i < lines.length && balance === 0) {
        console.log(`Balance hit ZERO on line ${i+1}: ${line.trim()}`);
    }
}
