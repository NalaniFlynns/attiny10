const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /const pwmVal = map\[i\] \|\| 0;/;
const replacement = `
           const lvl = i + 1;
           let eff_level = (lvl > maxLimit) ? maxLimit : lvl;
           let pwmVal = map[eff_level - 1] || 0;
           // If it's the max limit and it's mapped, the compensation might boost it
           let l_vlm = mem[SRAM.last_vlm_state];
           if (config.CFG_VOLTAGE_COMP_EN && l_vlm < 5) {
               if (eff_level === maxLimit && isMapped) {
                   pwmVal = 255;
               } else {
                   const { S_TAB } = getTabs(config);
                   let s = S_TAB[l_vlm];
                   let res = 0, a = map[eff_level-1];
                   while (s) {
                       if (s & 1) res += a;
                       a <<= 1;
                       s >>= 1;
                   }
                   res >>= 5;
                   pwmVal = (res > 255) ? 255 : res;
               }
           }
`;

content = content.replace(/const lvl = i \+ 1;\n\s*const pwmVal = map\[i\] \|\| 0;/, replacement);

fs.writeFileSync('src/App.tsx', content);
