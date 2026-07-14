const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/getLedVoltage\(mem, vccRef\.current\)/g, "getLedVoltage(mem, vccRef.current, config).vLed");

fs.writeFileSync('src/App.tsx', content);
