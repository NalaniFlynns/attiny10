import { RenderPipeline } from './Pipeline';
import fullscreenCode from '../shader/fullscreen.wgsl?raw';
import blurCode from '../shader/blur.wgsl?raw';

export class BloomPass {
    device: GPUDevice;
    pipeline: GPURenderPipeline;
    sampler: GPUSampler;
    
    uniformBufferH: GPUBuffer;
    uniformBufferV: GPUBuffer;
    
    bindGroupH!: GPUBindGroup;
    bindGroupV!: GPUBindGroup;
    
    blurTexture!: GPUTexture;
    blurView!: GPUTextureView;
    
    width: number = 0;
    height: number = 0;
    
    constructor(device: GPUDevice, pipelineHelper: RenderPipeline, targetFormat: GPUTextureFormat) {
        this.device = device;
        this.pipeline = pipelineHelper.createFullscreenPipeline(
            fullscreenCode + '\n' + blurCode,
            'Bloom Blur',
            targetFormat
        );
        
        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'clamp-to-edge',
            addressModeV: 'clamp-to-edge',
        });
        
        this.uniformBufferH = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.uniformBufferH, 0, new Float32Array([1.0, 0.0, 0, 0]));
        
        this.uniformBufferV = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(this.uniformBufferV, 0, new Float32Array([0.0, 1.0, 0, 0]));
    }
    
    resize(width: number, height: number, format: GPUTextureFormat) {
        if (this.width === width && this.height === height && this.blurTexture) return;
        this.width = width;
        this.height = height;
        
        if (this.blurTexture) this.blurTexture.destroy();
        
        // We use half resolution for bloom for better performance/blur spread
        const blurW = Math.max(1, Math.floor(width / 2));
        const blurH = Math.max(1, Math.floor(height / 2));
        
        this.blurTexture = this.device.createTexture({
            size: [blurW, blurH],
            format,
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });
        this.blurView = this.blurTexture.createView();
    }
    
    updateBindGroups(sourceView: GPUTextureView) {
        this.bindGroupH = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: sourceView },
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.uniformBufferH } }
            ]
        });
        
        this.bindGroupV = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.blurView }, // read from blur (pass 1 output)
                { binding: 1, resource: this.sampler },
                { binding: 2, resource: { buffer: this.uniformBufferV } }
            ]
        });
    }
    
    execute(encoder: GPUCommandEncoder, sourceView: GPUTextureView, targetView: GPUTextureView) {
        this.updateBindGroups(sourceView);
        
        // Pass 1: Horizontal Blur (Source -> BlurTexture)
        let pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.blurView,
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroupH);
        pass.draw(3);
        pass.end();
        
        // Pass 2: Vertical Blur (BlurTexture -> TargetView)
        pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: targetView,
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroupV);
        pass.draw(3);
        pass.end();
    }
}
