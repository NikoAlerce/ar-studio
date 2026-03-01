import React, { useState } from 'react';
import { Upload, File as FileIcon, Target } from 'lucide-react';
import { useSceneStore } from '../../../store/sceneStore';
import type { Asset, SceneNode } from '../../../store/sceneStore';
import { compileMindARImage } from '../../../lib/compiler';

export default function Sidebar({ projectId }: { projectId: string }) {
    const {
        sceneNodes, activeNodeId, setActiveNode, addNode,
        assets, uploadAsset, isSaving
    } = useSceneStore();

    const [activeTab, setActiveTab] = useState<'files' | 'targets'>('files');
    const [isCompiling, setIsCompiling] = useState(false);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, isTarget = false) => {
        const file = event.target.files?.[0];
        if (!file || !projectId) return;

        let type: Asset['type'] = 'gltf';
        let fileToUpload = file;
        let thumbnailUrl: string | undefined = undefined;

        if (isTarget) {
            type = 'image-target';
            try {
                setIsCompiling(true);
                // Compile the image into a .mind feature tracking file locally, and get thumbnail
                const { mindBlob, thumbnailBlob } = await compileMindARImage(file);

                const cleanName = file.name.split('.')[0] || 'target';
                fileToUpload = new File([mindBlob], `${cleanName}.mind`, { type: 'application/octet-stream' });

                // Upload thumbnail direct to Supabase Storage without registering it as a Scene Asset
                const thumbFile = new File([thumbnailBlob], `${cleanName}_thumb.jpg`, { type: 'image/jpeg' });
                const thumbPath = `${projectId}/${Date.now()}-thumb-${thumbFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;

                // We need to import supabase dynamically or use it if available
                const { supabase } = await import('../../../lib/supabase');
                const { error: thumbError } = await supabase.storage.from('assets').upload(thumbPath, thumbFile, { cacheControl: '3600' });
                if (!thumbError) {
                    const { data } = supabase.storage.from('assets').getPublicUrl(thumbPath);
                    thumbnailUrl = data.publicUrl;
                }

            } catch (err) {
                console.error("Compilation failed:", err);
                alert("Hubo un error compilando la imagen para AR Tracking. Revisa la consola.");
                setIsCompiling(false);
                return;
            } finally {
                setIsCompiling(false);
            }
        } else {
            if (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf')) type = 'gltf';
            else if (file.type.startsWith('image/')) type = 'image';
            else if (file.type.startsWith('video/')) type = 'video';
            else if (file.type.startsWith('audio/')) type = 'audio';
            else {
                alert("Formato no soportado. Sube un .glb, imagen, video o audio.");
                return;
            }
        }

        await uploadAsset(projectId, fileToUpload, type, thumbnailUrl);
        event.target.value = ''; // Reset
    };

    // Drag from Asset Browser
    const handleDragStart = (e: React.DragEvent, asset: Asset) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ source: 'asset-browser', asset }));
    };

    // Drop into Scene Hierarchy
    const handleDropOnScene = (e: React.DragEvent) => {
        e.preventDefault();
        const dataStr = e.dataTransfer.getData('application/json');
        if (!dataStr) return;

        try {
            const data = JSON.parse(dataStr);
            if (data.source === 'asset-browser') {
                const asset = data.asset as Asset;

                // Instanciar un nuevo nodo en la escena basado en el asset subido
                let nodeType: SceneNode['type'] = 'box';
                let name = asset.name;

                if (asset.type === 'gltf') nodeType = 'gltf-model';
                else if (asset.type === 'image-target') nodeType = 'image-target';
                else if (asset.type === 'video' || asset.type === 'image') {
                    // Si arrastras un video/imagen, creamos un plano que lo contenga
                    nodeType = 'plane';
                    name = `Plane (${asset.name})`;
                }

                const newNode: SceneNode = {
                    id: `node-${Date.now()}`,
                    name: name,
                    type: nodeType,
                    assetId: asset.id,
                    position: { x: 0, y: 0.5, z: 0 },
                    rotation: { x: 0, y: 0, z: 0 },
                    scale: { x: 1, y: 1, z: 1 },
                    properties: nodeType === 'box' || nodeType === 'plane' ? { color: '#ffffff' } : {}
                };

                addNode(newNode);
            }
        } catch (err) {
            console.error("Error parsing drop data", err);
        }
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // allow dropping
    };

    const filteredAssets = Object.values(assets).filter(a => activeTab === 'targets' ? a.type === 'image-target' : a.type !== 'image-target');

    const handleAddPrimitive = (type: SceneNode['type'], name: string) => {
        addNode({
            id: `node-${Date.now()}`,
            name,
            type,
            position: { x: 0, y: 0.5, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            properties: type === 'light' ? {
                color: '#ffffff',
                intensity: 1,
                distance: 10,
                lightType: 'point'
            } : type === 'box' || type === 'plane' ? {
                color: '#7a8bcc'
            } : {}
        });
    };

    return (
        <aside className="w-64 bg-[#1e1e24] border-r border-gray-800 flex flex-col h-full">
            {/* TOP PANEL: SCENE HIERARCHY */}
            <div className="flex flex-col h-1/2 border-b border-gray-800">
                <div className="p-3 bg-gray-900/50 text-xs font-semibold uppercase tracking-wider text-gray-400 flex justify-between items-center">
                    <span>Scene</span>
                    <div className="flex gap-2 text-base">
                        <button onClick={() => handleAddPrimitive('box', 'Cubo')} title="Añadir Cubo" className="hover:scale-110 transition-transform">📦</button>
                        <button onClick={() => handleAddPrimitive('plane', 'Plano')} title="Añadir Plano" className="hover:scale-110 transition-transform">📰</button>
                        <button onClick={() => handleAddPrimitive('light', 'Luz')} title="Añadir Luz" className="hover:scale-110 transition-transform">💡</button>
                    </div>
                </div>
                <div
                    className="flex-1 overflow-y-auto p-2 space-y-1 bg-[#1a1a1f]"
                    onDrop={handleDropOnScene}
                    onDragOver={handleDragOver}
                >
                    {Object.values(sceneNodes).length === 0 && (
                        <div className="text-xs text-gray-500 text-center mt-4">
                            Arrastra archivos aquí <br /> para añadirlos a la escena
                        </div>
                    )}
                    {Object.values(sceneNodes).map((node) => (
                        <div
                            key={node.id}
                            onClick={() => setActiveNode(node.id)}
                            className={`px-3 py-2 text-sm border rounded cursor-pointer truncate transition-colors flex items-center gap-2 ${activeNodeId === node.id ? 'bg-purple-900/20 text-purple-300 border-purple-500/30' : 'bg-transparent text-gray-400 border-transparent hover:bg-gray-800/50 hover:text-gray-300'}`}
                        >
                            <span className="opacity-70 text-[10px]">
                                {node.type === 'gltf-model' ? '🧊' : node.type === 'box' ? '📦' : node.type === 'plane' ? '📰' : '🎯'}
                            </span>
                            {node.name}
                        </div>
                    ))}
                </div>
            </div>

            {/* BOTTOM PANEL: ASSET BROWSER */}
            <div className="flex flex-col h-1/2">
                {/* Tabs */}
                <div className="flex bg-gray-900/50 text-xs border-b border-gray-800">
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`flex-1 py-3 font-semibold uppercase tracking-wider flex justify-center items-center gap-2 transition-colors ${activeTab === 'files' ? 'text-purple-400 border-b-2 border-purple-500 bg-[#1e1e24]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <FileIcon size={14} /> Files
                    </button>
                    <button
                        onClick={() => setActiveTab('targets')}
                        className={`flex-1 py-3 font-semibold uppercase tracking-wider flex justify-center items-center gap-2 transition-colors ${activeTab === 'targets' ? 'text-purple-400 border-b-2 border-purple-500 bg-[#1e1e24]' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        <Target size={14} /> Targets
                    </button>
                </div>

                {/* File Upload Header */}
                <div className="px-3 py-2 flex justify-between items-center text-xs text-gray-400">
                    <span>{activeTab === 'files' ? 'Archivos del Proyecto' : 'Image Targets'}</span>

                    {isCompiling ? (
                        <span className="text-purple-400 animate-pulse text-[10px]">Compilando...</span>
                    ) : (
                        <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 p-1.5 rounded transition-colors text-white flex items-center gap-1">
                            <Upload size={14} />
                            {isSaving && <span className="text-[10px]">...</span>}
                            <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, activeTab === 'targets')}
                                accept={activeTab === 'targets' ? "image/*" : ".glb,.gltf,image/*,video/*,audio/*"}
                            />
                        </label>
                    )}
                </div>

                {/* Grid de Assets */}
                <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-2 content-start">
                    {filteredAssets.length === 0 && (
                        <div className="text-xs text-gray-500 text-center col-span-2 mt-4">
                            No hay archivos subidos.
                        </div>
                    )}
                    {filteredAssets.map(asset => (
                        <div
                            key={asset.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, asset)}
                            className="bg-gray-800/50 hover:bg-gray-700/50 border border-gray-700 hover:border-gray-500 rounded p-2 cursor-grab active:cursor-grabbing flex flex-col items-center gap-2 text-center transition-all group"
                        >
                            <div className="h-12 w-full bg-black/50 rounded flex items-center justify-center overflow-hidden">
                                {asset.type === 'image' || asset.type === 'image-target' ? (
                                    <img src={asset.url} alt={asset.name} className="object-cover w-full h-full opacity-70 group-hover:opacity-100" />
                                ) : asset.type === 'gltf' ? (
                                    <span className="text-2xl">🧊</span>
                                ) : asset.type === 'video' ? (
                                    <span className="text-2xl">🎬</span>
                                ) : (
                                    <span className="text-2xl">🎵</span>
                                )}
                            </div>
                            <span className="text-[10px] text-gray-400 truncate w-full" title={asset.name}>{asset.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </aside>
    );
}
