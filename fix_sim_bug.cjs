const fs = require('fs');

let content = fs.readFileSync('src/useSimulator.ts', 'utf8');

// I will replace `return;` after `do_sleep();` to not return, or actually wait!
// The C code has a `do_sleep` label at the end of the loop!
// Let's completely replace `runTick` to closely match C code structure.
