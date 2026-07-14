const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/\\\`\\\$\{(.*?)\}\%\\\`/g, "\`${$1}%\`");
content = content.replace(/\\\`flex-shrink/g, "\`flex-shrink");
content = content.replace(/\\\`/g, "\`");

fs.writeFileSync('src/App.tsx', content);
