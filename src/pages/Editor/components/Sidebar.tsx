import React, { useState } from 'react';
import { Upload, File as FileIcon, Target, Trash2, GripVertical } from 'lucide-react';
import { useSceneStore } from '../../../store/sceneStore';
import type { Asset, SceneNode } from '../../../store/sceneStore';
import { compileMindARImage } from '../../../lib/compiler';

const NODE_ICONS: Record<string, string> = {
    'gltf-model': '🧊',
    'box': '📦',
    'plane': '📰',
    'light': '💡',
    'image-target': '🎯',
    'camera': '🎥',
};

export default function Sidebar({ projectId }: { projectId: string }) {
    const {
        sceneNodes, activeNodeId, setActiveNode, addNode,
        assets, uploadAsset, deleteAsset, isSaving
    } = useSceneStore();

    const [activeTab, setActiveTab] = useState<'files' | 'targets'>('files');
    const [isCompiling, setIsCompiling] = useState(false);
    const [deletingAssetId, setDeletingAssetId] = useState<string | null>(null);

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
                const { mindBlob, thumbnailBlob } = await compileMindARImage(file);

                const cleanName = file.name.split('.')[0] || 'target';
                fileToUpload = new File([mindBlob], `${cleanName}.mind`, { type: 'application/octet-stream' });

                const thumbFile = new File([thumbnailBlob], `${cleanName}_thumb.jpg`, { type: 'image/jpeg' });
                const thumbPath = `${projectId}/${Date.now()}-thumb-${thumbFile.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;

                const { supabase } = await import('../../../lib/supabase');
                const { error: thumbError } = await supabase.storage.from('assets').upload(thumbPath, thumbFile, { cacheControl: '3600' });
                if (!thumbError) {
                    const { data } = supabase.storage.from('assets').getPublicUrl(thumbPath);
                    thumbnailUrl = data.publicUrl;
                }
            } catch (err) {
                console.error("Compilation failed:", err);
                alert("Error compilando la imagen para AR Tracking. Revisa la consola.");
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
                alert("Formato no soportado. Sube .glb, imagen, video o audio.");
                return;
            }
        }

        await uploadAsset(projectId, fileToUpload, type, thumbnailUrl);
        event.target.value = '';
    };

    // Drag & Drop
    const handleDragStart = (e: React.DragEvent, asset: Asset) => {
        e.dataTransfer.setData('application/json', JSON.stringify({ source: 'asset-browser', asset }));
    };

    const handleDropOnScene = (e: React.DragEvent) => {
        e.preventDefault();
        const dataStr = e.dataTransfer.getData('application/json');
        if (!dataStr) return;

        try {
            const data = JSON.parse(dataStr);
            if (data.source === 'asset-browser') {
                const asset = data.asset as Asset;

                let nodeType: SceneNode['type'] = 'box';
                let name = asset.name;

                if (asset.type === 'gltf') nodeType = 'gltf-model';
                else if (asset.type === 'image-target') nodeType = 'image-target';
                else if (asset.type === 'video' || asset.type === 'image') {
                    nodeType = 'plane';
                    name = `Plane (${asset.name})`;
                }

                const newNode: SceneNode = {
                    id: crypto.randomUUID(),
                    name,
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
            console.error("Drop error", err);
        }
    };

    const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); };

    const filteredAssets = Object.values(assets).filter(a =>
        activeTab === 'targets' ? a.type === 'image-target' : a.type !== 'image-target'
    );

    const handleAddPrimitive = (type: SceneNode['type'], name: string) => {
        addNode({
            id: crypto.randomUUID(),
            name,
            type,
            position: { x: 0, y: 0.5, z: 0 },
            rotation: { x: 0, y: 0, z: 0 },
            scale: { x: 1, y: 1, z: 1 },
            properties: type === 'light' ? {
                color: '#ffffff', intensity: 1, distance: 10, lightType: 'point'
            } : type === 'box' || type === 'plane' ? {
                color: '#7a8bcc'
            } : type === 'camera' ? {
                // Empty properties for now, but could hold fov later
            } : {}
        });
    };

    const handleDeleteAsset = (assetId: string) => {
        deleteAsset(assetId);
        setDeletingAssetId(null);
    };

    return (
        <aside className="w-64 bg-[#131318] border-r border-gray-800/60 flex flex-col h-full">
            {/* TOP: SCENE HIERARCHY */}
            <div className="flex flex-col h-1/2 border-b border-gray-800/60">
                <div className="p-3 bg-black/30 text-xs font-semibold uppercase tracking-wider text-gray-500 flex justify-between items-center">
                    <span>Scene</span>
                    <div className="flex gap-1.5 text-base">
                        <button onClick={() => handleAddPrimitive('box', 'Cubo')} title="Añadir Cubo" className="hover:scale-110 transition-transform opacity-70 hover:opacity-100">📦</button>
                        <button onClick={() => handleAddPrimitive('plane', 'Plano')} title="Añadir Plano" className="hover:scale-110 transition-transform opacity-70 hover:opacity-100">📰</button>
                        <button onClick={() => handleAddPrimitive('light', 'Luz')} title="Añadir Luz" className="hover:scale-110 transition-transform opacity-70 hover:opacity-100">💡</button>
                        <button onClick={() => handleAddPrimitive('camera', 'Cámara')} title="Añadir Cámara" className="hover:scale-110 transition-transform opacity-70 hover:opacity-100">🎥</button>
                    </div>
                </div>
                <div
                    className="flex-1 overflow-y-auto p-2 space-y-0.5"
                    onDrop={handleDropOnScene}
                    onDragOver={handleDragOver}
                >
                    {Object.values(sceneNodes).length === 0 && (
                        <div className="text-xs text-gray-600 text-center mt-8 px-4">
                            <div className="w-10 h-10 rounded-xl bg-white/5 border border-gray-800/60 flex items-center justify-center mx-auto mb-2">
                                <GripVertical size={16} className="text-gray-600" />
                            </div>
                            Arrastra archivos aquí<br />o añade primitivas arriba
                        </div>
                    )}
                    {Object.values(sceneNodes).map((node) => (
                        <div
                            key={node.id}
                            onClick={() => setActiveNode(node.id)}
                            className={`px-3 py-2 text-sm rounded-lg cursor-pointer truncate transition-all flex items-center gap-2 ${activeNodeId === node.id
                                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/25'
                                : 'bg-transparent text-gray-400 border border-transparent hover:bg-white/5 hover:text-gray-300'
                                }`}
                        >
                            <span className="opacity-70 text-[10px]">{NODE_ICONS[node.type] || '📦'}</span>
                            {node.name}
                        </div>
                    ))}
                </div>
            </div>

            {/* BOTTOM: ASSET BROWSER */}
            <div className="flex flex-col h-1/2">
                {/* Tabs */}
                <div className="flex bg-black/30 text-xs border-b border-gray-800/60">
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`flex-1 py-3 font-semibold uppercase tracking-wider flex justify-center items-center gap-2 transition-colors ${activeTab === 'files'
                            ? 'text-purple-400 border-b-2 border-purple-500 bg-[#131318]'
                            : 'text-gray-600 hover:text-gray-400'
                            }`}
                    >
                        <FileIcon size={13} /> Files
                    </button>
                    <button
                        onClick={() => setActiveTab('targets')}
                        className={`flex-1 py-3 font-semibold uppercase tracking-wider flex justify-center items-center gap-2 transition-colors ${activeTab === 'targets'
                            ? 'text-purple-400 border-b-2 border-purple-500 bg-[#131318]'
                            : 'text-gray-600 hover:text-gray-400'
                            }`}
                    >
                        <Target size={13} /> Targets
                    </button>
                </div>

                {/* Upload Header */}
                <div className="px-3 py-2 flex justify-between items-center text-xs text-gray-500">
                    <span>{activeTab === 'files' ? 'Archivos' : 'Image Targets'}</span>
                    {isCompiling ? (
                        <span className="text-purple-400 animate-pulse text-[10px]">Compilando...</span>
                    ) : (
                        <label className="cursor-pointer bg-white/5 hover:bg-white/10 p-1.5 rounded-lg transition-colors text-gray-400 hover:text-white flex items-center gap-1 border border-gray-800/60">
                            <Upload size={13} />
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

                {/* Asset Grid */}
                <div className="flex-1 overflow-y-auto p-2 grid grid-cols-2 gap-1.5 content-start">
                    {filteredAssets.length === 0 && (
                        <div className="text-xs text-gray-600 text-center col-span-2 mt-4">
                            Sin archivos aún. Haz clic en <Upload size={10} className="inline" /> para subir.
                        </div>
                    )}
                    {filteredAssets.map(asset => (
                        <div
                            key={asset.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, asset)}
                            className="bg-white/[0.03] hover:bg-white/[0.06] border border-gray-800/50 hover:border-gray-700/70 rounded-lg p-2 cursor-grab active:cursor-grabbing flex flex-col items-center gap-1.5 text-center transition-all group relative"
                        >
                            {/* Delete button */}
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeletingAssetId(asset.id); }}
                                className="absolute -top-1 -right-1 bg-red-500/80 hover:bg-red-500 text-white p-0.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity z-10"
                                title="Eliminar asset"
                            >
                                <Trash2 size={10} />
                            </button>

                            <div className="h-12 w-full bg-black/30 rounded flex items-center justify-center overflow-hidden">
                                {(asset.type === 'image' || (asset.type === 'image-target' && asset.thumbnailUrl)) ? (
                                    <img src={asset.thumbnailUrl || asset.url} alt={asset.name} className="object-cover w-full h-full opacity-70 group-hover:opacity-100 transition-opacity" />
                                ) : asset.type === 'gltf' ? (
                                    <span className="text-xl">🧊</span>
                                ) : asset.type === 'video' ? (
                                    <span className="text-xl">🎬</span>
                                ) : asset.type === 'image-target' ? (
                                    <span className="text-xl">🎯</span>
                                ) : (
                                    <span className="text-xl">🎵</span>
                                )}
                            </div>
                            <span className="text-[10px] text-gray-500 truncate w-full" title={asset.name}>{asset.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Delete Asset Confirmation */}
            {deletingAssetId && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-[#1a1a22] border border-gray-800 rounded-xl p-5 max-w-xs w-full mx-4 shadow-2xl">
                        <h3 className="text-white font-semibold text-sm text-center mb-2">¿Eliminar archivo?</h3>
                        <p className="text-gray-400 text-xs text-center mb-4">Se desvinculará de cualquier nodo que lo use.</p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDeletingAssetId(null)}
                                className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 py-1.5 rounded-lg text-xs font-medium transition-colors border border-gray-800"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDeleteAsset(deletingAssetId)}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-1.5 rounded-lg text-xs font-medium transition-colors"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}
