export class RenderPipeline {
    device: GPUDevice;
    
    constructor(device: GPUDevice) {
        this.device = device;
    }
    
    createFullscreenPipeline(fragmentShaderCode: string, label: string, format: GPUTextureFormat): GPURenderPipeline {
        const module = this.device.createShaderModule({
            code: fragmentShaderCode,
            label: `${label} Shader`
        });
        
        return this.device.createRenderPipeline({
            layout: 'auto',
            vertex: {
                module,
                entryPoint: 'vs_main'
            },
            fragment: {
                module,
                entryPoint: 'fs_main',
                targets: [{ format }]
            },
            primitive: {
                topology: 'triangle-list'
            },
            label: `${label} Pipeline`
        });
    }
}
