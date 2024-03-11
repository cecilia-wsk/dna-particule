uniform sampler2D imageTexture;
uniform float uTime;
uniform vec4 uResolution;

uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;

varying float vColorRandoms;
varying vec2 vUv;

void main()	{
	//vec2 newUV = (vUv - vec2(0.5))*uResolution.zw + vec2(0.5);

	// MAKE PARTICULE IN ROUND SHAPE!
	//float alpha = 1.0 - smoothstep(-0.2, 0.5, length(gl_PointCoord - vec2(0.5)));
	float alpha = 1.0 - smoothstep(-0.001, 0.5, length(gl_PointCoord - vec2(0.5)));
	alpha *= 0.6;
	
	vec3 finalColor = uColor1;
	if ( vColorRandoms > 0.33 && vColorRandoms < 0.66 ) {
		finalColor = uColor2;
	}
	if ( vColorRandoms > 0.66 ) {
		finalColor = uColor3;
	}

	float gradient = smoothstep( 0.38, 0.55, vUv.y);

	gl_FragColor = vec4( finalColor, alpha);
}