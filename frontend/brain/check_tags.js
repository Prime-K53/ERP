
import fs from 'fs';

const content = fs.readFileSync('frontend/components/items/ItemModal/ItemModal.tsx', 'utf8');

function checkTags(text) {
    const stack = [];
    const lines = text.split('\n');
    
    // Simple regex for tags, ignoring self-closing ones like <input />
    const tagRegex = /<(\/?[a-zA-Z0-9]+)([^>]*?)>/g;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let match;
        while ((match = tagRegex.exec(line)) !== null) {
            const fullTag = match[0];
            const tagName = match[1];
            const attrs = match[2];

            if (fullTag.endsWith('/>')) continue; // Self-closing
            if (['input', 'img', 'br', 'hr', 'link', 'meta'].includes(tagName.toLowerCase())) continue;

            if (tagName.startsWith('/')) {
                const name = tagName.substring(1);
                const last = stack.pop();
                if (!last || last.name !== name) {
                    console.log(`Unmatched closing tag </${name}> at line ${i + 1}`);
                    if (last) console.log(`Expected matching tag for <${last.name}> from line ${last.line}`);
                }
            } else {
                stack.push({ name: tagName, line: i + 1 });
            }
        }
    }

    if (stack.length > 0) {
        console.log(`${stack.length} unmatched tags remaining:`);
        stack.forEach(s => console.log(`Unmatched <${s.name}> from line ${s.line}`));
    } else {
        console.log('All tags balanced!');
    }
}

checkTags(content);
