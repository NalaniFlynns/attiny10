const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<div key=\{i\} className="h-full flex flex-col justify-end" style=\{\{ width: '10%' \}\}>\s*<div className="bg-emerald-500 w-full" style=\{\{ height: duty > 0 \? '100%' : '0%', width: `\$\{duty \* 100\}%` \}\}><\/div>\s*<div className="bg-zinc-900 w-full" style=\{\{ height: duty < 1 \? '10%' : '0%', width: `\$\{\(1 - duty\) \* 100\}%` \}\}><\/div>\s*<\/div>/g;

const replacement = `<div key={i} className="h-full flex flex-row items-end" style={{ width: '10%' }}>
                    <div className="bg-emerald-500 h-full border-r border-emerald-400" style={{ width: \`\${(1 - duty) * 100}%\`, display: (1 - duty) > 0 ? 'block' : 'none' }}></div>
                    <div className="bg-emerald-900/50 h-[10%] border-l border-emerald-800" style={{ width: \`\${duty * 100}%\`, display: duty > 0 ? 'block' : 'none' }}></div>
                </div>`;

if (content.match(regex)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('src/App.tsx', content);
    console.log("PWM Waveform replaced successfully");
} else {
    console.log("Could not match PWM Waveform");
}
