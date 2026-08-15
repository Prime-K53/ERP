
const fs = require('fs');
const content = fs.readFileSync('components/items/ItemModal/ItemModal.tsx', 'utf8');
const lines = content.split('\n');

let balance = 0;
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
        if (line[j] === '{') balance++;
        if (line[j] === '}') balance--;
        
        if (balance < 0) {
            console.log(`Unbalanced bracket on line ${i + 1}, column ${j + 1}`);
            console.log(line.trim());
            process.exit(1);
        }
    }
}
console.log('Balance at end:', balance);
