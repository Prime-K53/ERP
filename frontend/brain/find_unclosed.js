
import fs from 'fs';

const content = fs.readFileSync('frontend/components/items/ItemModal/ItemModal.tsx', 'utf8');

function findUnclosed(text) {
    const stack = [];
    const lines = text.split('\n');
    const tagRegex = /<(\/?[a-zA-Z0-9]+)([^>]*?)>/g;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;
        while ((match = tagRegex.exec(line)) !== null) {
            const fullTag = match[0];
            const tagName = match[1];

            if (fullTag.endsWith('/>')) continue;
            
            const isClosing = tagName.startsWith('/');
            const name = isClosing ? tagName.substring(1) : tagName;
            
            if (name.toLowerCase() !== 'div') continue;

            if (isClosing) {
                if (stack.length === 0) {
                    console.log(`Extra closing div at line ${i + 1}`);
                } else {
                    stack.pop();
                }
            } else {
                stack.push({ line: i + 1 });
            }
        }
    }

    console.log(`Total remaining on stack: ${stack.length}`);
    stack.forEach(s => console.log(`Unclosed div from line ${s.line}`));
}

findUnclosed(content);
