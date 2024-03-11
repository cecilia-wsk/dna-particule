import * as THREE from "three";
import dna from "../assets/dna.glb";
import fragment from "./shader/fragment.glsl";
import vertexParticules from "./shader/vertexParticules.glsl";
import * as dat from "dat.gui";
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';


export default class Sketch {
	
	constructor(options) {
		this.scene = new THREE.Scene();

		this.clock = new THREE.Clock();

		this.width = window.innerWidth;
		this.height = window.innerHeight;

		this.renderer = new THREE.WebGLRenderer({
			antialias: true,
			alpha: true
		});

		this.renderer.setSize( this.width , this.height )
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
		this.renderer.setClearColor(0x000000, 1);
		this.renderer.physicallyCorrectLights = true;
	

		this.container = document.getElementById("webgl");
		this.container.appendChild(this.renderer.domElement);

		this.speed = 0;
		this.targetSpeed = 0;
		this.mouse = new THREE.Vector2();
		this.followMouse = new THREE.Vector2();
		this.prevMouse = new THREE.Vector2();

		this.paused = false;

		this.settings();
		this.addCamera();
		this.addObjects();
		this.addControls();
		this.createMesh();
		this.initPostProcessing();
		this.resize();
		this.render();

		window.addEventListener('mousemove', (event) => {
			this.mouseMouve(event);
		});

		window.addEventListener('resize', (event) => {
			this.resize(event);
		});

	}

	initPostProcessing = () => {
		this.renderScene = new RenderPass( this.scene, this.camera );

		this.bloomPass = new UnrealBloomPass( new THREE.Vector2( this.width, this.height ), 1.5, 0.9, 0.85 );

		this.composer = new EffectComposer( this.renderer );
		this.composer.addPass( this.renderScene );
		this.composer.addPass( this.bloomPass );

		//custom shader pass
		var AberrationShader = {
			uniforms: {
				"tDiffuse": { value: null },
				"uDistort": { value: 0.5 },
				"uTime": { value: 0 },
				"uMaxDistort": { value: 2.4 }
			},
			vertexShader: `
				varying vec2 vUv;
				void main() {
					vUv = uv;
					gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0 );
				}`,
		fragmentShader: `
				uniform float uTime;
				uniform sampler2D tDiffuse;
				uniform float uMaxDistort;
				uniform vec2 uDistort;
				uniform float uVelo;
				varying vec2 vUv;

				// const float max_distort = 3.4;
				const int num_iter = 12;
				const float reci_num_iter_f = 1.0 / float(num_iter);

				vec2 barrelDistortion(vec2 coord, float amt) {
					vec2 cc = coord - 0.5;
					float dist = dot(cc, cc);
					return coord + cc * dist * amt;
				}

				float sat( float t ) {
					return clamp( t, 0.0, 1.0 );
				}

				float linterp( float t ) {
					return sat( 1.0 - abs( 2.0*t - 1.0 ) );
				}

				float remap( float t, float a, float b ) {
					return sat( (t - a) / (b - a) );
				}

				vec4 spectrum_offset( float t ) {
					vec4 ret;
					float lo = step(t,0.5);
					float hi = 1.0-lo;
					float w = linterp( remap( t, 1.0/6.0, 5.0/6.0 ) );
					ret = vec4(lo,1.0,hi, 1.) * vec4(1.0-w, w, 1.0-w, 1.);

					return pow( ret, vec4(1.0/2.2) );
				}

				void main()  {
					float max_distort = uMaxDistort;
					vec2 zUV = (vUv - vec2(0.5))*0.95 + vec2(0.5);
					vec4 sumcol = vec4(0.0);
					vec4 sumw = vec4(0.0);	

					for ( int i=0; i<num_iter;++i ) {
						float t = float(i) * reci_num_iter_f;
						vec4 w = spectrum_offset( t );
						sumw += w;
						sumcol += w * texture2D( tDiffuse, barrelDistortion(zUV, .2 * max_distort*t ) );
					}

					vec4 color = sumcol / sumw;
						
					gl_FragColor = color;
				}`
		}

		this.aberrationEffect = new ShaderPass(AberrationShader);
		this.composer.addPass(this.aberrationEffect);
	}

	settings = () => {
		this.settings = {
			progress: 0.,
			bloomPassThreshold: 0.1,
			bloomPassStrength: 0.9,
			bloomPassRadius: 0.01,
			aberrationMaxDistort: 1.4
		};
		this.gui = new dat.GUI();
		this.gui.add(this.settings, "progress", 0, 1, 0.01);
		this.gui.add(this.settings, "bloomPassThreshold", 0, 2, 0.001);
		this.gui.add(this.settings, "bloomPassStrength", 0, 2, 0.01);
		this.gui.add(this.settings, "bloomPassRadius", 0, 2, 0.01);
		this.gui.add(this.settings, "aberrationMaxDistort", 0, 50, 0.01);
	}

	mouseMouve = (event) => {
		this.mouse.x = ( event.clientX / this.width ) ;
		this.mouse.y = 1. - ( event.clientY/ this.height );
	}

	resize = () => {
		this.width = window.innerWidth;
		this.height = window.innerHeight;
    	// Update camera
		this.camera.aspect = this.width / this.height;
		this.camera.updateProjectionMatrix();
		// Update renderer
		this.renderer.setSize(this.width, this.height);
		this.composer.setSize(this.width, this.height);
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
		// this.keepImageAspectRatio();
	}

	keepImageAspectRatio = (object) => {
		// image cover
		let imageAspect = object.iHeight / object.iWidth;
		let a1;
		let a2;

		if (object.height / object.width > imageAspect) {
			a1 = (object.width / object.height) * imageAspect;
			a2 = 1;
		} else {
			a1 = 1;
			a2 = object.height / object.width / imageAspect;
		}
		// update material
		this.material.uniforms.uResolution.value.x = object.width;
		this.material.uniforms.uResolution.value.y = object.height;
		this.material.uniforms.uResolution.value.z = a1;
		this.material.uniforms.uResolution.value.w = a2;
	}

	addCamera = () => {
		this.camera = new THREE.PerspectiveCamera(
			75,
			this.width/this.height,
			0.001,
			1000
		);

		this.camera.position.set(0, 0, 4);
		// this.camera.lookAt(0, 0, 0);
		this.scene.add(this.camera);
	}

	addControls = () => {
		this.controls = new OrbitControls(this.camera, this.renderer.domElement);
		this.controls.enableDamping = true;
	}

	addObjects = () => {
		//this.geometry = new THREE.PlaneGeometry(1,1,10,10);
		this.material = new THREE.ShaderMaterial({
			extensions: {
				derivatives: "#extension GL_OES_standard_derivatives : enable"
			},
			uniforms: {
				uTime: { value: 0 },
				uProgress: { value: 0},
				uColor1: { value: new THREE.Color(0x612574) },
				uColor2: { value: new THREE.Color(0x293583) },
				uColor3: { value: new THREE.Color(0x1954ec) },
				uMouse: { value: new THREE.Vector2(0,0) },
				uResolution: { value: new THREE.Vector4(this.width, this.height, 1, 1) },
			},
			// wireframe: true,
			transparent: true,
			side: THREE.DoubleSide,
			vertexShader: vertexParticules,
			fragmentShader: fragment,
			depthTest: false,
			depthWrite: false,
			blending: THREE.AdditiveBlending
		});
	}

	createMesh = () => {
		
		//this.number = this.geometry.attributes.position.array.length;
		this.geometry = new THREE.BufferGeometry();
		this.number = 180000;
		
		let positions = new Float32Array(this.number);
		let randoms = new Float32Array(this.number/3);
		let colorRandoms = new Float32Array(this.number/3);
		let animationOffset = new Float32Array(this.number/3);

		let row = 100;
		for ( let i = 0; i < this.number/3; i++) {

			randoms.set([Math.random()],i);
			colorRandoms.set([Math.random()],i);
			animationOffset.set([Math.random()],i);
			
			// dna
			let theta = 0.002*Math.PI*2*(Math.floor(i/row));
			let radius = 0.06*((i%row)-50);

			// original dna
			// let theta = 0.002*Math.PI*2*(Math.floor(i/row));
			// let radius = 0.03*((i%row)-50);
			
			// strange spirale escalator 
			// let theta = 0.01*Math.PI*2*(Math.floor(i/row));
			// let radius = 0.09*((i%row)-50);
			
			// round molecule like
			//let theta = 0.1*Math.PI*2*(Math.floor(i/row));
			//let radius = 0.3*((i%row)-50);
			
			//animationOffset.set([ (i%row)/row ],i);

			let x = radius*Math.cos(theta);
			let y = 0.01*(Math.floor(i/row))-2.5;
			let z = radius*Math.sin(theta);
			
			positions.set([x,y,z], i*3);

		}

		this.geometry.setAttribute('position', new THREE.BufferAttribute(positions,3));
		this.geometry.setAttribute('randoms', new THREE.BufferAttribute(randoms,1));
		this.geometry.setAttribute('offset', new THREE.BufferAttribute(animationOffset,1));
		this.geometry.setAttribute('colorRandoms', new THREE.BufferAttribute(colorRandoms,1));

		this.dna = new THREE.Points(this.geometry, this.material);
		this.scene.add(this.dna);
	}

	stop = () => {
		this.paused = true;
	}

	play = () => {
		this.paused = false;
		this.render();
	}

	getSpeed = () => {
		this.speed = Math.sqrt( (this.prevMouse.x- this.mouse.x)**2 + (this.prevMouse.y- this.mouse.y)**2 );

		this.targetSpeed -= 0.1*(this.targetSpeed - this.speed);
		this.followMouse.x -= 0.1*(this.followMouse.x - this.mouse.x);
		this.followMouse.y -= 0.1*(this.followMouse.y - this.mouse.y);

		this.prevMouse.x = this.mouse.x;
		this.prevMouse.y = this.mouse.y;
	}

	render = () => {

		this.elapsedTime = this.clock.getElapsedTime();
		
		this.controls.update();
		this.getSpeed();
		
		this.bloomPass.threshold = this.settings.bloomPassThreshold;
		this.bloomPass.strength = this.settings.bloomPassStrength;
		this.bloomPass.radius = this.settings.bloomPassRadius;
		this.aberrationEffect.uniforms.uMaxDistort.value = this.settings.aberrationMaxDistort;

		this.dna.rotation.y = this.elapsedTime/35;

		this.material.uniforms.uProgress.value = this.settings.progress;
		this.material.uniforms.uTime.value = this.elapsedTime;
		this.material.uniforms.uMouse.value = this.followMouse;
		this.targetSpeed *= 0.999;
		
		//this.renderer.render(this.scene, this.camera);

		if(this.composer) this.composer.render()

    	// Call tick again on the next frame
    	window.requestAnimationFrame( this.render )
	}
}

new Sketch();