struct LedUniforms {
    powerRatio: f32,
    padding0: f32,
    padding1: f32,
    padding2: f32,
};
@group(0) @binding(0) var<uniform> uniforms: LedUniforms;


@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
    let center = vec2<f32>(0.5, 0.5);
    let d = distance(in.uv, center);
    
    // SMD led body is roughly a rect
    let size = vec2<f32>(0.25, 0.125);
    // d_rect calculated later
    
    var color = vec3<f32>(0.0);
    
    
    let intensity = clamp(uniforms.powerRatio, 0.0, 1.0);
    
    // Relax the gamma curve so low PWM values remain visible
    // Relax the gamma curve so low power values remain visible
    let curve = pow(intensity, 1.5);
    
    // Rounded rectangle distance field for the LED core
    let r = 0.02; // corner radius
    let rounded_d_rect = length(max(abs(in.uv - center) - size + vec2<f32>(r), vec2<f32>(0.0))) - r;
    
    // Smooth edges for anti-aliasing
    let edge = 1.0 - smoothstep(0.0, 0.01, rounded_d_rect);
    
    // Inside LED
    let max_hdr = 10000.0; // Extreme HDR hardware limit
    let hdr_brightness = curve * max_hdr; 
    
    // Phosphor color (yellowish when off)
    let phosphor_color = vec3<f32>(0.8, 0.7, 0.1) * 0.5;
    
    // Add inner shadow/bevel to the phosphor
    let inner_shadow = smoothstep(-0.05, 0.0, rounded_d_rect) * 0.5;
    // Make it more red!
    let base_color = vec3<f32>(1.0, 0.05, 0.0); // True red
    
    var led_color = mix(phosphor_color, phosphor_color * 0.5, inner_shadow) + base_color * hdr_brightness;
    
    // Center hot spot (white-yellowish hot core)
    let hotspot_glow = 1.0 - smoothstep(0.0, 0.25, d);
    let hotspot_core = 1.0 - smoothstep(0.0, 0.12, d);
    
    // Smooth transition from red to orange/yellow
    led_color += vec3<f32>(1.0, 0.5, 0.1) * hdr_brightness * hotspot_glow * 1.2;
    // Bright white/yellow core
    led_color += vec3<f32>(1.0, 0.9, 0.7) * hdr_brightness * hotspot_core * 1.0;
    
    color = mix(vec3<f32>(0.0), led_color, edge);
    let alpha = edge;
    
    return vec4<f32>(color, alpha);
}
