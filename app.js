import * as THREE from './libs/three/three.module.js';
import { GLTFLoader } from './libs/three/jsm/GLTFLoader.js';
import { DRACOLoader } from './libs/three/jsm/DRACOLoader.js';
import { RGBELoader } from './libs/three/jsm/RGBELoader.js';
import { Stats } from './libs/stats.module.js';
import { LoadingBar } from './libs/LoadingBar.js';
import { VRButton } from './libs/VRButton.js';
import { CanvasUI } from './libs/CanvasUI.js';
import { GazeController } from './libs/GazeController.js'
import { XRControllerModelFactory } from './libs/three/jsm/XRControllerModelFactory.js';

class App{
	constructor(){
		const container = document.createElement( 'div' );
		document.body.appendChild( container );

		this.assetsPath = './assets/';
		
		this.camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.01, 500 );
		this.camera.position.set( 0, 1.6, 0 );
		
        this.dolly = new THREE.Object3D(  );
        this.dolly.position.set(0, 0, 10);
        this.dolly.add( this.camera );
        this.dummyCam = new THREE.Object3D();
        this.camera.add( this.dummyCam );
		
		this.scene = new THREE.Scene();
        this.scene.add( this.dolly );
		
		const ambient = new THREE.HemisphereLight(0xFFFFFF, 0xAAAAAA, 0.8);
		this.scene.add(ambient);

		this.renderer = new THREE.WebGLRenderer({ antialias: true });
		this.renderer.setPixelRatio( window.devicePixelRatio );
		this.renderer.setSize( window.innerWidth, window.innerHeight );
		this.renderer.outputEncoding = THREE.sRGBEncoding;
		container.appendChild( this.renderer.domElement );
        this.setEnvironment();
	
        window.addEventListener( 'resize', this.resize.bind(this) );
		
        this.clock = new THREE.Clock();
        this.up = new THREE.Vector3(0,1,0);
        this.origin = new THREE.Vector3();
        this.workingVec3 = new THREE.Vector3();
        this.workingQuaternion = new THREE.Quaternion();
        this.raycaster = new THREE.Raycaster();
		
        this.stats = new Stats();
		container.appendChild( this.stats.dom );
		
		this.loadingBar = new LoadingBar();
		
		this.loadCollege();
		
        this.immersive = false;
		
        const self = this;
		
        fetch('./college.json')
            .then(response => response.json())
            .then(obj =>{
                self.boardShown = '';
                self.boardData = obj;
            });
	}

    setEnvironment(){
        const loader = new RGBELoader().setDataType( THREE.UnsignedByteType );
        const pmremGenerator = new THREE.PMREMGenerator( this.renderer );
        pmremGenerator.compileEquirectangularShader();
		
        const self = this;
		
        loader.load( './assets/hdr/venice_sunset_1k.hdr', ( texture ) => {
          const envMap = pmremGenerator.fromEquirectangular( texture ).texture;
          pmremGenerator.dispose();

          self.scene.environment = envMap;

        }, undefined, (err)=>{
            console.error( 'An error occurred setting the environment');
        } );
    }
	
    resize(){
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize( window.innerWidth, window.innerHeight );  
    }
	
	loadCollege(){
		const loader = new GLTFLoader( ).setPath(this.assetsPath);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath( './libs/three/js/draco/' );
        loader.setDRACOLoader( dracoLoader );
		
        const self = this;
		
		loader.load('college.glb', function ( gltf ) {
            const college = gltf.scene.children[0];
			self.scene.add( college );
			self.college = college;
			
			college.traverse(function (child) {
				if (child.isMesh){
					if (child.name.indexOf("PROXY")!=-1){
						child.material.visible = false;
						self.proxy = child;
					}else if (child.material.name.indexOf('Glass')!=-1){
                        child.material.opacity = 0.1;
                        child.material.transparent = true;
                    }else if (child.material.name.indexOf("SkyBox")!=-1){
                        const mat1 = child.material;
                        const mat2 = new THREE.MeshBasicMaterial({map: mat1.map});
                        child.material = mat2;
                        mat1.dispose();
                    }
				}
			});
				   
            const door1 = college.getObjectByName("LobbyShop_Door__1_");
            const door2 = college.getObjectByName("LobbyShop_Door__2_");
            const pos = door1.position.clone().sub(door2.position).multiplyScalar(0.5).add(door2.position);
            const obj = new THREE.Object3D();
            obj.name = "LobbyShop";
            obj.position.copy(pos);
            college.add( obj );
            
            self.loadingBar.visible = false;
			
            self.loadCarModel();
            self.setupXR();
		}, function ( xhr ) {
			self.loadingBar.progress = (xhr.loaded / xhr.total);
		}, function ( error ) {
			console.log( 'An error happened' );
		});
	}

	loadCarModel(){
		const loader = new GLTFLoader().setPath(this.assetsPath);
		loader.load('car.glb', gltf => {
			const car = gltf.scene;
			car.scale.set(0.5, 0.5, 0.5);
			car.position.set(2, 0, 8); // Placed near dolly starting pos (0,0,10) slightly right
			car.rotation.y = -Math.PI / 2;
			if (this.college) this.college.add(car);
			else this.scene.add(car);
		}, undefined, err => console.error('Car load error:', err));
	}

    // ...rest of the class remains unchanged
}

export { App };