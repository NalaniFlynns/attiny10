@group(0) @binding(0) var hdrTex: texture_2d<f32>;
@group(0) @binding(1) var bloomTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;

struct TonemapUniforms {
    mode: u32, // 0 = SDR ACES, 1 = HDR Extended
    padding1: f32,
    padding2: f32,
    padding3: f32,
};
@group(0) @binding(3) var<uniform> uniforms: TonemapUniforms;


fn ACESFilm(x: vec3<f32>) -> vec3<f32> {
    let a = 2.51;
    let b = 0.03;
    let c = 2.43;
    let d = 0.59;
    let e = 0.14;
    return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn LinearTosRGB(c: vec3<f32>) -> vec3<f32> {
    let a = 0.055;
    let c_srgb = select(
        1.055 * pow(c, vec3<f32>(1.0 / 2.4)) - 0.055,
        12.92 * c,
        c <= vec3<f32>(0.0031308)
    );
    return c_srgb;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let hdrSample = textureSample(hdrTex, samp, in.uv);
    let hdrColor = hdrSample.rgb;
    let alpha = hdrSample.a;
    let bloomColor = textureSample(bloomTex, samp, in.uv).rgb;
    
    // Add bloom with some weight
    var color = hdrColor + bloomColor * 0.2;
    
    if (uniforms.mode == 0u) {
        // Simple Exposure + Reinhard
        let exposure = 1.0;
        let exposed = color * exposure;
        // preserve hue by applying reinhard to luminance
        let luma = dot(exposed, vec3<f32>(0.2126, 0.7152, 0.0722));
        let toneMappedLuma = luma / (1.0 + luma);
        if (luma > 0.0) {
            color = exposed * (toneMappedLuma / luma);
        }
        color = LinearTosRGB(color);
    }
    
    // If mode == 1, we output linear HDR values for the Canvas to tone map
    
    
    let total_luma = dot(color, vec3<f32>(0.2126, 0.7152, 0.0722));
    // Bloom and HDR overflow should increase opacity so it blends with HTML background
    
    let final_alpha = clamp(alpha + max(color.r, max(color.g, color.b)), 0.0, 1.0);

    return vec4<f32>(color, final_alpha);

}
