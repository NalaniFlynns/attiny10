import { useState, useEffect, useRef, useCallback } from 'react';

const MEM_SIZE = 0x60;

export const IO = {
  PINB: 0x00, DDRB: 0x01, PORTB: 0x02, PUEB: 0x03,
  TCCR0A: 0x2E, TCCR0B: 0x2D, OCR0AL: 0x26, OCR0AH: 0x27,
  VLMCSR: 0x34, SMCR: 0x3A,
};

export const SRAM = {
  magic_cookie: 0x40, saved_level: 0x42, tick_flag: 0x43,
  sys_state: 0x44, idle_sec: 0x45, tick_cnt: 0x47,
  vlm_ticks: 0x48, hold_ticks: 0x49, btn_state: 0x4A,
  clock_cycles_l: 0x4B, clock_cycles_h: 0x4C
};

const PWM_MAP = [2, 5, 12, 25, 45, 80, 130, 190, 255];
const B_PR1 = 0, B_PR2 = 1, B_DB1 = 2, B_DB2 = 3, B_LAST1 = 4, B_LAST2 = 5, B_DUAL = 6, B_DUAL_EX = 7;

export interface FirmwareConfig {
  CFG_HOLD_SEC: number;
  CFG_ENABLE_MEMORY: number;
  CFG_DEFAULT_LEVEL: number;
  CFG_PWM_MAP: number[];
  CFG_MAX_LIMIT_LEVEL: number;
  CFG_AUTO_SLEEP_EN: number;
  CFG_DIM_SEC: number;
  CFG_OFF_SEC: number;
  CFG_VLM_LEVEL: number;
  CFG_VLM_FILTER_EN: number;
  CFG_VLM_FILTER_MS: number;
}

export const defaultFirmwareConfig: FirmwareConfig = {
  CFG_HOLD_SEC: 2,
  CFG_ENABLE_MEMORY: 1,
  CFG_DEFAULT_LEVEL: 4,
  CFG_PWM_MAP: [2, 5, 12, 25, 45, 80, 130, 190, 255],
  CFG_MAX_LIMIT_LEVEL: 9,
  CFG_AUTO_SLEEP_EN: 1,
  CFG_DIM_SEC: 7200,
  CFG_OFF_SEC: 7800,
  CFG_VLM_LEVEL: 3,
  CFG_VLM_FILTER_EN: 1,
  CFG_VLM_FILTER_MS: 200,
};

export function getVlmVoltage(level: number): number {
  switch (level & 0x07) {
    case 1: return 1.4;
    case 2: return 1.6;
    case 3: return 1.8;
    case 4: return 2.0;
    case 5: return 2.5;
    case 6: return 2.7;
    case 7: return 4.3;
    default: return 0; // Disabled
  }
}

export function useSimulator() {
  const memRef = useRef<Uint8Array>(new Uint8Array(MEM_SIZE));
  const vccRef = useRef<number>(3.1);
  const btn1Ref = useRef<boolean>(false);
  const btn2Ref = useRef<boolean>(false);
  const warpSpeedRef = useRef<number>(1);
  const configRef = useRef<FirmwareConfig>(defaultFirmwareConfig);
  
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [logs, setLogs] = useState<{time: string, msg: string, id: number}[]>([]);
  const [currentConfig, setCurrentConfig] = useState<FirmwareConfig>(defaultFirmwareConfig);
  const logIdRef = useRef(0);

  const setConfig = useCallback((newConfig: FirmwareConfig) => {
    configRef.current = newConfig;
    setCurrentConfig(newConfig);
  }, []);

  const addLog = useCallback((msg: string) => {
    setLogs(prev => {
      logIdRef.current++;
      const newLogs = [{ time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second:'2-digit' }), msg, id: logIdRef.current }, ...prev];
      return newLogs.slice(0, 50); // keep last 50
    });
  }, []);

  const resetBattery = useCallback(() => {
    memRef.current[SRAM.saved_level] = configRef.current.CFG_DEFAULT_LEVEL;
    addLog(`[SYS] Battery hard reset. Memory cleared, saved_level = ${configRef.current.CFG_DEFAULT_LEVEL}.`);
  }, [addLog]);

  // Initialize memory once
  useEffect(() => {
    const mem = memRef.current;
    mem[SRAM.magic_cookie] = 0x5A;
    mem[SRAM.magic_cookie + 1] = 0xA5;
    mem[SRAM.saved_level] = configRef.current.CFG_DEFAULT_LEVEL;
    mem[SRAM.btn_state] = 0x03; // p_r1 and p_r2 = 1 (buttons unpressed)
    mem[IO.DDRB] = 0x01; // PB0 output
    mem[IO.PUEB] = 0x06; // PB1, PB2 pullups
    addLog("[BOOT] Simulator initialized. Core clock: 4MHz.");
  }, [addLog]);

  useEffect(() => {
    let frameId: number;
    let lastTime = performance.now();
    const TICK_RATE = 1000 / 62; // ~16.12ms

    let accumulator = 0;

    function loop(time: number) {
      const dt = time - lastTime;
      lastTime = time;
      
      let ticksToRun = 0;
      
      const speed = warpSpeedRef.current;
      accumulator += dt * speed;
      while (accumulator >= TICK_RATE) {
        ticksToRun++;
        accumulator -= TICK_RATE;
      }
      if (ticksToRun > 5000) {
        ticksToRun = 5000;
        accumulator = 0;
      }

      if (ticksToRun > 0) {
        for (let i = 0; i < ticksToRun; i++) {
          runTick(memRef.current, vccRef.current, btn1Ref.current, btn2Ref.current, addLog, configRef.current);
        }
        setRenderTrigger(t => t + (ticksToRun % 10000));
      }
      frameId = requestAnimationFrame(loop);
    }
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, [addLog]);

  return {
    mem: memRef.current,
    vccRef,
    btn1Ref,
    btn2Ref,
    warpSpeedRef,
    renderTrigger,
    logs,
    resetBattery,
    config: currentConfig,
    setConfig
  };
}

function runTick(mem: Uint8Array, vcc: number, btn1: boolean, btn2: boolean, log: (msg: string)=>void, config: FirmwareConfig) {
  const read8 = (addr: number) => mem[addr];
  const write8 = (addr: number, val: number) => { mem[addr] = val & 0xFF; };
  const read16 = (addr: number) => mem[addr] | (mem[addr + 1] << 8);
  const write16 = (addr: number, val: number) => { mem[addr] = val & 0xFF; mem[addr + 1] = (val >> 8) & 0xFF; };
  const read32 = (addr: number) => read16(addr) | (read16(addr + 2) << 16);
  const write32 = (addr: number, val: number) => { write16(addr, val & 0xFFFF); write16(addr + 2, (val >> 16) & 0xFFFF); };
  
  // Increment clock (~64516 CPU cycles per tick at 4MHz)
  write32(SRAM.clock_cycles_l, (read32(SRAM.clock_cycles_l) + 64516) >>> 0);

  const get_btn = (bit: number) => (read8(SRAM.btn_state) & (1 << bit)) !== 0;
  const set_btn = (bit: number, val: boolean | number) => {
      let b = read8(SRAM.btn_state);
      if (val) b |= (1 << bit);
      else b &= ~(1 << bit);
      write8(SRAM.btn_state, b);
  };

  // 1. Update physical pins (PB1, PB2)
  let pinb = read8(IO.PINB);
  pinb = (pinb & ~(1 << 1)) | ((btn1 ? 0 : 1) << 1);
  pinb = (pinb & ~(1 << 2)) | ((btn2 ? 0 : 1) << 2);
  write8(IO.PINB, pinb);

  const maxLevel = Math.min(config.CFG_MAX_LIMIT_LEVEL, config.CFG_PWM_MAP.length);

  const apply_pwm = (level: number) => {
      if (level < 1) level = 1;
      if (level > maxLevel) level = maxLevel;
      write8(IO.OCR0AL, config.CFG_PWM_MAP[level - 1]);
  };

  const enter_standby = () => {
      if (read8(SRAM.sys_state) !== 0) log("[PWR] System entering POWER-DOWN state.");
      write8(SRAM.sys_state, 0); 
      write8(IO.TCCR0A, 0);
      write8(IO.TCCR0B, 0);
      write8(IO.PORTB, read8(IO.PORTB) & ~1);
  };

  const wake_up_system = () => {
      const vlm_volt = getVlmVoltage(config.CFG_VLM_LEVEL);
      if (vlm_volt > 0 && vcc <= vlm_volt) {
          log(`[PWR] Wakeup rejected: VCC below cut-off (${vlm_volt}V).`);
          return;
      }
      
      let sl = read8(SRAM.saved_level);
      if (!config.CFG_ENABLE_MEMORY) sl = config.CFG_DEFAULT_LEVEL;
      
      log(`[PWR] System waking up. Restoring level ${sl}.`);
      write8(SRAM.sys_state, 1);
      write16(SRAM.idle_sec, 0);
      apply_pwm(sl);
      write8(IO.TCCR0A, (1 << 7) | 1);
      write8(IO.TCCR0B, (1 << 3) | 1);
  };

  // 2. VLM Logic
  const vlm_volt = getVlmVoltage(config.CFG_VLM_LEVEL);
  if (vlm_volt > 0 && vcc <= vlm_volt) {
      write8(IO.VLMCSR, read8(IO.VLMCSR) | 0x80); // Set VLMF flag
      if (config.CFG_VLM_FILTER_EN) {
          let vlm_ticks = read8(SRAM.vlm_ticks);
          const max_ticks = Math.floor(config.CFG_VLM_FILTER_MS / 16);
          if (vlm_ticks < max_ticks) {
              vlm_ticks++;
              write8(SRAM.vlm_ticks, vlm_ticks);
          }
          if (vlm_ticks >= max_ticks) {
              if (read8(SRAM.sys_state) !== 0) {
                  log(`[VLM] Under-voltage protection triggered (<${vlm_volt}V)! Forced shutdown.`);
                  enter_standby();
              }
          }
      } else {
          if (read8(SRAM.sys_state) !== 0) {
              log(`[VLM] Under-voltage protection triggered (<${vlm_volt}V)! Forced shutdown.`);
              enter_standby();
          }
      }
  } else {
      write8(IO.VLMCSR, read8(IO.VLMCSR) & ~0x80); // Clear VLMF flag
      if (read8(SRAM.vlm_ticks) > 0) log(`[VLM] Voltage recovered (>= ${vlm_volt}V). Counter reset.`);
      write8(SRAM.vlm_ticks, 0);
  }

  // 3. Timeout Engine
  if (config.CFG_AUTO_SLEEP_EN) {
      let tick_cnt = read8(SRAM.tick_cnt) + 1;
      write8(SRAM.tick_cnt, tick_cnt);
      if (tick_cnt >= 62) {
          write8(SRAM.tick_cnt, 0);
          let sys_state = read8(SRAM.sys_state);
          if (sys_state !== 0) {
              let idle_sec = read16(SRAM.idle_sec);
              if (idle_sec < 0xFFFF) idle_sec++;
              write16(SRAM.idle_sec, idle_sec);
              
              if (sys_state === 1 && idle_sec >= config.CFG_DIM_SEC) {
                  log(`[TIMER] Idle ${config.CFG_DIM_SEC}s: DIMMED state activated.`);
                  write8(SRAM.sys_state, 2);
                  apply_pwm(1);
              } else if (sys_state === 2 && idle_sec >= config.CFG_OFF_SEC) {
                  log(`[TIMER] Idle ${config.CFG_OFF_SEC}s: Auto shutdown.`);
                  enter_standby();
              }
          }
      }
  }

  // 4. Debouncing & Interaction
  let r1 = !(read8(IO.PINB) & 2) ? 1 : 0; // 1 means pressed
  let r2 = !(read8(IO.PINB) & 4) ? 1 : 0; 
  
  if (r1 === (get_btn(B_PR1) ? 1 : 0)) set_btn(B_DB1, r1);
  if (r2 === (get_btn(B_PR2) ? 1 : 0)) set_btn(B_DB2, r2);
  set_btn(B_PR1, r1);
  set_btn(B_PR2, r2);

  let rel1 = (get_btn(B_LAST1) && !get_btn(B_DB1));
  let rel2 = (get_btn(B_LAST2) && !get_btn(B_DB2));
  
  // Dual lock
  if (get_btn(B_DB1) && get_btn(B_DB2)) {
      if (!get_btn(B_DUAL)) log("[BTN] Dual-button interlock ENGAGED.");
      set_btn(B_DUAL, 1);
      
      let ht = read8(SRAM.hold_ticks);
      if (ht < 0xFF) { ht++; write8(SRAM.hold_ticks, ht); }
      
      if (ht === Math.floor(config.CFG_HOLD_SEC * 62) && !get_btn(B_DUAL_EX)) {
          if (read8(SRAM.sys_state) === 0) {
              wake_up_system();
          } else {
              log("[BTN] Manual shutdown via dual long-press.");
              enter_standby();
          }
          set_btn(B_DUAL_EX, 1);
      }
  } else {
      write8(SRAM.hold_ticks, 0);
  }

  // Release lock only when BOTH are fully released
  if (!get_btn(B_DB1) && !get_btn(B_DB2)) {
      if (get_btn(B_DUAL)) {
          set_btn(B_DUAL, 0);
          set_btn(B_DUAL_EX, 0);
      }
  }

  // Single button release actions
  let sys_state = read8(SRAM.sys_state);
  if (sys_state !== 0 && !get_btn(B_DUAL)) {
      if (rel1) {
          write16(SRAM.idle_sec, 0);
          if (sys_state === 2) {
              log("[BTN] Wake from DIMMED via BT1.");
              write8(SRAM.sys_state, 1);
          } else {
              let sl = read8(SRAM.saved_level);
              if (sl < maxLevel) {
                  write8(SRAM.saved_level, sl + 1);
                  log(`[BTN] BT1 release: Brightness increased to ${sl + 1}`);
              } else {
                  log(`[BTN] BT1 release: Brightness at MAX (${maxLevel})`);
              }
          }
          apply_pwm(read8(SRAM.saved_level));
      }
      if (rel2) {
          write16(SRAM.idle_sec, 0);
          if (sys_state === 2) {
              log("[BTN] Wake from DIMMED via BT2.");
              write8(SRAM.sys_state, 1);
          } else {
              let sl = read8(SRAM.saved_level);
              if (sl > 1) {
                  write8(SRAM.saved_level, sl - 1);
                  log(`[BTN] BT2 release: Brightness decreased to ${sl - 1}`);
              } else {
                  log(`[BTN] BT2 release: Brightness at MIN (1)`);
              }
          }
          apply_pwm(read8(SRAM.saved_level));
      }
  }

  set_btn(B_LAST1, get_btn(B_DB1));
  set_btn(B_LAST2, get_btn(B_DB2));
}

export function getLedVoltage(mem: Uint8Array, vcc: number) {
  const ddrb = mem[IO.DDRB];
  const portb = mem[IO.PORTB];
  const tccr0a = mem[IO.TCCR0A];
  const ocr0a = mem[IO.OCR0AL];

  if (!(ddrb & 1)) return 0; // Floating/Input
  
  if (tccr0a & (1 << 7)) { // COM0A1 set -> PWM
      return (ocr0a / 255) * vcc;
  } else {
      return (portb & 1) ? vcc : 0;
  }
}
