const fs = require('fs');
let content = fs.readFileSync('src/useSimulator.ts', 'utf8');
if (content.includes('vLed: dutyLow > 0 ? vLedOn : 0,')) {
    console.log("OK");
} else {
    console.log("NOT OK");
}
