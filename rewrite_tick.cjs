const fs = require('fs');

const code = `
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
        if (sys_state !== 0) log(\`[VLM] Under-voltage triggered (<\${vlm_volt}V). Shutting down.\`);
        do_sleep();
        return;
      }
    } else {
      if (sys_state !== 0) log(\`[VLM] Under-voltage triggered (<\${vlm_volt}V). Shutting down.\`);
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
        log(\`[BTN] \${act === 1 ? 'UP' : 'DOWN'}. Level: \${saved_level}/\${CFG_MAX_LEVEL}\`);
      }
      
      apply_pwm(read8(SRAM.saved_level));
      write8(IO.TCCR0A, (1 << 7) | 1); // COM0A1 | WGM00
      write8(IO.TCCR0B, (1 << 3) | 1); // WGM02 | CS00
    }
  }
}
`;

let useSim = fs.readFileSync('src/useSimulator.ts', 'utf8');

const prefix = useSim.substring(0, useSim.indexOf('  // Main loop logic'));
const suffix = useSim.substring(useSim.indexOf('export function getLedVoltage'));

fs.writeFileSync('src/useSimulator.ts', prefix + code + suffix);
console.log("Successfully rewrote loop logic!");
