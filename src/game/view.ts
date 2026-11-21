import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { ControllerReplica } from '../model.ts';
import { TargetField } from './targets.ts';
import type { RangeHit } from './targets.ts';
import { RangeWeapon } from './weapon.ts';
import type { BlasterId } from './aim.ts';
import { loadBlasters } from './blasters.ts';
import { placeCrate } from './props.ts';

export class RangeView {
  readonly camera = new THREE.PerspectiveCamera(42, 1, .1, 80);
  ready = false;
  visible = false;
  lost = false;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private replicaScene = new THREE.Scene();
  private replicaCamera = new THREE.OrthographicCamera(-4, 4, 3, -3, .1, 30);
  private replica: ControllerReplica | null = null;
  private field: TargetField | null = null;
  private blaster: RangeWeapon | null = null;
  private tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffdf92', transparent: true, opacity: 1, toneMapped: false }));
  private impact = new THREE.Mesh(new THREE.RingGeometry(.07, .095, 24), new THREE.MeshBasicMaterial({ color: '#68e0b0', transparent: true, depthWrite: false, toneMapped: false }));
  private flash = 0;
  private floor = new THREE.MeshStandardMaterial({ roughness: 1 });
  private wall = new THREE.MeshStandardMaterial({ roughness: 1 });
  private rail = new THREE.MeshStandardMaterial({ color: '#607887', roughness: .7 });

  constructor(private container: HTMLElement, private loading: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.prepend(this.renderer.domElement);
    this.camera.position.set(0, 3, 9);
    this.camera.lookAt(0, 3, -5);
    this.camera.updateMatrixWorld();
    this.scene.add(this.camera);
    this.replicaCamera.position.set(0, 0, 12);
    for (const scene of [this.scene, this.replicaScene]) {
      scene.add(new THREE.HemisphereLight(0xf4faff, 0x546c7a, 2));
      const light = new THREE.DirectionalLight(0xffffff, 3);
      light.position.set(-3, 8, 8);
      scene.add(light);
    }
    this.box(0, -.2, -7, 35, .4, 35, this.floor);
    this.box(0, 6, -15, 35, 12, .5, this.wall);
    const grid = new THREE.GridHelper(35, 35, '#607887', '#607887');
    grid.position.y = .015; this.scene.add(grid);
    for (const x of [-9, -4.5, 4.5, 9]) this.box(x, 4, -14.6, .10, 8, .2, this.rail);
    this.box(0, 7.1, -14.5, 18, .12, .3, this.rail);
    for (const [y, z] of [[1.4, -3], [2.9, -6], [4.4, -9]]) this.box(0, y, z, 27, .08, .12, this.rail);
    this.tracer.visible = false; this.impact.visible = false;
    this.scene.add(this.tracer, this.impact);
    this.addSign();
    new ResizeObserver(() => this.resize()).observe(container);
    new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; }, { threshold: .15 }).observe(container);
    window.addEventListener('padscope-theme', () => this.setTheme());
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.lost = true; this.ready = false;
      this.loading.hidden = false; this.loading.textContent = 'Range graphics paused. Reload the page to restore the game.';
    });
    this.setTheme(); this.resize();
  }

  private box(x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material): void {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z); this.scene.add(mesh);
  }

  private addSign(): void {
    const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
    const context = canvas.getContext('2d'); if (!context) return;
    context.fillStyle = '#163747'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#f3f8fb'; context.font = '600 58px Barlow, sans-serif'; context.textAlign = 'center';
    context.fillText('PADSCOPE  /  TARGET RANGE', 384, 85);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.08), new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }));
    sign.position.set(0, 6.15, -14.45); this.scene.add(sign);
  }

  async load(): Promise<void> {
    this.loading.hidden = false; this.loading.textContent = 'Loading Kenney’s targets and blasters…';
    try {
      const loader = new GLTFLoader();
      const [assets, blasters] = await Promise.all([
        Promise.all(['target-large', 'target-small', 'crate-wide', 'crate-medium'].map(name => loader.loadAsync(`${import.meta.env.BASE_URL}models/range/${name}.glb`))), loadBlasters(),
      ]);
      const [large, small, wide, medium] = assets;
      this.field = new TargetField(large.scene, small.scene, this.camera);
      this.scene.add(this.field.group);
      this.blaster = new RangeWeapon(blasters, this.camera);
      for (const [source, x, z, scale] of [[wide.scene, -6, -4, 4], [medium.scene, 6, -7, 4], [medium.scene, -5, -10, 3]] as const) {
        this.scene.add(placeCrate(source, x, z, scale));
      }
      this.ready = true; this.loading.hidden = true; this.reset();
    } catch (error) {
      console.error('Range assets could not load', error);
      this.loading.textContent = 'Targets could not load. Close and reopen the range to retry.';
      throw error;
    }
  }

  private resize(): void {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height; this.camera.updateProjectionMatrix();
  }

  private setTheme(): void {
    const dark = document.documentElement.dataset.theme === 'dark';
    this.scene.background = new THREE.Color(dark ? '#193342' : '#c4dae6');
    this.scene.fog = new THREE.Fog(dark ? '#193342' : '#c4dae6', 18, 40);
    this.floor.color.set(dark ? '#234453' : '#a7c1cf');
    this.wall.color.set(dark ? '#203e4b' : '#bdd1db');
  }

  setReplica(replica: ControllerReplica): void {
    this.replica = replica; this.replicaScene.add(replica.object);
    this.container.dataset.replica = 'ready';
  }

  get hasReplica(): boolean { return this.replica !== null; }

  reset(): void { this.field?.reset(); this.flash = 0; this.tracer.visible = false; this.impact.visible = false; }

  advance(dt: number, elapsed: number): void {
    this.field?.advance(dt, elapsed);
  }

  shoot(cursor: THREE.Vector2): RangeHit {
    this.flash = .14;
    const hit = this.field?.shoot(cursor) ?? { hit: false, bullseye: false, small: false };
    if (this.blaster && this.field) {
      const start = this.blaster.fire(), end = this.field.lastImpact;
      const position = this.tracer.geometry.getAttribute('position');
      position.setXYZ(0, start.x, start.y, start.z); position.setXYZ(1, end.x, end.y, end.z);
      position.needsUpdate = true; this.tracer.geometry.computeBoundingSphere();
      this.tracer.visible = true; this.impact.visible = hit.hit;
      this.impact.position.copy(end); this.impact.position.z += .03;
    }
    return hit;
  }

  render(cursor: THREE.Vector2, weapon: THREE.Quaternion, gunPose: THREE.Quaternion, gyro: boolean, inside: boolean, dt: number, blaster: BlasterId): void {
    if (!this.visible || this.lost) return;
    this.blaster?.select(blaster); this.blaster?.update(cursor, gunPose, gyro, inside, dt);
    this.flash = Math.max(0, this.flash - dt);
    this.tracer.visible = this.flash > .06;
    (this.tracer.material as THREE.LineBasicMaterial).opacity = this.flash / .14;
    this.impact.visible = this.impact.visible && this.flash > 0;
    this.impact.scale.setScalar(1 + (1 - this.flash / .14) * 4);
    (this.impact.material as THREE.MeshBasicMaterial).opacity = this.flash / .14;
    const width = this.container.clientWidth, height = this.container.clientHeight;
    this.renderer.setScissorTest(false); this.renderer.setViewport(0, 0, width, height);
    this.renderer.render(this.scene, this.camera);
    if (!this.replica) return;
    this.replica.sync();
    const size = Math.min(170, width * .28, height * .45), insetHeight = size * .8;
    this.replicaCamera.left = -4; this.replicaCamera.right = 4;
    this.replicaCamera.top = 4 * insetHeight / size; this.replicaCamera.bottom = -this.replicaCamera.top;
    this.replicaCamera.updateProjectionMatrix();
    this.replica.object.quaternion.copy(gyro ? weapon : new THREE.Quaternion().setFromEuler(new THREE.Euler(.15, -.3, 0)));
    this.replica.object.position.z = this.flash * 2;
    this.renderer.autoClear = false;
    this.renderer.setViewport(width - size - 8, 22, size, insetHeight);
    this.renderer.setScissor(width - size - 8, 22, size, insetHeight); this.renderer.setScissorTest(true);
    this.renderer.clearDepth(); this.renderer.render(this.replicaScene, this.replicaCamera);
    this.renderer.setScissorTest(false); this.renderer.autoClear = true;
  }
}
