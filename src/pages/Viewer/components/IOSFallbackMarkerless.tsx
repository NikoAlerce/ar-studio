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

        // Assuming permissions were granted in the AROverlayUI step, controls should work now
        try {
            const controls = new DeviceOrientationControls(camera);
            controlsRef.current = controls;
        } catch (e) {
            console.warn("DeviceOrientationControls failed to initialize (expected on Desktop)", e);
        }

        return () => {
            if (controlsRef.current) {
                controlsRef.current.dispose();
            }
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

// Note: useCameraBackground was removed in favor of the unified React component in Viewer/index.tsx
