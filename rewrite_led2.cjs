const fs = require('fs');
let content = fs.readFileSync('src/useSimulator.ts', 'utf8');

const regex = /export function getLedVoltage[\s\S]*/;

const replacement = `export function getLedVoltage(mem: Uint8Array, vcc: number, config: FirmwareConfig) {
  const ddrb = mem[IO.DDRB];
  const portb = mem[IO.PORTB];
  const tccr0a = mem[IO.TCCR0A];
  const ocr0a = mem[IO.OCR0AL];
  
  if (!(ddrb & 1)) return { vLed: 0, iLed: 0, duty: 0 }; // Floating/Input
  
  // LED is Active Low (Anode to VCC, Cathode to PB0)
  // When PB0 is LOW, LED is ON.
  let dutyLow = 0;
  
  if (tccr0a & (1 << 7)) { // COM0A1 set -> PWM
      // Fast PWM, Clear OC0A on match, Set at Bottom.
      // High time is proportional to OCR0A. Low time is (255 - OCR0A).
      dutyLow = (255 - ocr0a) / 255;
  } else {
      dutyLow = (portb & 1) ? 0 : 1;
  }
  
  const Vf = (config.CFG_LED_VF_DV || 28) / 10;
  let iLedOn = 0;
  let vLedOn = 0;
  
  if (vcc > Vf) {
      iLedOn = (vcc - Vf) / 25.0; // Assume 25 ohm output driver resistance
      vLedOn = Vf;
  } else {
      iLedOn = 0;
      vLedOn = vcc;
  }
  
  return {
      vLed: vLedOn, // Average V_LED isn't as useful as the ON state voltage drop across the LED
      iLed: iLedOn * dutyLow, // Average current
      duty: dutyLow
  };
}
`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/useSimulator.ts', content);
