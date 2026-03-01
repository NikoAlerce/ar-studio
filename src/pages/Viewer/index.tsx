import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

/**
 * AR VIEWER — Hybrid SLAM Viewer
 * 
 * 3-Tier AR Strategy:
 * Tier 1: WebXR Hit-Test      (Chrome Android — native surface detection)
 * Tier 2: AlvaAR Visual SLAM  (iOS Safari + others — WASM-based ORB-SLAM2)
 * Tier 3: Gyroscope + Camera  (Universal fallback — overlay without anchoring)
 * 
 * For image tracking, MindAR is used regardless of tier.
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

// ====== SLAM Tier detection ======
async function detectSlamTier(): Promise<'webxr' | 'alva' | 'gyro'> {
    // Tier 1: WebXR AR with hit-test
    if ('xr' in navigator) {
        try {
            const xr = navigator as any;
            const supported = await xr.xr.isSessionSupported('immersive-ar');
            if (supported) return 'webxr';
        } catch { /* fallthrough */ }
    }
    // Tier 2: AlvaAR (WASM visual SLAM) — supported if WebAssembly available
    if (typeof WebAssembly !== 'undefined') {
        return 'alva';
    }
    // Tier 3: Gyroscope fallback
    return 'gyro';
}

// ====== MAIN VIEWER COMPONENT ======
export default function Viewer() {
    const { id } = useParams();
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneInjected = useRef(false);
    const [status, setStatus] = useState<'loading' | 'empty' | 'loading-scripts' | 'scanning' | 'ready' | 'error'>('loading');
    const [statusText, setStatusText] = useState('Conectando con el servidor...');
    const [errorMsg, setErrorMsg] = useState('');
    const [slamTier, setSlamTier] = useState<string>('');

    const buildScene = useCallback(async () => {
        if (!id) { setStatus('error'); setErrorMsg('No se proporcionó un ID de proyecto.'); return; }

        try {
            // ====== 1. FETCH DATA ======
            setStatusText('Cargando escena...');
            const { data, error } = await supabase
                .from('projects').select('scene_data').eq('id', id).single();

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

            // ====== 3. LOAD SCRIPTS ======
            setStatus('loading-scripts');
            setStatusText('Cargando motor 3D...');
            await loadScript('https://aframe.io/releases/1.4.2/aframe.min.js');

            if (hasTargets) {
                setStatusText('Cargando rastreador de imágenes...');
                await loadScript('https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-aframe.prod.js');
            }

            // Detect SLAM tier for markerless
            let tier: 'webxr' | 'alva' | 'gyro' = 'gyro';
            if (!hasTargets) {
                tier = await detectSlamTier();
                setSlamTier(tier);
            }

            await new Promise(r => setTimeout(r, 200));

            // ====== 4. BUILD SCENE ======
            if (sceneInjected.current || !containerRef.current) return;
            sceneInjected.current = true;
            containerRef.current.innerHTML = '';

            const scene = document.createElement('a-scene');
            scene.setAttribute('vr-mode-ui', 'enabled: false');
            scene.setAttribute('loading-screen', 'enabled: false');

            // ----- Entity builder -----
            const buildEntity = (node: SceneNode): HTMLElement => {
                const el = document.createElement('a-entity');
                el.id = node.id;
                el.setAttribute('position', vec3(node.position));
                el.setAttribute('rotation', toDeg(node.rotation));
                el.setAttribute('scale', vec3(node.scale));
                const props = node.properties || {};

                switch (node.type) {
                    case 'box': {
                        el.setAttribute('geometry', 'primitive: box');
                        el.setAttribute('material', `color: ${props.color || '#7a8bcc'}; roughness: 0.5; metalness: 0.1`);
                        break;
                    }
                    case 'plane': {
                        if (node.assetId && sceneData.assets[node.assetId]) {
                            const asset = sceneData.assets[node.assetId];
                            el.setAttribute('geometry', 'primitive: plane; width: 1; height: 1');
                            el.setAttribute('material', asset.type === 'video'
                                ? `src: #vid-${asset.id}; side: double; shader: flat`
                                : `src: url(${asset.url}); side: double; shader: flat`
                            );
                        } else {
                            el.setAttribute('geometry', 'primitive: plane; width: 1; height: 1');
                            el.setAttribute('material', `color: ${props.color || '#7a8bcc'}; side: double`);
                        }
                        break;
                    }
                    case 'light': {
                        const lt = props.lightType || 'point';
                        let s = `type: ${lt}; color: ${props.color || '#fff'}; intensity: ${props.intensity ?? 1}`;
                        if (lt === 'point' || lt === 'spot') s += `; distance: ${props.distance ?? 10}`;
                        if (lt === 'spot') s += `; angle: ${((props.angle ?? Math.PI / 4) * 180 / Math.PI).toFixed(1)}; penumbra: 0.5`;
                        el.setAttribute('light', s);
                        break;
                    }
                    case 'gltf-model': {
                        if (node.assetId && sceneData.assets[node.assetId])
                            el.setAttribute('gltf-model', `url(${sceneData.assets[node.assetId].url})`);
                        break;
                    }
                }
                return el;
            };

            // ----- Video assets -----
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

            // ====== 5. MODE-SPECIFIC SETUP ======

            if (hasTargets) {
                // =========== IMAGE TRACKING (MindAR) ===========
                scene.setAttribute('renderer', 'colorManagement: true; antialias: true;');
                const primary = targetNodes.find(n => n.assetId && sceneData.assets[n.assetId!]);
                if (primary?.assetId) {
                    scene.setAttribute('mindar-image',
                        `imageTargetSrc: ${sceneData.assets[primary.assetId].url}; autoStart: true; uiLoading: no; uiScanning: no; uiError: no;`
                    );
                    scene.setAttribute('color-space', 'sRGB');
                }
                const cam = document.createElement('a-camera');
                cam.setAttribute('position', '0 0 0');
                cam.setAttribute('look-controls', 'enabled: false');
                scene.appendChild(cam);

                const target = document.createElement('a-entity');
                target.setAttribute('mindar-image-target', 'targetIndex: 0');
                contentNodes.forEach(n => target.appendChild(buildEntity(n)));
                scene.appendChild(target);

            } else if (tier === 'webxr') {
                // =========== TIER 1: WebXR Surface Detection ===========
                setStatusText('Iniciando AR con detección de superficie...');
                scene.setAttribute('renderer', 'colorManagement: true; antialias: true; alpha: true');
                scene.setAttribute('webxr', 'requiredFeatures: hit-test, local-floor; optionalFeatures: dom-overlay; overlayElement: #ar-overlay');

                // Register hit-test reticle component
                const hitTestScript = document.createElement('script');
                hitTestScript.textContent = `
                    AFRAME.registerComponent('ar-hit-test-custom', {
                        init: function() {
                            this.xrHitTestSource = null;
                            this.placed = false;
                            this.el.sceneEl.renderer.xr.addEventListener('sessionstart', async () => {
                                const session = this.el.sceneEl.renderer.xr.getSession();
                                const viewerSpace = await session.requestReferenceSpace('viewer');
                                session.requestHitTestSource({space: viewerSpace}).then(source => {
                                    this.xrHitTestSource = source;
                                });
                            });
                        },
                        tick: function() {
                            if (this.placed || !this.xrHitTestSource) return;
                            const frame = this.el.sceneEl.frame;
                            if (!frame) return;
                            const results = frame.getHitTestResults(this.xrHitTestSource);
                            if (results.length > 0) {
                                const refSpace = this.el.sceneEl.renderer.xr.getReferenceSpace();
                                const pose = results[0].getPose(refSpace);
                                if (pose) {
                                    const p = pose.transform.position;
                                    this.el.object3D.position.set(p.x, p.y, p.z);
                                    this.el.object3D.visible = true;
                                }
                            }
                        }
                    });

                    AFRAME.registerComponent('ar-place-on-tap', {
                        init: function() {
                            const container = this.el;
                            const reticle = document.getElementById('ar-reticle');
                            this.el.sceneEl.addEventListener('click', () => {
                                if (reticle && reticle.object3D.visible) {
                                    container.object3D.position.copy(reticle.object3D.position);
                                    container.object3D.visible = true;
                                    reticle.object3D.visible = false;
                                    if (reticle.components['ar-hit-test-custom']) {
                                        reticle.components['ar-hit-test-custom'].placed = true;
                                    }
                                }
                            });
                        }
                    });
                `;
                document.head.appendChild(hitTestScript);

                const cam = document.createElement('a-camera');
                cam.setAttribute('position', '0 0 0');
                scene.appendChild(cam);

                // Reticle (white ring that follows surfaces)
                const reticle = document.createElement('a-entity');
                reticle.id = 'ar-reticle';
                reticle.setAttribute('ar-hit-test-custom', '');
                reticle.setAttribute('visible', 'false');
                reticle.setAttribute('geometry', 'primitive: ring; radiusInner: 0.08; radiusOuter: 0.12');
                reticle.setAttribute('material', 'color: white; shader: flat; opacity: 0.7');
                reticle.setAttribute('rotation', '-90 0 0');
                scene.appendChild(reticle);

                // Content container (hidden until placed)
                const contentContainer = document.createElement('a-entity');
                contentContainer.id = 'ar-content';
                contentContainer.setAttribute('ar-place-on-tap', '');
                contentContainer.setAttribute('visible', 'false');
                contentNodes.forEach(n => contentContainer.appendChild(buildEntity(n)));
                scene.appendChild(contentContainer);

                // Light
                const light = document.createElement('a-light');
                light.setAttribute('type', 'ambient'); light.setAttribute('intensity', '0.8');
                scene.appendChild(light);

            } else if (tier === 'alva') {
                // =========== TIER 2: AlvaAR Visual SLAM ===========
                setStatusText('Cargando motor SLAM...');
                scene.setAttribute('renderer', 'colorManagement: true; antialias: true; alpha: true');
                scene.style.background = 'transparent';

                // Get camera stream
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: { ideal: 'environment' }, width: { ideal: 640 }, height: { ideal: 480 } },
                    audio: false
                });

                // Camera video background
                const videoBg = document.createElement('video');
                videoBg.srcObject = stream; videoBg.muted = true; videoBg.autoplay = true;
                videoBg.setAttribute('playsinline', ''); videoBg.setAttribute('webkit-playsinline', '');
                videoBg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;z-index:0;pointer-events:none;';
                containerRef.current.appendChild(videoBg);
                await videoBg.play();

                scene.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:1;background:transparent;';

                // Setup hidden canvas for AlvaAR processing
                const processCanvas = document.createElement('canvas');
                const VW = 320; const VH = 240; // Low res for fast SLAM processing
                processCanvas.width = VW; processCanvas.height = VH;
                const ctx = processCanvas.getContext('2d', { willReadFrequently: true })!;

                // Load AlvaAR from CDN
                setStatusText('Cargando SLAM visual...');
                try {
                    await loadScript('https://cdn.jsdelivr.net/gh/nicolo-ribaudo/AliucordRN@main/dist/alva_ar.js');
                } catch {
                    // AlvaAR CDN load failed — try alternative or fall back to gyro-only
                    console.warn('AlvaAR CDN not available, falling back to gyro mode');
                    // Enable gyroscope-based look around
                    const cam = document.createElement('a-camera');
                    cam.setAttribute('position', '0 1.6 0');
                    cam.setAttribute('look-controls', 'enabled: true');
                    scene.appendChild(cam);
                    contentNodes.forEach(n => scene.appendChild(buildEntity(n)));
                    containerRef.current.appendChild(scene);
                    setStatus('ready');
                    return;
                }

                // Initialize AlvaAR
                const AlvaAR = (window as any).AlvaAR;
                if (!AlvaAR) {
                    // If AlvaAR didn't load properly, use gyroscope fallback
                    const cam = document.createElement('a-camera');
                    cam.setAttribute('position', '0 1.6 0');
                    cam.setAttribute('look-controls', 'enabled: true');
                    scene.appendChild(cam);
                    contentNodes.forEach(n => scene.appendChild(buildEntity(n)));
                    containerRef.current.appendChild(scene);
                    setStatus('ready');
                    return;
                }

                const alva = await AlvaAR.Initialize(VW, VH);

                // Camera without look-controls (SLAM controls it)
                const cam = document.createElement('a-camera');
                cam.setAttribute('position', '0 1.6 0');
                cam.setAttribute('look-controls', 'enabled: false');
                scene.appendChild(cam);

                // Content container — placed at origin, SLAM moves the camera
                const contentContainer = document.createElement('a-entity');
                contentContainer.id = 'slam-content';
                contentContainer.setAttribute('visible', 'false'); // Hidden until plane detected
                contentNodes.forEach(n => contentContainer.appendChild(buildEntity(n)));
                scene.appendChild(contentContainer);

                // Light
                const dirLight = document.createElement('a-light');
                dirLight.setAttribute('type', 'directional'); dirLight.setAttribute('intensity', '0.6');
                dirLight.setAttribute('position', '1 4 2');
                scene.appendChild(dirLight);
                const ambLight = document.createElement('a-light');
                ambLight.setAttribute('type', 'ambient'); ambLight.setAttribute('intensity', '0.5');
                scene.appendChild(ambLight);

                // Scanning UI overlay
                setStatus('scanning');
                setStatusText('Mueve el celular lentamente para escanear el entorno...');

                // SLAM processing loop
                let planeDetected = false;
                const slamLoop = () => {
                    if (!videoBg.videoWidth) { requestAnimationFrame(slamLoop); return; }

                    ctx.drawImage(videoBg, 0, 0, VW, VH);
                    const frame = ctx.getImageData(0, 0, VW, VH);
                    const cameraPose = alva.findCameraPose(frame);

                    if (cameraPose) {
                        // Apply camera pose to A-Frame camera
                        const aframeCam = scene.querySelector('a-camera');
                        if (aframeCam) {
                            // cameraPose is a 4x4 matrix [R|t]
                            const r = cameraPose.rotation;
                            const t = cameraPose.translation;
                            if (r && t) {
                                aframeCam.object3D.position.set(t.x, t.y + 1.6, t.z);
                                aframeCam.object3D.quaternion.set(r.x, r.y, r.z, r.w);
                            }
                        }

                        // Try to detect a plane
                        if (!planeDetected) {
                            const planePose = alva.findPlane();
                            if (planePose) {
                                planeDetected = true;
                                const content = document.getElementById('slam-content');
                                if (content) {
                                    content.setAttribute('visible', 'true');
                                    // Place content at detected plane position
                                    const pt = planePose.translation;
                                    if (pt) {
                                        content.setAttribute('position', `${pt.x} ${pt.y} ${pt.z}`);
                                    }
                                }
                                setStatus('ready');
                            }
                        }
                    }
                    requestAnimationFrame(slamLoop);
                };

                // Start SLAM after scene is appended
                setTimeout(() => requestAnimationFrame(slamLoop), 500);

            } else {
                // =========== TIER 3: Gyroscope + Camera Fallback ===========
                setStatusText('Iniciando cámara...');
                scene.setAttribute('renderer', 'colorManagement: true; antialias: true; alpha: true');
                scene.style.background = 'transparent';

                try {
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                        audio: false
                    });
                    const videoBg = document.createElement('video');
                    videoBg.srcObject = stream; videoBg.muted = true; videoBg.autoplay = true;
                    videoBg.setAttribute('playsinline', ''); videoBg.setAttribute('webkit-playsinline', '');
                    videoBg.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;object-fit:cover;z-index:0;pointer-events:none;';
                    containerRef.current.appendChild(videoBg);
                    await videoBg.play();
                    scene.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:1;background:transparent;';
                } catch {
                    const sky = document.createElement('a-sky');
                    sky.setAttribute('color', '#b8cfe8');
                    scene.appendChild(sky);
                }

                const cam = document.createElement('a-camera');
                cam.setAttribute('position', '0 1.6 0');
                cam.setAttribute('look-controls', 'enabled: true');
                scene.appendChild(cam);

                const dirLight = document.createElement('a-light');
                dirLight.setAttribute('type', 'directional'); dirLight.setAttribute('intensity', '0.6'); dirLight.setAttribute('position', '1 4 2');
                scene.appendChild(dirLight);
                const ambLight = document.createElement('a-light');
                ambLight.setAttribute('type', 'ambient'); ambLight.setAttribute('intensity', '0.5');
                scene.appendChild(ambLight);

                contentNodes.forEach(n => scene.appendChild(buildEntity(n)));
            }

            // ====== 6. INJECT SCENE ======
            containerRef.current.appendChild(scene);

            // ====== 7. CUSTOM CODE ======
            if (sceneData.customCode?.trim()) {
                const clean = sceneData.customCode.trim();
                const hasRealCode = clean.split('\n').some(l => {
                    const t = l.trim();
                    return t.length > 0 && !t.startsWith('//');
                });
                if (hasRealCode) {
                    const s = document.createElement('script');
                    s.textContent = clean;
                    document.body.appendChild(s);
                }
            }

            // ====== 8. VIDEO AUTOPLAY MOBILE ======
            scene.addEventListener('loaded', () => {
                videoAssets.forEach(v => {
                    const el = document.getElementById(`vid-${v.id}`) as HTMLVideoElement | null;
                    if (el) {
                        el.play().catch(() => {
                            const play = () => { el.play(); document.removeEventListener('touchstart', play); document.removeEventListener('click', play); };
                            document.addEventListener('touchstart', play, { once: true });
                            document.addEventListener('click', play, { once: true });
                        });
                    }
                });
            });

            if (status !== 'scanning') setStatus('ready');

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
    const baseStyle: React.CSSProperties = {
        width: '100vw', height: '100vh', background: '#0a0a0c',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: 'white', padding: 24, textAlign: 'center', boxSizing: 'border-box',
    };

    if (status === 'scanning') {
        // SLAM scanning overlay — show while AlvaAR processes the environment
        return (
            <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, background: 'black' }}>
                <div style={{
                    position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
                    zIndex: 100, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)',
                    padding: '16px 28px', borderRadius: 16, border: '1px solid rgba(255,255,255,0.1)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                }}>
                    <div style={{
                        width: 32, height: 32, border: '3px solid #7c3aed', borderTopColor: 'transparent',
                        borderRadius: '50%', animation: 'spin 0.8s linear infinite'
                    }} />
                    <p style={{ color: 'white', fontSize: 14, fontWeight: 600, margin: 0 }}>Escaneando entorno...</p>
                    <p style={{ color: '#9ca3af', fontSize: 12, margin: 0 }}>Mueve el celular lentamente</p>
                    <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
            </div>
        );
    }

    if (status !== 'ready') {
        return (
            <div style={baseStyle}>
                {status === 'empty' && (
                    <>
                        <div style={{ width: 80, height: 80, borderRadius: 20, background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(99,102,241,0.1))', border: '1px solid rgba(139,92,246,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontSize: 36 }}>💡</div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Proyecto Vacío</h2>
                        <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 340, lineHeight: 1.5 }}>
                            No se encontró contenido. Haz clic en <strong style={{ color: '#d1d5db' }}>"Guardar"</strong> en el Editor antes de escanear el QR.
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
                        <div style={{ position: 'relative', marginBottom: 32 }}>
                            <div style={{ width: 64, height: 64, borderRadius: 16, background: 'linear-gradient(135deg, #7c3aed, #4f46e5)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 40px rgba(124,58,237,0.3)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                </svg>
                            </div>
                        </div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>AR STUDIO</h2>
                        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>{statusText}</p>
                        {slamTier && <p style={{ color: '#4b5563', fontSize: 10, fontFamily: 'monospace' }}>Engine: {slamTier === 'webxr' ? 'WebXR Native' : slamTier === 'alva' ? 'AlvaAR SLAM' : 'Camera Overlay'}</p>}
                        <div style={{ width: 180, height: 3, background: '#1f2937', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{ width: '50%', height: '100%', borderRadius: 4, background: 'linear-gradient(90deg, #7c3aed, #4f46e5)', animation: 'arloader 1.2s ease-in-out infinite' }} />
                        </div>
                        <style>{`@keyframes arloader { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
                    </>
                )}
            </div>
        );
    }

    return (
        <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, background: 'black', overflow: 'hidden' }} />
    );
}
