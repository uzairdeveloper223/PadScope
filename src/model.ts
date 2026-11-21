import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { buttonParts } from './controller/state.ts';
import type { Axes, Contact, Rotation } from './controller/state.ts';

interface ControlPart { group: THREE.Group; origin: THREE.Vector3; materials: { material: THREE.MeshStandardMaterial; color: THREE.Color; emissive: THREE.Color; intensity: number }[] }
export interface ControllerReplica { object: THREE.Group; sync: () => void }

export class ModelView {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, .1, 100);
  private orbit: OrbitControls;
  private body = new THREE.Group();
  private parts = new Map<string, ControlPart>();
  private leds: THREE.MeshBasicMaterial[] = [];
  private shells: THREE.MeshStandardMaterial[] = [];
  private caps: THREE.MeshStandardMaterial[] = [];
  private symbols: THREE.MeshBasicMaterial[] = [];
  private touchMarkers: THREE.Group[] = [];
  private touchSurfaces: THREE.Mesh[] = [];
  private touchBounds = new THREE.Box3();
  private touchRay = new THREE.Raycaster();
  private shellColor = '#202226';
  private lightColor = '#408cff';
  private motionEnabled = false;
  private fitDistance = 0;
  private currentView: 'front' | 'perspective' = 'front';
  private loaded = false;
  private visible = true;
  private dirty = true;
  private lastSignature = '';
  private target = new THREE.Quaternion();
  private size = new THREE.Vector3(5.3, 3.5, 2.2);

  constructor(private container: HTMLElement, private loading: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setClearColor(0xdfe9ee, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .95;
    this.renderer.domElement.setAttribute('aria-hidden', 'true');
    this.container.append(this.renderer.domElement);
    this.scene.add(this.body);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.scene.environment = pmrem.fromScene(room, .04).texture;
    room.dispose();
    pmrem.dispose();
    this.scene.add(new THREE.HemisphereLight(0xf5faff, 0x536b7a, .8));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(-4, 6, 8);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xc7e1f0, 1.2);
    rim.position.set(5, 2, -4);
    this.scene.add(rim);
    this.orbit = new OrbitControls(this.camera, this.renderer.domElement);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = .12;
    this.orbit.enablePan = false;
    this.orbit.minDistance = 3.8;
    this.orbit.maxDistance = 22;
    this.orbit.addEventListener('change', () => { this.dirty = true; });
    window.addEventListener('padscope-theme', () => { this.dirty = true; });
    new ResizeObserver(() => this.resize()).observe(container);
    new IntersectionObserver(entries => { this.visible = entries[0].isIntersecting; if (this.visible) this.dirty = true; }, { rootMargin: '100px' }).observe(container);
    this.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      this.loading.hidden = false;
      this.loading.textContent = '3D view paused. Reload the page to restore it; input tools still work.';
      this.visible = false;
    });
    this.setView('front');
    void this.load();
  }

  private async load(): Promise<void> {
    try {
      const gltf = await new GLTFLoader().loadAsync(`${import.meta.env.BASE_URL}models/dualsense.glb`);
      const model = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(model);
      bounds.getSize(this.size);
      const center = bounds.getCenter(new THREE.Vector3());
      model.position.sub(center);
      this.body.add(model);
      const meshes: THREE.Mesh[] = [];
      model.traverse(object => { if (object instanceof THREE.Mesh) meshes.push(object); });
      const controls = [...new Set(buttonParts)].sort((a, b) => b.length - a.length);
      for (const mesh of meshes) {
        mesh.material = (mesh.material as THREE.MeshStandardMaterial).clone();
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.envMapIntensity = .45;
        if (/^(white-shell|back-shell|touchpad|ps-mount|mute-mount)/.test(mesh.name)) {
          this.shells.push(material);
          material.roughness = .58;
          material.metalness = 0;
        }
        if (mesh.name.startsWith('black-front') || mesh.name.startsWith('back-shell')) {
          material.roughness = .82;
          material.metalness = 0;
        }
        if (mesh.name.includes('__cap__') || /^(options|create)__/.test(mesh.name)) {
          this.caps.push(material);
          material.roughness = .5;
          material.metalness = 0;
        }
        if (mesh.name.includes('stick__head')) {
          material.metalness = 0;
          material.roughness = .85;
          material.color.set('#181a1d');
        }
        if (material.transparent) { material.depthWrite = false; material.polygonOffset = true; material.polygonOffsetFactor = -2; }
        if (mesh.name.startsWith('lights__')) {
          // Unlit sRGB keeps the selected color exact instead of bleaching it
          // through studio lighting, emissive exposure, and filmic tone mapping.
          const light = new THREE.MeshBasicMaterial({ color: this.lightColor, toneMapped: false, side: material.side });
          mesh.material = light;
          this.leds.push(light);
          continue;
        }
        const part = controls.find(control => mesh.name.startsWith(`${control}__`));
        if (!part) continue;
        let entry = this.parts.get(part);
        if (!entry) {
          const group = new THREE.Group();
          group.name = `control-${part}`;
          model.add(group);
          entry = { group, origin: new THREE.Vector3(), materials: [] };
          this.parts.set(part, entry);
        }
        entry.group.attach(mesh);
        entry.materials.push({ material, color: material.color.clone(), emissive: material.emissive.clone(), intensity: material.emissiveIntensity });
      }
      for (const [name, entry] of this.parts) {
        const box = new THREE.Box3().setFromObject(entry.group);
        const pivot = box.getCenter(new THREE.Vector3());
        model.worldToLocal(pivot);
        if (name.endsWith('stick')) pivot.z = box.min.z - model.position.z;
        if (name === 'l2' || name === 'r2') pivot.y = box.max.y - model.position.y;
        const children = [...entry.group.children];
        children.forEach(child => model.attach(child));
        entry.group.position.copy(pivot);
        children.forEach(child => entry.group.attach(child));
        entry.origin.copy(pivot);
      }
      this.addSymbols();
      this.prepareTouchMarkers();
      this.loaded = true;
      this.loading.hidden = true;
      this.setShellColor(this.shellColor);
      this.setColor(this.lightColor);
      this.resize();
      this.setView(this.currentView);
      this.dirty = true;
    } catch (error) {
      console.error('Controller model could not load', error);
      this.loading.textContent = 'The 3D model could not load. Check your connection and reload; input tools still work.';
    }
  }

  private resize(): void {
    const width = this.container.clientWidth, height = this.container.clientHeight;
    if (!width || !height) return;
    this.renderer.setSize(width, height);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.fitCamera();
    this.dirty = true;
  }

  setView(view: 'front' | 'perspective'): void {
    this.currentView = view;
    this.camera.position.set(view === 'front' ? 0 : .65, view === 'front' ? 0 : .55, 8);
    this.fitDistance = 0;
    this.fitCamera();
    this.orbit.target.set(0, 0, 0);
    this.orbit.update();
    this.dirty = true;
  }

  private fitCamera(): void {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    const tangent = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2);
    // Leave room for the object to turn without clipping either handle.
    const span = this.motionEnabled ? this.size.length() : this.size.y;
    const distance = Math.max(span, (this.motionEnabled ? span : this.size.x) / Math.max(aspect, .5)) / (2 * tangent) * 1.08;
    if (this.fitDistance) this.camera.position.multiplyScalar(distance / this.fitDistance);
    else this.camera.position.setLength(distance);
    this.fitDistance = distance;
    this.dirty = true;
  }

  setColor(color: string): void {
    this.lightColor = color;
    for (const material of this.leds) material.color.set(color);
    this.dirty = true;
  }

  setShellColor(color: string): void {
    this.shellColor = color;
    const shell = new THREE.Color(color);
    const dark = shell.r * .2126 + shell.g * .7152 + shell.b * .0722 < .3;
    for (const material of this.shells) material.color.copy(shell);
    for (const material of this.caps) material.color.set(dark ? '#30343a' : '#d4d9df');
    for (const material of this.symbols) material.color.set(dark ? '#d8e1e8' : '#4c5966');
    for (const part of this.parts.values()) for (const surface of part.materials) surface.color.copy(surface.material.color);
    this.lastSignature = '';
    this.dirty = true;
  }

  private addSymbols(): void {
    for (const name of ['cross', 'circle', 'square', 'triangle', 'up', 'down', 'left', 'right']) {
      const part = this.parts.get(name);
      const cap = part?.group.children.find(child => child instanceof THREE.Mesh && child.name.includes('__cap__')) as THREE.Mesh | undefined;
      if (!part || !cap) continue;
      // Reuse the workbench's authored SVG symbols as a surface overlay. The
      // artist's original artwork is below the opaque button caps in the GLB.
      const svg = document.getElementById(`i-${name}`)!;
      const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="128" height="128" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg.innerHTML}</svg>`;
      const texture = new THREE.TextureLoader().load(`data:image/svg+xml,${encodeURIComponent(source)}`, () => { this.dirty = true; });
      texture.colorSpace = THREE.SRGBColorSpace;
      const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
      this.symbols.push(material);
      cap.updateWorldMatrix(true, false);
      const bounds = new THREE.Box3().setFromObject(cap);
      const point = bounds.getCenter(new THREE.Vector3());
      point.z = bounds.max.z;
      const arrow = ['up', 'down', 'left', 'right'].includes(name);
      const width = arrow ? .14 : .24;
      const geometry = new DecalGeometry(cap, point, new THREE.Euler(), new THREE.Vector3(width, width, .25));
      geometry.applyMatrix4(part.group.matrixWorld.clone().invert());
      const decal = new THREE.Mesh(geometry, material);
      decal.name = `${name}-visible-symbol`;
      part.group.add(decal);
    }
  }

  private prepareTouchMarkers(): void {
    const part = this.parts.get('touchpad');
    if (!part) return;
    this.touchSurfaces = part.group.children.filter(child => child instanceof THREE.Mesh) as THREE.Mesh[];
    this.touchBounds.setFromObject(part.group);
    this.touchBounds.translate(part.group.getWorldPosition(new THREE.Vector3()).negate());
    for (const color of ['#36c99b', '#ff885d']) {
      const marker = new THREE.Group();
      marker.name = `touch-marker-${this.touchMarkers.length}`;
      const material = new THREE.MeshBasicMaterial({ color, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
      marker.add(new THREE.Mesh(new THREE.RingGeometry(.06, .085, 32), material), new THREE.Mesh(new THREE.CircleGeometry(.025, 20), material));
      marker.visible = false;
      part.group.add(marker);
      this.touchMarkers.push(marker);
    }
  }

  createReplica(): ControllerReplica | null {
    if (!this.loaded) return null;
    const object = this.body.clone(true);
    object.quaternion.identity();
    const sources = [...this.parts.values()].map(part => part.group).concat(this.touchMarkers);
    const pairs = sources.map(source => [source, object.getObjectByName(source.name)!] as const);
    return { object, sync: () => {
      for (const [source, copy] of pairs) {
        copy.position.copy(source.position); copy.quaternion.copy(source.quaternion); copy.visible = source.visible;
      }
    } };
  }

  private updateTouches(contacts: Contact[] | null, size: [number, number]): void {
    const part = this.parts.get('touchpad');
    if (!part) return;
    part.group.updateWorldMatrix(true, true);
    const inverse = part.group.matrixWorld.clone().invert();
    this.touchMarkers.forEach((marker, index) => {
      const contact = contacts?.[index];
      marker.visible = Boolean(contact?.active);
      if (!contact?.active) return;
      const x = THREE.MathUtils.clamp(contact.x / size[0], 0, 1), y = THREE.MathUtils.clamp(contact.y / size[1], 0, 1);
      const bounds = this.touchBounds;
      const origin = new THREE.Vector3(THREE.MathUtils.lerp(bounds.min.x + .08, bounds.max.x - .08, x), THREE.MathUtils.lerp(bounds.max.y - .13, bounds.min.y + .08, y), bounds.max.z + 1);
      this.touchRay.set(part.group.localToWorld(origin), new THREE.Vector3(0, 0, -1).transformDirection(part.group.matrixWorld));
      const hit = this.touchRay.intersectObjects(this.touchSurfaces, false)[0];
      marker.visible = Boolean(hit?.face);
      if (!hit?.face) return;
      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).transformDirection(inverse);
      marker.position.copy(part.group.worldToLocal(hit.point)).addScaledVector(normal, .016);
      marker.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    });
  }

  update(axes: Axes, buttons: number[], orientation: Rotation, followMotion: boolean, contacts: Contact[] | null, touchSize: [number, number]): void {
    if (!this.loaded || document.hidden) return;
    if (this.motionEnabled !== followMotion) { this.motionEnabled = followMotion; this.fitCamera(); }
    const signature = [...axes, ...buttons, ...(followMotion ? orientation : [0, 0, 0, 1]), ...(contacts ?? []).flatMap(c => [Number(c.active), c.x, c.y]), ...touchSize].map(n => n.toFixed(3)).join(',');
    if (signature !== this.lastSignature) {
      this.lastSignature = signature;
      for (const [name, part] of this.parts) {
        const index = buttonParts.indexOf(name);
        const value = buttons[index] ?? 0;
        part.group.position.copy(part.origin);
        part.group.rotation.set(0, 0, 0);
        if (name.endsWith('stick')) {
          const offset = name === 'left-stick' ? 0 : 2;
          part.group.rotation.set(axes[offset + 1] * .3, axes[offset] * .3, 0);
          part.group.position.z -= value * .035;
        } else if (name === 'l2' || name === 'r2') part.group.rotation.x = -value * .4;
        else part.group.position.z -= value * .035;
        for (const surface of part.materials) {
          surface.material.color.copy(surface.color);
          surface.material.emissive.copy(surface.emissive);
          surface.material.emissiveIntensity = surface.intensity;
          if (value > .05) {
            surface.material.color.lerp(new THREE.Color(0xe9815c), .65 * value);
            surface.material.emissive.set(0xb04427);
            surface.material.emissiveIntensity = .14 * value;
          }
          if (name === 'touchpad' && contacts?.some(contact => contact.active)) {
            surface.material.emissive.set('#23776a');
            surface.material.emissiveIntensity = .18;
          }
        }
      }
      this.target.fromArray(followMotion ? orientation : [0, 0, 0, 1]);
      this.updateTouches(contacts, touchSize);
      this.dirty = true;
    }
    if (!this.visible) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (this.body.quaternion.angleTo(this.target) > .001) {
      this.body.quaternion.slerp(this.target, reduced ? 1 : .22);
      this.dirty = true;
    }
    this.orbit.update();
    if (this.dirty) { this.renderer.render(this.scene, this.camera); this.dirty = false; }
  }
}
