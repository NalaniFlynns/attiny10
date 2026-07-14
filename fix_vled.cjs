const fs = require('fs');
let content = fs.readFileSync('src/useSimulator.ts', 'utf8');

content = content.replace(/vLed: dutyLow > 0 \? vLedOn : 0, as the ON state voltage drop across the LED/g, 'vLed: dutyLow > 0 ? vLedOn : 0,');

fs.writeFileSync('src/useSimulator.ts', content);
