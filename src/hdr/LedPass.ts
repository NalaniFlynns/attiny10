import { RenderPipeline } from './Pipeline';
import fullscreenCode from '../shader/fullscreen.wgsl?raw';
import ledCode from '../shader/led.wgsl?raw';

export class LedPass {
    pipeline: GPURenderPipeline;
    uniformBuffer: GPUBuffer;
    bindGroup: GPUBindGroup;
    
    constructor(device: GPUDevice, pipelineHelper: RenderPipeline, targetFormat: GPUTextureFormat) {
        this.pipeline = pipelineHelper.createFullscreenPipeline(
            fullscreenCode + '\n' + ledCode, 
            'LED', 
            targetFormat
        );
        
        this.uniformBuffer = device.createBuffer({
            size: 16, // 4 floats
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            label: 'LED Uniforms'
        });
        
        this.bindGroup = device.createBindGroup({
            layout: this.pipeline.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: { buffer: this.uniformBuffer } }
            ],
            label: 'LED BindGroup'
        });
    }
    
    update(device: GPUDevice, powerRatio: number, unused: number) {
        device.queue.writeBuffer(this.uniformBuffer, 0, new Float32Array([powerRatio, 0, 0, 0]));
    }
    
    execute(encoder: GPUCommandEncoder, targetView: GPUTextureView) {
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
