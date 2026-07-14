const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<div className="absolute inset-0 flex">[\s\S]*?<\/div>\s*<\/div>\s*<div className="flex justify-between text-\[8px\] text-zinc-600">/m;

const replacement = `<div className="absolute inset-0 flex items-center justify-center">
          <svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
            {Array.from({length: 10}).map((_, i) => {
              const startX = i * 10;
              const highWidth = (1 - duty) * 10;
              const lowWidth = duty * 10;
              return (
                <g key={i}>
                  {highWidth > 0 && <line x1={startX} y1="10" x2={startX + highWidth} y2="10" stroke="#10b981" strokeWidth="2" />}
                  {highWidth > 0 && lowWidth > 0 && <line x1={startX + highWidth} y1="10" x2={startX + highWidth} y2="90" stroke="#10b981" strokeWidth="2" />}
                  {lowWidth > 0 && <line x1={startX + highWidth} y1="90" x2={startX + 10} y2="90" stroke="#10b981" strokeWidth="2" />}
                  {highWidth > 0 && lowWidth > 0 && i < 9 && <line x1={startX + 10} y1="90" x2={startX + 10} y2="10" stroke="#10b981" strokeWidth="2" />}
                </g>
              );
            })}
          </svg>
        </div>
      </div>
      <div className="flex justify-between text-[8px] text-zinc-600">`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/App.tsx', content);
