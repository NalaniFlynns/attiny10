@group(0) @binding(0) var tex: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;

struct BlurUniforms {
    direction: vec2<f32>,
    padding1: f32,
    padding2: f32,
};
@group(0) @binding(2) var<uniform> uniforms: BlurUniforms;


@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let size = vec2<f32>(textureDimensions(tex));
    let texelSize = 1.0 / size;
    var color = vec3<f32>(0.0);
    
    // 9-tap gaussian
    let weights = array<f32, 5>(0.227027, 0.1945946, 0.1216216, 0.054054, 0.016216);
    
    color += textureSample(tex, samp, in.uv).rgb * weights[0];
    for (var i = 1; i < 5; i++) {
        let offset = vec2<f32>(f32(i)) * uniforms.direction * texelSize * 1.5; // wider blur
        color += textureSample(tex, samp, in.uv + offset).rgb * weights[i];
        color += textureSample(tex, samp, in.uv - offset).rgb * weights[i];
    }
    
    return vec4<f32>(color, 1.0);
}
