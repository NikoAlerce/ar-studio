import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

/**
 * AR VIEWER — Production AR Experience
 * 
 * KEY INNOVATION: ALL scenes are converted to GLB on-the-fly using Three.js GLTFExporter.
 * This means model-viewer can render ANY scene (boxes, lights, GLBs, planes)
 * with native ARCore/ARKit surface detection, pinch-to-zoom, and anchoring.
 * 
 * MODES:
 * 1. IMAGE TRACKING: MindAR + A-Frame (camera → detect image → overlay 3D)
 * 2. MARKERLESS AR:  Scene → Three.js → GLB → model-viewer (native AR everywhere)
 */

interface Transform { x: number; y: number; z: number; }

interface Asset {
    id: string;
    name: string;
    type: 'gltf' | 'image-target' | 'video' | 'image' | 'audio';
    url: string;
    thumbnailUrl?: string;
}

interface SceneNode {
    id: string;
    name: string;
    type: 'gltf-model' | 'image-target' | 'plane' | 'box' | 'light';
    assetId?: string;
    position: Transform;
    rotation: Transform;
    scale: Transform;
    properties?: Record<string, any>;
}

interface SceneData {
    assets: Record<string, Asset>;
    sceneNodes: Record<string, SceneNode>;
    customCode?: string;
}

// ====== Script Loader ======
function loadScript(src: string, type?: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src; s.crossOrigin = 'anonymous';
        if (type) s.type = type;
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load: ${src}`));
        document.head.appendChild(s);
    });
}

// ====== Build Three.js scene from scene data and export to GLB Blob ======
async function buildSceneToGLB(sceneData: SceneData, contentNodes: SceneNode[]): Promise<string> {
    const scene = new THREE.Scene();

    // Add default lighting to the exported GLB
    // model-viewer handles environment lighting, but we embed scene lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    for (const node of contentNodes) {
        const props = node.properties || {};

        switch (node.type) {
            case 'box': {
                const geo = new THREE.BoxGeometry(1, 1, 1);
                const mat = new THREE.MeshStandardMaterial({
                    color: new THREE.Color(props.color || '#7a8bcc'),
                    roughness: 0.5,
                    metalness: 0.1,
                });
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(node.position.x, node.position.y, node.position.z);
                mesh.rotation.set(node.rotation.x, node.rotation.y, node.rotation.z);
                mesh.scale.set(node.scale.x, node.scale.y, node.scale.z);
                mesh.name = node.name;
                scene.add(mesh);
                break;
            }
            case 'plane': {
                const geo = new THREE.PlaneGeometry(1, 1);
                let mat: THREE.Material;
                if (node.assetId && sceneData.assets[node.assetId]) {
                    const asset = sceneData.assets[node.assetId];
                    if (asset.type === 'image') {
                        try {
                            const tex = await new THREE.TextureLoader().loadAsync(asset.url);
                            tex.colorSpace = THREE.SRGBColorSpace;
                            mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide });
                        } catch {
                            mat = new THREE.MeshStandardMaterial({ color: props.color || '#7a8bcc', side: THREE.DoubleSide });
                        }
                    } else {
                        mat = new THREE.MeshStandardMaterial({ color: props.color || '#7a8bcc', side: THREE.DoubleSide });
                    }
                } else {
                    mat = new THREE.MeshStandardMaterial({ color: props.color || '#7a8bcc', side: THREE.DoubleSide });
                }
                const mesh = new THREE.Mesh(geo, mat);
                mesh.position.set(node.position.x, node.position.y, node.position.z);
                mesh.rotation.set(node.rotation.x, node.rotation.y, node.rotation.z);
                mesh.scale.set(node.scale.x, node.scale.y, node.scale.z);
                mesh.name = node.name;
                scene.add(mesh);
                break;
            }
            case 'light': {
                const lt = props.lightType || 'point';
                const color = new THREE.Color(props.color || '#ffffff');
                const intensity = props.intensity ?? 1;
                let light: THREE.Light;

                if (lt === 'directional') {
                    light = new THREE.DirectionalLight(color, intensity);
                } else if (lt === 'spot') {
                    const spot = new THREE.SpotLight(color, intensity);
                    spot.angle = props.angle ?? Math.PI / 4;
                    spot.penumbra = 0.5;
                    light = spot;
                } else {
                    const point = new THREE.PointLight(color, intensity);
                    point.distance = props.distance ?? 10;
                    light = point;
                }
                light.position.set(node.position.x, node.position.y, node.position.z);
                light.name = node.name;
                scene.add(light);
                break;
            }
            case 'gltf-model': {
                if (node.assetId && sceneData.assets[node.assetId]) {
                    try {
                        const loader = new GLTFLoader();
                        const gltf = await loader.loadAsync(sceneData.assets[node.assetId].url);
                        const model = gltf.scene;
                        model.position.set(node.position.x, node.position.y, node.position.z);
                        model.rotation.set(node.rotation.x, node.rotation.y, node.rotation.z);
                        model.scale.set(node.scale.x, node.scale.y, node.scale.z);
                        model.name = node.name;
                        scene.add(model);
                    } catch (e) {
                        console.warn('Failed to load GLB for export:', e);
                    }
                }
                break;
            }
        }
    }

    // Export scene to GLB binary
    const exporter = new GLTFExporter();
    const glb = await exporter.parseAsync(scene, { binary: true }) as ArrayBuffer;
    return glb;
}

// ====== Upload GLB to Supabase Storage → get HTTP URL for native AR ======
async function uploadGLBToSupabase(glb: ArrayBuffer, projectId: string): Promise<string> {
    const fileName = `${projectId}/ar-scene-${Date.now()}.glb`;
    const blob = new Blob([glb], { type: 'model/gltf-binary' });
    const file = new File([blob], 'scene.glb', { type: 'model/gltf-binary' });

    const { error } = await supabase.storage
        .from('assets')
        .upload(fileName, file, { cacheControl: '60', upsert: true });

    if (error) throw new Error(`Upload failed: ${error.message}`);

    const { data } = supabase.storage.from('assets').getPublicUrl(fileName);
    return data.publicUrl;
}

// ====== A-Frame helpers (for image tracking mode) ======
const vec3 = (t: Transform) => `${t.x.toFixed(4)} ${t.y.toFixed(4)} ${t.z.toFixed(4)}`;
const toDeg = (t: Transform) => {
    const d = (r: number) => (r * 180) / Math.PI;
    return `${d(t.x).toFixed(2)} ${d(t.y).toFixed(2)} ${d(t.z).toFixed(2)}`;
};

// ====== MAIN VIEWER ======
export default function Viewer() {
    const { id } = useParams();
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneInjected = useRef(false);
    const [status, setStatus] = useState<'loading' | 'empty' | 'building-glb' | 'loading-scripts' | 'ready' | 'error'>('loading');
    const [statusText, setStatusText] = useState('Conectando...');
    const [errorMsg, setErrorMsg] = useState('');
    const [arMode, setArMode] = useState('');

    const buildScene = useCallback(async () => {
        if (!id) { setStatus('error'); setErrorMsg('No se proporcionó un ID de proyecto.'); return; }

        try {
            // ====== 1. FETCH DATA ======
            setStatusText('Cargando experiencia...');
            const { data, error } = await supabase
                .from('projects').select('scene_data, name').eq('id', id).single();

            if (error || !data?.scene_data) { setStatus('empty'); return; }

            let sceneData: SceneData;
            const raw = data.scene_data as any;
            if (raw.entities && !raw.sceneNodes) {
                sceneData = { assets: {}, sceneNodes: raw.entities, customCode: '' };
            } else {
                sceneData = { assets: raw.assets || {}, sceneNodes: raw.sceneNodes || {}, customCode: raw.customCode || '' };
            }

            const nodes = Object.values(sceneData.sceneNodes);
            if (nodes.length === 0) { setStatus('empty'); return; }

            // ====== 2. DETERMINE MODE ======
            const hasTargets = nodes.some(n => n.type === 'image-target');
            const targetNodes = nodes.filter(n => n.type === 'image-target');
            const contentNodes = nodes.filter(n => n.type !== 'image-target');
            const videoAssets = Object.values(sceneData.assets).filter(a => a.type === 'video');
            const projectName = (data as any).name || 'AR Experience';

            if (sceneInjected.current || !containerRef.current) return;
            sceneInjected.current = true;
            containerRef.current.innerHTML = '';

            // ====== MODE 1: IMAGE TRACKING (MindAR + A-Frame) ======
            if (hasTargets) {
                setArMode('mindar');
                setStatus('loading-scripts');
                setStatusText('Cargando motor 3D...');
                await loadScript('https://aframe.io/releases/1.4.2/aframe.min.js');
                setStatusText('Cargando rastreador de imágenes...');
                await loadScript('https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-aframe.prod.js');
                await new Promise(r => setTimeout(r, 200));

                const scene = document.createElement('a-scene');
                scene.setAttribute('vr-mode-ui', 'enabled: false');
                scene.setAttribute('renderer', 'colorManagement: true; antialias: true;');
                scene.setAttribute('loading-screen', 'enabled: false');

                const primary = targetNodes.find(n => n.assetId && sceneData.assets[n.assetId!]);
                if (primary?.assetId) {
                    scene.setAttribute('mindar-image',
                        `imageTargetSrc: ${sceneData.assets[primary.assetId].url}; autoStart: true; uiLoading: no; uiScanning: no; uiError: no;`
                    );
                    scene.setAttribute('color-space', 'sRGB');
                }

                // Videos
                if (videoAssets.length > 0) {
                    const assetsEl = document.createElement('a-assets');
                    videoAssets.forEach(v => {
                        const video = document.createElement('video');
                        video.id = `vid-${v.id}`; video.src = v.url;
                        for (const attr of ['autoplay', 'loop', 'muted', 'playsinline', 'webkit-playsinline']) video.setAttribute(attr, '');
                        video.setAttribute('crossorigin', 'anonymous'); video.muted = true;
                        assetsEl.appendChild(video);
                    });
                    scene.appendChild(assetsEl);
                }

                const cam = document.createElement('a-camera');
                cam.setAttribute('position', '0 0 0');
                cam.setAttribute('look-controls', 'enabled: false');
                scene.appendChild(cam);

                const target = document.createElement('a-entity');
                target.setAttribute('mindar-image-target', 'targetIndex: 0');
                contentNodes.forEach(n => {
                    const el = document.createElement('a-entity');
                    el.id = n.id;
                    el.setAttribute('position', vec3(n.position));
                    el.setAttribute('rotation', toDeg(n.rotation));
                    el.setAttribute('scale', vec3(n.scale));
                    const p = n.properties || {};
                    if (n.type === 'box') {
                        el.setAttribute('geometry', 'primitive: box');
                        el.setAttribute('material', `color: ${p.color || '#7a8bcc'}; roughness: 0.5; metalness: 0.1`);
                    } else if (n.type === 'plane') {
                        el.setAttribute('geometry', 'primitive: plane; width: 1; height: 1');
                        if (n.assetId && sceneData.assets[n.assetId]) {
                            const a = sceneData.assets[n.assetId];
                            el.setAttribute('material', a.type === 'video'
                                ? `src: #vid-${a.id}; side: double; shader: flat`
                                : `src: url(${a.url}); side: double; shader: flat`);
                        } else {
                            el.setAttribute('material', `color: ${p.color || '#7a8bcc'}; side: double`);
                        }
                    } else if (n.type === 'light') {
                        const lt = p.lightType || 'point';
                        let s = `type: ${lt}; color: ${p.color || '#fff'}; intensity: ${p.intensity ?? 1}`;
                        if (lt === 'point' || lt === 'spot') s += `; distance: ${p.distance ?? 10}`;
                        if (lt === 'spot') s += `; angle: ${((p.angle ?? Math.PI / 4) * 180 / Math.PI).toFixed(1)}; penumbra: 0.5`;
                        el.setAttribute('light', s);
                    } else if (n.type === 'gltf-model' && n.assetId && sceneData.assets[n.assetId]) {
                        el.setAttribute('gltf-model', `url(${sceneData.assets[n.assetId].url})`);
                    }
                    target.appendChild(el);
                });
                scene.appendChild(target);

                containerRef.current.appendChild(scene);

                // Video autoplay fallback
                scene.addEventListener('loaded', () => {
                    videoAssets.forEach(v => {
                        const el = document.getElementById(`vid-${v.id}`) as HTMLVideoElement | null;
                        if (el) el.play().catch(() => {
                            const play = () => { el.play(); document.removeEventListener('touchstart', play); };
                            document.addEventListener('touchstart', play, { once: true });
                        });
                    });
                });

                // ====== MODE 2: MARKERLESS → Build GLB → Upload → model-viewer with AR ======
            } else {
                setArMode('model-viewer');
                setStatus('loading-scripts');
                setStatusText('Cargando visor AR...');
                await loadScript('https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer.min.js', 'module');

                // Build the entire scene into a GLB
                setStatus('building-glb');
                setStatusText('Construyendo escena 3D...');
                let glbHttpUrl: string;
                try {
                    const glbData = await buildSceneToGLB(sceneData, contentNodes);
                    // Upload GLB to Supabase Storage to get real HTTP URL
                    // Scene Viewer (Android) and Quick Look (iOS) are EXTERNAL APPS
                    // that need to DOWNLOAD the GLB via HTTP — blob: URLs don't work
                    setStatusText('Preparando experiencia AR...');
                    glbHttpUrl = await uploadGLBToSupabase(glbData, id!);
                } catch (e) {
                    console.error('GLB export/upload failed:', e);
                    setStatus('error');
                    setErrorMsg('Error al preparar la escena AR. Intenta de nuevo.');
                    return;
                }

                // Create <model-viewer> with REAL HTTP URL → AR button works!
                const mv = document.createElement('model-viewer') as any;
                mv.setAttribute('src', glbHttpUrl);
                mv.setAttribute('ar', '');
                mv.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
                mv.setAttribute('ar-scale', 'auto');
                mv.setAttribute('camera-controls', '');
                mv.setAttribute('touch-action', 'pan-y');
                mv.setAttribute('auto-rotate', '');
                mv.setAttribute('shadow-intensity', '1.2');
                mv.setAttribute('shadow-softness', '0.8');
                mv.setAttribute('environment-image', 'neutral');
                mv.setAttribute('exposure', '1');
                mv.setAttribute('alt', projectName);
                mv.setAttribute('interaction-prompt', 'auto');
                mv.setAttribute('camera-orbit', '45deg 55deg auto');

                mv.style.cssText = `
                    width: 100vw; height: 100vh;
                    position: fixed; top: 0; left: 0;
                    background: radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0c 100%);
                    --poster-color: transparent;
                `;

                // AR button
                const arButton = document.createElement('button');
                arButton.slot = 'ar-button';
                arButton.style.cssText = `
                    position: fixed; bottom: 32px; left: 50%; transform: translateX(-50%);
                    z-index: 100; padding: 14px 32px;
                    background: linear-gradient(135deg, #7c3aed, #4f46e5);
                    color: white; border: none; border-radius: 50px;
                    font-size: 16px; font-weight: 700; font-family: -apple-system, BlinkMacSystemFont, sans-serif;
                    cursor: pointer; box-shadow: 0 8px 32px rgba(124,58,237,0.4);
                    display: flex; align-items: center; gap: 10px;
                    letter-spacing: 0.5px;
                `;
                arButton.innerHTML = `
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                    Ver en AR
                `;
                mv.appendChild(arButton);

                // Project info overlay
                const infoOverlay = document.createElement('div');
                infoOverlay.style.cssText = `
                    position: absolute; top: 0; left: 0; right: 0;
                    padding: 20px; z-index: 10;
                    background: linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%);
                    pointer-events: none;
                `;
                infoOverlay.innerHTML = `
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="width: 36px; height: 36px; border-radius: 10px; background: linear-gradient(135deg, #7c3aed, #4f46e5); display: flex; align-items: center; justify-content: center;">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                            </svg>
                        </div>
                        <div>
                            <div style="color: white; font-size: 14px; font-weight: 700; font-family: -apple-system, sans-serif;">${projectName}</div>
                            <div style="color: rgba(255,255,255,0.5); font-size: 11px; font-family: -apple-system, sans-serif;">AR Studio</div>
                        </div>
                    </div>
                `;
                mv.appendChild(infoOverlay);

                // Hint
                const hint = document.createElement('div');
                hint.style.cssText = `
                    position: absolute; bottom: 100px; left: 50%; transform: translateX(-50%);
                    color: rgba(255,255,255,0.4); font-size: 12px;
                    font-family: -apple-system, sans-serif; text-align: center;
                    pointer-events: none;
                `;
                hint.textContent = '↻ Arrastra para rotar · ⇔ Pellizca para zoom';
                mv.appendChild(hint);

                containerRef.current.appendChild(mv);
            }

            // ====== CUSTOM CODE ======
            if (sceneData.customCode?.trim()) {
                const clean = sceneData.customCode.trim();
                const hasReal = clean.split('\n').some(l => { const t = l.trim(); return t.length > 0 && !t.startsWith('//'); });
                if (hasReal) {
                    const s = document.createElement('script');
                    s.textContent = clean;
                    document.body.appendChild(s);
                }
            }

            setStatus('ready');

        } catch (err: any) {
            console.error('Viewer error:', err);
            setStatus('error');
            setErrorMsg(err.message || 'Error desconocido');
        }
    }, [id]);

    useEffect(() => {
        document.body.style.overflow = 'hidden';
        document.body.style.margin = '0';
        buildScene();
        return () => { document.body.style.overflow = ''; document.body.style.margin = ''; };
    }, [buildScene]);

    // ====== RENDER ======
    // CRITICAL: containerRef MUST always be in the DOM so buildScene can inject into it.
    return (
        <>
            <div
                ref={containerRef}
                style={{
                    width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0,
                    background: '#0a0a0c', overflow: 'hidden', zIndex: 0,
                }}
            />

            {status !== 'ready' && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 10,
                    background: '#0a0a0c',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: 'white', padding: 24, textAlign: 'center', boxSizing: 'border-box',
                }}>
                    {status === 'empty' && (
                        <>
                            <div style={{ width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(99,102,241,0.1))', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontSize: 36 }}>💡</div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Proyecto Vacío</h2>
                            <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 340, lineHeight: 1.5 }}>
                                No se encontró contenido. Haz clic en <strong style={{ color: '#d1d5db' }}>"Guardar"</strong> en el Editor.
                            </p>
                        </>
                    )}
                    {status === 'error' && (
                        <>
                            <div style={{ width: 80, height: 80, borderRadius: 20, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontSize: 36 }}>⚠️</div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Error</h2>
                            <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 340 }}>{errorMsg}</p>
                            <button onClick={() => window.location.reload()} style={{ marginTop: 20, padding: '10px 24px', background: '#7c3aed', border: 'none', borderRadius: 8, color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Reintentar</button>
                        </>
                    )}
                    {(status === 'loading' || status === 'loading-scripts' || status === 'building-glb') && (
                        <>
                            <div style={{ marginBottom: 32 }}>
                                <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(124,58,237,0.3)' }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                    </svg>
                                </div>
                            </div>
                            <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>AR STUDIO</h2>
                            <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>{statusText}</p>
                            {arMode && (
                                <p style={{ color: '#4b5563', fontSize: 10, fontFamily: 'monospace', marginBottom: 16 }}>
                                    {arMode === 'model-viewer' ? '🎯 AR Nativo (Surface Detection + Pinch-to-Zoom)' :
                                        '📷 Image Tracking (MindAR)'}
                                </p>
                            )}
                            <div style={{ width: 180, height: 3, background: '#1f2937', borderRadius: 4, overflow: 'hidden' }}>
                                <div style={{ width: '50%', height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #7c3aed, #4f46e5)', animation: 'arloader 1.2s ease-in-out infinite' }} />
                            </div>
                            <style>{`@keyframes arloader { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
                        </>
                    )}
                </div>
            )}
        </>
    );
}
