const fs = require('fs');
const file = 'components/generative-wizard/GenerativeWizardCore.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/=== 'chat-v4'/g, "=== 'chat-v4' || (mode as any) === 'chat-v4a'");
content = content.replace(/!== 'chat-v4'/g, "!== 'chat-v4' && (mode as any) !== 'chat-v4a'");

fs.writeFileSync(file, content);
console.log('Replacements complete');
