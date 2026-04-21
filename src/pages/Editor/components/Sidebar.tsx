import React, { useState } from 'react';
import { Upload, File as FileIcon, Target, Trash2 } from 'lucide-react';
import { useSceneStore } from '../../../store/sceneStore';
import type { Asset, SceneNode } from '../../../store/sceneStore';
import { compileMindARImage } from '../../../lib/compiler';
import { supabase } from '../../../lib/supabase';

export default function Sidebar({ projectId }: { projectId: string }) {
    const {
        addNode,
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

    const handleDeleteAsset = (assetId: string) => {
        deleteAsset(assetId);
        setDeletingAssetId(null);
    };

    return (
        <div className="flex flex-col h-full w-full bg-[#222]">
            {/* Header / Tabs */}
            <div className="flex items-center justify-between px-3 h-8 bg-[#1a1a1a] border-b border-[#333]">
                <div className="flex gap-2 h-full">
                    <button
                        onClick={() => setActiveTab('files')}
                        className={`px-3 text-[11px] font-medium tracking-wide uppercase transition-colors flex items-center gap-1.5 ${activeTab === 'files' ? 'text-white border-b-2 border-[#00aaff] bg-[#222]' : 'text-[#888] hover:text-[#bbb]'}`}
                    >
                        <FileIcon size={12} /> Models & Media
                    </button>
                    <button
                        onClick={() => setActiveTab('targets')}
                        className={`px-3 text-[11px] font-medium tracking-wide uppercase transition-colors flex items-center gap-1.5 ${activeTab === 'targets' ? 'text-white border-b-2 border-[#00aaff] bg-[#222]' : 'text-[#888] hover:text-[#bbb]'}`}
                    >
                        <Target size={12} /> AR Targets
                    </button>
                </div>

                {/* Upload Button */}
                <div className="flex items-center">
                    {isCompiling ? (
                        <span className="text-[#00aaff] animate-pulse text-[10px]">Compiling...</span>
                    ) : (
                        <label className="cursor-pointer bg-[#333] hover:bg-[#444] border border-[#555] px-2 py-1 rounded text-[10px] text-[#ddd] flex items-center gap-1 transition-colors">
                            <Upload size={12} />
                            {activeTab === 'targets' ? 'Upload MindAR Target' : 'Upload Asset'}
                            {isSaving && <span className="ml-1">...</span>}
                            <input
                                type="file"
                                className="hidden"
                                onChange={(e) => handleFileUpload(e, activeTab === 'targets')}
                                accept={activeTab === 'targets' ? "image/*" : ".glb,.gltf,image/*,video/*,audio/*"}
                            />
                        </label>
                    )}
                </div>
            </div>

            {/* Asset Grid */}
            <div
                className="flex-1 overflow-y-auto p-2"
                onDrop={handleDropOnScene}
                onDragOver={handleDragOver}
            >
                {filteredAssets.length === 0 ? (
                    <div className="text-[11px] text-[#666] flex items-center justify-center h-full italic">
                        {activeTab === 'files' ? "No models or media uploaded. Click upload to add assets." : "No Image Targets uploaded."}
                    </div>
                ) : (
                    <div className="flex flex-wrap gap-2 content-start">
                        {filteredAssets.map(asset => (
                            <div
                                key={asset.id}
                                draggable
                                onDragStart={(e) => handleDragStart(e, asset)}
                                className="w-24 bg-[#1a1a1a] border border-[#333] hover:border-[#666] rounded cursor-grab active:cursor-grabbing flex flex-col items-center text-center transition-colors group relative overflow-hidden"
                            >
                                {/* Delete button */}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDeletingAssetId(asset.id); }}
                                    className="absolute top-1 right-1 bg-[#ff4444] text-white p-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity z-10 border border-white/20"
                                    title="Delete Asset"
                                >
                                    <Trash2 size={10} />
                                </button>

                                <div className="h-16 w-full bg-[#111] flex items-center justify-center relative">
                                    {(asset.type === 'image' || (asset.type === 'image-target' && asset.thumbnailUrl)) ? (
                                        <img src={asset.thumbnailUrl || asset.url} alt={asset.name} className="object-cover w-full h-full opacity-80 group-hover:opacity-100" />
                                    ) : asset.type === 'gltf' ? (
                                        <span className="text-2xl text-[#666]">🧊</span>
                                    ) : asset.type === 'video' ? (
                                        <span className="text-2xl text-[#666]">🎬</span>
                                    ) : asset.type === 'image-target' ? (
                                        <span className="text-2xl text-[#666]">🎯</span>
                                    ) : (
                                        <span className="text-2xl text-[#666]">🎵</span>
                                    )}
                                </div>
                                <div className="p-1 w-full bg-[#222]">
                                    <span className="text-[9px] text-[#aaa] truncate block w-full" title={asset.name}>{asset.name}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Delete Asset Confirmation */}
            {deletingAssetId && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
                    <div className="bg-[#222] border border-[#444] rounded shadow-xl p-4 w-72">
                        <h3 className="text-[#eee] font-semibold text-xs mb-1">Delete Asset?</h3>
                        <p className="text-[#888] text-[10px] mb-4">This will unlink it from any nodes using it.</p>
                        <div className="flex gap-2 justify-end">
                            <button
                                onClick={() => setDeletingAssetId(null)}
                                className="px-3 py-1 bg-[#333] hover:bg-[#444] text-[#ddd] text-xs rounded border border-[#555] transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteAsset(deletingAssetId)}
                                className="px-3 py-1 bg-[#ff4444] hover:bg-[#ff6666] text-white text-xs rounded border border-[#ff4444] transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
