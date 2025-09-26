// app.js
import * as THREE from './libs/three/three.module.js';
import { GLTFLoader } from './libs/three/jsm/GLTFLoader.js';
import { DRACOLoader } from './libs/three/jsm/DRACOLoader.js';
import { RGBELoader } from './libs/three/jsm/RGBELoader.js';
import { Stats } from './libs/stats.module.js';
import { LoadingBar } from './libs/LoadingBar.js';
import { VRButton } from './libs/VRButton.js';
import { CanvasUI } from './libs/CanvasUI.js';
import { GazeController } from './libs/GazeController.js';
import { XRControllerModelFactory } from './libs/three/jsm/XRControllerModelFactory.js';

class App{
	constructor(){
		const container = document.createElement( 'div' );
		document.body.appendChild( container );

		this.assetsPath = './assets/';
        
		this.camera = new THREE.PerspectiveCamera( 60, window.innerWidth / window.innerHeight, 0.01, 500 );
		this.camera.position.set( 0, 1.6, 0 );
        
        this.dolly = new THREE.Object3D();
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

        // Ensure canvas can receive keyboard focus (for WASD)
        this.renderer.domElement.setAttribute('tabindex', '0');
        this.renderer.domElement.addEventListener('click', () => this.renderer.domElement.focus());
        this.renderer.domElement.focus();

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

        // --- Web (desktop) keyboard locomotion (WASD) ---
        this.keys = { w:false, a:false, s:false, d:false };
        this.keyboardSpeed = 2.5; // meters/second
        this.bindKeys();
        // -------------------------------------------------

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
		const loader = new GLTFLoader().setPath(this.assetsPath);
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath( './libs/three/js/draco/' );
        loader.setDRACOLoader( dracoLoader );
        
        const self = this;
		
		loader.load(
			'college.glb',
			function ( gltf ) {
                const college = gltf.scene.children[0];
				self.scene.add( college );
				
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
			
                self.setupXR();
			},
			function ( xhr ) {
				self.loadingBar.progress = (xhr.loaded / xhr.total);
			},
			function () {
				console.log( 'An error happened' );
			}
		);
	}
    
    setupXR(){
        this.renderer.xr.enabled = true;
        const btn = new VRButton( this.renderer );
        
        const self = this;
        const timeoutId = setTimeout( connectionTimeout, 2000 );
        
        function onSelectStart() { this.userData.selectPressed = true; }
        function onSelectEnd() { this.userData.selectPressed = false; }
        function onConnected(){ clearTimeout( timeoutId ); }
        function connectionTimeout(){
            self.useGaze = true;
            self.gazeController = new GazeController( self.scene, self.dummyCam );
        }
        
        this.controllers = this.buildControllers( this.dolly );
        this.controllers.forEach( ( controller ) =>{
            controller.addEventListener( 'selectstart', onSelectStart );
            controller.addEventListener( 'selectend', onSelectEnd );
            controller.addEventListener( 'connected', onConnected );
        });
        
        const config = {
            panelSize: { height: 0.5 },
            height: 256,
            name: { fontSize: 50, height: 70 },
            info: { position:{ top: 70, backgroundColor: "#ccc", fontColor:"#000" } }
        }
        const content = { name: "name", info: "info" }
        
        this.ui = new CanvasUI( content, config );
        this.scene.add( this.ui.mesh );
        
        this.renderer.setAnimationLoop( this.render.bind(this) );
    }
    
    buildControllers( parent = this.scene ){
        const controllerModelFactory = new XRControllerModelFactory();
        const geometry = new THREE.BufferGeometry().setFromPoints( [ new THREE.Vector3( 0, 0, 0 ), new THREE.Vector3( 0, 0, -1 ) ] );
        const line = new THREE.Line( geometry ); line.scale.z = 0;
        
        const controllers = [];
        for(let i=0; i<=1; i++){
            const controller = this.renderer.xr.getController( i );
            controller.add( line.clone() );
            controller.userData.selectPressed = false;
            parent.add( controller );
            controllers.push( controller );
            
            const grip = this.renderer.xr.getControllerGrip( i );
            grip.add( controllerModelFactory.createControllerModel( grip ) );
            parent.add( grip );
        }
        return controllers;
    }

    // -------- Keyboard support (W/A/S/D) --------
    bindKeys(){
        const down = (e)=>{
            const k = e.key.toLowerCase();
            if (k==='w' || k==='a' || k==='s' || k==='d'){ this.keys[k] = true; e.preventDefault(); }
        };
        const up = (e)=>{
            const k = e.key.toLowerCase();
            if (k==='w' || k==='a' || k==='s' || k==='d'){ this.keys[k] = false; e.preventDefault(); }
        };
        // Listen on both window and document for robustness
        window.addEventListener('keydown', down);
        window.addEventListener('keyup', up);
        document.addEventListener('keydown', down);
        document.addEventListener('keyup', up);
        window.addEventListener('blur', ()=>{ this.keys.w=this.keys.a=this.keys.s=this.keys.d=false; });
    }

    // Move the dolly using forward/strafe input (WASD) with collision against this.proxy
    moveDollyByInput(forward=0, strafe=0, dt){
        if (this.proxy === undefined) return;
        if (forward===0 && strafe===0) return;

        const wallLimit = 1.3;
        const speed = this.keyboardSpeed;

        // Save original rotation and align dolly with camera yaw for movement basis
        const originalQ = this.dolly.quaternion.clone();
        this.dolly.quaternion.copy( this.dummyCam.getWorldQuaternion(this.workingQuaternion) );

        // Basis vectors
        const forwardVec = new THREE.Vector3();
        this.dolly.getWorldDirection(forwardVec);
        forwardVec.negate();          // forward looking direction
        forwardVec.y = 0; forwardVec.normalize();

        const rightVec = new THREE.Vector3().crossVectors(forwardVec, this.up).normalize();

        // Requested movement direction
        const moveDir = new THREE.Vector3()
            .addScaledVector(forwardVec, forward)
            .addScaledVector(rightVec, strafe);

        if (moveDir.lengthSq() === 0){
            this.dolly.quaternion.copy(originalQ);
            return;
        }
        moveDir.normalize();

        // Start point for casts
        let pos = this.dolly.getWorldPosition(this.origin);
        pos.y += 1;

        // Forward collision
        this.raycaster.set(pos, moveDir);
        let blocked = false;
        const step = speed * dt;
        let hit = this.raycaster.intersectObject(this.proxy);
        if (hit.length>0 && hit[0].distance < wallLimit + step){
            blocked = true;
        }

        if (!blocked){
            this.dolly.position.addScaledVector(moveDir, step);
            pos = this.dolly.getWorldPosition(this.origin);
        }

        // Side clearance
        const leftWorld = new THREE.Vector3(-1,0,0).applyQuaternion(this.dolly.quaternion).normalize();
        this.raycaster.set(pos, leftWorld);
        hit = this.raycaster.intersectObject(this.proxy);
        if (hit.length>0 && hit[0].distance < wallLimit){
            this.dolly.translateX(wallLimit - hit[0].distance);
        }

        const rightWorld = new THREE.Vector3(1,0,0).applyQuaternion(this.dolly.quaternion).normalize();
        this.raycaster.set(pos, rightWorld);
        hit = this.raycaster.intersectObject(this.proxy);
        if (hit.length>0 && hit[0].distance < wallLimit){
            this.dolly.translateX(hit[0].distance - wallLimit);
        }

        // Keep on ground
        const down = new THREE.Vector3(0,-1,0);
        pos.y += 1.5;
        this.raycaster.set(pos, down);
        hit = this.raycaster.intersectObject(this.proxy);
        if (hit.length>0){
            this.dolly.position.copy(hit[0].point);
        }

        // Restore rotation
        this.dolly.quaternion.copy(originalQ);
    }
    // --------------------------------------------

    // Original forward move used by VR controller trigger
    moveDolly(dt){
        if (this.proxy === undefined) return;
        
        const wallLimit = 1.3;
        const speed = 2;
		let pos = this.dolly.position.clone();
        pos.y += 1;
        
		let dir = new THREE.Vector3();
        const quaternion = this.dolly.quaternion.clone();
        this.dolly.quaternion.copy( this.dummyCam.getWorldQuaternion(this.workingQuaternion) );
		this.dolly.getWorldDirection(dir);
        dir.negate();
		this.raycaster.set(pos, dir);
		
        let blocked = false;
		
		let intersect = this.raycaster.intersectObject(this.proxy);
        if (intersect.length>0){
            if (intersect[0].distance < wallLimit) blocked = true;
        }
		
		if (!blocked){
            this.dolly.translateZ(-dt*speed);
            pos = this.dolly.getWorldPosition( this.origin );
		}
		
        //cast left
        dir.set(-1,0,0);
        dir.applyMatrix4(this.dolly.matrix);
        dir.normalize();
        this.raycaster.set(pos, dir);

        intersect = this.raycaster.intersectObject(this.proxy);
        if (intersect.length>0){
            if (intersect[0].distance<wallLimit) this.dolly.translateX(wallLimit-intersect[0].distance);
        }

        //cast right
        dir.set(1,0,0);
        dir.applyMatrix4(this.dolly.matrix);
        dir.normalize();
        this.raycaster.set(pos, dir);

        intersect = this.raycaster.intersectObject(this.proxy);
        if (intersect.length>0){
            if (intersect[0].distance<wallLimit) this.dolly.translateX(intersect[0].distance-wallLimit);
        }

        //cast down
        dir.set(0,-1,0);
        pos.y += 1.5;
        this.raycaster.set(pos, dir);
        
        intersect = this.raycaster.intersectObject(this.proxy);
        if (intersect.length>0){
            this.dolly.position.copy( intersect[0].point );
        }

        this.dolly.quaternion.copy( quaternion );
	}
		
    get selectPressed(){
        return ( this.controllers !== undefined && (this.controllers[0].userData.selectPressed || this.controllers[1].userData.selectPressed) );    
    }
    
    showInfoboard( name, info, pos ){
        if (this.ui === undefined ) return;
        this.ui.position.copy(pos).add( this.workingVec3.set( 0, 1.3, 0 ) );
        const camPos = this.dummyCam.getWorldPosition( this.workingVec3 );
        this.ui.updateElement( 'name', info.name );
        this.ui.updateElement( 'info', info.info );
        this.ui.update();
        this.ui.lookAt( camPos )
        this.ui.visible = true;
        this.boardShown = name;
    }

	render(){
        const dt = this.clock.getDelta();
        
        // Web: WASD locomotion (works both flat and in-headset if a keyboard is available)
        const forward = (this.keys.w ? 1 : 0) + (this.keys.s ? -1 : 0);
        const strafe  = (this.keys.d ? 1 : 0) + (this.keys.a ? -1 : 0);
        if (forward !== 0 || strafe !== 0){
            this.moveDollyByInput(forward, strafe, dt);
        }

        if (this.renderer.xr.isPresenting){
            // Keep gaze cursor updating, but DO NOT auto-walk
            if ( this.useGaze && this.gazeController ){
                this.gazeController.update();
            }

            // Move forward only when controller trigger is pressed
            if (this.selectPressed){
                this.moveDolly(dt);

                if (this.boardData){
                    const scene = this.scene;
                    const dollyPos = this.dolly.getWorldPosition( new THREE.Vector3() );
                    let boardFound = false;
                    Object.entries(this.boardData).forEach(([name, info]) => {
                        const obj = scene.getObjectByName( name );
                        if (obj !== undefined){
                            const pos = obj.getWorldPosition( new THREE.Vector3() );
                            if (dollyPos.distanceTo( pos ) < 3){
                                boardFound = true;
                                if ( this.boardShown !== name) this.showInfoboard( name, info, pos );
                            }
                        }
                    });
                    if (!boardFound){
                        this.boardShown = "";
                        this.ui.visible = false;
                    }
                }
            }
        }
        
        if ( this.immersive != this.renderer.xr.isPresenting){
            this.resize();
            this.immersive = this.renderer.xr.isPresenting;
        }
        
        this.stats.update();
		this.renderer.render(this.scene, this.camera);
	}
}

export { App };
