const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

const regex = /export default App;\n*function PWMWaveform([\s\S]*)/;
const match = content.match(regex);
if (match) {
  content = content.replace(regex, ''); // Remove the export and appended functions
  content += "\n" + "function PWMWaveform" + match[1] + "\nexport default App;\n";
  fs.writeFileSync('src/App.tsx', content);
}
