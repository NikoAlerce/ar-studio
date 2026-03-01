import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

/**
 * AR VIEWER — Experiencia final que ve el usuario al escanear el QR
 * 
 * Filosofía: Este componente debe funcionar como una página standalone.
 * 1. Carga datos de Supabase UNA sola vez (no usa reactive Zustand)
 * 2. Inyecta A-Frame y MindAR via script tags reales
 * 3. Construye la escena imperativamente (no via dangerouslySetInnerHTML)
 * 4. Nunca re-renderiza después de la inyección del AR
 */

interface Transform {
    x: number; y: number; z: number;
}

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

// ------ Loading external scripts properly ------
function loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (document.querySelector(`script[src="${src}"]`)) {
            resolve();
            return;
        }
        const script = document.createElement('script');
        script.src = src;
        script.crossOrigin = 'anonymous';
        script.onload = () => resolve();
        script.onerror = () => reject(new Error(`Failed to load: ${src}`));
        document.head.appendChild(script);
    });
}

// ------ Conversion helpers ------
const vec3 = (t: Transform) => `${t.x.toFixed(4)} ${t.y.toFixed(4)} ${t.z.toFixed(4)}`;
const toDeg = (t: Transform) => {
    const d = (r: number) => (r * 180) / Math.PI;
    return `${d(t.x).toFixed(2)} ${d(t.y).toFixed(2)} ${d(t.z).toFixed(2)}`;
};

// ====== MAIN VIEWER COMPONENT ======
export default function Viewer() {
    const { id } = useParams();
    const containerRef = useRef<HTMLDivElement>(null);
    const sceneInjected = useRef(false);

    const [status, setStatus] = useState<'loading' | 'empty' | 'loading-scripts' | 'ready' | 'error'>('loading');
    const [statusText, setStatusText] = useState('Conectando con el servidor...');
    const [errorMsg, setErrorMsg] = useState('');

    // ===== STEP 1: Fetch scene data from Supabase (NO Zustand, direct fetch) =====
    const buildScene = useCallback(async () => {
        if (!id) {
            setStatus('error');
            setErrorMsg('No se proporcionó un ID de proyecto.');
            return;
        }

        try {
            // 1. Fetch project
            setStatusText('Cargando escena...');
            const { data, error } = await supabase
                .from('projects')
                .select('scene_data')
                .eq('id', id)
                .single();

            if (error || !data?.scene_data) {
                setStatus('empty');
                return;
            }

            // Parse scene data (handle legacy format)
            let sceneData: SceneData;
            const raw = data.scene_data as any;
            if (raw.entities && !raw.sceneNodes) {
                sceneData = { assets: {}, sceneNodes: raw.entities, customCode: '' };
            } else {
                sceneData = {
                    assets: raw.assets || {},
                    sceneNodes: raw.sceneNodes || {},
                    customCode: raw.customCode || ''
                };
            }

            const nodes = Object.values(sceneData.sceneNodes);
            if (nodes.length === 0) {
                setStatus('empty');
                return;
            }

            // 2. Determine AR mode
            const hasTargets = nodes.some(n => n.type === 'image-target');
            const targetNodes = nodes.filter(n => n.type === 'image-target');
            const contentNodes = nodes.filter(n => n.type !== 'image-target');

            // 3. Load scripts
            setStatus('loading-scripts');
            setStatusText('Cargando motor 3D...');
            await loadScript('https://aframe.io/releases/1.4.2/aframe.min.js');

            if (hasTargets) {
                setStatusText('Cargando rastreador de imágenes...');
                await loadScript('https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-aframe.prod.js');
            }

            // 4. Small delay to let A-Frame initialize its custom elements
            await new Promise(r => setTimeout(r, 200));

            // 5. Build and inject the scene imperatively (NOT via innerHTML)
            if (sceneInjected.current || !containerRef.current) return;
            sceneInjected.current = true;

            setStatusText('Iniciando experiencia AR...');

            // Clear the container
            containerRef.current.innerHTML = '';

            // Build <a-scene>
            const scene = document.createElement('a-scene');
            scene.setAttribute('vr-mode-ui', 'enabled: false');
            scene.setAttribute('renderer', 'colorManagement: true; antialias: true;');
            scene.setAttribute('loading-screen', 'enabled: false');

            if (hasTargets && targetNodes.length > 0) {
                // Find the first target node that has an assigned .mind asset
                const primaryTarget = targetNodes.find(n => n.assetId && sceneData.assets[n.assetId]);
                if (primaryTarget && primaryTarget.assetId) {
                    const targetAsset = sceneData.assets[primaryTarget.assetId];
                    scene.setAttribute('mindar-image',
                        `imageTargetSrc: ${targetAsset.url}; autoStart: true; uiLoading: no; uiScanning: no; uiError: no;`
                    );
                    scene.setAttribute('color-space', 'sRGB');
                }
            }

            // <a-assets> for videos
            const videoAssets = Object.values(sceneData.assets).filter(a => a.type === 'video');
            if (videoAssets.length > 0) {
                const assetsEl = document.createElement('a-assets');
                videoAssets.forEach(v => {
                    const video = document.createElement('video');
                    video.id = `vid-${v.id}`;
                    video.src = v.url;
                    video.setAttribute('autoplay', '');
                    video.setAttribute('loop', '');
                    video.setAttribute('muted', '');
                    video.setAttribute('crossorigin', 'anonymous');
                    video.setAttribute('playsinline', '');
                    video.setAttribute('webkit-playsinline', '');
                    assetsEl.appendChild(video);
                });
                scene.appendChild(assetsEl);
            }

            // Camera
            const camera = document.createElement('a-camera');
            camera.setAttribute('position', '0 0 0');
            camera.setAttribute('look-controls', 'enabled: false');
            scene.appendChild(camera);

            // Default lighting (subtle, don't overpower user lights)
            const dirLight = document.createElement('a-light');
            dirLight.setAttribute('type', 'directional');
            dirLight.setAttribute('intensity', '0.6');
            dirLight.setAttribute('position', '1 4 2');
            scene.appendChild(dirLight);

            const ambLight = document.createElement('a-light');
            ambLight.setAttribute('type', 'ambient');
            ambLight.setAttribute('intensity', '0.5');
            scene.appendChild(ambLight);

            // ===== BUILD CONTENT ENTITIES =====
            const buildEntity = (node: SceneNode): HTMLElement => {
                const el = document.createElement('a-entity');
                el.id = node.id;
                el.setAttribute('position', vec3(node.position));
                el.setAttribute('rotation', toDeg(node.rotation));
                el.setAttribute('scale', vec3(node.scale));

                const props = node.properties || {};

                switch (node.type) {
                    case 'box': {
                        const color = props.color || '#7a8bcc';
                        el.setAttribute('geometry', 'primitive: box');
                        el.setAttribute('material', `color: ${color}; roughness: 0.5; metalness: 0.1`);
                        break;
                    }
                    case 'plane': {
                        if (node.assetId && sceneData.assets[node.assetId]) {
                            const asset = sceneData.assets[node.assetId];
                            el.setAttribute('geometry', 'primitive: plane; width: 1; height: 1');
                            if (asset.type === 'video') {
                                el.setAttribute('material', `src: #vid-${asset.id}; side: double; shader: flat`);
                            } else {
                                el.setAttribute('material', `src: url(${asset.url}); side: double; shader: flat`);
                            }
                        } else {
                            const color = props.color || '#7a8bcc';
                            el.setAttribute('geometry', 'primitive: plane; width: 1; height: 1');
                            el.setAttribute('material', `color: ${color}; side: double`);
                        }
                        break;
                    }
                    case 'light': {
                        const lightType = props.lightType || 'point';
                        const color = props.color || '#ffffff';
                        const intensity = props.intensity ?? 1;
                        const distance = props.distance ?? 10;
                        const angle = props.angle ?? Math.PI / 4;
                        const angleDeg = ((angle * 180) / Math.PI).toFixed(1);

                        let lightStr = `type: ${lightType}; color: ${color}; intensity: ${intensity}`;
                        if (lightType === 'point' || lightType === 'spot') lightStr += `; distance: ${distance}`;
                        if (lightType === 'spot') lightStr += `; angle: ${angleDeg}; penumbra: 0.5`;
                        el.setAttribute('light', lightStr);
                        break;
                    }
                    case 'gltf-model': {
                        if (node.assetId && sceneData.assets[node.assetId]) {
                            el.setAttribute('gltf-model', `url(${sceneData.assets[node.assetId].url})`);
                        }
                        break;
                    }
                }
                return el;
            };

            // ===== Inject content into scene =====
            if (hasTargets) {
                // Image Tracking mode: wrap content in mindar-image-target
                const targetContainer = document.createElement('a-entity');
                targetContainer.setAttribute('mindar-image-target', 'targetIndex: 0');
                contentNodes.forEach(n => targetContainer.appendChild(buildEntity(n)));
                scene.appendChild(targetContainer);
            } else {
                // ===== MARKERLESS AR MODE =====
                // The approach: Camera feed as background video + transparent A-Frame overlay
                // This is the same fundamental technique used by 8th Wall.

                // Make A-Frame background transparent so camera shows through
                scene.setAttribute('renderer', 'colorManagement: true; antialias: true; alpha: true;');
                scene.style.background = 'transparent';

                // Request camera access (prefer rear camera for AR)
                try {
                    setStatusText('Solicitando acceso a la cámara...');
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: {
                            facingMode: { ideal: 'environment' },
                            width: { ideal: 1280 },
                            height: { ideal: 720 }
                        },
                        audio: false
                    });

                    // Create fullscreen video background
                    const videoBackground = document.createElement('video');
                    videoBackground.srcObject = stream;
                    videoBackground.setAttribute('playsinline', '');
                    videoBackground.setAttribute('webkit-playsinline', '');
                    videoBackground.setAttribute('muted', '');
                    videoBackground.muted = true;
                    videoBackground.autoplay = true;
                    videoBackground.style.cssText = `
                        position: fixed; top: 0; left: 0;
                        width: 100vw; height: 100vh;
                        object-fit: cover; z-index: 0;
                        pointer-events: none;
                    `;
                    containerRef.current.appendChild(videoBackground);
                    await videoBackground.play();

                    // Style the A-Frame canvas to overlay on top of the camera
                    scene.style.cssText = `
                        position: fixed; top: 0; left: 0;
                        width: 100vw; height: 100vh;
                        z-index: 1; background: transparent;
                    `;

                } catch (camErr) {
                    console.warn('Camera not available, falling back to sky background:', camErr);
                    // Fallback: show objects against a sky (no camera)
                    const sky = document.createElement('a-sky');
                    sky.setAttribute('color', '#b8cfe8');
                    scene.appendChild(sky);
                }

                // Enable look-controls so user can look around with the phone gyroscope
                camera.setAttribute('look-controls', 'enabled: true');

                contentNodes.forEach(n => scene.appendChild(buildEntity(n)));
            }

            // ===== Inject the scene into the DOM =====
            containerRef.current.appendChild(scene);

            // ===== Inject custom code as a REAL script element =====
            if (sceneData.customCode && sceneData.customCode.trim()) {
                // Filter out default/example comments
                const cleanCode = sceneData.customCode.trim();
                if (cleanCode && !cleanCode.startsWith('// AR Studio') || cleanCode.split('\n').some(l => !l.trim().startsWith('//'))) {
                    const codeScript = document.createElement('script');
                    codeScript.textContent = cleanCode;
                    document.body.appendChild(codeScript);
                }
            }

            // ===== Handle video autoplay on mobile =====
            // Mobile browsers require user interaction for video playback
            scene.addEventListener('loaded', () => {
                videoAssets.forEach(v => {
                    const videoEl = document.getElementById(`vid-${v.id}`) as HTMLVideoElement | null;
                    if (videoEl) {
                        videoEl.play().catch(() => {
                            // If autoplay fails, try again on user tap
                            const playOnTap = () => {
                                videoEl.play();
                                document.removeEventListener('touchstart', playOnTap);
                                document.removeEventListener('click', playOnTap);
                            };
                            document.addEventListener('touchstart', playOnTap, { once: true });
                            document.addEventListener('click', playOnTap, { once: true });
                        });
                    }
                });
            });

            setStatus('ready');

        } catch (err: any) {
            console.error('Viewer initialization error:', err);
            setStatus('error');
            setErrorMsg(err.message || 'Error desconocido al iniciar la experiencia AR.');
        }
    }, [id]);

    // ===== Trigger build once on mount =====
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        document.body.style.margin = '0';
        buildScene();
        return () => {
            document.body.style.overflow = '';
            document.body.style.margin = '';
        };
    }, [buildScene]);

    // ===== RENDER =====

    // Loading / Error / Empty states
    if (status !== 'ready') {
        return (
            <div style={{
                width: '100vw', height: '100vh', background: '#0a0a0c',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
                color: 'white', padding: '24px', textAlign: 'center', boxSizing: 'border-box',
            }}>
                {status === 'empty' && (
                    <>
                        <div style={{
                            width: 80, height: 80, borderRadius: 20,
                            background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(99,102,241,0.1))',
                            border: '1px solid rgba(139,92,246,0.25)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontSize: 36
                        }}>💡</div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Proyecto Vacío</h2>
                        <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 340, lineHeight: 1.5 }}>
                            No se encontró contenido para este proyecto. Asegúrate de hacer clic en
                            <strong style={{ color: '#d1d5db' }}> "Guardar" </strong>
                            en el Editor antes de escanear el QR.
                        </p>
                    </>
                )}

                {status === 'error' && (
                    <>
                        <div style={{
                            width: 80, height: 80, borderRadius: 20,
                            background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(220,38,38,0.1))',
                            border: '1px solid rgba(239,68,68,0.25)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center', marginBottom: 24, fontSize: 36
                        }}>⚠️</div>
                        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Error</h2>
                        <p style={{ color: '#9ca3af', fontSize: 14, maxWidth: 340, lineHeight: 1.5 }}>{errorMsg}</p>
                        <button
                            onClick={() => window.location.reload()}
                            style={{
                                marginTop: 20, padding: '10px 24px', background: '#7c3aed',
                                border: 'none', borderRadius: 8, color: 'white', fontSize: 14,
                                fontWeight: 600, cursor: 'pointer'
                            }}
                        >Reintentar</button>
                    </>
                )}

                {(status === 'loading' || status === 'loading-scripts') && (
                    <>
                        <div style={{ position: 'relative', marginBottom: 32 }}>
                            <div style={{
                                width: 64, height: 64, borderRadius: 16,
                                background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 0 40px rgba(124,58,237,0.3)',
                            }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                </svg>
                            </div>
                        </div>
                        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: 2, marginBottom: 6 }}>AR STUDIO</h2>
                        <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>{statusText}</p>
                        <div style={{
                            width: 180, height: 3, background: '#1f2937', borderRadius: 4, overflow: 'hidden'
                        }}>
                            <div style={{
                                width: '50%', height: '100%', borderRadius: 4,
                                background: 'linear-gradient(90deg, #7c3aed, #4f46e5)',
                                animation: 'arloader 1.2s ease-in-out infinite'
                            }} />
                        </div>
                        <style>{`@keyframes arloader { 0% { transform: translateX(-100%); } 100% { transform: translateX(300%); } }`}</style>
                    </>
                )}
            </div>
        );
    }

    // The AR scene container — after scripts load and scene is injected, this just shows the A-Frame canvas
    return (
        <div
            ref={containerRef}
            style={{
                width: '100vw', height: '100vh',
                position: 'fixed', top: 0, left: 0,
                background: 'black', overflow: 'hidden'
            }}
        />
    );
}
