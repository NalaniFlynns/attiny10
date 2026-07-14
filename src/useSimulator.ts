import { useState, useEffect, useRef, useCallback } from 'react';

const MEM_SIZE = 0x60;

export const IO = {
  PINB: 0x00, DDRB: 0x01, PORTB: 0x02, PUEB: 0x03,
  TCCR0A: 0x2E, TCCR0B: 0x2D, OCR0AL: 0x26, OCR0AH: 0x27,
  VLMCSR: 0x34, SMCR: 0x3A,
};

export const SRAM = {
  magic_cookie: 0x40, saved_level: 0x42, tick_flag: 0x43,
  sys_state: 0x44, idle_sec: 0x45, idle_min: 0x46, tick_cnt: 0x47,
  vlm_ticks: 0x48, hold_ticks: 0x49, btn_state: 0x4A,
  clock_cycles_l: 0x4B, 
  dyn_max_level: 0x4F, dyn_max_is_mapped: 0x50, last_vlm_state: 0x51,
  last_raw_pb: 0x52, stable_pb: 0x53, comp_val: 0x54,
  sys_flags: 0x55 // bit 0: dual_flag, bit 1: dual_exec, bit 2: last1, bit 3: last2
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
  CFG_DIM_MIN: number;
  CFG_OFF_MIN: number;
  CFG_VLM_LEVEL: number;
  CFG_VLM_FILTER_EN: number;
  CFG_VLM_FILTER_MS: number;
  CFG_VOLTAGE_COMP_EN: number;
  CFG_TYPICAL_VCC_DV: number;
  CFG_LED_VF_DV: number;
  CFG_VCOMP_GAP: number;
}

export const defaultFirmwareConfig: FirmwareConfig = {
  CFG_HOLD_SEC: 2,
  CFG_ENABLE_MEMORY: 1,
  CFG_DEFAULT_LEVEL: 4,
  CFG_PWM_MAP: [2, 5, 12, 25, 45, 80, 130, 190, 255],
  CFG_MAX_LIMIT_LEVEL: 9,
  CFG_AUTO_SLEEP_EN: 1,
  CFG_DIM_MIN: 120,
  CFG_OFF_MIN: 130,
  CFG_VLM_LEVEL: 3,
  CFG_VLM_FILTER_EN: 1,
  CFG_VLM_FILTER_MS: 200,
  CFG_VOLTAGE_COMP_EN: 1,
  CFG_TYPICAL_VCC_DV: 30,
  CFG_LED_VF_DV: 20,
  CFG_VCOMP_GAP: 25,
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

export function calcScale(v: number, config: FirmwareConfig): number {
  const num32 = config.CFG_TYPICAL_VCC_DV * (config.CFG_TYPICAL_VCC_DV - config.CFG_LED_VF_DV);
  const denom32 = v * (v > config.CFG_LED_VF_DV ? (v - config.CFG_LED_VF_DV) : 1);
  const rawScale = Math.floor((num32 * 32) / denom32);
  return (v <= config.CFG_LED_VF_DV || rawScale > 255) ? 255 : rawScale;
}

export function cThresh(v: number, config: FirmwareConfig): number {
  const cs = calcScale(v, config);
  return cs === 255 ? 0 : Math.floor(8160 / cs);
}

export function cGap(v: number, config: FirmwareConfig): number {
  const cs = calcScale(v, config);
  return cs === 255 ? 0 : Math.floor(((255 - config.CFG_VCOMP_GAP) * 32) / cs);
}

export function getTabs(config: FirmwareConfig) {
  const S_TAB = [13, 15, 18, 22, 26].map(v => calcScale(v, config));
  const T_TAB = [13, 15, 18, 22, 26].map(v => cThresh(v, config));
  const G_TAB = [13, 15, 18, 22, 26].map(v => cGap(v, config));
  return { S_TAB, T_TAB, G_TAB };
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

  // PB pins (inverted: 0 is pressed, 1 is released)
  let pinb = read8(IO.PINB);
  pinb = (pinb & ~(1 << 1)) | ((btn1 ? 0 : 1) << 1);
  pinb = (pinb & ~(1 << 2)) | ((btn2 ? 0 : 1) << 2);
  write8(IO.PINB, pinb);

  const CFG_MAX_LEVEL = Math.min(config.CFG_MAX_LIMIT_LEVEL, config.CFG_PWM_MAP.length);

  if (read16(SRAM.magic_cookie) !== 0xA55A || read8(SRAM.saved_level) < 1 || read8(SRAM.saved_level) > CFG_MAX_LEVEL) {
    write16(SRAM.magic_cookie, 0xA55A);
    write8(SRAM.saved_level, config.CFG_DEFAULT_LEVEL);
    write8(SRAM.dyn_max_level, CFG_MAX_LEVEL);
    write8(SRAM.last_vlm_state, 5);
  }

  const get_vlm_state = () => {
    if (vcc >= 2.5) return 5;
    if (vcc >= 2.0) return 4;
    if (vcc >= 1.8) return 3;
    if (vcc >= 1.6) return 2;
    if (vcc >= 1.4) return 1;
    return 0;
  };

  const update_dynamic_levels = () => {
    if (!config.CFG_VOLTAGE_COMP_EN) {
      write8(SRAM.dyn_max_level, CFG_MAX_LEVEL);
      write8(SRAM.dyn_max_is_mapped, 0);
      return;
    }
    
    let l_vlm = get_vlm_state();
    write8(SRAM.last_vlm_state, l_vlm);

    if (l_vlm >= 5) {
      write8(SRAM.dyn_max_level, CFG_MAX_LEVEL);
      write8(SRAM.dyn_max_is_mapped, 0);
      return;
    }

    const { T_TAB, G_TAB } = getTabs(config);
    const t = T_TAB[l_vlm];
    const g = G_TAB[l_vlm];

    for (let i = 1; i <= CFG_MAX_LEVEL; i++) {
      if (config.CFG_PWM_MAP[i-1] >= t) {
        if (i === 1) {
          write8(SRAM.dyn_max_level, 1);
        } else if (i > 1 && config.CFG_PWM_MAP[i-2] >= g) {
          write8(SRAM.dyn_max_level, i - 1);
        } else {
          write8(SRAM.dyn_max_level, i);
        }
        write8(SRAM.dyn_max_is_mapped, 1);
        return;
      }
    }
    write8(SRAM.dyn_max_level, CFG_MAX_LEVEL);
    write8(SRAM.dyn_max_is_mapped, 0);
  };

  const apply_pwm = (level: number) => {
    if (level < 1) level = 1;
    const dyn_max_level = read8(SRAM.dyn_max_level);
    const dyn_max_is_mapped = read8(SRAM.dyn_max_is_mapped);
    let eff_level = (level > dyn_max_level) ? dyn_max_level : level;
    let comp = 0;
    
    let l_vlm = read8(SRAM.last_vlm_state);

    if (config.CFG_VOLTAGE_COMP_EN && l_vlm < 5) {
      if (eff_level === dyn_max_level && dyn_max_is_mapped) {
        comp = 255;
      } else {
        const { S_TAB } = getTabs(config);
        let s = S_TAB[l_vlm];
        let res = 0, a = config.CFG_PWM_MAP[eff_level-1];
        while (s) {
          if (s & 1) res += a;
          a <<= 1;
          s >>= 1;
        }
        res >>= 5;
        comp = (res > 255) ? 255 : res;
      }
    } else {
      comp = config.CFG_PWM_MAP[eff_level-1];
    }
    write8(SRAM.comp_val, comp);
    write8(IO.OCR0AL, 255 - comp);
  };

  const do_sleep = () => {
    if (read8(SRAM.sys_state) !== 0) log("[PWR] Entering SLEEP_MODE_PWR_DOWN.");
    write8(SRAM.sys_state, 0);
    write8(IO.TCCR0A, 0); write8(IO.TCCR0B, 0);
    write8(IO.PORTB, read8(IO.PORTB) | 1); // LED off
    write8(IO.VLMCSR, 0);
    
    write8(SRAM.last_raw_pb, (~read8(IO.PINB)) & 0x06);
    write8(SRAM.stable_pb, read8(SRAM.last_raw_pb));
  };


  // Main loop logic
  let raw_pb = (~read8(IO.PINB)) & 0x06;

  if (raw_pb === read8(SRAM.last_raw_pb)) {
    write8(SRAM.stable_pb, raw_pb);
  }
  write8(SRAM.last_raw_pb, raw_pb);

  let stable_pb = read8(SRAM.stable_pb);
  let b1 = (stable_pb & (1 << 1)) ? 1 : 0;
  let b2 = (stable_pb & (1 << 2)) ? 1 : 0;

  let sys_state = read8(SRAM.sys_state);

  let act = 0;
  let sys_flags = read8(SRAM.sys_flags);
  let dual_flag = (sys_flags & 1) ? 1 : 0;
  let dual_exec = (sys_flags & 2) ? 1 : 0;
  let last1 = (sys_flags & 4) ? 1 : 0;
  let last2 = (sys_flags & 8) ? 1 : 0;

  if (b1 && b2) {
    dual_flag = 1;
    let hold_ticks = read8(SRAM.hold_ticks);
    if (hold_ticks < 0xFF) { hold_ticks++; write8(SRAM.hold_ticks, hold_ticks); }
    if (hold_ticks === (config.CFG_HOLD_SEC * 62) && !dual_exec) {
      act = 3; dual_exec = 1;
    }
  } else {
    write8(SRAM.hold_ticks, 0);
    
    // Generate clicks if not part of a dual hold release
    if (!dual_flag) {
      if (last1 && !b1) act = 1;
      if (last2 && !b2) act = 2;
    }
    
    // Clear dual state only when both released
    if (!b1 && !b2) {
      dual_flag = 0; 
      dual_exec = 0;
    }
  }

  last1 = b1;
  last2 = b2;
  sys_flags = (dual_flag) | (dual_exec << 1) | (last1 << 2) | (last2 << 3);
  write8(SRAM.sys_flags, sys_flags);

  if (sys_state === 0) {
    if (act !== 3) {
      do_sleep();
      return;
    }
  }

  let vlmf = 0;
  const vlm_volt = getVlmVoltage(config.CFG_VLM_LEVEL);
  if (vlm_volt > 0 && vcc <= vlm_volt) {
    write8(IO.VLMCSR, read8(IO.VLMCSR) | 0x80);
    vlmf = 1;
  } else {
    write8(IO.VLMCSR, read8(IO.VLMCSR) & ~0x80);
  }

  if (vlmf) {
    if (config.CFG_VLM_FILTER_EN) {
      let vlm_ticks = read8(SRAM.vlm_ticks);
      vlm_ticks++;
      write8(SRAM.vlm_ticks, vlm_ticks);
      if (vlm_ticks >= Math.floor(config.CFG_VLM_FILTER_MS / 16)) {
        if (sys_state !== 0) log(`[VLM] Under-voltage triggered (<${vlm_volt}V). Shutting down.`);
        do_sleep();
        return;
      }
    } else {
      if (sys_state !== 0) log(`[VLM] Under-voltage triggered (<${vlm_volt}V). Shutting down.`);
      do_sleep();
      return;
    }
  } else {
    write8(SRAM.vlm_ticks, 0);
  }

  if (config.CFG_AUTO_SLEEP_EN && sys_state !== 0) {
    let tick_cnt = read8(SRAM.tick_cnt) + 1;
    write8(SRAM.tick_cnt, tick_cnt);
    if (tick_cnt >= 62) {
      write8(SRAM.tick_cnt, 0);
      let idle_sec = read8(SRAM.idle_sec) + 1;
      write8(SRAM.idle_sec, idle_sec);
      if (idle_sec >= 60) {
        write8(SRAM.idle_sec, 0);
        let idle_min = read8(SRAM.idle_min);
        if (idle_min < 255) {
          idle_min++;
          write8(SRAM.idle_min, idle_min);
        }
      }
      let idle_min = read8(SRAM.idle_min);
      if (sys_state === 1 && idle_min >= config.CFG_DIM_MIN) {
        log(`[TIMER] Idle ${config.CFG_DIM_MIN}m: DIMMED.`);
        write8(SRAM.sys_state, 2);
        write8(IO.OCR0AL, 255 - config.CFG_PWM_MAP[0]);
      } else if (sys_state === 2 && idle_min >= config.CFG_OFF_MIN) {
        log(`[TIMER] Idle ${config.CFG_OFF_MIN}m: Auto OFF.`);
        do_sleep();
        return;
      }
    }
  }

  if (act) {
    write8(SRAM.idle_sec, 0); write8(SRAM.idle_min, 0);
    
    if (act === 3) {
      if (sys_state === 0) {
        if (vlm_volt > 0 && vcc <= vlm_volt) {
           log(`[PWR] Wakeup rejected: <${vlm_volt}V`);
           do_sleep();
           return;
        }
        log("[PWR] System Wake Up (Dual Hold).");
        write8(SRAM.sys_state, 1);
        if (!config.CFG_ENABLE_MEMORY) write8(SRAM.saved_level, config.CFG_DEFAULT_LEVEL);
        if (read8(SRAM.saved_level) > CFG_MAX_LEVEL) write8(SRAM.saved_level, CFG_MAX_LEVEL);
        
      } else {
        log("[PWR] Manual Shutdown (Dual Hold).");
        do_sleep();
        return;
      }
    }
    
    if (read8(SRAM.sys_state) !== 0) {
      let dyn_max_level = read8(SRAM.dyn_max_level);
      let dyn_max_is_mapped = read8(SRAM.dyn_max_is_mapped);

      if (read8(SRAM.sys_state) === 2) {
        sys_state = 1;
        write8(SRAM.sys_state, 1);
        log("[PWR] Wake from DIM.");
      } else if (act === 1 || act === 2) {
        update_dynamic_levels();
        dyn_max_level = read8(SRAM.dyn_max_level);
        dyn_max_is_mapped = read8(SRAM.dyn_max_is_mapped);
        
        let saved_level = read8(SRAM.saved_level);
        if (act === 1) { // Up
          if (saved_level < dyn_max_level) saved_level++;
          else if (saved_level === dyn_max_level && dyn_max_is_mapped) saved_level++;
          
          if (saved_level > CFG_MAX_LEVEL) saved_level = CFG_MAX_LEVEL;
        } else { // Down
          if (saved_level > dyn_max_level) saved_level = dyn_max_level;
          else if (saved_level > 1) saved_level--;
        }
        write8(SRAM.saved_level, saved_level);
        log(`[BTN] ${act === 1 ? 'UP' : 'DOWN'}. Level: ${saved_level}/${CFG_MAX_LEVEL}`);
      }
      
      apply_pwm(read8(SRAM.saved_level));
      write8(IO.TCCR0A, (1 << 7) | 1); // COM0A1 | WGM00
      write8(IO.TCCR0B, (1 << 3) | 1); // WGM02 | CS00
    }
  }
}
export function getLedVoltage(mem: Uint8Array, vcc: number, config: FirmwareConfig) {
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
