const fs = require('fs');
let content = fs.readFileSync('index.html', 'utf8');

content = content.replace(/<title>.*?<\/title>/, '<title>ATtiny10 Simulator</title>');

fs.writeFileSync('index.html', content);
