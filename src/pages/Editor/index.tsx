import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Play, Code, Box, X, Share2 } from 'lucide-react';
import Canvas3D from './components/Canvas3D';
import CodeEditor from './components/CodeEditor';
import Sidebar from './components/Sidebar';
import QRCodeModal from './components/QRCodeModal';

export type TransformMode = 'translate' | 'rotate' | 'scale';
type EditorView = 'scene' | 'code';

export default function Editor() {
    const { id } = useParams();
    const [mode, setMode] = useState<TransformMode>('translate');
    const [view, setView] = useState<EditorView>('scene');
    const [showPreview, setShowPreview] = useState(false);
    const [showQR, setShowQR] = useState(false);

    // Scene Store subscriptions
    const { isSaving } = useSceneStore();

    // Initial Load
    useEffect(() => {
        if (id) {
            useSceneStore.getState().loadScene(id);
        }
    }, [id]);

    return (
        <div className="flex flex-col h-screen bg-black text-white">
            {/* Top Navbar */}
            <header className="h-14 bg-[#1e1e24] border-b border-gray-800 flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <Link to="/" className="text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft size={20} />
                    </Link>
                    <h1 className="font-semibold text-lg border-l border-gray-700 pl-4">{id || 'Nuevo Proyecto'}</h1>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowQR(true)}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-sm transition-colors text-gray-300 border border-gray-700 hover:border-gray-500"
                        title="Compartir Proyecto (QR)"
                    >
                        <Share2 size={16} /> Compartir
                    </button>
                    <button
                        onClick={() => setShowPreview(true)}
                        className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded text-sm transition-colors text-gray-300"
                    >
                        <Play size={16} /> Preview (AR)
                    </button>
                    <button
                        onClick={() => useSceneStore.getState().saveScene(id || 'default')}
                        disabled={isSaving}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded font-medium text-sm transition-colors ${isSaving ? 'bg-purple-800 text-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700 text-white'}`}
                    >
                        <Save size={16} /> {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </header>

            {/* Editor Main Layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar (Hierarchy/Assets) */}
                <Sidebar projectId={id || 'default'} />

                {/* Central Workspace (Tabs + Content) */}
                <main className="flex-1 relative bg-[#0a0a0c] flex flex-col">
                    {/* View Tabs */}
                    <div className="h-10 bg-[#1e1e24] border-b border-gray-800 flex items-center px-1 z-10 sticky top-0">
                        <button
                            onClick={() => setView('scene')}
                            className={`flex items-center gap-2 px-4 py-1.5 mt-2 text-sm font-medium rounded-t-lg transition-colors ${view === 'scene' ? 'bg-[#0a0a0c] text-purple-400 border-t border-x border-gray-800' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            <Box size={14} /> Scene View
                        </button>
                        <button
                            onClick={() => setView('code')}
                            className={`flex items-center gap-2 px-4 py-1.5 mt-2 text-sm font-medium rounded-t-lg transition-colors ${view === 'code' ? 'bg-[#0a0a0c] text-purple-400 border-t border-x border-gray-800' : 'text-gray-400 hover:text-gray-200'}`}
                        >
                            <Code size={14} /> main.js
                        </button>
                    </div>

                    <div className="flex-1 relative overflow-hidden">
                        {view === 'scene' ? (
                            <>
                                <Canvas3D mode={mode} />
                                {/* Overlay Gizmos */}
                                <div className="absolute bottom-4 left-4 flex gap-2">
                                    <button
                                        onClick={() => setMode('translate')}
                                        className={`px-3 py-1.5 rounded text-xs transition-colors ${mode === 'translate' ? 'bg-purple-600 text-white font-medium' : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300'}`}
                                    >
                                        Mover (W)
                                    </button>
                                    <button
                                        onClick={() => setMode('rotate')}
                                        className={`px-3 py-1.5 rounded text-xs transition-colors ${mode === 'rotate' ? 'bg-purple-600 text-white font-medium' : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300'}`}
                                    >
                                        Rotar (E)
                                    </button>
                                    <button
                                        onClick={() => setMode('scale')}
                                        className={`px-3 py-1.5 rounded text-xs transition-colors ${mode === 'scale' ? 'bg-purple-600 text-white font-medium' : 'bg-gray-800/80 hover:bg-gray-700 text-gray-300'}`}
                                    >
                                        Escalar (R)
                                    </button>
                                </div>
                            </>
                        ) : (
                            <CodeEditor />
                        )}
                    </div>
                </main>

                {/* Right Sidebar (Inspector) */}
                <aside className="w-80 bg-[#1e1e24] border-l border-gray-800 overflow-y-auto">
                    <div className="p-3 bg-gray-900/50 text-xs font-semibold uppercase tracking-wider text-gray-400">
                        Inspector
                    </div>
                    <div className="p-4 space-y-6">
                        {/* Inspector Items will go here */}
                        <InspectorPanel />
                    </div>
                </aside>
            </div>

            {/* Mobile Simulator Overlay */}
            {showPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/60 p-4">
                    <div className="relative bg-[#1e1e24] w-[400px] h-[800px] rounded-[3rem] border-8 border-gray-900 shadow-2xl flex flex-col overflow-hidden">
                        {/* Mock Phone Notion (Camera bump) */}
                        <div className="absolute top-0 inset-x-0 h-6 bg-gray-900 rounded-b-3xl w-40 mx-auto z-10" />

                        {/* Overlay Header */}
                        <div className="absolute top-8 w-full flex justify-end px-6 z-10 pt-2">
                            <button onClick={() => setShowPreview(false)} className="bg-black/50 hover:bg-white/20 p-2 rounded-full backdrop-blur transition-all text-white">
                                <X size={20} />
                            </button>
                        </div>

                        {/* Iframe Viewer */}
                        <iframe
                            src={`/play/${id || 'default'}`}
                            title="AR Preview"
                            className="w-full h-full bg-black border-none"
                            allow="camera; gyroscope; accelerometer; magnetometer; vr"
                        />
                    </div>
                </div>
            )}

            <QRCodeModal
                isOpen={showQR}
                onClose={() => setShowQR(false)}
                projectId={id || 'default'}
            />
        </div>
    );
}

// Subcomponente temporal para el inspector
import { useSceneStore } from '../../store/sceneStore';

function InspectorPanel() {
    const { sceneNodes, activeNodeId, updateTransform, updateNodeAssetId, removeNode, assets } = useSceneStore();
    const activeNode = activeNodeId ? sceneNodes[activeNodeId] : null;

    if (!activeNode) return <div className="text-gray-500 text-sm">Selecciona un objeto</div>;

    const handlePosChange = (axis: 'x' | 'y' | 'z', val: string) => {
        updateTransform(activeNode.id, 'position', { ...activeNode.position, [axis]: parseFloat(val) || 0 });
    };

    const handleRotChange = (axis: 'x' | 'y' | 'z', val: string) => {
        const radValue = (parseFloat(val) || 0) * (Math.PI / 180);
        updateTransform(activeNode.id, 'rotation', { ...activeNode.rotation, [axis]: radValue });
    };

    const handleScaleChange = (axis: 'x' | 'y' | 'z', val: string) => {
        updateTransform(activeNode.id, 'scale', { ...activeNode.scale, [axis]: parseFloat(val) || 0 });
    };

    const handlePropertyChange = (prop: string, val: any) => {
        useSceneStore.getState().updateNodeProperties(activeNode.id, { [prop]: val });
    };

    // Helper functions to convert between rad and deg for display
    const toDeg = (rad: number) => (rad * (180 / Math.PI)).toFixed(1);

    // Filter assets by type for dropdowns
    const imageAssets = Object.values(assets).filter(a => a.type === 'image' || a.type === 'video');
    const targetAssets = Object.values(assets).filter(a => a.type === 'image-target');

    return (
        <div className="pb-10">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium text-gray-300">Transforms: {activeNode.name}</h3>
                <button onClick={() => removeNode(activeNode.id)} className="text-red-400 hover:text-red-300 text-xs px-2 py-1 bg-red-900/20 rounded border border-red-900/50">Eliminar</button>
            </div>

            <div className="space-y-3">
                {/* POSITION */}
                <div className="flex text-xs items-center gap-2">
                    <span className="w-16 text-gray-500">Posición</span>
                    <div className="flex-1 grid grid-cols-3 gap-1">
                        <input type="number" step="0.1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={activeNode.position.x.toFixed(2)} onChange={(e) => handlePosChange('x', e.target.value)} />
                        <input type="number" step="0.1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={activeNode.position.y.toFixed(2)} onChange={(e) => handlePosChange('y', e.target.value)} />
                        <input type="number" step="0.1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={activeNode.position.z.toFixed(2)} onChange={(e) => handlePosChange('z', e.target.value)} />
                    </div>
                </div>

                {/* ROTATION */}
                <div className="flex text-xs items-center gap-2">
                    <span className="w-16 text-gray-500">Rotación</span>
                    <div className="flex-1 grid grid-cols-3 gap-1">
                        <input type="number" step="1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={toDeg(activeNode.rotation.x)} onChange={(e) => handleRotChange('x', e.target.value)} />
                        <input type="number" step="1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={toDeg(activeNode.rotation.y)} onChange={(e) => handleRotChange('y', e.target.value)} />
                        <input type="number" step="1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={toDeg(activeNode.rotation.z)} onChange={(e) => handleRotChange('z', e.target.value)} />
                    </div>
                </div>

                {/* SCALE */}
                <div className="flex text-xs items-center gap-2">
                    <span className="w-16 text-gray-500">Escala</span>
                    <div className="flex-1 grid grid-cols-3 gap-1">
                        <input type="number" step="0.1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={activeNode.scale.x.toFixed(2)} onChange={(e) => handleScaleChange('x', e.target.value)} />
                        <input type="number" step="0.1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={activeNode.scale.y.toFixed(2)} onChange={(e) => handleScaleChange('y', e.target.value)} />
                        <input type="number" step="0.1" className="bg-black border border-gray-700 px-2 py-1 rounded text-center w-full focus:outline-none focus:border-purple-500 text-gray-300" value={activeNode.scale.z.toFixed(2)} onChange={(e) => handleScaleChange('z', e.target.value)} />
                    </div>
                </div>
            </div>

            {/* ADVANCED PROPERTIES / MATERIAL */}
            <div className="mt-6 space-y-4 pt-4 border-t border-gray-800">
                <h3 className="text-sm font-medium text-gray-300">Propiedades Especiales</h3>

                {/* COLOR CONTROL FOR PRIMITIVES */}
                {(activeNode.type === 'plane' || activeNode.type === 'box' || activeNode.type === 'light') && (
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-gray-500 block w-16">Color</label>
                        <input
                            type="color"
                            className="bg-black border border-gray-700 rounded h-8 outline-none cursor-pointer w-full p-0.5"
                            value={activeNode.properties?.color || '#ffffff'}
                            onChange={(e) => handlePropertyChange('color', e.target.value)}
                        />
                    </div>
                )}

                {/* LIGHT CONTROLS */}
                {activeNode.type === 'light' && (
                    <div className="space-y-4 pt-2">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500">Tipo de Luz</label>
                            <select
                                className="bg-black border border-gray-700 px-2 py-1.5 rounded text-xs text-gray-300 focus:outline-none focus:border-purple-500"
                                value={activeNode.properties?.lightType || 'point'}
                                onChange={(e) => handlePropertyChange('lightType', e.target.value)}
                            >
                                <option value="point">Spot/Point Light</option>
                                <option value="ambient">Luz Ambiental</option>
                                <option value="directional">Luz Direccional</option>
                                <option value="spot">Luz de Foco Cónico (Spot)</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1">
                            <div className="flex justify-between">
                                <label className="text-xs text-gray-500">Intensidad</label>
                                <span className="text-xs text-purple-400">{activeNode.properties?.intensity ?? 1}</span>
                            </div>
                            <input
                                type="range"
                                min="0" max="10" step="0.1"
                                className="accent-purple-500"
                                value={activeNode.properties?.intensity ?? 1}
                                onChange={(e) => handlePropertyChange('intensity', parseFloat(e.target.value))}
                            />
                        </div>

                        {(activeNode.properties?.lightType === 'point' || activeNode.properties?.lightType === 'spot') && (
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between">
                                    <label className="text-xs text-gray-500">Distancia / Alcance</label>
                                    <span className="text-xs text-purple-400">{activeNode.properties?.distance ?? 10}</span>
                                </div>
                                <input
                                    type="range"
                                    min="1" max="50" step="1"
                                    className="accent-purple-500"
                                    value={activeNode.properties?.distance ?? 10}
                                    onChange={(e) => handlePropertyChange('distance', parseFloat(e.target.value))}
                                />
                            </div>
                        )}

                        {activeNode.properties?.lightType === 'spot' && (
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between">
                                    <label className="text-xs text-gray-500">Ángulo Cónico</label>
                                    <span className="text-xs text-purple-400">{Math.round((activeNode.properties?.angle ?? Math.PI / 4) * (180 / Math.PI))}°</span>
                                </div>
                                <input
                                    type="range"
                                    min="0.1" max={Math.PI / 2} step="0.05"
                                    className="accent-purple-500"
                                    value={activeNode.properties?.angle ?? Math.PI / 4}
                                    onChange={(e) => handlePropertyChange('angle', parseFloat(e.target.value))}
                                />
                            </div>
                        )}
                    </div>
                )}

                {/* MATERIAL TEXTURE BINDING */}
                {(activeNode.type === 'plane' || activeNode.type === 'box') && (
                    <div className="flex flex-col gap-1 mt-4">
                        <label className="text-xs text-gray-500">Textura (Imagen/Video)</label>
                        <select
                            className="bg-black border border-gray-700 px-2 py-1.5 rounded text-xs text-gray-300 focus:outline-none focus:border-purple-500"
                            value={activeNode.assetId || ''}
                            onChange={(e) => updateNodeAssetId(activeNode.id, e.target.value)}
                        >
                            <option value="">-- Usar Color Sólido --</option>
                            {imageAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                {activeNode.type === 'image-target' && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Target a detectar</label>
                        <select
                            className="bg-black border border-gray-700 px-2 py-1.5 rounded text-xs text-gray-300 focus:outline-none focus:border-purple-500"
                            value={activeNode.assetId || ''}
                            onChange={(e) => updateNodeAssetId(activeNode.id, e.target.value)}
                        >
                            <option value="">-- Sin asignar --</option>
                            {targetAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                {activeNode.type === 'gltf-model' && (
                    <div className="text-xs text-gray-500 mt-2 bg-gray-900/40 p-2 rounded">
                        Importado: Los materiales de los modelos GLB se definen dentro del archivo original.
                    </div>
                )}
            </div>
        </div>
    );
}
