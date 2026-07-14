const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/getLedVoltage\(mem, vccSlider\)/g, "getLedVoltage(mem, vccSlider, config).vLed");
content = content.replace(/getLedVoltage\(mem, vccSlider, config\)\.vLed > 2\.0 \? \(\(getLedVoltage\(mem, vccSlider, config\)\.vLed - 2\.0\) \/ 10 \* 1000\)\.toFixed\(1\) : '0\.0'/g, "(getLedVoltage(mem, vccSlider, config).iLed * 1000).toFixed(1)");
content = content.replace(/voltage=\{ledVoltage\}/g, "voltage={getLedVoltage(mem, vccSlider, config).vLed} iLed={getLedVoltage(mem, vccSlider, config).iLed} duty={getLedVoltage(mem, vccSlider, config).duty}");

fs.writeFileSync('src/App.tsx', content);
