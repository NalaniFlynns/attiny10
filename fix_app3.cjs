const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/ \(duty \* 255\)=\{255 \- mem\[IO\.OCR0AL\]\} \/>/, ' />');

fs.writeFileSync('src/App.tsx', content);
