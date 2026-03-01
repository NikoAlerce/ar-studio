import { useEffect, useState, useMemo, Suspense } from 'react';
import { useParams } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { createXRStore } from '@react-three/xr';
import { supabase } from '../../lib/supabase';
import AROverlayUI from './components/AROverlayUI';
import WebXRMarkerless from './components/WebXRMarkerless';
import IOSFallbackMarkerless from './components/IOSFallbackMarkerless';
import MindARImageTracker from './components/MindARImageTracker';
import type { SceneNode } from '../../store/sceneStore';

type ARMode = 'image-tracking' | 'webxr-markerless' | 'ios-fallback';

/**
 * AR VIEWER V2 — React Three Fiber + WebXR + MindAR Three
 */
export default function Viewer() {
    const { id } = useParams();
    const [status, setStatus] = useState<'loading' | 'preparing' | 'empty' | 'ready' | 'error'>('loading');
    const [errorMsg, setErrorMsg] = useState('');
    const [started, setStarted] = useState(false);

    // Scene state
    const [sceneNodes, setSceneNodes] = useState<SceneNode[]>([]);
    const [assets, setAssets] = useState<Record<string, any>>({});
    const [customCode, setCustomCode] = useState('');

    const [arMode, setArMode] = useState<ARMode | null>(null);
    const [imageTargetSrc, setImageTargetSrc] = useState<string | null>(null);

    // WebXR Store for Android/Headsets
    const xrStore = useMemo(() => createXRStore(), []);

    useEffect(() => {
        let isMounted = true;

        async function init() {
            if (!id) {
                if (isMounted) {
                    setStatus('error');
                    setErrorMsg('No se proporcionó un ID de proyecto.');
                }
                return;
            }

            try {
                // 1. Fetch Scene
                const { data, error } = await supabase
                    .from('projects').select('scene_data, name').eq('id', id).single();

                if (error || !data?.scene_data) {
                    if (isMounted) setStatus('empty');
                    return;
                }

                setStatus('preparing');

                let sceneData;
                const raw = data.scene_data as any;
                if (raw.entities && !raw.sceneNodes) {
                    sceneData = { assets: {}, sceneNodes: raw.entities, customCode: '' };
                } else {
                    sceneData = { assets: raw.assets || {}, sceneNodes: raw.sceneNodes || {}, customCode: raw.customCode || '' };
                }

                const nodes = Object.values(sceneData.sceneNodes) as SceneNode[];
                if (nodes.length === 0) {
                    if (isMounted) setStatus('empty');
                    return;
                }

                if (isMounted) {
                    setSceneNodes(nodes);
                    setAssets(sceneData.assets);
                    setCustomCode(sceneData.customCode || '');
                }

                // 2. Determine Mode
                const hasTargets = nodes.some(n => n.type === 'image-target');
                const targetNodes = nodes.filter(n => n.type === 'image-target');

                if (hasTargets) {
                    // IMAGE TRACKING
                    const primary = targetNodes.find(n => n.assetId && sceneData.assets[n.assetId!]);
                    if (isMounted) {
                        setArMode('image-tracking');
                        setImageTargetSrc(primary?.assetId ? sceneData.assets[primary.assetId].url : null);
                        setStatus('ready');
                    }
                } else {
                    // MARKERLESS: check WebXR support
                    const isXRSupported = await navigator.xr?.isSessionSupported('immersive-ar');
                    if (isMounted) {
                        setArMode(isXRSupported ? 'webxr-markerless' : 'ios-fallback');
                        setStatus('ready');
                    }
                }

            } catch (err: any) {
                if (isMounted) {
                    setStatus('error');
                    setErrorMsg(err.message || 'Error inicializando la escena.');
                }
            }
        }

        init();

        return () => { isMounted = false; };
    }, [id]);

    // Handle the custom code execution when started
    useEffect(() => {
        if (started && customCode?.trim()) {
            const clean = customCode.trim();
            const hasReal = clean.split('\n').some(l => { const t = l.trim(); return t.length > 0 && !t.startsWith('//'); });
            if (hasReal) {
                const s = document.createElement('script');
                s.textContent = clean;
                document.body.appendChild(s);
            }
        }
    }, [started, customCode]);

    const handleStart = () => {
        setStarted(true);
        if (arMode === 'webxr-markerless') {
            xrStore.enterAR();
        }
    };

    return (
        <div className="fixed inset-0 w-screen h-screen bg-black overflow-hidden z-0">
            <AROverlayUI
                status={status}
                errorMsg={errorMsg}
                onStart={handleStart}
                xrSupported={arMode === 'webxr-markerless'}
            />

            {/* Render Canvas only when started or in testing, but actually for ImageTracking we need it immediately upon start */}
            {started && arMode && (
                <Canvas style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', background: 'transparent', zIndex: 1 }}>
                    <Suspense fallback={null}>
                        {arMode === 'image-tracking' && imageTargetSrc && (
                            <MindARImageTracker targetSrc={imageTargetSrc} nodes={sceneNodes} assets={assets} />
                        )}
                        {arMode === 'webxr-markerless' && (
                            <WebXRMarkerless nodes={sceneNodes} assets={assets} xrStore={xrStore} />
                        )}
                        {arMode === 'ios-fallback' && (
                            <IOSFallbackMarkerless nodes={sceneNodes} assets={assets} />
                        )}
                    </Suspense>
                </Canvas>
            )}

            {/* iOS Fallback needs underlying camera component, which we'll render via a special hook outside Canvas */}
            {started && arMode === 'ios-fallback' && <CameraBackground />}
        </div>
    );
}

// React component to mount the camera feed background for iOS
function CameraBackground() {
    useEffect(() => {
        const videoBg = document.createElement('video');
        videoBg.muted = true;
        videoBg.autoplay = true;
        videoBg.setAttribute('playsinline', '');
        videoBg.setAttribute('webkit-playsinline', '');
        videoBg.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            object-fit: cover; z-index: 0; pointer-events: none;
        `;
        document.body.appendChild(videoBg);

        let streamRef: MediaStream | null = null;
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        }).then(stream => {
            streamRef = stream;
            videoBg.srcObject = stream;
            videoBg.play().catch(console.error);
        }).catch(err => {
            console.warn('Camera access denied or missing', err);
        });

        return () => {
            if (streamRef) streamRef.getTracks().forEach(t => t.stop());
            videoBg.remove();
        };
    }, []);
    return null;
}
