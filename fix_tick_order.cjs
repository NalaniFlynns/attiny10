const fs = require('fs');
let content = fs.readFileSync('src/useSimulator.ts', 'utf8');

const regex = /  let act = 0;[\s\S]*?write8\(SRAM\.sys_flags, sys_flags\);\n\n  if \(sys_state === 0\) \{\n    if \(!b1 \|\| !b2\) \{\n      do_sleep\(\);\n      return;\n    \}\n  \}/;

const replacement = `  if (sys_state === 0) {
    if (!b1 || !b2) {
      do_sleep();
      return;
    }
  }

  let act = 0;
  let sys_flags = read8(SRAM.sys_flags);
  let dual_flag = (sys_flags & 1) ? 1 : 0;
  let dual_exec = (sys_flags & 2) ? 1 : 0;
  let last1 = (sys_flags & 4) ? 1 : 0;
  let last2 = (sys_flags & 8) ? 1 : 0;

  if (b1 && b2) {
    dual_flag = 1;
    let hold_ticks = read8(SRAM.hold_ticks);
    if (hold_ticks < 0xFF) { hold_ticks++; write8(SRAM.hold_ticks, hold_ticks); }
    if (hold_ticks === (config.CFG_HOLD_SEC * 62) && !dual_exec) {
      act = 3; dual_exec = 1;
    }
  } else {
    write8(SRAM.hold_ticks, 0);
    
    // Generate clicks if not part of a dual hold release
    if (!dual_flag) {
      if (last1 && !b1) act = 1;
      if (last2 && !b2) act = 2;
    }
    
    // Clear dual state only when both released
    if (!b1 && !b2) {
      dual_flag = 0; 
      dual_exec = 0;
    }
  }

  last1 = b1;
  last2 = b2;
  sys_flags = (dual_flag) | (dual_exec << 1) | (last1 << 2) | (last2 << 3);
  write8(SRAM.sys_flags, sys_flags);`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/useSimulator.ts', content);
