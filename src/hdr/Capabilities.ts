export interface HdrCapabilities {
    webgpu: boolean;
    displayP3: boolean;
    hdrCanvas: boolean;
    floatTexture: boolean;
}

export async function detectHdrCapabilities(): Promise<HdrCapabilities> {
    const caps: HdrCapabilities = {
        webgpu: false,
        displayP3: false,
        hdrCanvas: false,
        floatTexture: false,
    };

    if (!navigator.gpu) return caps;
    
    try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) return caps;
        caps.webgpu = true;
        caps.floatTexture = true; // rgba16float is core in WebGPU
    } catch(e) {
        return caps;
    }

    if (window.matchMedia && window.matchMedia('(color-gamut: p3)').matches) {
        caps.displayP3 = true;
    }

    // Extended tone mapping for canvas is a newer feature, often combined with colorSpace: 'display-p3' and float formats.
    // We assume if webgpu and displayP3 are present, we can TRY to create an HDR canvas, but we'll know for sure at canvas config time.
    // For now, let's assume Safari with WebGPU and P3 supports it.
    caps.hdrCanvas = caps.webgpu && caps.displayP3; 

    return caps;
}
