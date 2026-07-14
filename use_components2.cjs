const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /<span>SRAM<\/span>\n\s*<\/div>\n\s*<\/div>\n\s*<\/>/;
const replacement = `<span>SRAM</span>
                  </div>
                </div>
                
                <LevelsDisplay config={config} mem={mem} />
                <PWMWaveform duty={getLedVoltage(mem, vccSlider, config).duty} />
              </>`;

if (regex.test(content)) {
    content = content.replace(regex, replacement);
    fs.writeFileSync('src/App.tsx', content);
    console.log("Success");
} else {
    console.log("Failed");
}
