import { RenderPipeline } from './Pipeline';
import fullscreenCode from '../shader/fullscreen.wgsl?raw';
import tonemapCode from '../shader/tonemap.wgsl?raw';

export class ToneMapPass {
    device: GPUDevice;
    pipeline: GPURenderPipeline;
    sampler: GPUSampler;
    uniformBuffer: GPUBuffer;
    bindGroup!: GPUBindGroup;
    
    constructor(device: GPUDevice, pipelineHelper: RenderPipeline, targetFormat: GPUTextureFormat, isHdrActive: boolean) {
        this.device = device;
        this.pipeline = pipelineHelper.createFullscreenPipeline(
            fullscreenCode + '\n' + tonemapCode,
            'ToneMap',
            targetFormat
        );
        
        this.sampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
        });
        
        this.uniformBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        
        const mode = isHdrActive ? 1 : 0; // 1 = Extended, 0 = SDR ACES
        device.queue.writeBuffer(this.uniformBuffer, 0, new Uint32Array([mode, 0, 0, 0]));
    }
    
    updateMode(isHdrActive: boolean) {
        const mode = isHdrActive ? 1 : 0;
        this.device.queue.writeBuffer(this.uniformBuffer, 0, new Uint32Array([mode, 0, 0, 0]));
    }
    
    execute(encoder: GPUCommandEncoder, hdrView: GPUTextureView, bloomView: GPUTextureView, targetView: GPUTextureView) {
        this.bindGroup = this.device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: hdrView },
                { binding: 1, resource: bloomView },
                { binding: 2, resource: this.sampler },
                { binding: 3, resource: { buffer: this.uniformBuffer } }
            ]
        });
        
        const pass = encoder.beginRenderPass({
            colorAttachments: [{
                view: targetView,
                clearValue: { r: 0, g: 0, b: 0, a: 0 },
                loadOp: 'clear',
                storeOp: 'store'
            }]
        });
        pass.setPipeline(this.pipeline);
        pass.setBindGroup(0, this.bindGroup);
        pass.draw(3);
        pass.end();
    }
}
