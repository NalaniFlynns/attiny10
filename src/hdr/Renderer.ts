import { detectHdrCapabilities, HdrCapabilities } from './Capabilities';
import { RenderPipeline } from './Pipeline';
import { LedPass } from './LedPass';
import { BloomPass } from './BloomPass';
import { ToneMapPass } from './ToneMapPass';

export class HdrRenderer {
    canvas: HTMLCanvasElement;
    context!: GPUCanvasContext;
    device!: GPUDevice;
    format!: GPUTextureFormat;
    
    caps!: HdrCapabilities;
    pipelineHelper!: RenderPipeline;
    
    ledPass!: LedPass;
    bloomPass!: BloomPass;
    toneMapPass!: ToneMapPass;
    
    hdrTexture!: GPUTexture;
    hdrView!: GPUTextureView;
    bloomTargetTexture!: GPUTexture;
    bloomTargetView!: GPUTextureView;
    
    width = 0;
    height = 0;
    
    currentPwm = 0;
    currentVoltage = 3.0;
    isHdrActive = false;
    
    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
    }
    
    async initialize(): Promise<boolean> {
        this.caps = await detectHdrCapabilities();
        if (!this.caps.webgpu) return false;
        
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return false;
        
        this.device = await adapter.requestDevice();
        this.context = this.canvas.getContext('webgpu') as GPUCanvasContext;
        if (!this.context) return false;
        
        this.isHdrActive = this.caps.hdrCanvas;
        
        // HDR requires a float format
        this.format = this.isHdrActive ? 'rgba16float' : navigator.gpu.getPreferredCanvasFormat();
        
        const config: GPUCanvasConfiguration = {
            device: this.device,
            format: this.format,
            alphaMode: 'premultiplied'
        };
        
        if (this.isHdrActive) {
            config.colorSpace = 'display-p3';
            (config as any).toneMapping = { mode: 'extended' };
        }
        
        try {
            this.context.configure(config);
        } catch (e) {
            // Fallback if rgba16float is not supported for canvas
            this.isHdrActive = false;
            this.format = navigator.gpu.getPreferredCanvasFormat();
            config.format = this.format;
            delete config.colorSpace;
            delete (config as any).toneMapping;
            this.context.configure(config);
        }
        
        this.pipelineHelper = new RenderPipeline(this.device);
        
        // RGBA16Float is preferred for HDR rendering targets
        const internalFormat = 'rgba16float';
        
        this.ledPass = new LedPass(this.device, this.pipelineHelper, internalFormat);
        this.bloomPass = new BloomPass(this.device, this.pipelineHelper, internalFormat);
        this.toneMapPass = new ToneMapPass(this.device, this.pipelineHelper, this.format, this.isHdrActive);
        
        this.resize(this.canvas.width, this.canvas.height);
        
        return true;
    }
    
    resize(width: number, height: number) {
        if (this.width === width && this.height === height) return;
        this.width = width;
        this.height = height;
        
        if (this.hdrTexture) this.hdrTexture.destroy();
        if (this.bloomTargetTexture) this.bloomTargetTexture.destroy();
        
        const size = [Math.max(1, width), Math.max(1, height)];
        
        this.hdrTexture = this.device.createTexture({
            size,
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.hdrView = this.hdrTexture.createView();
        
        this.bloomTargetTexture = this.device.createTexture({
            size,
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.bloomTargetView = this.bloomTargetTexture.createView();
        
        this.bloomPass.resize(size[0], size[1], 'rgba16float');
    }
    
    setBrightness(pwm: number, voltage: number) {
        this.currentPwm = pwm;
        this.currentVoltage = voltage;
        if (this.ledPass) {
            this.ledPass.update(this.device, pwm, voltage);
        }
    }
    
    render() {
        if (!this.device || !this.context) return;
        
        // Always ensure we have matching sizes
        this.resize(this.canvas.width, this.canvas.height);
        
        const encoder = this.device.createCommandEncoder();
        
        // 1. LED Pass -> HDR Texture
        this.ledPass.execute(encoder, this.hdrView);
        
        // 2. Bloom Pass -> HDR Texture -> Bloom Target Texture
        this.bloomPass.execute(encoder, this.hdrView, this.bloomTargetView);
        
        // 3. ToneMap Pass -> HDR + Bloom -> Canvas Swapchain
        const targetView = this.context.getCurrentTexture().createView();
        this.toneMapPass.execute(encoder, this.hdrView, this.bloomTargetView, targetView);
        
        this.device.queue.submit([encoder.finish()]);
    }
    
    destroy() {
        if (this.hdrTexture) this.hdrTexture.destroy();
        if (this.bloomTargetTexture) this.bloomTargetTexture.destroy();
        if (this.bloomPass && this.bloomPass.blurTexture) this.bloomPass.blurTexture.destroy();
        if (this.device) this.device.destroy();
    }
}
