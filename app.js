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

class App {
  constructor() {
    const container = document.createElement('div');
    document.body.appendChild(container);

    this.assetsPath = './assets/';

    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 500);
    this.camera.position.set(0, 1.6, 0);

    this.dolly = new THREE.Object3D();
    this.dolly.position.set(0, 0, 10);
    this.dolly.add(this.camera);
    this.dummyCam = new THREE.Object3D();
    this.camera.add(this.dummyCam);

    this.scene = new THREE.Scene();
    this.scene.add(this.dolly);

    const ambient = new THREE.HemisphereLight(0xffffff, 0xaaaaaa, 0.8);
    this.scene.add(ambient);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    container.appendChild(this.renderer.domElement);

    this.setEnvironment();
    window.addEventListener('resize', this.resize.bind(this));

    this.clock = new THREE.Clock();
    this.workingVec3 = new THREE.Vector3();
    this.workingQuaternion = new THREE.Quaternion();
    this.raycaster = new THREE.Raycaster();

    this.stats = new Stats();
    container.appendChild(this.stats.dom);

    this.loadingBar = new LoadingBar();
    this.loadCollege();

    this.immersive = false;

    fetch('./college.json')
      .then(res => res.json())
      .then(data => {
        this.boardData = data;
        this.boardShown = '';
        this.uiTimer = 0;
      });
  }

  setEnvironment() {
    const loader = new RGBELoader().setDataType(THREE.UnsignedByteType);
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    loader.load('./assets/hdr/venice_sunset_1k.hdr', (texture) => {
      const envMap = pmremGenerator.fromEquirectangular(texture).texture;
      pmremGenerator.dispose();
      this.scene.environment = envMap;
    });
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  loadCollege() {
    const loader = new GLTFLoader().setPath(this.assetsPath);
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('./libs/three/js/draco/');
    loader.setDRACOLoader(dracoLoader);

    loader.load('college.glb', gltf => {
      const college = gltf.scene.children[0];
      this.scene.add(college);

      college.traverse(child => {
        if (child.isMesh) {
          if (child.name.includes('PROXY')) {
            child.material.visible = false;
            this.proxy = child;
          } else if (child.material.name.includes('Glass')) {
            child.material.opacity = 0.1;
            child.material.transparent = true;
          } else if (child.material.name.includes('SkyBox')) {
            const mat = new THREE.MeshBasicMaterial({ map: child.material.map });
            child.material.dispose();
            child.material = mat;
          }
        }
      });

      this.loadingBar.visible = false;
      this.loadCarModel();
      this.setupXR();
    },
    xhr => {
      this.loadingBar.progress = xhr.loaded / xhr.total;
    },
    err => console.error(err));
  }

  loadCarModel() {
    const loader = new GLTFLoader().setPath(this.assetsPath);
    loader.load('car.glb', gltf => {
      const car = gltf.scene;
      car.scale.set(0.7, 0.7, 0.7);
      car.position.set(2, 0, -5);
      car.rotation.y = Math.PI / 2;
      this.scene.add(car);
    }, undefined, error => {
      console.error('Failed to load car model:', error);
    });
  }

  setupXR() {
    this.renderer.xr.enabled = true;
    new VRButton(this.renderer);

    const timeoutId = setTimeout(() => {
      this.useGaze = true;
      this.gazeController = new GazeController(this.scene, this.dummyCam);
    }, 2000);

    const onSelectStart = function () {
      this.userData.selectPressed = true;
    };
    const onSelectEnd = () => {
      this.controllers.forEach(ctrl => ctrl.userData.selectPressed = false);
    };

    const onConnected = () => clearTimeout(timeoutId);

    this.controllers = this.buildControllers(this.dolly);
    this.controllers.forEach(controller => {
      controller.addEventListener('selectstart', onSelectStart);
      controller.addEventListener('selectend', onSelectEnd);
      controller.addEventListener('connected', onConnected);
    });

    const content = { name: 'name', info: 'info' };
    const config = {
      panelSize: { height: 0.5 },
      height: 256,
      name: { fontSize: 50, height: 70 },
      info: { position: { top: 70, backgroundColor: '#ccc', fontColor: '#000' } }
    };
    this.ui = new CanvasUI(content, config);
    this.scene.add(this.ui.mesh);

    this.renderer.setAnimationLoop(this.render.bind(this));
  }

  buildControllers(parent) {
    const factory = new XRControllerModelFactory();
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -1)
    ]);
    const line = new THREE.Line(geometry);

    const controllers = [];
    for (let i = 0; i < 2; i++) {
      const controller = this.renderer.xr.getController(i);
      controller.add(line.clone());
      controller.userData.selectPressed = false;
      parent.add(controller);
      controllers.push(controller);

      const grip = this.renderer.xr.getControllerGrip(i);
      grip.add(factory.createControllerModel(grip));
      parent.add(grip);
    }
    return controllers;
  }

  get selectPressed() {
    return this.controllers && (this.controllers[0].userData.selectPressed || this.controllers[1].userData.selectPressed);
  }

  showInfoboard(name, info, pos) {
    if (!this.ui) return;
    this.ui.position.copy(pos).add(this.workingVec3.set(0, 1.3, 0));
    const camPos = this.dummyCam.getWorldPosition(this.workingVec3);
    this.ui.updateElement('name', info.name);
    this.ui.updateElement('info', info.info);
    this.ui.update();
    this.ui.lookAt(camPos);
    this.ui.visible = true;
    this.boardShown = name;

    clearTimeout(this.uiTimer);
    this.uiTimer = setTimeout(() => {
      this.ui.visible = false;
      this.boardShown = '';
    }, 7000);
  }

  render() {
    const dt = this.clock.getDelta();

    if (this.renderer.xr.isPresenting) {
      if (this.selectPressed || (this.useGaze && this.gazeController?.mode === GazeController.Modes.MOVE)) {
        if (this.proxy) this.dolly.translateZ(-dt * 2);

        const dollyPos = this.dolly.getWorldPosition(new THREE.Vector3());
        let boardFound = false;
        if (this.boardData) {
          Object.entries(this.boardData).forEach(([name, info]) => {
            const obj = this.scene.getObjectByName(name);
            if (obj) {
              const pos = obj.getWorldPosition(new THREE.Vector3());
              if (dollyPos.distanceTo(pos) < 3) {
                boardFound = true;
                if (this.boardShown !== name) this.showInfoboard(name, info, pos);
              }
            }
          });
        }
        if (!boardFound) {
          this.boardShown = '';
          this.ui.visible = false;
        }
      }
    }

    if (this.immersive !== this.renderer.xr.isPresenting) {
      this.resize();
      this.immersive = this.renderer.xr.isPresenting;
    }

    this.stats.update();
    this.renderer.render(this.scene, this.camera);
  }
}

export { App };
}

export { App };
