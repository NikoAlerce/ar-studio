import { Suspense, useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useGLTF } from '@react-three/drei';
import type { SceneNode } from '../../../store/sceneStore';

// --- Individual node renderers ---

function GLBModel({ url }: { url: string }) {
    const { scene } = useGLTF(url);
    const cloned = useMemo(() => scene.clone(true), [scene]);
    return <primitive object={cloned} />;
}

function BoxNode({ properties = {} }: { properties?: Record<string, any> }) {
    return (
        <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={properties.color || "#7a8bcc"} roughness={0.4} />
        </mesh>
    );
}

function PlaneNode({ asset, properties = {} }: { asset?: any; properties?: Record<string, any> }) {
    const [texture, setTexture] = useState<THREE.Texture | null>(null);

    useEffect(() => {
        if (!asset) {
            setTexture(null);
            return;
        }

        let disposed = false;

        if (asset.type === 'video') {
            const vid = document.createElement('video');
            vid.src = asset.url;
            vid.crossOrigin = 'Anonymous';
            vid.loop = true;
            vid.muted = true;
            vid.playsInline = true;
            vid.play().catch(e => console.warn('Autoplay prevented', e));
            const tex = new THREE.VideoTexture(vid);
            tex.colorSpace = THREE.SRGBColorSpace;
            if (!disposed) setTexture(tex);
            return () => { disposed = true; vid.pause(); vid.src = ''; tex.dispose(); };
        } else if (asset.type === 'image') {
            const loader = new THREE.TextureLoader();
            loader.load(asset.url, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                if (!disposed) setTexture(tex);
            });
            return () => { disposed = true; };
        } else if (asset.type === 'image-target' && asset.thumbnailUrl) {
            const loader = new THREE.TextureLoader();
            loader.load(asset.thumbnailUrl, (tex) => {
                tex.colorSpace = THREE.SRGBColorSpace;
                if (!disposed) setTexture(tex);
            });
            return () => { disposed = true; };
        }

        return () => { disposed = true; };
    }, [asset?.id, asset?.url, asset?.thumbnailUrl]);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial
                color={asset ? 'white' : (properties.color || '#7a8bcc')}
                map={texture}
                side={THREE.DoubleSide}
            />
        </mesh>
    );
}

function LightNode({ properties = {} }: { properties?: Record<string, any> }) {
    const color = properties.color || "#ffffff";
    const intensity = properties.intensity ?? 1;
    const distance = properties.distance ?? 10;
    const angle = properties.angle ?? Math.PI / 4;
    const lightType = properties.lightType || 'point';

    return (
        <group>
            {lightType === 'point' && <pointLight intensity={intensity} distance={distance} color={color} />}
            {lightType === 'spot' && <spotLight intensity={intensity} distance={distance} color={color} angle={angle} penumbra={0.5} />}
            {lightType === 'directional' && <directionalLight intensity={intensity} color={color} />}
            {lightType === 'ambient' && <ambientLight intensity={intensity} color={color} />}
        </group>
    );
}

// Wrapper for nodes
export function NodeRenderer({
    node, assets
}: {
    node: SceneNode;
    assets: Record<string, any>;
}) {
    const linkedAsset = node.assetId ? assets[node.assetId] : null;

    return (
        <group
            position={[node.position.x, node.position.y, node.position.z]}
            rotation={[node.rotation.x, node.rotation.y, node.rotation.z]}
            scale={[node.scale.x, node.scale.y, node.scale.z]}
        >
            {node.type === 'box' && <BoxNode properties={node.properties} />}
            {node.type === 'plane' && <PlaneNode asset={linkedAsset} properties={node.properties} />}
            {node.type === 'light' && <LightNode properties={node.properties} />}
            {node.type === 'gltf-model' && node.assetId && assets[node.assetId] && (
                <Suspense fallback={null}>
                    <GLBModel url={assets[node.assetId].url} />
                </Suspense>
            )}
            {/* Image targets are not rendered natively here, their contents are rendered by the tracker */}
        </group>
    );
}
