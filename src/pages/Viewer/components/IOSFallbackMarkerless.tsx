import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { DeviceOrientationControls } from 'three-stdlib';
import { NodeRenderer } from './SceneHydrator';
import type { SceneNode } from '../../../store/sceneStore';

export default function IOSFallbackMarkerless({
    nodes,
    assets
}: {
    nodes: SceneNode[];
    assets: Record<string, any>;
}) {
    const { camera, gl } = useThree();
    const cameraNode = nodes.find(n => n.type === 'camera');
    const controlsRef = useRef<any>(null);

    useEffect(() => {
        // We set alpha to true so the camera background shows through
        gl.setClearColor(0x000000, 0);

        // Position the camera based on the scene data before initializing controls
        if (cameraNode) {
            camera.position.set(cameraNode.position.x, cameraNode.position.y, cameraNode.position.z);
        } else {
            camera.position.set(0, 0, 3);
        }

        // Initialize DeviceOrientationControls
        const controls = new DeviceOrientationControls(camera);
        controlsRef.current = controls;

        return () => {
            controls.dispose();
        };
    }, [camera, gl]);

    useFrame(() => {
        if (controlsRef.current) {
            controlsRef.current.update();
        }
    });

    return (
        <>
            <ambientLight intensity={0.6} />
            <directionalLight position={[1, 4, 2]} intensity={0.8} />

            {/* If there's no camera, we push content forward. If there is a camera, we respect true world coordinates */}
            <group position={cameraNode ? [0, 0, 0] : [0, 0, -3]}>
                {nodes.map(node => (
                    <NodeRenderer key={node.id} node={node} assets={assets} />
                ))}
            </group>
        </>
    );
}

// Helper to open camera feed behind the canvas
export function useCameraBackground(active: boolean) {
    useEffect(() => {
        if (!active) return;

        const videoBg = document.createElement('video');
        videoBg.muted = true;
        videoBg.autoplay = true;
        videoBg.setAttribute('playsinline', '');
        videoBg.setAttribute('webkit-playsinline', '');
        videoBg.style.cssText = `
            position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
            object-fit: cover; z-index: -1; pointer-events: none;
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
            if (streamRef) {
                streamRef.getTracks().forEach(t => t.stop());
            }
            videoBg.remove();
        };
    }, [active]);
}
