import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useSceneStore } from '../../store/sceneStore';

export default function Viewer() {
    const { id } = useParams();
    const { sceneNodes, assets } = useSceneStore();
    const [ready, setReady] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    // Helper to format position/rotation/scale for A-Frame
    const toAFrameVec3 = (transform: { x: number, y: number, z: number }) => {
        return `${transform.x.toFixed(3)} ${transform.y.toFixed(3)} ${transform.z.toFixed(3)}`;
    };

    const toAFrameRot = (transform: { x: number, y: number, z: number }) => {
        const toDeg = (rad: number) => rad * (180 / Math.PI);
        return `${toDeg(transform.x).toFixed(2)} ${toDeg(transform.y).toFixed(2)} ${toDeg(transform.z).toFixed(2)}`;
    }

    // Load Scene data from Supabase
    useEffect(() => {
        if (id) {
            useSceneStore.getState().loadScene(id);
        }
    }, [id]);

    useEffect(() => {
        // Prevent body scrolling on AR view
        document.body.style.overflow = 'hidden';

        if (!sceneNodes || Object.keys(sceneNodes).length === 0) return;

        const hasTargets = Object.values(sceneNodes).some(n => n.type === 'image-target');

        // Check if already loaded to avoid duplicate script injection
        if ((window as any).AFRAME) {
            if (hasTargets && (window as any).MINDAR) {
                setReady(true);
                return;
            } else if (!hasTargets && (window as any).XR8) {
                setReady(true);
                return;
            }
        }

        const loadScripts = async () => {
            return new Promise<void>((resolve) => {
                const loadEngine = () => {
                    if (hasTargets) {
                        const engineScript = document.createElement('script');
                        engineScript.src = "https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-aframe.prod.js";
                        engineScript.crossOrigin = "anonymous";
                        engineScript.onload = () => {
                            console.log('MindAR Tracking Loaded!');
                            setReady(true);
                            resolve();
                        };
                        document.head.appendChild(engineScript);
                    } else {
                        console.log('Standard WebXR Markerless Loaded!');
                        setReady(true);
                        resolve();
                    }
                };

                // Load A-Frame 1.4.2 for both modes
                const aframeScript = document.createElement('script');
                aframeScript.src = "https://aframe.io/releases/1.4.2/aframe.min.js";
                aframeScript.crossOrigin = "anonymous";
                aframeScript.onload = loadEngine;
                document.head.appendChild(aframeScript);
            });
        };

        loadScripts();

        return () => { document.body.style.overflow = 'auto'; };
    }, [sceneNodes]);

    if (!ready) {
        return (
            <div className="w-screen h-screen bg-[#111114] text-white flex flex-col items-center justify-center font-sans">
                <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <h2 className="text-xl font-bold tracking-wider mb-2">AR STUDIO</h2>
                <p className="text-gray-400 text-sm">Inicializando Motor de Realidad Aumentada...</p>
            </div>
        );
    }

    // Prepare A-Frame injection HTML
    const nodes = Object.values(sceneNodes);
    const targetNodes = nodes.filter(n => n.type === 'image-target');
    const otherNodes = nodes.filter(n => n.type !== 'image-target');
    const videoAssets = Object.values(assets).filter(a => a.type === 'video');

    const renderNode = (node: any) => {
        let attrs = `id="${node.id}" `;

        switch (node.type) {
            case 'box':
                attrs += `geometry="primitive: box" material="color: #7a8bcc" `;
                break;
            case 'plane':
                attrs += `geometry="primitive: plane; width: 1; height: 1" `;
                if (node.assetId && assets[node.assetId]) {
                    const asset = assets[node.assetId];
                    if (asset.type === 'image') {
                        attrs += `material="src: url(${asset.url}); side: double; shader: flat" `;
                    } else if (asset.type === 'video') {
                        attrs += `material="src: #vid-${asset.id}; side: double; shader: flat" `;
                    }
                } else {
                    attrs += `material="color: #7a8bcc; side: double" `;
                }
                break;
            case 'light':
                attrs += `light="type: point; intensity: 1; color: white" `;
                break;
            case 'gltf-model':
                if (node.assetId && assets[node.assetId]) {
                    attrs += `gltf-model="url(${assets[node.assetId].url})" `;
                }
                break;
        }

        return `
    <a-entity
        ${attrs}
        position="${toAFrameVec3(node.position)}"
        rotation="${toAFrameRot(node.rotation)}"
        scale="${toAFrameVec3(node.scale)}"
    ></a-entity>`;
    };

    const hasTargets = targetNodes.length > 0;

    let innerHtml = `
<a-scene 
    ${hasTargets
            ? `mindar-image="imageTargetSrc: ${targetNodes[0].assetId && assets[targetNodes[0].assetId] ? assets[targetNodes[0].assetId].url : ''}; autoStart: true;" color-space="sRGB"`
            : `webxr="optionalFeatures: hit-test, local-floor;"`}
    renderer="colorManagement: true;"
>
    <!-- Assets (Videos require muted to autoplay on mobile) -->
    <a-assets>
        ${videoAssets.map(v => `<video id="vid-${v.id}" src="${v.url}" autoplay loop muted crossorigin="anonymous" playsinline webkit-playsinline></video>`).join('\n        ')}
    </a-assets>

    <a-camera position="0 0 0" look-controls="enabled: false"></a-camera>
    <a-light type="directional" intensity="0.8" position="1 4 2"></a-light>
    <a-light type="ambient" intensity="0.6"></a-light>
`;

    // Wrap elements in Image Tracker if present
    if (hasTargets) {
        innerHtml += `
    <a-entity mindar-image-target="targetIndex: 0">
        ${otherNodes.map(renderNode).join('')}
    </a-entity>
        `;
    } else {
        innerHtml += otherNodes.map(renderNode).join('');
    }

    innerHtml += `\n</a-scene>`;

    return (
        <div className="w-screen h-screen bg-black relative" ref={containerRef}>
            {/* A-Frame Scene Injection */}
            <div id="ar-scene-container" className="w-full h-full relative" dangerouslySetInnerHTML={{ __html: innerHtml }} />
        </div>
    );
}
