import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Play, Code, Box, X, Share2, Check } from 'lucide-react';
import Canvas3D from './components/Canvas3D';
import CodeEditor from './components/CodeEditor';
import Sidebar from './components/Sidebar';
import QRCodeModal from './components/QRCodeModal';
import { useSceneStore } from '../../store/sceneStore';

export type TransformMode = 'translate' | 'rotate' | 'scale';
type EditorView = 'scene' | 'code';

export default function Editor() {
    const { id } = useParams();
    const [mode, setMode] = useState<TransformMode>('translate');
    const [view, setView] = useState<EditorView>('scene');
    const [showPreview, setShowPreview] = useState(false);
    const [showQR, setShowQR] = useState(false);
    const [saveFlash, setSaveFlash] = useState(false);

    const { isSaving, activeNodeId } = useSceneStore();

    // Initial Load
    useEffect(() => {
        if (id) {
            useSceneStore.getState().loadScene(id);
        }
    }, [id]);

    // Save handler
    const handleSave = useCallback(async () => {
        const success = await useSceneStore.getState().saveScene(id || 'default');
        if (success) {
            setSaveFlash(true);
            setTimeout(() => setSaveFlash(false), 2000);
        }
    }, [id]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            // Don't trigger shortcuts when typing in inputs
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.closest('.monaco-editor')) return;

            switch (e.key.toLowerCase()) {
                case 'w': setMode('translate'); break;
                case 'e': setMode('rotate'); break;
                case 'r': setMode('scale'); break;
                case 'delete':
                case 'backspace':
                    if (activeNodeId) {
                        useSceneStore.getState().removeNode(activeNodeId);
                    }
                    break;
            }

            // Ctrl+S to save
            if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                e.preventDefault();
                handleSave();
            }
        };

        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [activeNodeId, handleSave]);

    return (
        <div className="flex flex-col h-screen bg-black text-white">
            {/* Top Navbar */}
            <header className="h-14 bg-[#131318] border-b border-gray-800/60 flex items-center justify-between px-4">
                <div className="flex items-center gap-4">
                    <Link to="/" className="text-gray-500 hover:text-white transition-colors p-1">
                        <ArrowLeft size={18} />
                    </Link>
                    <div className="border-l border-gray-800/60 pl-4">
                        <ProjectNameInput projectId={id || 'default'} />
                    </div>
                </div>
                <div className="flex items-center gap-2.5">
                    <button
                        onClick={async () => { await handleSave(); setShowQR(true); }}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm transition-all text-gray-400 hover:text-white border border-gray-800/60"
                        title="Guardar y compartir (QR)"
                    >
                        <Share2 size={15} /> Compartir
                    </button>
                    <button
                        onClick={async () => { await handleSave(); setShowPreview(true); }}
                        className="flex items-center gap-2 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg text-sm transition-all text-gray-400 hover:text-white border border-gray-800/60"
                    >
                        <Play size={15} /> Preview
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-lg font-medium text-sm transition-all ${saveFlash
                            ? 'bg-green-600 text-white'
                            : isSaving
                                ? 'bg-purple-800/50 text-gray-400 cursor-not-allowed'
                                : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white shadow-lg shadow-purple-500/20'
                            }`}
                    >
                        {saveFlash ? <Check size={15} /> : <Save size={15} />}
                        {saveFlash ? '¡Guardado!' : isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </header>

            {/* Editor Main Layout */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left Sidebar */}
                <Sidebar projectId={id || 'default'} />

                {/* Central Workspace */}
                <main className="flex-1 relative bg-[#0a0a0c] flex flex-col">
                    {/* View Tabs */}
                    <div className="h-10 bg-[#131318] border-b border-gray-800/60 flex items-center px-1 z-10 sticky top-0">
                        <button
                            onClick={() => setView('scene')}
                            className={`flex items-center gap-2 px-4 py-1.5 mt-2 text-sm font-medium rounded-t-lg transition-colors ${view === 'scene' ? 'bg-[#0a0a0c] text-purple-400 border-t border-x border-gray-800/60' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Box size={14} /> Scene View
                        </button>
                        <button
                            onClick={() => setView('code')}
                            className={`flex items-center gap-2 px-4 py-1.5 mt-2 text-sm font-medium rounded-t-lg transition-colors ${view === 'code' ? 'bg-[#0a0a0c] text-purple-400 border-t border-x border-gray-800/60' : 'text-gray-500 hover:text-gray-300'}`}
                        >
                            <Code size={14} /> main.js
                        </button>
                    </div>

                    <div className="flex-1 relative overflow-hidden">
                        {view === 'scene' ? (
                            <>
                                <Canvas3D mode={mode} />
                                {/* Transform Mode Buttons */}
                                <div className="absolute bottom-4 left-4 flex gap-1.5 bg-black/60 backdrop-blur-md p-1 rounded-lg border border-gray-800/40">
                                    {(['translate', 'rotate', 'scale'] as TransformMode[]).map((m) => (
                                        <button
                                            key={m}
                                            onClick={() => setMode(m)}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${mode === m
                                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                                                : 'text-gray-400 hover:text-white hover:bg-white/10'
                                                }`}
                                        >
                                            {m === 'translate' ? 'Mover (W)' : m === 'rotate' ? 'Rotar (E)' : 'Escalar (R)'}
                                        </button>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <CodeEditor />
                        )}
                    </div>
                </main>

                {/* Right Sidebar (Inspector) */}
                <aside className="w-80 bg-[#131318] border-l border-gray-800/60 overflow-y-auto">
                    <div className="p-3 bg-black/30 text-xs font-semibold uppercase tracking-wider text-gray-500">
                        Inspector
                    </div>
                    <div className="p-4 space-y-6">
                        <InspectorPanel />
                    </div>
                </aside>
            </div>

            {/* Mobile Preview Overlay */}
            {showPreview && (
                <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/70 p-4">
                    <div className="relative bg-[#1a1a22] w-[400px] h-[800px] rounded-[3rem] border-8 border-gray-900 shadow-2xl shadow-black/50 flex flex-col overflow-hidden">
                        <div className="absolute top-0 inset-x-0 h-6 bg-gray-900 rounded-b-3xl w-40 mx-auto z-10" />
                        <div className="absolute top-8 w-full flex justify-end px-6 z-10 pt-2">
                            <button onClick={() => setShowPreview(false)} className="bg-black/50 hover:bg-white/20 p-2 rounded-full backdrop-blur transition-all text-white">
                                <X size={20} />
                            </button>
                        </div>
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

// --- Editable Project Name ---
function ProjectNameInput({ projectId }: { projectId: string }) {
    const { projectName, updateProjectName } = useSceneStore();
    const [editing, setEditing] = useState(false);
    const [localName, setLocalName] = useState(projectName);

    useEffect(() => { setLocalName(projectName); }, [projectName]);

    const commit = () => {
        setEditing(false);
        if (localName.trim() && localName !== projectName) {
            updateProjectName(projectId, localName.trim());
        }
    };

    if (editing) {
        return (
            <input
                autoFocus
                className="bg-transparent border-b border-purple-500 outline-none text-white font-semibold text-lg w-60 py-0"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocalName(projectName); setEditing(false); } }}
            />
        );
    }

    return (
        <h1
            className="font-semibold text-lg text-white cursor-pointer hover:text-purple-300 transition-colors"
            onClick={() => setEditing(true)}
            title="Clic para renombrar"
        >
            {projectName}
        </h1>
    );
}

// --- Inspector Panel ---
function InspectorPanel() {
    const { sceneNodes, activeNodeId, updateTransform, updateNodeAssetId, removeNode, assets, updateNodeProperties } = useSceneStore();
    const activeNode = activeNodeId ? sceneNodes[activeNodeId] : null;

    if (!activeNode) {
        return (
            <div className="text-gray-600 text-sm text-center py-8">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-gray-800/60 flex items-center justify-center mx-auto mb-3">
                    <Box size={20} className="text-gray-600" />
                </div>
                Selecciona un objeto para editarlo
            </div>
        );
    }

    const toDeg = (rad: number) => (rad * (180 / Math.PI)).toFixed(1);
    const imageAssets = Object.values(assets).filter(a => a.type === 'image' || a.type === 'video');
    const targetAssets = Object.values(assets).filter(a => a.type === 'image-target');

    return (
        <div className="pb-10 space-y-5">
            {/* Node Name & Delete */}
            <div className="flex justify-between items-center">
                <InlineNodeName nodeId={activeNode.id} currentName={activeNode.name} />
                <button
                    onClick={() => removeNode(activeNode.id)}
                    className="text-red-400 hover:text-red-300 text-xs px-2.5 py-1 bg-red-500/10 rounded-lg border border-red-500/20 hover:border-red-500/40 transition-all"
                >
                    Eliminar
                </button>
            </div>

            {/* TRANSFORMS */}
            <div className="space-y-2">
                <TransformRow
                    label="Posición"
                    value={activeNode.position}
                    step={0.1}
                    onChange={(val) => updateTransform(activeNode.id, 'position', val)}
                />
                <TransformRow
                    label="Rotación"
                    value={{
                        x: parseFloat(toDeg(activeNode.rotation.x)),
                        y: parseFloat(toDeg(activeNode.rotation.y)),
                        z: parseFloat(toDeg(activeNode.rotation.z))
                    }}
                    step={1}
                    onChange={(val) => updateTransform(activeNode.id, 'rotation', {
                        x: val.x * (Math.PI / 180),
                        y: val.y * (Math.PI / 180),
                        z: val.z * (Math.PI / 180)
                    })}
                />

                <TransformRow
                    label="Escala"
                    value={activeNode.scale}
                    step={0.1}
                    onChange={(val) => updateTransform(activeNode.id, 'scale', val)}
                />
            </div>

            {/* PROPERTIES */}
            <div className="pt-4 border-t border-gray-800/60 space-y-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">Propiedades</h3>

                {/* Color */}
                {(activeNode.type === 'plane' || activeNode.type === 'box' || activeNode.type === 'light') && (
                    <div className="flex items-center gap-3">
                        <label className="text-xs text-gray-500 w-16">Color</label>
                        <input
                            type="color"
                            className="bg-black border border-gray-800 rounded-lg h-8 w-full p-0.5 cursor-pointer"
                            value={activeNode.properties?.color || '#ffffff'}
                            onChange={(e) => updateNodeProperties(activeNode.id, { color: e.target.value })}
                        />
                    </div>
                )}

                {/* Light Controls */}
                {activeNode.type === 'light' && (
                    <div className="space-y-4">
                        <div className="flex flex-col gap-1">
                            <label className="text-xs text-gray-500">Tipo de Luz</label>
                            <select
                                className="bg-black border border-gray-800 px-2 py-1.5 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-purple-500"
                                value={activeNode.properties?.lightType || 'point'}
                                onChange={(e) => updateNodeProperties(activeNode.id, { lightType: e.target.value })}
                            >
                                <option value="point">Point Light</option>
                                <option value="ambient">Luz Ambiental</option>
                                <option value="directional">Luz Direccional</option>
                                <option value="spot">Spot Light</option>
                            </select>
                        </div>

                        <SliderControl
                            label="Intensidad"
                            value={activeNode.properties?.intensity ?? 1}
                            min={0} max={10} step={0.1}
                            onChange={(v) => updateNodeProperties(activeNode.id, { intensity: v })}
                        />

                        {(activeNode.properties?.lightType === 'point' || activeNode.properties?.lightType === 'spot') && (
                            <SliderControl
                                label="Distancia"
                                value={activeNode.properties?.distance ?? 10}
                                min={1} max={50} step={1}
                                onChange={(v) => updateNodeProperties(activeNode.id, { distance: v })}
                            />
                        )}

                        {activeNode.properties?.lightType === 'spot' && (
                            <SliderControl
                                label="Ángulo"
                                value={activeNode.properties?.angle ?? Math.PI / 4}
                                min={0.1} max={Math.PI / 2} step={0.05}
                                displayFn={(v) => `${Math.round(v * (180 / Math.PI))}°`}
                                onChange={(v) => updateNodeProperties(activeNode.id, { angle: v })}
                            />
                        )}
                    </div>
                )}

                {/* Material Texture */}
                {(activeNode.type === 'plane' || activeNode.type === 'box') && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Textura (Imagen/Video)</label>
                        <select
                            className="bg-black border border-gray-800 px-2 py-1.5 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-purple-500"
                            value={activeNode.assetId || ''}
                            onChange={(e) => updateNodeAssetId(activeNode.id, e.target.value)}
                        >
                            <option value="">— Color Sólido —</option>
                            {imageAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                {/* Image Target */}
                {activeNode.type === 'image-target' && (
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-gray-500">Target a detectar</label>
                        <select
                            className="bg-black border border-gray-800 px-2 py-1.5 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-purple-500"
                            value={activeNode.assetId || ''}
                            onChange={(e) => updateNodeAssetId(activeNode.id, e.target.value)}
                        >
                            <option value="">— Sin asignar —</option>
                            {targetAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                {/* GLTF Info */}
                {activeNode.type === 'gltf-model' && (
                    <div className="text-xs text-gray-500 bg-white/5 p-3 rounded-lg border border-gray-800/60">
                        Los materiales del modelo GLB se definen dentro del archivo original.
                    </div>
                )}
            </div>
        </div>
    );
}

// --- Reusable Components ---

function InlineNodeName({ nodeId, currentName }: { nodeId: string; currentName: string }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(currentName);
    const { updateNodeName } = useSceneStore();

    useEffect(() => { setVal(currentName); }, [currentName]);

    const commit = () => {
        setEditing(false);
        if (val.trim()) updateNodeName(nodeId, val.trim());
    };

    if (editing) {
        return (
            <input
                autoFocus
                className="bg-transparent border-b border-purple-500 outline-none text-sm font-medium text-gray-300 w-40"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
            />
        );
    }

    return (
        <h3
            className="text-sm font-medium text-gray-300 cursor-pointer hover:text-purple-300 transition-colors"
            onDoubleClick={() => setEditing(true)}
            title="Doble clic para renombrar"
        >
            {currentName}
        </h3>
    );
}

function TransformRow({ label, value, step, onChange }: {
    label: string;
    value: { x: number; y: number; z: number };
    step: number;
    onChange: (v: { x: number; y: number; z: number }) => void;
}) {
    return (
        <div className="flex text-xs items-center gap-2">
            <span className="w-16 text-gray-500 shrink-0">{label}</span>
            <div className="flex-1 grid grid-cols-3 gap-1">
                {(['x', 'y', 'z'] as const).map((axis) => (
                    <NumericInput
                        key={axis}
                        value={value[axis]}
                        step={step}
                        onChange={(v) => onChange({ ...value, [axis]: v })}
                    />
                ))}
            </div>
        </div>
    );
}

function NumericInput({ value, step, onChange }: {
    value: number;
    step: number;
    onChange: (v: number) => void;
}) {
    const [local, setLocal] = useState(value.toFixed(step < 1 ? 2 : 1));
    const [focused, setFocused] = useState(false);

    useEffect(() => {
        if (!focused) setLocal(value.toFixed(step < 1 ? 2 : 1));
    }, [value, focused, step]);

    const commit = () => {
        setFocused(false);
        const parsed = parseFloat(local);
        if (!isNaN(parsed)) onChange(parsed);
        else setLocal(value.toFixed(step < 1 ? 2 : 1));
    };

    return (
        <input
            type="number"
            step={step}
            className="bg-black border border-gray-800 px-2 py-1 rounded-md text-center w-full focus:outline-none focus:border-purple-500 text-gray-300 transition-colors"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
        />
    );
}

function SliderControl({ label, value, min, max, step, onChange, displayFn }: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (v: number) => void;
    displayFn?: (v: number) => string;
}) {
    return (
        <div className="flex flex-col gap-1">
            <div className="flex justify-between">
                <label className="text-xs text-gray-500">{label}</label>
                <span className="text-xs text-purple-400 font-mono">{displayFn ? displayFn(value) : value.toFixed(1)}</span>
            </div>
            <input
                type="range"
                min={min} max={max} step={step}
                className="accent-purple-500 w-full"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
            />
        </div>
    );
}
