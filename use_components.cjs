const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const target = /<div className="mt-3 pt-3 border-t border-zinc-800 flex gap-4 text-\[8px\] text-zinc-500 tracking-widest">\s*<div className="flex items-center gap-1">\s*<div className="w-2 h-2 bg-indigo-900\/40 border border-indigo-700\/50 rounded-sm"><\/div>\s*<span>IO REGS<\/span>\s*<\/div>\s*<div className="flex items-center gap-1">\s*<div className="w-2 h-2 bg-emerald-900\/40 border border-emerald-700\/50 rounded-sm"><\/div>\s*<span>SRAM<\/span>\s*<\/div>\s*<\/div>\s*<\/(\>|Fragment)>/;

const replacement = `
                <div className="mt-3 pt-3 border-t border-zinc-800 flex gap-4 text-[8px] text-zinc-500 tracking-widest mb-4">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-indigo-900/40 border border-indigo-700/50 rounded-sm"></div>
                    <span>IO REGS</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-emerald-900/40 border border-emerald-700/50 rounded-sm"></div>
                    <span>SRAM</span>
                  </div>
                </div>

                <LevelsDisplay config={config} mem={mem} />
                <PWMWaveform duty={getLedVoltage(mem, vccSlider, config).duty} />
              </>
`;

if (target.test(content)) {
    content = content.replace(target, replacement);
    fs.writeFileSync('src/App.tsx', content);
    console.log("Replaced successfully!");
} else {
    console.log("Could not find target!");
}
