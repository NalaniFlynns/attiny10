const fs = require('fs');
let content = fs.readFileSync('src/App.tsx', 'utf8');

// I should remove the old keyListener first if it was added.
content = content.replace(/  useEffect\(\(\) => \{\n    const handleKeyDown[\s\S]*?\}, \[\]\);\n\n/g, "");

const keyListener = `  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === '1' || e.key.toLowerCase() === 'a') btn1Ref.current = true;
      if (e.key === '2' || e.key.toLowerCase() === 'd') btn2Ref.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === '1' || e.key.toLowerCase() === 'a') btn1Ref.current = false;
      if (e.key === '2' || e.key.toLowerCase() === 'd') btn2Ref.current = false;
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

`;

content = content.replace(/const \[vccSlider, setVccSlider\] = useState\(3\.1\);\n/g, "const [vccSlider, setVccSlider] = useState(3.1);\n\n" + keyListener);

// Also add a text tip below the buttons
content = content.replace(/<span className="text-\[9px\] text-zinc-600 mt-2">BTN 1 \(UP\)<\/span>/g, '<span className="text-[9px] text-zinc-600 mt-2">BTN 1 (UP) [Key A]</span>');
content = content.replace(/<span className="text-\[9px\] text-zinc-600 mt-2">BTN 2 \(DOWN\)<\/span>/g, '<span className="text-[9px] text-zinc-600 mt-2">BTN 2 (DOWN) [Key D]</span>');

fs.writeFileSync('src/App.tsx', content);
