import { useEffect, useRef, useState } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { NodeRenderer } from './SceneHydrator';
import type { SceneNode } from '../../../store/sceneStore';

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

export default function MindARImageTracker({
    targetSrc,
    nodes,
    assets
}: {
    targetSrc: string;
    nodes: SceneNode[];
    assets: Record<string, any>;
}) {
    const { camera, scene } = useThree();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [mindARReady, setMindARReady] = useState(false);
    const mindARRef = useRef<any>(null);

    // Filter nodes that are supposed to be inside the target
    // The previous implementation put all non-target nodes inside the first image target
    // We will do the same here.
    const contentNodes = nodes.filter(n => n.type !== 'image-target');

    useEffect(() => {
        // Container for MindAR video
        const container = document.createElement('div');
        container.style.position = 'fixed';
        container.style.top = '0';
        container.style.left = '0';
        container.style.width = '100vw';
        container.style.height = '100vh';
        container.style.zIndex = '-1';
        container.style.overflow = 'hidden';
        document.body.appendChild(container);
        containerRef.current = container;

        const initMindAR = async () => {
            try {
                // Ensure MindAR Three is loaded
                await loadScript('https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-three.prod.js');

                // @ts-ignore
                const MindARThree = window.MINDAR.IMAGE.MindARThree;
                const mindarThree = new MindARThree({
                    container,
                    imageTargetSrc: targetSrc,
                    uiLoading: 'no',
                    uiScanning: 'no',
                    uiError: 'no'
                });

                mindARRef.current = mindarThree;

                // Sync the MindAR camera and renderer with R3F
                // R3F handles its own render loop, but MindARThree creates its own WebGLRenderer.
                // However, mindar-image-three allows us to get the video texture or update the matrix.
                // Wait, it's easier to use mindarThree's underlying matrix updates inside R3F.

                // Let's hook into the anchor
                mindarThree.addAnchor(0);

                // We add a group to R3F scene that will be synced with MindAR anchor
                const targetGroup = new THREE.Group();
                scene.add(targetGroup);

                // Instead of using mindarThree renderer, we sync its internal anchors
                // We must start mindar
                await mindarThree.start();

                // On every frame, mindar updates the anchor matrix.
                // We copy the matrix to our targetGroup, and mindar video to background.
                const video = mindarThree.video;
                if (video) {
                    const texture = new THREE.VideoTexture(video);
                    scene.background = texture;
                }

                setMindARReady(true);

            } catch (err) {
                console.error("MindAR Init Error:", err);
            }
        };

        initMindAR();

        return () => {
            if (mindARRef.current) {
                mindARRef.current.stop();
            }
            if (containerRef.current) {
                containerRef.current.remove();
            }
        };
    }, [targetSrc, scene]);

    useFrame(() => {
        if (mindARRef.current && mindARReady) {
            // Update the underlying AR system
            // mindARThree expects its own loop but we can manually sync matrix
            // Actually, mind-ar updates anchors automatically if we just copy them
            const mindCamera = mindARRef.current.camera;

            // Sync Camera projection matrix
            if (mindCamera) {
                camera.projectionMatrix.copy(mindCamera.projectionMatrix);
            }

            // The content nodes are rendered below via NodeRenderer, 
            // wrapped in a special group that copies the anchor matrix
        }
    });

    if (!mindARReady) return null;

    return (
        <group>
            {/* The nodes will be wrapped in an Anchor sync group */}
            <AnchorGroup mindARRef={mindARRef} anchorIndex={0}>
                {contentNodes.map(node => (
                    <NodeRenderer key={node.id} node={node} assets={assets} />
                ))}
            </AnchorGroup>
        </group>
    );
}

function AnchorGroup({ children, mindARRef, anchorIndex }: { children: React.ReactNode, mindARRef: any, anchorIndex: number }) {
    const groupRef = useRef<THREE.Group>(null);
    const anchorObjRef = useRef<THREE.Group | null>(null);

    useEffect(() => {
        if (!mindARRef.current) return;
        // Get the internal Three.js group for this anchor
        // MindARThree creates it via mindARThree.addAnchor(index) 
        // We assume index 0 was created in the main effect
        const mindarThree = mindARRef.current;
        const anchor = mindarThree.anchors[anchorIndex];
        if (anchor && anchor.group) {
            anchorObjRef.current = anchor.group;
        }
    }, [mindARRef, anchorIndex]);

    useFrame(() => {
        if (groupRef.current && anchorObjRef.current) {
            // Copy matrix from MindAR's internal anchor to our R3F group
            groupRef.current.matrixAutoUpdate = false;
            groupRef.current.matrix.copy(anchorObjRef.current.matrixWorld);
            groupRef.current.visible = anchorObjRef.current.visible;
        }
    });

    return (
        <group ref={groupRef}>
            {children}
            {/* MindAR planes are usually small, we might need a light inside the group */}
            <ambientLight intensity={0.8} />
            <directionalLight position={[0, 2, 2]} intensity={1.0} />
        </group>
    );
}
