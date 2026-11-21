import * as THREE from 'three';
import type { BlasterId } from './aim.ts';
import { blasterIds, loadBlasters, prepareBlaster } from './blasters.ts';
import type { BlasterModel } from './blasters.ts';
import { inspectionDistance } from './inspection-pose.ts';

export class InspectionView {
  ready = false;
  visible = false;
  lost = false;
  private renderer: THREE.WebGLRenderer;
  private camera = new THREE.PerspectiveCamera(38, 1, .1, 80);
  private scene = new THREE.Scene();
  private rig = new THREE.Group();
  private models = new Map<BlasterId, BlasterModel>();
  private selected: BlasterId = 'compact';
  private zoom = 1;

  constructor(private container: HTMLElement, private loading: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    container.prepend(this.renderer.domElement);
    this.scene.add(this.rig, new THREE.HemisphereLight(0xf4faff, 0x546c7a, 2));
    for (const [x, y, z, intensity] of [[-3, 5, 5, 3], [4, 1, -3, 2]]) {
      const light = new THREE.DirectionalLight(0xffffff, intensity);
      light.position.set(x, y, z); this.scene.add(light);
    }
    new ResizeObserver(() => this.resize()).observe(container);
    new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; }, { threshold: .15 }).observe(container);
    window.addEventListener('padscope-theme', () => this.setTheme());
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault(); this.lost = true; this.ready = false;
      loading.hidden = false; loading.textContent = 'Inspection graphics paused. Reload the page to restore the model.';
    });
    this.setTheme(); this.resize();
  }

  async load(): Promise<void> {
    this.loading.hidden = false; this.loading.textContent = 'Loading Kenney’s blasters…';
    try {
      const sources = await loadBlasters();
      for (const id of blasterIds) {
        const blaster = prepareBlaster(sources[id], 2.6);
        blaster.model.visible = id === this.selected;
        this.models.set(id, blaster); this.rig.add(blaster.model);
      }
      this.ready = true; this.loading.hidden = true; this.fit();
    } catch (error) {
      this.loading.textContent = 'Blasters could not load. Close and reopen inspection to retry.';
      throw error;
    }
  }

  private setTheme(): void {
    this.scene.background = new THREE.Color(document.documentElement.dataset.theme === 'dark' ? '#1b3543' : '#dfe9ee');
  }

  private resize(): void {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height; this.fit();
  }

  private fit(): void {
    const radius = this.models.get(this.selected)?.radius ?? 1.5;
    this.camera.position.set(0, 0, inspectionDistance(radius, this.camera.aspect, this.camera.fov, this.zoom));
    this.camera.far = Math.max(80, this.camera.position.z + radius * 3);
    this.camera.updateProjectionMatrix(); this.camera.updateMatrixWorld();
  }

  render(rotation: THREE.Quaternion, selected: BlasterId, zoom: number): void {
    if (!this.visible || this.lost || !this.ready) return;
    if (selected !== this.selected || zoom !== this.zoom) {
      this.selected = selected; this.zoom = zoom;
      for (const [id, blaster] of this.models) blaster.model.visible = id === selected;
      this.fit();
    }
    this.rig.quaternion.copy(rotation);
    this.renderer.render(this.scene, this.camera);
  }
}
