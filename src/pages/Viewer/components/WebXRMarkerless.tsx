import { XR, XROrigin } from '@react-three/xr';
import { NodeRenderer } from './SceneHydrator';
import type { SceneNode } from '../../../store/sceneStore';

export default function WebXRMarkerless({
    nodes,
    assets,
    xrStore
}: {
    nodes: SceneNode[];
    assets: Record<string, any>;
    xrStore: any;
}) {
    const cameraNode = nodes.find(n => n.type === 'camera');

    // In WebXR, the origin defines the user's starting point
    // React Three XR v6 supports position and rotation on XROrigin
    const originPos: [number, number, number] = cameraNode
        ? [cameraNode.position.x, cameraNode.position.y, cameraNode.position.z]
        : [0, -1.6, 2];

    const originRot: [number, number, number] = cameraNode
        ? [cameraNode.rotation.x, cameraNode.rotation.y, cameraNode.rotation.z]
        : [0, 0, 0];

    return (
        <XR store={xrStore}>
            <XROrigin position={originPos} rotation={originRot} />

            <ambientLight intensity={0.6} />
            <directionalLight position={[1, 4, 2]} intensity={0.8} />

            {/* Render all nodes */}
            {nodes.map(node => (
                <NodeRenderer key={node.id} node={node} assets={assets} />
            ))}
        </XR>
    );
}
