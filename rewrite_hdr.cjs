const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/function HdrSmdLed\(\{ voltage, ocr0al \}: \{ voltage: number, ocr0al: number \}\) \{/g, 
  "function HdrSmdLed({ voltage, iLed, duty }: { voltage: number, iLed: number, duty: number }) {");

content = content.replace(/let intensity = \(voltage > 0 && ocr0al > 0\) \? Math\.pow\(ocr0al \/ 255\.0, 2\.2\) \* 5\.0 : 0;/g,
  "let intensity = (duty > 0) ? Math.pow(duty, 2.2) * 5.0 * (iLed > 0 ? 1 : 0) : 0;");

// Also remove WebGPU error logging since they aren't critical
content = content.replace(/console\.error\('WebGPU init error:', e\);/g, "");

fs.writeFileSync('src/App.tsx', content);
