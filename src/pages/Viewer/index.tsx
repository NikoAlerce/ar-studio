import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useSceneStore } from '../../store/sceneStore';
import type { SceneNode } from '../../store/sceneStore';

export default function Viewer() {
    const { id } = useParams();
    const { sceneNodes, assets, customCode } = useSceneStore();
    const [ready, setReady] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [loadStatus, setLoadStatus] = useState('Conectando...');

    // Helpers
    const toVec3 = (t: { x: number; y: number; z: number }) =>
        `${t.x.toFixed(3)} ${t.y.toFixed(3)} ${t.z.toFixed(3)}`;

    const toRot = (t: { x: number; y: number; z: number }) => {
        const d = (r: number) => r * (180 / Math.PI);
        return `${d(t.x).toFixed(2)} ${d(t.y).toFixed(2)} ${d(t.z).toFixed(2)}`;
    };

    // Load scene from Supabase
    useEffect(() => {
        if (id) {
            setLoadStatus('Cargando escena...');
            useSceneStore.getState().loadScene(id);
        }
    }, [id]);

    // Load AR scripts
    useEffect(() => {
        document.body.style.overflow = 'hidden';

        if (!sceneNodes || Object.keys(sceneNodes).length === 0) return;

        const hasTargets = Object.values(sceneNodes).some(n => n.type === 'image-target');

        // Check if scripts already loaded
        if (document.querySelector('script[src*="aframe.min.js"]')) {
            if (hasTargets && document.querySelector('script[src*="mindar"]')) {
                setReady(true);
                return;
            } else if (!hasTargets) {
                setReady(true);
                return;
            }
        }

        const loadScripts = async () => {
            return new Promise<void>((resolve) => {
                setLoadStatus('Cargando motor 3D...');

                // Load A-Frame first
                const aframeScript = document.createElement('script');
                aframeScript.src = "https://aframe.io/releases/1.4.2/aframe.min.js";
                aframeScript.crossOrigin = "anonymous";
                aframeScript.onload = () => {
                    if (hasTargets) {
                        setLoadStatus('Cargando rastreador de imágenes...');
                        const engineScript = document.createElement('script');
                        engineScript.src = "https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-aframe.prod.js";
                        engineScript.crossOrigin = "anonymous";
                        engineScript.onload = () => {
                            console.log('MindAR Tracking Loaded!');
                            setLoadStatus('¡Listo! Iniciando cámara...');
                            setReady(true);
                            resolve();
                        };
                        document.head.appendChild(engineScript);
                    } else {
                        console.log('Standard WebXR Markerless Loaded!');
                        setLoadStatus('¡Listo! Iniciando cámara...');
                        setReady(true);
                        resolve();
                    }
                };
                document.head.appendChild(aframeScript);
            });
        };

        loadScripts();

        return () => { document.body.style.overflow = 'auto'; };
    }, [sceneNodes]);

    // --- Loading / Empty Screen ---
    if (!ready) {
        const isEmpty = !sceneNodes || Object.keys(sceneNodes).length === 0;
        return (
            <div className="w-screen h-screen bg-[#0a0a0c] text-white flex flex-col items-center justify-center font-sans p-6 text-center">
                {isEmpty ? (
                    <>
                        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 flex items-center justify-center mb-5">
                            <span className="text-3xl">💡</span>
                        </div>
                        <h2 className="text-xl font-bold mb-2">Proyecto Vacío</h2>
                        <p className="text-gray-400 text-sm max-w-sm">
                            No se encontró contenido para este proyecto. Asegúrate de hacer clic en <strong>"Guardar"</strong> en el Editor antes de escanear el QR.
                        </p>
                    </>
                ) : (
                    <>
                        {/* Premium Loading */}
                        <div className="relative mb-8">
                            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/30 animate-pulse">
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                                </svg>
                            </div>
                            <div className="absolute inset-0 w-16 h-16 rounded-2xl border-2 border-purple-400/30 animate-ping"></div>
                        </div>
                        <h2 className="text-lg font-bold tracking-wider mb-1">AR STUDIO</h2>
                        <p className="text-gray-500 text-sm mb-4">{loadStatus}</p>
                        <div className="w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full animate-[loading_1.5s_ease-in-out_infinite]" style={{ width: '60%' }}></div>
                        </div>
                        <style>{`@keyframes loading { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }`}</style>
                    </>
                )}
            </div>
        );
    }

    // --- Build A-Frame Scene ---
    const nodes = Object.values(sceneNodes);
    const targetNodes = nodes.filter(n => n.type === 'image-target');
    const otherNodes = nodes.filter(n => n.type !== 'image-target');
    const videoAssets = Object.values(assets).filter(a => a.type === 'video');

    const renderNode = (node: SceneNode) => {
        const props = node.properties || {};
        let attrs = `id="${node.id}" `;

        switch (node.type) {
            case 'box': {
                const color = props.color || '#7a8bcc';
                attrs += `geometry="primitive: box" material="color: ${color}; roughness: 0.5" `;
                break;
            }
            case 'plane': {
                if (node.assetId && assets[node.assetId]) {
                    const asset = assets[node.assetId];
                    if (asset.type === 'image') {
                        attrs += `geometry="primitive: plane; width: 1; height: 1" material="src: url(${asset.url}); side: double; shader: flat" `;
                    } else if (asset.type === 'video') {
                        attrs += `geometry="primitive: plane; width: 1; height: 1" material="src: #vid-${asset.id}; side: double; shader: flat" `;
                    }
                } else {
                    const color = props.color || '#7a8bcc';
                    attrs += `geometry="primitive: plane; width: 1; height: 1" material="color: ${color}; side: double" `;
                }
                break;
            }
            case 'light': {
                const lightType = props.lightType || 'point';
                const color = props.color || 'white';
                const intensity = props.intensity ?? 1;
                const distance = props.distance ?? 10;
                const angle = props.angle ?? (Math.PI / 4);
                const angleDeg = (angle * 180 / Math.PI).toFixed(1);

                let lightAttrs = `type: ${lightType}; color: ${color}; intensity: ${intensity}`;
                if (lightType === 'point' || lightType === 'spot') {
                    lightAttrs += `; distance: ${distance}`;
                }
                if (lightType === 'spot') {
                    lightAttrs += `; angle: ${angleDeg}`;
                }
                attrs += `light="${lightAttrs}" `;
                break;
            }
            case 'gltf-model': {
                if (node.assetId && assets[node.assetId]) {
                    attrs += `gltf-model="url(${assets[node.assetId].url})" `;
                }
                break;
            }
        }

        return `
        <a-entity
            ${attrs}
            position="${toVec3(node.position)}"
            rotation="${toRot(node.rotation)}"
            scale="${toVec3(node.scale)}"
        ></a-entity>`;
    };

    const hasTargets = targetNodes.length > 0;

    // Build the full A-Frame HTML
    let html = `
    <a-scene
        ${hasTargets
            ? `mindar-image="imageTargetSrc: ${targetNodes[0].assetId && assets[targetNodes[0].assetId] ? assets[targetNodes[0].assetId].url : ''}; autoStart: true;" color-space="sRGB"`
            : `webxr="optionalFeatures: hit-test, local-floor;"`}
        renderer="colorManagement: true;"
        vr-mode-ui="enabled: false"
    >
        <!-- Assets -->
        <a-assets>
            ${videoAssets.map(v => `<video id="vid-${v.id}" src="${v.url}" autoplay loop muted crossorigin="anonymous" playsinline webkit-playsinline></video>`).join('\n            ')}
        </a-assets>

        <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
        <a-light type="directional" intensity="0.8" position="1 4 2"></a-light>
        <a-light type="ambient" intensity="0.6"></a-light>
    `;

    // Wrap in image target container or render flat
    if (hasTargets) {
        html += `
        <a-entity mindar-image-target="targetIndex: 0">
            ${otherNodes.map(renderNode).join('')}
        </a-entity>`;
    } else {
        html += `
        <a-sky color="#b8cfe8"></a-sky>
        ${otherNodes.map(renderNode).join('')}`;
    }

    html += `\n    </a-scene>`;

    // Inject custom code
    if (customCode && customCode.trim()) {
        html += `\n<script>${customCode}</script>`;
    }

    return (
        <div className="w-screen h-screen bg-black relative" ref={containerRef}>
            <div
                id="ar-scene-container"
                className="w-full h-full relative"
                dangerouslySetInnerHTML={{ __html: html }}
            />
        </div>
    );
}
