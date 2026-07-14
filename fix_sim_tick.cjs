const fs = require('fs');
let content = fs.readFileSync('src/useSimulator.ts', 'utf8');

content = content.replace(/if \(sys_state === 0\) \{\n    if \(act !== 3\) \{\n      do_sleep\(\);\n      return;\n    \}\n  \}/, `if (sys_state === 0) {
    if (!b1 || !b2) {
      do_sleep();
      return;
    }
  }`);

content = content.replace(/vLed: vLedOn, \/\/ Average V_LED isn't as useful/, "vLed: dutyLow > 0 ? vLedOn : 0,");

fs.writeFileSync('src/useSimulator.ts', content);
