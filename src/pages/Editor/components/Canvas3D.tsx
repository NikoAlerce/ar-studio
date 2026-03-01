import { useEffect, useRef, useState, Suspense } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, TransformControls, Grid, useGLTF, Outlines, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore } from '../../../store/sceneStore';
import type { TransformMode } from '../index';
import type { SceneNode } from '../../../store/sceneStore';

// --- Individual node renderers ---

function GLBModel({ url, active }: { url: string; active: boolean }) {
    const { scene } = useGLTF(url);
    const ref = useRef<THREE.Group>(null);

    // Apply a yellow emissive-style highlight on selection
    useEffect(() => {
        if (!ref.current) return;
        ref.current.traverse((child: any) => {
            if (child.isMesh) {
                // Store original emissive for restoring later
                if (!child.userData._origEmissive) {
                    child.userData._origEmissive = child.material.emissive?.clone?.() ?? new THREE.Color(0, 0, 0);
                }
                if (active) {
                    child.material.emissive = new THREE.Color(0.4, 0.35, 0);
                } else {
                    child.material.emissive = child.userData._origEmissive;
                }
            }
        });
    }, [active]);

    return <primitive ref={ref} object={scene.clone()} />;
}

function BoxNode({ active, properties = {} }: { active: boolean; properties?: Record<string, any> }) {
    return (
        <mesh>
            <boxGeometry args={[1, 1, 1]} />
            <meshStandardMaterial color={properties.color || "#7a8bcc"} roughness={0.4} />
            {active && <Outlines thickness={3} color="#FFD700" />}
        </mesh>
    );
}

function PlaneNode({ active, asset, properties = {} }: { active: boolean; asset?: any; properties?: Record<string, any> }) {
    const texRef = useRef<THREE.Texture | null>(null);

    useEffect(() => {
        if (!asset) {
            texRef.current = null;
            return;
        }

        if (asset.type === 'video') {
            const vid = document.createElement('video');
            vid.src = asset.url;
            vid.crossOrigin = 'Anonymous';
            vid.loop = true;
            vid.muted = true;
            vid.play();
            texRef.current = new THREE.VideoTexture(vid);
            texRef.current.colorSpace = THREE.SRGBColorSpace;
        } else if (asset.type === 'image') {
            texRef.current = new THREE.TextureLoader().load(asset.url);
            texRef.current.colorSpace = THREE.SRGBColorSpace;
        } else if (asset.type === 'image-target' && asset.thumbnailUrl) {
            texRef.current = new THREE.TextureLoader().load(asset.thumbnailUrl);
            texRef.current.colorSpace = THREE.SRGBColorSpace;
        }
    }, [asset]);

    return (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1, 1]} />
            <meshStandardMaterial
                color={asset ? 'white' : (properties.color || '#7a8bcc')}
                map={texRef.current ?? undefined}
                side={THREE.DoubleSide}
            />
            {active && <Outlines thickness={4} color="#FFD700" />}
        </mesh>
    );
}

function LightNode({ active, properties = {} }: { active: boolean; properties?: Record<string, any> }) {
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

            {/* Visual Helper for the Editor */}
            {lightType !== 'ambient' && (
                <mesh>
                    <sphereGeometry args={[0.12, 8, 8]} />
                    <meshStandardMaterial color={active ? '#FFD700' : '#FFE066'} emissive={active ? '#AA8800' : '#000'} />
                    {active && <Outlines thickness={3} color="#FFD700" />}
                </mesh>
            )}
        </group>
    );
}

// Wrapper that attaches itself to TransformControls via ref
function NodeObject({
    node, active, assets, onSelect
}: {
    node: SceneNode;
    active: boolean;
    assets: Record<string, any>;
    onSelect: () => void;
}) {
    const groupRef = useRef<THREE.Group>(null);

    // Get asset for plane
    const linkedAsset = node.assetId ? assets[node.assetId] : null;

    return (
        <group
            ref={groupRef}
            position={[node.position.x, node.position.y, node.position.z]}
            rotation={[node.rotation.x, node.rotation.y, node.rotation.z]}
            scale={[node.scale.x, node.scale.y, node.scale.z]}
            onClick={(e) => { e.stopPropagation(); onSelect(); }}
        >
            {node.type === 'box' && <BoxNode active={active} properties={node.properties} />}
            {node.type === 'plane' && <PlaneNode active={active} asset={linkedAsset} properties={node.properties} />}
            {node.type === 'light' && <LightNode active={active} properties={node.properties} />}
            {node.type === 'gltf-model' && node.assetId && assets[node.assetId] && (
                <Suspense fallback={
                    <mesh>
                        <boxGeometry args={[0.5, 0.5, 0.5]} />
                        <meshStandardMaterial color="gray" wireframe />
                    </mesh>
                }>
                    <GLBModel url={assets[node.assetId].url} active={active} />
                </Suspense>
            )}
            {node.type === 'image-target' && (
                <>
                    {linkedAsset?.thumbnailUrl ? (
                        <PlaneNode active={active} asset={linkedAsset} />
                    ) : (
                        <mesh>
                            <planeGeometry args={[1, 1]} />
                            <meshStandardMaterial color="#6688FF" wireframe />
                            {active && <Outlines thickness={4} color="#FFD700" />}
                        </mesh>
                    )}
                </>
            )}
        </group>
    );
}

// Active wrapper: attaches TransformControls to the rendered group
function ActiveNodeWithControls({
    node, assets, mode, orbitRef, updateTransformFn
}: {
    node: SceneNode;
    assets: Record<string, any>;
    mode: TransformMode;
    orbitRef: React.RefObject<any>;
    updateTransformFn: (pos: any, rot: any, scl: any) => void;
}) {
    const [target, setTarget] = useState<THREE.Group | null>(null);
    const transformRef = useRef<any>(null);

    const linkedAsset = node.assetId ? assets[node.assetId] : null;

    useEffect(() => {
        if (!transformRef.current) return;
        const controls = transformRef.current;

        const onDraggingChanged = (event: any) => {
            if (orbitRef.current) orbitRef.current.enabled = !event.value;
        };

        const onChange = () => {
            if (!controls.object) return;
            const obj = controls.object;
            updateTransformFn(
                { x: obj.position.x, y: obj.position.y, z: obj.position.z },
                { x: obj.rotation.x, y: obj.rotation.y, z: obj.rotation.z },
                { x: obj.scale.x, y: obj.scale.y, z: obj.scale.z }
            );
        };

        controls.addEventListener('dragging-changed', onDraggingChanged);
        controls.addEventListener('objectChange', onChange);

        return () => {
            controls.removeEventListener('dragging-changed', onDraggingChanged);
            controls.removeEventListener('objectChange', onChange);
        };
    }, [node.id, mode, updateTransformFn]);

    return (
        <>
            <group
                ref={setTarget}
                position={[node.position.x, node.position.y, node.position.z]}
                rotation={[node.rotation.x, node.rotation.y, node.rotation.z]}
                scale={[node.scale.x, node.scale.y, node.scale.z]}
                onClick={(e) => e.stopPropagation()}
                onPointerMissed={(e) => {
                    if (e.type === 'click') {
                        // Usually handled by Canvas, but just in case
                    }
                }}
            >
                {node.type === 'box' && <BoxNode active={true} properties={node.properties} />}
                {node.type === 'plane' && <PlaneNode active={true} asset={linkedAsset} properties={node.properties} />}
                {node.type === 'light' && <LightNode active={true} properties={node.properties} />}
                {node.type === 'gltf-model' && node.assetId && assets[node.assetId] && (
                    <Suspense fallback={null}>
                        <GLBModel url={assets[node.assetId].url} active={true} />
                    </Suspense>
                )}
                {node.type === 'image-target' && (
                    <>
                        {linkedAsset?.thumbnailUrl ? (
                            <PlaneNode active={true} asset={linkedAsset} properties={node.properties} />
                        ) : (
                            <mesh>
                                <planeGeometry args={[1, 1]} />
                                <meshStandardMaterial color="#6688FF" wireframe />
                                <Outlines thickness={4} color="#FFD700" />
                            </mesh>
                        )}
                    </>
                )}
            </group>
            {/* TransformControls anchored to the group ref */}
            {target && (
                <TransformControls
                    ref={transformRef}
                    object={target}
                    mode={mode}
                />
            )}
        </>
    );
}


export default function Canvas3D({ mode }: { mode: TransformMode }) {
    const { sceneNodes, assets, activeNodeId, setActiveNode, updateTransform } = useSceneStore();
    const orbitRef = useRef<any>(null);

    const updateTransformFn = (id: string) => (pos: any, rot: any, scl: any) => {
        updateTransform(id, 'position', pos);
        updateTransform(id, 'rotation', rot);
        updateTransform(id, 'scale', scl);
    };

    return (
        <Canvas
            camera={{ position: [3, 2.5, 3], fov: 50 }}
            onPointerMissed={() => setActiveNode(null)}
            gl={{ antialias: true }}
        >
            {/* Light blue background like 8th Wall */}
            <color attach="background" args={['#b8cfe8']} />
            <ambientLight intensity={0.8} />
            <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
            <directionalLight position={[-5, 3, -5]} intensity={0.4} />

            {/* Environment provides reflection data for PBR materials in GLB models */}
            <Environment preset="city" />

            {/* Grid helper */}
            <Grid
                infiniteGrid
                fadeDistance={25}
                sectionColor="#7a9fbf"
                cellColor="#95b5d0"
                sectionSize={5}
                cellSize={1}
            />

            {/* Render all nodes */}
            {Object.values(sceneNodes).map((node) => {
                const isActive = activeNodeId === node.id;

                if (isActive) {
                    return (
                        <ActiveNodeWithControls
                            key={node.id}
                            node={node}
                            assets={assets}
                            mode={mode}
                            orbitRef={orbitRef}
                            updateTransformFn={updateTransformFn(node.id)}
                        />
                    );
                }

                return (
                    <NodeObject
                        key={node.id}
                        node={node}
                        active={false}
                        assets={assets}
                        onSelect={() => setActiveNode(node.id)}
                    />
                );
            })}

            <OrbitControls ref={orbitRef} makeDefault />
        </Canvas>
    );
}
