
import fs from 'fs';

const content = fs.readFileSync('frontend/components/items/ItemModal/ItemModal.tsx', 'utf8');

function checkDivs(text) {
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
            if (tagName.toLowerCase() !== 'div') continue;

            if (tagName.startsWith('/')) {
                const last = stack.pop();
                if (!last) {
                    console.log(`Unmatched closing tag </div> at line ${i + 1}`);
                }
            } else {
                stack.push({ name: tagName, line: i + 1 });
            }
        }
    }

    if (stack.length > 0) {
        console.log(`${stack.length} unmatched <div> tags remaining:`);
        stack.forEach(s => console.log(`Unmatched <div> from line ${s.line}`));
    } else {
        console.log('All <div> tags balanced!');
    }
}

checkDivs(content);
