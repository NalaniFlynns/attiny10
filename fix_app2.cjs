const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

content = content.replace(/export default App;\n*$/, ''); // Remove trailing export

// Replace ocr0al in HdrSmdLed shader:
content = content.replace(/ocr0al/g, "(duty * 255)"); // This will replace inside the WebGPU shader text, which is fine!
// Wait! I need to be careful with the HdrSmdLed definition. Let's just fix the specific shader string:
// Actually `let intensity = (duty > 0) ? Math.pow(duty, 2.2) * 5.0 * (iLed > 0 ? 1 : 0) : 0;` replaced the ocr0al intensity line.
// But there's another usage of ocr0al inside the shader string!
// Let's replace the whole shader's ocr0al to use duty.

fs.writeFileSync('src/App.tsx', content);
