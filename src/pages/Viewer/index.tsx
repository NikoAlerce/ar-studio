import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../../lib/supabase';

/**
 * AR VIEWER — Production AR Experience
 * 
 * TWO MODES:
 * 1. IMAGE TRACKING: MindAR + A-Frame (camera → detect image → overlay 3D)
 * 2. MARKERLESS AR:  <model-viewer> by Google (native ARCore/ARKit surface detection)
 *    - Android: ARCore Scene Viewer → real surface detection, pinch-to-zoom
 *    - iOS: AR Quick Look → native Apple AR, anchoring, pinch-to-zoom
 *    - Desktop: Interactive 3D viewer with orbit controls
 * 
 * This is the same technology used by objkt.com, Sketchfab, and Google Search AR.
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
    const [statusText, setStatusText] = useState('Conectando con el servidor...');
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

            // Find GLB models for model-viewer
            const glbNodes = contentNodes.filter(n => n.type === 'gltf-model' && n.assetId && sceneData.assets[n.assetId]);
            const hasGLB = glbNodes.length > 0;

            // ====== 3. LOAD SCRIPTS ======
            setStatus('loading-scripts');

            if (hasTargets) {
                // IMAGE TRACKING MODE: Need A-Frame + MindAR
                setArMode('mindar');
                setStatusText('Cargando motor 3D...');
                await loadScript('https://aframe.io/releases/1.4.2/aframe.min.js');
                setStatusText('Cargando rastreador de imágenes...');
                await loadScript('https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-aframe.prod.js');
            } else if (hasGLB) {
                // MARKERLESS MODE WITH GLB: Use <model-viewer> (best AR experience)
                setArMode('model-viewer');
                setStatusText('Cargando visor 3D...');
                await loadScript('https://cdn.jsdelivr.net/npm/@google/model-viewer@4.1.0/dist/model-viewer.min.js', 'module');
            } else {
                // MARKERLESS WITH PRIMITIVES ONLY: Use A-Frame with camera
                setArMode('aframe-camera');
                setStatusText('Cargando motor 3D...');
                await loadScript('https://aframe.io/releases/1.4.2/aframe.min.js');
            }

            await new Promise(r => setTimeout(r, 200));

            // ====== 4. BUILD SCENE ======
            if (sceneInjected.current || !containerRef.current) return;
            sceneInjected.current = true;
            containerRef.current.innerHTML = '';

            // ----- Entity builder for A-Frame -----
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
                                : `src: url(${asset.url}); side: double; shader: flat`);
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

            // ===================================================================
            //                     MODE 1: IMAGE TRACKING (MindAR)
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
                contentNodes.forEach(n => target.appendChild(buildEntity(n)));
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

                // ===================================================================
                //             MODE 2: MARKERLESS AR WITH <model-viewer>
                //             Native ARCore (Android) / AR Quick Look (iOS)
                //             Surface detection, pinch-to-zoom, anchoring
                // ===================================================================
            } else if (hasGLB) {
                // Use the first GLB model as the primary model
                const primaryGLB = glbNodes[0];
                const glbUrl = sceneData.assets[primaryGLB.assetId!].url;
                const projectName = (data as any).name || 'AR Experience';

                // Create <model-viewer> element
                const mv = document.createElement('model-viewer') as any;
                mv.setAttribute('src', glbUrl);
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
                mv.setAttribute('ar-status', 'not-presenting');
                mv.setAttribute('interaction-prompt', 'auto');

                // Styling
                mv.style.cssText = `
                    width: 100vw; height: 100vh;
                    position: fixed; top: 0; left: 0;
                    background: radial-gradient(ellipse at center, #1a1a2e 0%, #0a0a0c 100%);
                    --poster-color: transparent;
                `;

                // Custom AR button style (slot)
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

                // Interaction hint for mobile
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

                // ===================================================================
                //           MODE 3: PRIMITIVES ONLY (A-Frame + Camera)
                // ===================================================================
            } else {
                const scene = document.createElement('a-scene');
                scene.setAttribute('vr-mode-ui', 'enabled: false');
                scene.setAttribute('loading-screen', 'enabled: false');
                scene.setAttribute('renderer', 'colorManagement: true; antialias: true; alpha: true');
                scene.style.background = 'transparent';

                // Camera background
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
                    sky.setAttribute('color', '#1a1a2e');
                    scene.appendChild(sky);
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
                cam.setAttribute('position', '0 1.6 0');
                cam.setAttribute('look-controls', 'enabled: true');
                scene.appendChild(cam);

                const dl = document.createElement('a-light');
                dl.setAttribute('type', 'directional'); dl.setAttribute('intensity', '0.6'); dl.setAttribute('position', '1 4 2');
                scene.appendChild(dl);
                const al = document.createElement('a-light');
                al.setAttribute('type', 'ambient'); al.setAttribute('intensity', '0.5');
                scene.appendChild(al);

                contentNodes.forEach(n => scene.appendChild(buildEntity(n)));
                containerRef.current.appendChild(scene);
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
    const baseStyle: React.CSSProperties = {
        width: '100vw', height: '100vh', background: '#0a0a0c',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        color: 'white', padding: 24, textAlign: 'center', boxSizing: 'border-box',
    };

    if (status !== 'ready') {
        return (
            <div style={baseStyle}>
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
                        {arMode && (
                            <p style={{ color: '#4b5563', fontSize: 10, fontFamily: 'monospace', marginBottom: 16 }}>
                                {arMode === 'model-viewer' ? '🎯 AR Nativo (Surface Detection)' :
                                    arMode === 'mindar' ? '📷 Image Tracking (MindAR)' :
                                        '📱 Camera Overlay'}
                            </p>
                        )}
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
        <div ref={containerRef} style={{ width: '100vw', height: '100vh', position: 'fixed', top: 0, left: 0, background: '#0a0a0c', overflow: 'hidden' }} />
    );
}
