const fs = require('fs');

let content = fs.readFileSync('src/useSimulator.ts', 'utf8');

const regex = /function runTick\(mem: Uint8Array, vcc: number, btn1: boolean, btn2: boolean, log: \(msg: string\)=>void, config: FirmwareConfig\) \{[\s\S]*?export function getLedVoltage/m;

const replacement = `function runTick(mem: Uint8Array, vcc: number, btn1: boolean, btn2: boolean, log: (msg: string)=>void, config: FirmwareConfig) {
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
    
    write8(SRAM.last_raw_pb, ~read8(IO.PINB) & 0x06);
    write8(SRAM.stable_pb, read8(SRAM.last_raw_pb));
  };

  if (read16(SRAM.magic_cookie) !== 0xA55A || read8(SRAM.saved_level) < 1 || read8(SRAM.saved_level) > CFG_MAX_LEVEL) {
    write16(SRAM.magic_cookie, 0xA55A);
    write8(SRAM.saved_level, config.CFG_DEFAULT_LEVEL);
    write8(SRAM.dyn_max_level, CFG_MAX_LEVEL);
    write8(SRAM.last_vlm_state, 5);
  }

  let raw_pb = ~read8(IO.PINB) & 0x06;
  if (raw_pb === read8(SRAM.last_raw_pb)) {
    write8(SRAM.stable_pb, raw_pb);
  }
  write8(SRAM.last_raw_pb, raw_pb);

  let stable_pb = read8(SRAM.stable_pb);
  let b1 = (stable_pb & (1 << 1)) ? 1 : 0;
  let b2 = (stable_pb & (1 << 2)) ? 1 : 0;

  let sys_state = read8(SRAM.sys_state);

  if (sys_state === 0) {
    if (!b1 || !b2) {
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
        log(\`[VLM] Under-voltage triggered (<\${vlm_volt}V). Shutting down.\`);
        do_sleep();
        return;
      }
    } else {
      log(\`[VLM] Under-voltage triggered (<\${vlm_volt}V). Shutting down.\`);
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
        log(\`[TIMER] Idle \${config.CFG_DIM_MIN}m: DIMMED.\`);
        write8(SRAM.sys_state, 2);
        write8(IO.OCR0AL, 255 - config.CFG_PWM_MAP[0]);
      } else if (sys_state === 2 && idle_min >= config.CFG_OFF_MIN) {
        log(\`[TIMER] Idle \${config.CFG_OFF_MIN}m: Auto OFF.\`);
        do_sleep();
        return;
      }
    }
  }

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
    if (!b1 && !b2) {
      dual_flag = 0; dual_exec = 0;
    } else if (!dual_flag) {
      if (last1 && !b1) act = 1;
      if (last2 && !b2) act = 2;
    }
  }

  last1 = b1;
  last2 = b2;
  sys_flags = (dual_flag) | (dual_exec << 1) | (last1 << 2) | (last2 << 3);
  write8(SRAM.sys_flags, sys_flags);

  if (act) {
    write8(SRAM.idle_sec, 0); write8(SRAM.idle_min, 0);
    
    if (act === 3) {
      if (sys_state === 0) {
        if (vlm_volt > 0 && vcc <= vlm_volt) {
           log(\`[PWR] Wakeup rejected: <\${vlm_volt}V\`);
           do_sleep();
           return;
        }
        log("[PWR] System Wake Up (Dual Hold).");
        write8(SRAM.sys_state, 1);
        if (!config.CFG_ENABLE_MEMORY) write8(SRAM.saved_level, config.CFG_DEFAULT_LEVEL);
        if (read8(SRAM.saved_level) > CFG_MAX_LEVEL) write8(SRAM.saved_level, CFG_MAX_LEVEL);
        
        // Ensure dyn_max_level is updated on wakeup
        update_dynamic_levels();
        let sl = read8(SRAM.saved_level);
        if (sl > read8(SRAM.dyn_max_level)) {
            write8(SRAM.saved_level, read8(SRAM.dyn_max_level));
        }
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
        write8(SRAM.sys_state, 1);
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
        log(\`[BTN] Change Level: \${saved_level}/\${CFG_MAX_LEVEL}\`);
      }
      
      apply_pwm(read8(SRAM.saved_level));
      write8(IO.TCCR0A, (1 << 7) | 1); // COM0A1 | WGM00
      write8(IO.TCCR0B, (1 << 3) | 1); // WGM02 | CS00
    }
  }
}

export function getLedVoltage`;

content = content.replace(regex, replacement);
fs.writeFileSync('src/useSimulator.ts', content);
