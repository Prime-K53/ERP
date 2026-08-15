
const fs = require('fs');
const content = fs.readFileSync('components/items/ItemModal/ItemModal.tsx', 'utf8');
const lines = content.split('\n');

let balance = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') balance++;
        if (line[j] === '}') balance--;
    }
    // console.log(`${i + 1}: ${balance}`);
}
console.log('Final Balance:', balance);
