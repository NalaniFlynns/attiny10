import React, { useState, Fragment, useEffect, useRef } from 'react';
import { Cpu, Zap, FastForward, RotateCcw, Activity, Settings2, Database } from 'lucide-react';
import { IO, SRAM, getLedVoltage, useSimulator, FirmwareConfig, defaultFirmwareConfig, getVlmVoltage } from './useSimulator';

function HdrSmdLed({ voltage, ocr0al }: { voltage: number, ocr0al: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const deviceRef = useRef<any>(null);
  const contextRef = useRef<any>(null);
  const [hasWebGPU, setHasWebGPU] = useState(true);

  useEffect(() => {
    let isActive = true;
    async function init() {
      try {
        if (!navigator.gpu) throw new Error("No WebGPU");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No Adapter");
        const device = await adapter.requestDevice();
        if (!isActive) return;
        deviceRef.current = device;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('webgpu') as any;
        if (!context) throw new Error("No Context");
        
        contextRef.current = context;
        context.configure({
          device,
          format: navigator.gpu.getPreferredCanvasFormat(),
          colorSpace: 'display-p3',
          toneMapping: { mode: 'extended' },
          alphaMode: 'premultiplied'
        });
      } catch (e) {
        if (isActive) setHasWebGPU(false);
      }
    }
    init();
    return () => { isActive = false; };
  }, []);

  useEffect(() => {
    if (!deviceRef.current || !contextRef.current) return;
    const device = deviceRef.current;
    const context = contextRef.current;
    
    // Convert 0-255 PWM to intensity (with gamma curve approx). 255 -> 5.0 HDR multiplier
    let intensity = (voltage > 0 && ocr0al > 0) ? Math.pow(ocr0al / 255.0, 2.2) * 5.0 : 0;
    
    try {
      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();
      const passEncoder = commandEncoder.beginRenderPass({
        colorAttachments: [{
          view: textureView,
          clearValue: { r: intensity, g: 0.0, b: 0.0, a: intensity > 0 ? 1.0 : 0.0 },
          loadOp: 'clear',
          storeOp: 'store',
        }]
      });
      passEncoder.end();
      device.queue.submit([commandEncoder.finish()]);
    } catch(e) {
       // Ignore render errors
    }
  }, [voltage, ocr0al]);

  return (
    <div className="relative mb-6 flex flex-col items-center group">
      <div className="w-16 h-8 bg-[#1e2022] border border-[#2a2d30] rounded-sm relative flex items-center justify-center shadow-lg transform transition-transform group-hover:scale-110">
        {/* Solder pads */}
        <div className="absolute left-0 w-3 h-full bg-gradient-to-r from-zinc-300 to-zinc-400 rounded-l-sm border-r border-zinc-500"></div>
        <div className="absolute right-0 w-3 h-full bg-gradient-to-l from-zinc-300 to-zinc-400 rounded-r-sm border-l border-zinc-500"></div>
        
        {/* Emitting core */}
        <div className="w-8 h-4 rounded-sm z-10 relative flex items-center justify-center">
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full mix-blend-screen rounded-sm" width={32} height={16} />
          
          {/* Base off color */}
          <div className="absolute inset-0 bg-[#0a0000] rounded-sm -z-10"></div>
          
          {/* CSS Fallback / Glow Enhancement */}
          <div 
            className="absolute inset-0 rounded-sm transition-colors duration-[16ms]"
            style={{ 
              backgroundColor: (voltage > 0 && ocr0al > 0) ? `rgba(255, ${Math.floor(ocr0al/4)}, ${Math.floor(ocr0al/4)}, ${0.8 + 0.2 * (ocr0al/255)})` : 'transparent',
              boxShadow: (voltage > 0 && ocr0al > 0) 
                ? `0 0 ${20 + (ocr0al / 255) * 80}px ${5 + (ocr0al / 255) * 20}px rgba(255, 0, 0, ${0.4 + (ocr0al/255)*0.6}), 
                   0 0 ${ocr0al >= 250 ? '120px 40px rgba(255, 100, 100, 0.8)' : '0px 0px rgba(0,0,0,0)'}`
                : 'none',
              mixBlendMode: 'screen',
              filter: (ocr0al >= 250 && voltage > 0) ? 'brightness(1.5) contrast(1.2)' : 'none'
            }}
          ></div>
        </div>
      </div>
      <div className="mt-4 text-center">
        <span className="text-[10px] font-bold text-zinc-500 tracking-widest">LED (0603 SMD)</span>
        <div className="text-[9px] text-red-400/80 mt-1 tabular-nums">{(voltage > 0 ? ocr0al / 2.55 : 0).toFixed(1)}% DUTY</div>
        {hasWebGPU ? <div className="text-[8px] text-emerald-500/70 mt-1">HDR ACTIVE</div> : <div className="text-[8px] text-amber-500/70 mt-1">HDR OFF</div>}
      </div>
    </div>
  );
}

function HexByte({ val }: { val: number }) {
  return <span>{val.toString(16).padStart(2, '0').toUpperCase()}</span>;
}

export default function App() {
  const { mem, vccRef, btn1Ref, btn2Ref, warpSpeedRef, renderTrigger, logs, resetBattery, config, setConfig } = useSimulator();
  const [vccSlider, setVccSlider] = useState(3.1);
  const [warpSpeed, setWarpSpeed] = useState(1);
  const [rightTab, setRightTab] = useState<'memory' | 'config'>('memory');
  const logContainerRef = useRef<HTMLDivElement>(null);

  const handleVccChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVccSlider(val);
    vccRef.current = val;
  };

  const handleConfigChange = (key: keyof FirmwareConfig, value: number) => {
    setConfig({ ...config, [key]: value });
  };

  const handlePwmMapChange = (index: number, value: number) => {
    const newMap = [...config.CFG_PWM_MAP];
    newMap[index] = value;
    setConfig({ ...config, CFG_PWM_MAP: newMap });
  };

  const handleAddPwm = () => {
    if (config.CFG_PWM_MAP.length >= 255) return;
    const newMap = [...config.CFG_PWM_MAP, 255].sort((a,b)=>a-b);
    let newMax = config.CFG_MAX_LIMIT_LEVEL;
    let newDef = config.CFG_DEFAULT_LEVEL;
    if (newMax > newMap.length) newMax = newMap.length;
    if (newDef > newMap.length) newDef = newMap.length;
    setConfig({ ...config, CFG_PWM_MAP: newMap, CFG_MAX_LIMIT_LEVEL: newMax, CFG_DEFAULT_LEVEL: newDef });
  };

  const handleRemovePwm = (index: number) => {
    if (config.CFG_PWM_MAP.length <= 2) return;
    const newMap = [...config.CFG_PWM_MAP];
    newMap.splice(index, 1);
    let newMax = config.CFG_MAX_LIMIT_LEVEL;
    let newDef = config.CFG_DEFAULT_LEVEL;
    if (newMax > newMap.length) newMax = newMap.length;
    if (newDef > newMap.length) newDef = newMap.length;
    setConfig({ ...config, CFG_PWM_MAP: newMap, CFG_MAX_LIMIT_LEVEL: newMax, CFG_DEFAULT_LEVEL: newDef });
  };

  const sortPwmMap = () => {
    const newMap = [...config.CFG_PWM_MAP].map(v => Number.isNaN(v) ? 0 : v).sort((a,b)=>a-b);
    setConfig({ ...config, CFG_PWM_MAP: newMap });
  };

  const cycleWarp = () => {
    const speeds = [1, 10, 50, 100, 400];
    const currentIndex = speeds.indexOf(warpSpeed);
    const nextSpeed = speeds[(currentIndex + 1) % speeds.length];
    setWarpSpeed(nextSpeed);
    warpSpeedRef.current = nextSpeed;
  };

  const ledVoltage = getLedVoltage(mem, vccRef.current);
  const sysState = mem[SRAM.sys_state];
  const stateLabels = ['SYS_OFF', 'SYS_ON', 'SYS_DIMMED'];
  
  // Format clock
  const clockCycles = (mem[SRAM.clock_cycles_l] | (mem[SRAM.clock_cycles_l+1] << 8) | (mem[SRAM.clock_cycles_h] << 16) | (mem[SRAM.clock_cycles_h+1] << 24)) >>> 0;
  
  return (
    <div className="min-h-screen lg:h-screen bg-zinc-950 text-zinc-300 flex flex-col font-mono relative select-none selection:bg-emerald-900/50">
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: 'linear-gradient(#3f3f46 1px, transparent 1px), linear-gradient(90deg, #3f3f46 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>

      {/* Header Section */}
      <header className="h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4 lg:px-6 shrink-0 shadow-lg z-10 relative">
        <div className="flex items-center gap-2 lg:gap-4">
          <div className="p-2 bg-emerald-900/40 border border-emerald-500/30 rounded-lg text-emerald-400">
            <Cpu className="w-5 h-5 lg:w-6 lg:h-6" />
          </div>
          <div>
            <h1 className="text-sm lg:text-lg font-bold tracking-widest text-emerald-50">ATTINY10-EMU</h1>
            <p className="text-[8px] lg:text-[10px] text-emerald-500/70 tracking-widest">#define F_CPU 4000000UL</p>
          </div>
        </div>
        <div className="flex items-center gap-4 lg:gap-8">
          <div className="flex flex-col items-end">
            <span className="text-[8px] lg:text-[10px] text-zinc-500 uppercase tracking-widest">Clock Cycles</span>
            <span className="text-sm lg:text-lg font-bold text-emerald-400 tracking-tighter tabular-nums">
              {clockCycles.toString().padStart(10, '0')}
            </span>
          </div>
          <div className="flex flex-col items-end">
            <span className="text-[8px] lg:text-[10px] text-zinc-500 uppercase tracking-widest">Status</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] ${sysState === 0 ? 'bg-zinc-600 text-zinc-600' : (sysState === 1 ? 'bg-emerald-500 text-emerald-500' : 'bg-amber-500 text-amber-500')}`}></span>
              <span className="text-xs lg:text-sm font-bold text-white">{stateLabels[sysState] || 'ERR'}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-2 p-2 overflow-y-auto lg:overflow-hidden relative z-10">
        
        {/* Left Column: Power & Hardware */}
        <aside className="lg:col-span-3 flex flex-col gap-2 lg:overflow-y-auto">
          {/* Power Management */}
          <section className="bg-zinc-900/80 border border-zinc-800 rounded flex flex-col gap-4 p-4 shadow-xl backdrop-blur-sm relative overflow-hidden">
             <div className="absolute top-0 right-0 p-2 opacity-10">
               <Zap className="w-16 h-16" />
             </div>
             <div className="flex justify-between items-center z-10">
               <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Energy Sys</h3>
               <button onClick={resetBattery} className="p-1 hover:bg-zinc-800 rounded border border-zinc-700 text-zinc-400 hover:text-white transition-colors" title="Hard Reset Battery">
                 <RotateCcw className="w-4 h-4" />
               </button>
             </div>
             <div className="space-y-4 z-10">
                <div>
                  <div className="flex justify-between mb-1 items-end">
                    <label className="text-[10px] text-zinc-500 tracking-wider">SR512SW x2 Series (Vcc)</label>
                    <span className={`text-sm font-bold ${vccSlider < getVlmVoltage(config.CFG_VLM_LEVEL) ? 'text-red-500' : 'text-emerald-400'}`}>{vccSlider.toFixed(2)}V</span>
                  </div>
                  <input 
                    type="range" 
                    min="1.0" max="3.3" step="0.1" 
                    value={vccSlider} 
                    onChange={handleVccChange}
                    className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                  />
                  <div className="flex justify-between mt-1 text-[9px] text-zinc-600">
                    <span className={vccSlider < getVlmVoltage(config.CFG_VLM_LEVEL) ? 'text-red-500/70' : ''}>1.0V (Cut-off {getVlmVoltage(config.CFG_VLM_LEVEL).toFixed(1)}V)</span>
                    <span className={vccSlider >= 3.1 && vccSlider < 3.3 ? 'text-emerald-500/70' : ''}>3.1V (Nominal)</span>
                    <span className={vccSlider >= 3.3 ? 'text-amber-400 font-bold' : ''}>3.3V (Max)</span>
                  </div>
                </div>
             </div>
          </section>

          {/* Interactive Components */}
          <section className="bg-zinc-900/80 border border-zinc-800 rounded flex-1 flex flex-col gap-4 p-4 shadow-xl backdrop-blur-sm min-h-[300px]">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Physical Interaction</h3>
            <div className="flex-1 flex flex-row justify-center items-center gap-8">
              {/* Button 1 */}
              <div className="flex flex-col items-center gap-3">
                <button 
                  onPointerDown={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); btn1Ref.current = true; }}
                  onPointerUp={() => btn1Ref.current = false}
                  onPointerLeave={() => btn1Ref.current = false}
                  className={`relative w-24 h-24 rounded-full border-b-4 transition-all duration-75 outline-none flex items-center justify-center group ${
                    btn1Ref.current 
                      ? 'border-b-0 translate-y-1 bg-zinc-800 border-zinc-900 shadow-inner' 
                      : 'border-zinc-950 bg-zinc-800 shadow-[0_5px_15px_rgba(0,0,0,0.5)] active:border-b-0 active:translate-y-1'
                  }`}
                  style={{ touchAction: 'none' }}
                >
                  <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-colors ${btn1Ref.current ? 'bg-red-800/80 border-red-900/80 text-red-950' : 'bg-red-600/90 border-red-700 text-red-900/50'}`}>
                    <span className="font-bold text-xl">+</span>
                  </div>
                </button>
                <div className="text-center">
                  <span className="text-[10px] font-bold text-zinc-500 tracking-widest block">BT1 (PB1)</span>
                  <span className="text-[8px] text-zinc-600">BRIGHTNESS UP</span>
                </div>
              </div>
              
              {/* Button 2 */}
              <div className="flex flex-col items-center gap-3">
                <button 
                  onPointerDown={(e) => { e.currentTarget.releasePointerCapture(e.pointerId); btn2Ref.current = true; }}
                  onPointerUp={() => btn2Ref.current = false}
                  onPointerLeave={() => btn2Ref.current = false}
                  className={`relative w-24 h-24 rounded-full border-b-4 transition-all duration-75 outline-none flex items-center justify-center group ${
                    btn2Ref.current 
                      ? 'border-b-0 translate-y-1 bg-zinc-800 border-zinc-900 shadow-inner' 
                      : 'border-zinc-950 bg-zinc-800 shadow-[0_5px_15px_rgba(0,0,0,0.5)] active:border-b-0 active:translate-y-1'
                  }`}
                  style={{ touchAction: 'none' }}
                >
                  <div className={`w-16 h-16 rounded-full border-4 flex items-center justify-center transition-colors ${btn2Ref.current ? 'bg-zinc-700/80 border-zinc-800/80 text-zinc-900' : 'bg-zinc-600 border-zinc-700 text-zinc-800/50'}`}>
                    <span className="font-bold text-xl">-</span>
                  </div>
                </button>
                <div className="text-center">
                  <span className="text-[10px] font-bold text-zinc-500 tracking-widest block">BT2 (PB2)</span>
                  <span className="text-[8px] text-zinc-600">BRIGHTNESS DOWN</span>
                </div>
              </div>
            </div>
          </section>
        </aside>

        {/* Center Column: System Monitor & Log */}
        <div className="lg:col-span-5 flex flex-col gap-2 lg:overflow-y-auto">
          {/* Main Monitor */}
          <section className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex-1 relative overflow-hidden backdrop-blur-sm flex flex-col min-h-[300px]">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">Hardware Simulator</h3>
            
            <div className="flex-1 flex flex-col items-center justify-center relative">
              {/* Virtual LED 0402 Style */}
              <HdrSmdLed voltage={ledVoltage} ocr0al={mem[IO.OCR0AL]} />

              {/* Data Panel */}
              <div className="w-full flex-1 overflow-y-auto custom-scrollbar mt-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  
                  {/* .noinit Data */}
                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-2 rounded col-span-1 md:col-span-2 flex justify-between items-center">
                    <div>
                      <span className="block text-[8px] text-zinc-500 tracking-widest mb-1 text-left">INTERNAL TIME (F_CPU 4MHz)</span>
                      <span className="text-sm font-bold text-emerald-400 tabular-nums">
                        {Math.floor(clockCycles / 4000000 / 3600).toString().padStart(2, '0')}:
                        {Math.floor((clockCycles / 4000000 % 3600) / 60).toString().padStart(2, '0')}:
                        {Math.floor(clockCycles / 4000000 % 60).toString().padStart(2, '0')}.
                        {Math.floor((clockCycles / 4000) % 1000).toString().padStart(3, '0')}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="block text-[8px] text-zinc-500 tracking-widest mb-1">MAGIC COOKIE (.noinit)</span>
                      <span className="text-sm font-bold text-indigo-400 font-mono">
                        0x{(mem[SRAM.magic_cookie] | (mem[SRAM.magic_cookie+1]<<8)).toString(16).toUpperCase().padStart(4, '0')}
                      </span>
                    </div>
                  </div>

                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-2 rounded">
                    <span className="block text-[8px] text-zinc-500 tracking-widest mb-1">SAVED LEVEL (.noinit)</span>
                    <span className="text-sm font-bold text-amber-400">{mem[SRAM.saved_level]} <span className="text-[10px] text-zinc-600">/ {Math.min(config.CFG_MAX_LIMIT_LEVEL, config.CFG_PWM_MAP.length)}</span></span>
                  </div>
                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-2 rounded">
                    <span className="block text-[8px] text-zinc-500 tracking-widest mb-1">IDLE SEC</span>
                    <span className="text-sm font-bold text-emerald-400 tabular-nums">
                      {Math.floor((mem[SRAM.idle_sec] | (mem[SRAM.idle_sec+1]<<8)) / 3600).toString().padStart(2, '0')}:
                      {Math.floor(((mem[SRAM.idle_sec] | (mem[SRAM.idle_sec+1]<<8)) % 3600) / 60).toString().padStart(2, '0')}:
                      {((mem[SRAM.idle_sec] | (mem[SRAM.idle_sec+1]<<8)) % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-2 rounded">
                    <span className="block text-[8px] text-zinc-500 tracking-widest mb-1">PWM DUTY (OCR0A)</span>
                    <span className="text-sm font-bold text-indigo-400 tabular-nums">{mem[IO.OCR0AL].toString().padStart(3, ' ')} <span className="text-[10px] text-zinc-600">/ 255</span></span>
                  </div>
                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-2 rounded">
                    <span className="block text-[8px] text-zinc-500 tracking-widest mb-1">VLM STATUS</span>
                    <span className={`text-sm font-bold ${(mem[IO.VLMCSR] & 0x80) ? 'text-red-500 animate-pulse' : 'text-zinc-600'}`}>
                      {(mem[IO.VLMCSR] & 0x80) ? `WARN <${getVlmVoltage(config.CFG_VLM_LEVEL)}V` : 'OK'}
                    </span>
                  </div>
                  
                  {/* Global Counters */}
                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-2 rounded col-span-1 md:col-span-2">
                    <span className="block text-[8px] text-zinc-500 tracking-widest mb-1">GLOBAL COUNTERS & FLAGS</span>
                    <div className="flex justify-between items-center text-xs font-bold text-slate-300 tabular-nums">
                      <div className="w-1/4">TICK: <span className="text-emerald-400">{mem[SRAM.tick_cnt].toString().padStart(2, '0')}</span><span className="text-[9px] text-zinc-600">/62</span></div>
                      <div className="w-1/4">HOLD: <span className="text-amber-400">{mem[SRAM.hold_ticks].toString().padStart(3, '0')}</span><span className="text-[9px] text-zinc-600">/{Math.floor(config.CFG_HOLD_SEC * 62)}</span></div>
                      <div className="w-1/4">VLM: <span className="text-red-400">{mem[SRAM.vlm_ticks].toString().padStart(2, '0')}</span><span className="text-[9px] text-zinc-600">/{Math.floor(config.CFG_VLM_FILTER_MS / 16)}</span></div>
                      <div className="w-1/4">FLAG: <span className="text-indigo-400">{mem[SRAM.tick_flag]}</span></div>
                    </div>
                  </div>

                  {/* BTN Bitfield */}
                  <div className="bg-zinc-950/50 border border-zinc-800/50 p-2 rounded col-span-1 md:col-span-2">
                    <div className="flex justify-between items-center mb-1">
                      <span className="block text-[8px] text-zinc-500 tracking-widest">BTN STATE BITFIELD (db/r/last/dual)</span>
                      <span className="text-[10px] font-mono text-zinc-600">0b{mem[SRAM.btn_state].toString(2).padStart(8, '0')}</span>
                    </div>
                    <div className="grid grid-cols-4 gap-1 text-[8px] text-center font-mono">
                      <div className={`p-1 rounded ${mem[SRAM.btn_state] & (1<<0) ? 'bg-indigo-900/40 text-indigo-300' : 'bg-zinc-900/50 text-zinc-500'}`}>p_r1</div>
                      <div className={`p-1 rounded ${mem[SRAM.btn_state] & (1<<1) ? 'bg-indigo-900/40 text-indigo-300' : 'bg-zinc-900/50 text-zinc-500'}`}>p_r2</div>
                      <div className={`p-1 rounded ${mem[SRAM.btn_state] & (1<<2) ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-900/50 text-zinc-500'}`}>db1</div>
                      <div className={`p-1 rounded ${mem[SRAM.btn_state] & (1<<3) ? 'bg-emerald-900/40 text-emerald-300' : 'bg-zinc-900/50 text-zinc-500'}`}>db2</div>
                      <div className={`p-1 rounded ${mem[SRAM.btn_state] & (1<<4) ? 'bg-amber-900/40 text-amber-300' : 'bg-zinc-900/50 text-zinc-500'}`}>last1</div>
                      <div className={`p-1 rounded ${mem[SRAM.btn_state] & (1<<5) ? 'bg-amber-900/40 text-amber-300' : 'bg-zinc-900/50 text-zinc-500'}`}>last2</div>
                      <div className={`p-1 rounded ${mem[SRAM.btn_state] & (1<<6) ? 'bg-red-900/40 text-red-300' : 'bg-zinc-900/50 text-zinc-500'}`}>dual_flag</div>
                      <div className={`p-1 rounded ${mem[SRAM.btn_state] & (1<<7) ? 'bg-red-900/40 text-red-300' : 'bg-zinc-900/50 text-zinc-500'}`}>dual_exec</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Terminal Log */}
          <section className="bg-zinc-950 border border-zinc-800 rounded min-h-[200px] lg:h-1/3 flex flex-col relative">
             <div className="flex justify-between items-center p-2 border-b border-zinc-900 bg-zinc-900/30">
               <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Terminal Log</h3>
               <div className="flex items-center gap-2">
                 <FastForward className={`w-3 h-3 ${warpSpeed > 1 ? 'text-amber-500 animate-pulse' : 'text-zinc-600'}`} />
                 <input 
                   type="range" 
                   min="0" max="4" step="1" 
                   value={
                     warpSpeed === 1 ? 0 :
                     warpSpeed === 10 ? 1 :
                     warpSpeed === 50 ? 2 :
                     warpSpeed === 100 ? 3 : 4
                   }
                   onChange={(e) => {
                     const val = parseInt(e.target.value);
                     const map = [1, 10, 50, 100, 400];
                     const nextSpeed = map[val];
                     setWarpSpeed(nextSpeed);
                     warpSpeedRef.current = nextSpeed;
                   }}
                   className="w-20 h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-amber-500"
                 />
                 <span className={`text-[9px] font-bold w-6 text-right ${warpSpeed > 1 ? 'text-amber-500' : 'text-zinc-500'}`}>
                   {warpSpeed}x
                 </span>
               </div>
             </div>
             <div className="flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[9px] custom-scrollbar" ref={logContainerRef}>
               {logs.map((log) => (
                 <div key={log.id} className="flex gap-2 opacity-80 hover:opacity-100">
                   <span className="text-zinc-600 shrink-0">[{log.time}]</span>
                   <span className={log.msg.includes('ERR') || log.msg.includes('protection') ? 'text-red-400' : (log.msg.includes('ON') || log.msg.includes('wake') || log.msg.includes('increase') ? 'text-emerald-400' : 'text-zinc-300')}>
                     {log.msg}
                   </span>
                 </div>
               ))}
             </div>
          </section>
        </div>

        {/* Right Column: Memory Map & Config */}
        <aside className="lg:col-span-4 flex flex-col gap-2 lg:overflow-y-auto min-h-[400px] lg:min-h-0">
          <section className="bg-zinc-900/80 border border-zinc-800 rounded p-4 flex-1 flex flex-col backdrop-blur-sm">
            
            {/* Tabs */}
            <div className="flex border-b border-zinc-800 mb-3 text-[10px] font-bold tracking-widest uppercase">
              <button 
                onClick={() => setRightTab('memory')}
                className={`flex-1 pb-2 flex items-center justify-center gap-2 transition-colors ${rightTab === 'memory' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <Database className="w-3 h-3" /> Memory Map
              </button>
              <button 
                onClick={() => setRightTab('config')}
                className={`flex-1 pb-2 flex items-center justify-center gap-2 transition-colors ${rightTab === 'config' ? 'text-emerald-400 border-b-2 border-emerald-500' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                <Settings2 className="w-3 h-3" /> Defines (Config)
              </button>
            </div>

            {rightTab === 'memory' && (
              <>
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Live View</span>
                  <span className="text-[9px] bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 border border-zinc-700">0x00 - 0x5F</span>
                </div>
                <div className="flex-1 overflow-auto bg-zinc-950/50 border border-zinc-800/50 rounded p-2 custom-scrollbar">
                  <div className="grid grid-cols-[auto_repeat(8,1fr)] gap-x-1 gap-y-1">
                    {/* Header Row */}
                    <div className="text-[8px] text-zinc-600 flex items-center justify-end pr-1">ADDR</div>
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="text-[8px] text-zinc-600 text-center pb-1">+{i}</div>
                    ))}
                    
                    {/* Memory Rows (12 rows of 8 bytes = 96 bytes total = 0x60) */}
                    {Array.from({ length: 12 }).map((_, rowIndex) => (
                      <Fragment key={rowIndex}>
                        <div className="text-[9px] text-zinc-600 text-right pr-1 flex items-center justify-end font-bold">
                          0x{(rowIndex * 8).toString(16).padStart(2, '0').toUpperCase()}
                        </div>
                        {Array.from({ length: 8 }).map((_, colIndex) => {
                          const addr = rowIndex * 8 + colIndex;
                          const val = mem[addr];
                          const isIO = addr < 0x40;
                          
                          return (
                            <div 
                              key={colIndex} 
                              className={`h-5 text-[9px] flex items-center justify-center rounded-sm transition-colors duration-75 ${
                                val !== 0 
                                  ? isIO 
                                    ? 'bg-indigo-900/40 border border-indigo-700/50 text-indigo-300 font-bold' 
                                    : 'bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 font-bold'
                                  : 'bg-zinc-900/30 border border-zinc-800/50 text-zinc-700'
                              }`}
                              title={`Address: 0x${addr.toString(16).padStart(2, '0').toUpperCase()}\nBinary: ${val.toString(2).padStart(8, '0')}`}
                            >
                              <HexByte val={val} />
                            </div>
                          );
                        })}
                      </Fragment>
                    ))}
                  </div>
                </div>
                
                <div className="mt-3 pt-3 border-t border-zinc-800 flex gap-4 text-[8px] text-zinc-500 tracking-widest">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-indigo-900/40 border border-indigo-700/50 rounded-sm"></div>
                    <span>IO REGS</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-emerald-900/40 border border-emerald-700/50 rounded-sm"></div>
                    <span>SRAM</span>
                  </div>
                </div>
              </>
            )}

            {rightTab === 'config' && (
              <div className="flex-1 overflow-auto custom-scrollbar flex flex-col gap-4 text-xs font-mono text-emerald-400 p-1">
                
                {/* Hold Sec */}
                <div className="flex flex-col gap-1 border-b border-zinc-800/50 pb-3">
                  <div className="flex justify-between items-center text-indigo-300">
                    <span>#define CFG_HOLD_SEC</span>
                    <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 tabular-nums">{config.CFG_HOLD_SEC}</span>
                  </div>
                  <input type="range" min="1" max="10" step="1" value={config.CFG_HOLD_SEC} onChange={e => handleConfigChange('CFG_HOLD_SEC', parseInt(e.target.value))} className="w-full accent-indigo-500" />
                </div>
                
                {/* Default Level */}
                <div className="flex flex-col gap-1 border-b border-zinc-800/50 pb-3">
                  <div className="flex justify-between items-center text-indigo-300">
                    <span>#define CFG_DEFAULT_LEVEL</span>
                    <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 tabular-nums">{config.CFG_DEFAULT_LEVEL}</span>
                  </div>
                  <input type="range" min="1" max={config.CFG_PWM_MAP.length} step="1" value={config.CFG_DEFAULT_LEVEL} onChange={e => handleConfigChange('CFG_DEFAULT_LEVEL', parseInt(e.target.value))} className="w-full accent-indigo-500" />
                </div>

                {/* Max Limit Level */}
                <div className="flex flex-col gap-1 border-b border-zinc-800/50 pb-3">
                  <div className="flex justify-between items-center text-indigo-300">
                    <span>#define CFG_MAX_LIMIT_LEVEL</span>
                    <span className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 tabular-nums">{config.CFG_MAX_LIMIT_LEVEL}</span>
                  </div>
                  <input type="range" min="1" max={config.CFG_PWM_MAP.length} step="1" value={config.CFG_MAX_LIMIT_LEVEL} onChange={e => handleConfigChange('CFG_MAX_LIMIT_LEVEL', parseInt(e.target.value))} className="w-full accent-indigo-500" />
                </div>
                
                {/* Memory Enable */}
                <div className="flex flex-col gap-1 border-b border-zinc-800/50 pb-3">
                  <div className="flex justify-between items-center text-indigo-300">
                    <span>#define CFG_ENABLE_MEMORY</span>
                    <button 
                      onClick={() => handleConfigChange('CFG_ENABLE_MEMORY', config.CFG_ENABLE_MEMORY ? 0 : 1)}
                      className={`px-3 py-1 rounded text-[10px] font-bold border transition-colors ${config.CFG_ENABLE_MEMORY ? 'bg-emerald-900/40 border-emerald-500/50 text-emerald-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}
                    >
                      {config.CFG_ENABLE_MEMORY ? '1' : '0'}
                    </button>
                  </div>
                </div>

                {/* Auto Sleep / Dim */}
                <div className="flex flex-col gap-1 border-b border-zinc-800/50 pb-3">
                  <div className="flex justify-between items-center text-amber-300">
                    <span>#define CFG_AUTO_SLEEP_EN</span>
                    <button 
                      onClick={() => handleConfigChange('CFG_AUTO_SLEEP_EN', config.CFG_AUTO_SLEEP_EN ? 0 : 1)}
                      className={`px-3 py-1 rounded text-[10px] font-bold border transition-colors ${config.CFG_AUTO_SLEEP_EN ? 'bg-amber-900/40 border-amber-500/50 text-amber-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}
                    >
                      {config.CFG_AUTO_SLEEP_EN ? '1' : '0'}
                    </button>
                  </div>
                  <div className="flex justify-between items-center text-amber-300 mt-2">
                    <span>#define CFG_DIM_SEC</span>
                    <input type="number" value={config.CFG_DIM_SEC} onChange={e => handleConfigChange('CFG_DIM_SEC', parseInt(e.target.value) || 0)} className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 w-20 text-right tabular-nums outline-none focus:border-amber-500" />
                  </div>
                  <div className="flex justify-between items-center text-amber-300 mt-2">
                    <span>#define CFG_OFF_SEC</span>
                    <input type="number" value={config.CFG_OFF_SEC} onChange={e => handleConfigChange('CFG_OFF_SEC', parseInt(e.target.value) || 0)} className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 w-20 text-right tabular-nums outline-none focus:border-amber-500" />
                  </div>
                </div>

                {/* VLM Settings */}
                <div className="flex flex-col gap-1 border-b border-zinc-800/50 pb-3">
                  <div className="flex justify-between items-center text-red-300">
                    <span title="0=Disable, 1=1.4V, 2=1.6V, 3=1.8V, 4=2.0V, 5=2.5V, 6=2.7V, 7=4.3V">#define CFG_VLM_LEVEL</span>
                    <select 
                      value={config.CFG_VLM_LEVEL} 
                      onChange={e => handleConfigChange('CFG_VLM_LEVEL', parseInt(e.target.value))} 
                      className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 text-red-300 outline-none"
                    >
                      <option value={0}>0 (OFF)</option>
                      <option value={1}>1 (1.4V)</option>
                      <option value={2}>2 (1.6V)</option>
                      <option value={3}>3 (1.8V)</option>
                      <option value={4}>4 (2.0V)</option>
                      <option value={5}>5 (2.5V)</option>
                      <option value={6}>6 (2.7V)</option>
                      <option value={7}>7 (4.3V)</option>
                    </select>
                  </div>
                  <div className="flex justify-between items-center text-red-300 mt-2">
                    <span>#define CFG_VLM_FILTER_EN</span>
                    <button 
                      onClick={() => handleConfigChange('CFG_VLM_FILTER_EN', config.CFG_VLM_FILTER_EN ? 0 : 1)}
                      className={`px-3 py-1 rounded text-[10px] font-bold border transition-colors ${config.CFG_VLM_FILTER_EN ? 'bg-red-900/40 border-red-500/50 text-red-400' : 'bg-zinc-900 border-zinc-700 text-zinc-500'}`}
                    >
                      {config.CFG_VLM_FILTER_EN ? '1' : '0'}
                    </button>
                  </div>
                  <div className="flex justify-between items-center text-red-300 mt-2">
                    <span>#define CFG_VLM_FILTER_MS</span>
                    <input type="number" value={config.CFG_VLM_FILTER_MS} onChange={e => handleConfigChange('CFG_VLM_FILTER_MS', parseInt(e.target.value) || 0)} className="bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 w-20 text-right tabular-nums outline-none focus:border-red-500" />
                  </div>
                </div>

                {/* PWM MAP */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-emerald-300">const uint8_t CFG_PWM_MAP[] = {'{'}</span>
                    <div className="flex gap-2">
                      <button onClick={sortPwmMap} className="px-2 py-0.5 bg-zinc-800 text-zinc-300 text-[10px] font-bold rounded border border-zinc-700 hover:bg-zinc-700 transition-colors">SORT</button>
                      <button onClick={handleAddPwm} className="px-2 py-0.5 bg-emerald-900/40 text-emerald-400 text-[10px] font-bold rounded border border-emerald-700/50 hover:bg-emerald-800/40 transition-colors">+ ADD</button>
                    </div>
                  </div>
                  {config.CFG_PWM_MAP.some(v => v > 255) && (
                    <div className="text-red-500 text-[10px] font-bold animate-pulse pl-4">Error: Brightness values cannot exceed 255.</div>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pl-4">
                    {config.CFG_PWM_MAP.map((val, idx) => (
                      <div key={idx} className="flex items-center gap-1 text-zinc-400">
                        <span className="w-6 text-right text-[10px] font-bold">L{idx+1}:</span>
                        <input 
                          type="number" 
                          value={Number.isNaN(val) ? '' : val} 
                          onChange={(e) => handlePwmMapChange(idx, parseInt(e.target.value))}
                          onBlur={sortPwmMap}
                          className={`bg-zinc-950 px-1 py-0.5 rounded border ${val > 255 ? 'border-red-500 text-red-400 focus:border-red-400' : 'border-zinc-800 text-emerald-300 focus:border-emerald-500'} w-full text-center tabular-nums outline-none`} 
                        />
                        {config.CFG_PWM_MAP.length > 2 && (
                          <button 
                            onClick={() => handleRemovePwm(idx)}
                            className="text-red-500/50 hover:text-red-400 p-1 flex items-center justify-center transition-colors font-bold text-lg leading-none"
                            title="Remove level"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <div className="text-emerald-300">{'}'};</div>
                </div>

              </div>
            )}
          </section>
        </aside>
      </main>

      {/* Bottom Status */}
      <footer className="h-6 bg-zinc-900 border-t border-zinc-800 flex items-center px-4 justify-between shrink-0 relative z-10">
        <div className="flex gap-4 text-[9px] font-bold text-zinc-600 tracking-widest">
          <span className="tabular-nums">TICK: {renderTrigger}</span>
          <span className="text-zinc-800">|</span>
          <span className={warpSpeed > 1 ? 'text-amber-500' : ''}>WARP: {warpSpeed > 1 ? `${warpSpeed}x` : 'OFF'}</span>
        </div>
      </footer>
    </div>
  );
}


