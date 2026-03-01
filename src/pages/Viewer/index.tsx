import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

/**
 * AR VIEWER — Immediate AR Experience
 * 
 * Scan QR → Camera opens INSTANTLY → 3D objects appear in AR.
 * No buttons, no 3D viewers. Direct AR.
 * 
 * MODES:
 * 1. IMAGE TRACKING: MindAR + A-Frame (detect image → overlay 3D)
 * 2. MARKERLESS AR:  A-Frame + Camera passthrough (objects placed in front of camera)
 *    - Chrome Android: WebXR immersive-ar with hit-test if available
 *    - All devices: Camera feed background + A-Frame transparent overlay
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
function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
        const s = document.createElement('script');
        s.src = src; s.crossOrigin = 'anonymous';
        s.onload = () => resolve();
        s.onerror = () => reject(new Error(`Failed to load: ${src}`));
        document.head.appendChild(s);
    });
}

// ====== Conversion helpers ======
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
    const [status, setStatus] = useState<'loading' | 'empty' | 'loading-scripts' | 'ready' | 'error'>('loading');
    const [statusText, setStatusText] = useState('Conectando...');
    const [errorMsg, setErrorMsg] = useState('');

    const buildScene = useCallback(async () => {
        if (!id) { setStatus('error'); setErrorMsg('No se proporcionó un ID de proyecto.'); return; }

        try {
            // ====== 1. FETCH DATA ======
            setStatusText('Cargando experiencia AR...');
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

            const hasTargets = nodes.some(n => n.type === 'image-target');
            const targetNodes = nodes.filter(n => n.type === 'image-target');
            const contentNodes = nodes.filter(n => n.type !== 'image-target');
            const videoAssets = Object.values(sceneData.assets).filter(a => a.type === 'video');

            // ====== 2. LOAD A-FRAME ======
            setStatus('loading-scripts');
            setStatusText('Cargando motor AR...');
            await loadScript('https://aframe.io/releases/1.4.2/aframe.min.js');

            if (hasTargets) {
                setStatusText('Cargando rastreador...');
                await loadScript('https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-aframe.prod.js');
            }

            await new Promise(r => setTimeout(r, 300));

            if (sceneInjected.current || !containerRef.current) return;
            sceneInjected.current = true;
            containerRef.current.innerHTML = '';

            // ====== Entity Builder ======
            const buildEntity = (node: SceneNode): HTMLElement => {
                const el = document.createElement('a-entity');
                el.id = node.id;
                el.setAttribute('position', vec3(node.position));
                el.setAttribute('rotation', toDeg(node.rotation));
                el.setAttribute('scale', vec3(node.scale));
                const p = node.properties || {};

                switch (node.type) {
                    case 'box':
                        el.setAttribute('geometry', 'primitive: box');
                        el.setAttribute('material', `color: ${p.color || '#7a8bcc'}; roughness: 0.5; metalness: 0.1`);
                        break;
                    case 'plane':
                        el.setAttribute('geometry', 'primitive: plane; width: 1; height: 1');
                        if (node.assetId && sceneData.assets[node.assetId]) {
                            const a = sceneData.assets[node.assetId];
                            el.setAttribute('material', a.type === 'video'
                                ? `src: #vid-${a.id}; side: double; shader: flat`
                                : `src: url(${a.url}); side: double; shader: flat`);
                        } else {
                            el.setAttribute('material', `color: ${p.color || '#7a8bcc'}; side: double`);
                        }
                        break;
                    case 'light': {
                        const lt = p.lightType || 'point';
                        let s = `type: ${lt}; color: ${p.color || '#fff'}; intensity: ${p.intensity ?? 1}`;
                        if (lt === 'point' || lt === 'spot') s += `; distance: ${p.distance ?? 10}`;
                        if (lt === 'spot') s += `; angle: ${((p.angle ?? Math.PI / 4) * 180 / Math.PI).toFixed(1)}; penumbra: 0.5`;
                        el.setAttribute('light', s);
                        break;
                    }
                    case 'gltf-model':
                        if (node.assetId && sceneData.assets[node.assetId])
                            el.setAttribute('gltf-model', `url(${sceneData.assets[node.assetId].url})`);
                        break;
                }
                return el;
            };

            // ====== Build A-Frame <a-assets> for videos ======
            const buildVideoAssets = (scene: HTMLElement) => {
                if (videoAssets.length === 0) return;
                const assetsEl = document.createElement('a-assets');
                videoAssets.forEach(v => {
                    const video = document.createElement('video');
                    video.id = `vid-${v.id}`; video.src = v.url;
                    for (const attr of ['autoplay', 'loop', 'muted', 'playsinline', 'webkit-playsinline'])
                        video.setAttribute(attr, '');
                    video.setAttribute('crossorigin', 'anonymous'); video.muted = true;
                    assetsEl.appendChild(video);
                });
                scene.appendChild(assetsEl);
            };

            // ===================================================================
            //         MODE 1: IMAGE TRACKING (MindAR + A-Frame)
            // ===================================================================
            if (hasTargets) {
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

                buildVideoAssets(scene);

                const cam = document.createElement('a-camera');
                cam.setAttribute('position', '0 0 0');
                cam.setAttribute('look-controls', 'enabled: false');
                scene.appendChild(cam);

                const target = document.createElement('a-entity');
                target.setAttribute('mindar-image-target', 'targetIndex: 0');
                contentNodes.forEach(n => target.appendChild(buildEntity(n)));
                scene.appendChild(target);

                containerRef.current.appendChild(scene);

                scene.addEventListener('loaded', () => {
                    videoAssets.forEach(v => {
                        const el = document.getElementById(`vid-${v.id}`) as HTMLVideoElement | null;
                        if (el) el.play().catch(() => {
                            document.addEventListener('touchstart', () => el.play(), { once: true });
                        });
                    });
                });

                // ===================================================================
                //         MODE 2: MARKERLESS AR — IMMEDIATE CAMERA + 3D
                //         Camera opens instantly, objects appear in AR
                // ===================================================================
            } else {
                // Step 1: Start camera IMMEDIATELY
                setStatusText('Abriendo cámara...');
                let stream: MediaStream | null = null;
                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                        audio: false
                    });
                } catch {
                    console.warn('Camera access denied');
                }

                if (stream) {
                    // Camera background video
                    const videoBg = document.createElement('video');
                    videoBg.srcObject = stream;
                    videoBg.muted = true;
                    videoBg.autoplay = true;
                    videoBg.setAttribute('playsinline', '');
                    videoBg.setAttribute('webkit-playsinline', '');
                    videoBg.style.cssText = `
                        position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                        object-fit: cover; z-index: 0; pointer-events: none;
                    `;
                    containerRef.current.appendChild(videoBg);
                    await videoBg.play();
                }

                // Step 2: Create transparent A-Frame scene on top of camera
                const scene = document.createElement('a-scene');
                scene.setAttribute('vr-mode-ui', 'enabled: false');
                scene.setAttribute('loading-screen', 'enabled: false');
                scene.setAttribute('renderer', 'colorManagement: true; antialias: true; alpha: true');
                scene.style.cssText = `
                    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
                    z-index: 1; background: transparent;
                `;

                buildVideoAssets(scene);

                // Camera with gyroscope look-controls
                const cam = document.createElement('a-camera');
                cam.setAttribute('position', '0 1.6 0');
                cam.setAttribute('look-controls', 'enabled: true; magicWindowTrackingEnabled: true');
                cam.setAttribute('wasd-controls', 'enabled: false');
                scene.appendChild(cam);

                // Lighting
                const dl = document.createElement('a-light');
                dl.setAttribute('type', 'directional');
                dl.setAttribute('intensity', '0.8');
                dl.setAttribute('position', '1 4 2');
                scene.appendChild(dl);
                const al = document.createElement('a-light');
                al.setAttribute('type', 'ambient');
                al.setAttribute('intensity', '0.6');
                scene.appendChild(al);

                // Place objects on a "floor" at y=0, in front of camera
                // Camera is at y=1.6, so objects at y=0 are on the ground
                contentNodes.forEach(n => scene.appendChild(buildEntity(n)));

                containerRef.current.appendChild(scene);

                // Video autoplay
                scene.addEventListener('loaded', () => {
                    videoAssets.forEach(v => {
                        const el = document.getElementById(`vid-${v.id}`) as HTMLVideoElement | null;
                        if (el) el.play().catch(() => {
                            document.addEventListener('touchstart', () => el.play(), { once: true });
                        });
                    });
                });
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
        document.body.style.background = '#000';
        buildScene();
        return () => {
            document.body.style.overflow = '';
            document.body.style.margin = '';
            document.body.style.background = '';
        };
    }, [buildScene]);

    // ====== RENDER ======
    return (
        <>
            <div
                ref={containerRef}
                style={{
                    width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0,
                    background: '#000', overflow: 'hidden', zIndex: 0,
                }}
            />

            {status !== 'ready' && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 10,
                    background: '#000',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                    color: 'white', padding: 24, textAlign: 'center', boxSizing: 'border-box',
                }}>
                    {status === 'empty' && (
                        <>
                            <div style={{ width: 80, height: 80, borderRadius: 20, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontSize: 36 }}>💡</div>
                            <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Proyecto Vacío</h2>
                            <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 340, lineHeight: 1.5 }}>
                                No hay contenido. Abrí el Editor y guardá la escena.
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
                    {(status === 'loading' || status === 'loading-scripts') && (
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
