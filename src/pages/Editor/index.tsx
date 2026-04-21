import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Save, Play, Code, Box, X, Share2, Check } from 'lucide-react';
import Canvas3D from './components/Canvas3D';
import CodeEditor from './components/CodeEditor';
import AssetBrowser from './components/Sidebar';
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

    const { activeNodeId, saveProject, isSaving, projectName, addNode } = useSceneStore();

    // Initial Load
    useEffect(() => {
        if (id) {
            useSceneStore.getState().loadScene(id);
        }
    }, [id]);

    // Save handler
    const handleSave = useCallback(async () => {
        try {
            const success = await useSceneStore.getState().saveScene(id || 'default');
            if (success) {
                setSaveFlash(true);
                setTimeout(() => setSaveFlash(false), 2000);
            }
        } catch (err) {
            console.error("Save failed:", err);
            alert("Error al guardar. Intenta nuevamente.");
        }
    }, [id, saveProject]);

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
            } : {}
        });
    };

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
        <div className="flex flex-col h-screen bg-[#222222] text-[#888888] font-sans selection:bg-[#00aaff] selection:text-white overflow-hidden text-[13px]">
            {/* Top Menubar */}
            <header className="h-8 bg-[#222] border-b border-[#444] flex items-center justify-between px-2 shadow-sm z-50">
                <div className="flex items-center gap-4 h-full">
                    <Link to="/" className="text-[#888] hover:text-white px-2 py-1 transition-colors">
                        <ArrowLeft size={14} />
                    </Link>
                    <div className="flex gap-1 h-full items-center">
                        <ProjectNameInput projectId={id || 'default'} />
                        {/* Mock Menus for aesthetic */}
                        <MenuButton label="File" />
                        <MenuButton label="Edit" />
                        <MenuButton label="Add" />
                        <MenuButton label="View" />
                        <MenuButton label="Help" />
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={async () => { await handleSave(); setShowQR(true); }}
                        className="flex items-center gap-1.5 px-3 h-6 rounded bg-[#333] hover:bg-[#444] text-[#ddd] border border-[#555] transition-colors"
                        title="Guardar y compartir (QR)"
                    >
                        <Share2 size={12} /> Share
                    </button>
                    <button
                        onClick={async () => { await handleSave(); setShowPreview(true); }}
                        className="flex items-center gap-1.5 px-3 h-6 rounded bg-[#333] hover:bg-[#444] text-[#ddd] border border-[#555] transition-colors"
                    >
                        <Play size={12} /> Play
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isSaving}
                        className={`flex items-center gap-1.5 px-4 h-6 rounded font-medium transition-colors ${saveFlash
                            ? 'bg-[#4caf50] text-white border border-[#388e3c]'
                            : isSaving
                                ? 'bg-[#333] text-[#666] cursor-not-allowed border border-[#444]'
                                : 'bg-[#00aaff] hover:bg-[#0099ee] text-white border border-[#0088cc]'
                            }`}
                    >
                        {saveFlash ? <Check size={12} /> : <Save size={12} />}
                        {saveFlash ? 'Saved!' : isSaving ? 'Saving...' : 'Save'}
                    </button>
                </div>
            </header>

            {/* Editor Main Layout */}
            <div className="flex flex-1 overflow-hidden relative">
                {/* Central Workspace */}
                <main className="flex-1 relative bg-[#111] flex flex-col min-w-0">

                    {/* Add Primitives Toolbar (Top Left) */}
                    <div className="absolute top-2 left-2 z-10 flex gap-0.5 bg-[#222] p-1 rounded-sm border border-[#444] shadow-md">
                        <button onClick={() => handleAddPrimitive('box', 'Cube')} title="Add Cube" className="p-1 text-sm text-[#aaa] hover:text-white hover:bg-[#333] rounded transition-colors">📦</button>
                        <button onClick={() => handleAddPrimitive('plane', 'Plane')} title="Add Plane" className="p-1 text-sm text-[#aaa] hover:text-white hover:bg-[#333] rounded transition-colors">📰</button>
                        <button onClick={() => handleAddPrimitive('light', 'Light')} title="Add Light" className="p-1 text-sm text-[#aaa] hover:text-white hover:bg-[#333] rounded transition-colors">💡</button>
                        <button onClick={() => handleAddPrimitive('camera', 'Camera')} title="Add Camera" className="p-1 text-sm text-[#aaa] hover:text-white hover:bg-[#333] rounded transition-colors">🎥</button>
                    </div>

                    {/* Viewport Toolbar (Floating over canvas in three.js, here embedded at top) */}
                    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex gap-0.5 bg-[#222] p-1 rounded-sm border border-[#444] shadow-md">
                        {(['translate', 'rotate', 'scale'] as TransformMode[]).map((m) => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${mode === m
                                    ? 'bg-[#333] text-white'
                                    : 'text-[#888] hover:text-[#bbb] hover:bg-[#2a2a2a]'
                                    }`}
                            >
                                {m === 'translate' ? 'Translate' : m === 'rotate' ? 'Rotate' : 'Scale'}
                            </button>
                        ))}
                        <div className="w-px h-4 bg-[#555] my-auto mx-1" />
                        <button
                            onClick={() => setView('scene')}
                            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${(view === 'scene') ? 'bg-[#333] text-white' : 'text-[#888] hover:text-[#bbb] hover:bg-[#2a2a2a]'}`}
                        >
                            <Box size={12} className="inline mr-1" /> Viewport
                        </button>
                        <button
                            onClick={() => setView('code')}
                            className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${(view === 'code') ? 'bg-[#333] text-white' : 'text-[#888] hover:text-[#bbb] hover:bg-[#2a2a2a]'}`}
                        >
                            <Code size={12} className="inline mr-1" /> Script
                        </button>
                    </div>

                    <div className="flex-1 relative overflow-hidden">
                        {view === 'scene' ? <Canvas3D mode={mode} /> : <CodeEditor />}
                    </div>

                    {/* Bottom Panel: Assets (Using Sidebar component for now, just styled horizontally via CSS later or we keep it as a panel) */}
                    <div className="h-48 bg-[#222] border-t border-[#444] shrink-0 overflow-y-auto">
                        <AssetBrowser projectId={id || 'default'} />
                    </div>
                </main>

                {/* Right Panel (Outliner & Properties) */}
                <aside className="w-80 bg-[#222] border-l border-[#444] flex flex-col shrink-0">
                    <div className="h-1/3 border-b border-[#444] flex flex-col bg-[#222]">
                        <div className="h-8 border-b border-[#333] flex items-center px-3 bg-[#1a1a1a] text-[#aaa] font-semibold tracking-wide text-xs">
                            Outliner
                        </div>
                        <div className="flex-1 overflow-y-auto">
                            <HierarchyDrawer />
                        </div>
                    </div>
                    <div className="flex-1 flex flex-col bg-[#222] overflow-hidden">
                        <div className="h-8 border-b border-[#333] flex items-center px-3 bg-[#1a1a1a] text-[#aaa] font-semibold tracking-wide text-xs">
                            Properties
                        </div>
                        <div className="flex-1 overflow-y-auto p-3">
                            <InspectorPanel />
                        </div>
                    </div>
                </aside>
            </div>

            {/* Mobile Preview Overlay */}
            {showPreview && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center backdrop-blur-sm bg-black/80 p-4">
                    <div className="relative bg-[#000] w-[375px] h-[812px] rounded-[3rem] border-[14px] border-[#222] shadow-[0_0_50px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden">
                        <div className="absolute top-0 inset-x-0 h-7 bg-[#222] rounded-b-3xl w-40 mx-auto z-10" />
                        <div className="absolute top-2 w-full flex justify-end px-4 z-10 pt-2">
                            <button onClick={() => setShowPreview(false)} className="bg-black/50 hover:bg-white/20 p-2 rounded-full backdrop-blur-md transition-all text-white border border-[#444]">
                                <X size={16} />
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

function MenuButton({ label }: { label: string }) {
    return (
        <button className="h-full px-2 text-[#aaa] hover:text-white hover:bg-[#333] cursor-pointer text-xs flex items-center">
            {label}
        </button>
    );
}

// --- Outliner / Hierarchy Drawer ---
function HierarchyDrawer() {
    const { sceneNodes, activeNodeId, setActiveNode } = useSceneStore();
    return (
        <div className="py-2">
            {Object.values(sceneNodes).map(node => (
                <div
                    key={node.id}
                    onClick={() => setActiveNode(node.id)}
                    className={`px-3 py-1 cursor-pointer flex items-center gap-2 border-l-2 transition-colors text-xs ${activeNodeId === node.id ? 'bg-[#00aaff]/20 text-white border-[#00aaff]' : 'border-transparent text-[#888] hover:bg-[#333] hover:text-[#bbb]'}`}
                >
                    <span className="opacity-70 text-[10px]">
                        {node.type === 'camera' ? '🎥' : node.type === 'light' ? '💡' : node.type === 'gltf-model' ? '🧊' : node.type === 'image-target' ? '🎯' : '📦'}
                    </span>
                    {node.name}
                </div>
            ))}
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
                className="bg-[#111] border border-[#555] rounded outline-none text-[#ddd] text-xs px-2 py-0.5 w-32"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setLocalName(projectName); setEditing(false); } }}
            />
        );
    }

    return (
        <div
            className="text-xs text-[#aaa] hover:text-white px-2 cursor-pointer h-full flex items-center"
            onClick={() => setEditing(true)}
            title="Rename Project"
        >
            {projectName}
        </div>
    );
}

// --- Inspector Panel ---
function InspectorPanel() {
    const { sceneNodes, activeNodeId, updateTransform, updateNodeAssetId, removeNode, assets, updateNodeProperties } = useSceneStore();
    const activeNode = activeNodeId ? sceneNodes[activeNodeId] : null;

    if (!activeNode) {
        return (
            <div className="text-[#666] text-xs text-center py-8">
                Selecciona un objeto para editar sus propiedades...
            </div>
        );
    }

    const toDeg = (rad: number) => (rad * (180 / Math.PI)).toFixed(1);
    const imageAssets = Object.values(assets).filter(a => a.type === 'image' || a.type === 'video');
    const targetAssets = Object.values(assets).filter(a => a.type === 'image-target');

    return (
        <div className="pb-10 flex flex-col gap-4">
            {/* Node Name & Delete */}
            <div className="flex justify-between items-center border-b border-[#333] pb-2">
                <InlineNodeName nodeId={activeNode.id} currentName={activeNode.name} />
                <button
                    onClick={() => removeNode(activeNode.id)}
                    className="text-[#ff4444] hover:text-[#ff6666] text-[10px] px-2 py-1 rounded bg-[#ff4444]/10 border border-[#ff4444]/20 hover:border-[#ff4444]/50 transition-colors"
                >
                    DELETE
                </button>
            </div>

            {/* TRANSFORMS */}
            <div className="flex flex-col gap-2">
                <div className="text-[#aaa] font-semibold text-[10px] uppercase mb-1">Transform</div>
                <TransformRow
                    label="Position"
                    value={activeNode.position}
                    step={0.1}
                    onChange={(val) => updateTransform(activeNode.id, 'position', val)}
                />
                <TransformRow
                    label="Rotation"
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
                    label="Scale"
                    value={activeNode.scale}
                    step={0.1}
                    onChange={(val) => updateTransform(activeNode.id, 'scale', val)}
                />
            </div>

            {/* PROPERTIES */}
            <div className="pt-3 border-t border-[#333] flex flex-col gap-3">
                <div className="text-[#aaa] font-semibold text-[10px] uppercase">Material & Properties</div>

                {/* Color */}
                {(activeNode.type === 'plane' || activeNode.type === 'box' || activeNode.type === 'light') && (
                    <div className="flex items-center gap-2">
                        <label className="text-[11px] text-[#888] w-16">Color</label>
                        <input
                            type="color"
                            className="bg-[#111] border border-[#444] rounded h-6 w-full p-0 cursor-pointer"
                            value={activeNode.properties?.color || '#ffffff'}
                            onChange={(e) => updateNodeProperties(activeNode.id, { color: e.target.value })}
                        />
                    </div>
                )}

                {/* Light Controls */}
                {activeNode.type === 'light' && (
                    <div className="flex flex-col gap-3 mt-1">
                        <div className="flex items-center gap-2">
                            <label className="text-[11px] text-[#888] w-16">Type</label>
                            <select
                                className="bg-[#111] border border-[#444] px-1 py-0.5 rounded text-[11px] text-[#ddd] focus:outline-none focus:border-[#00aaff] flex-1"
                                value={activeNode.properties?.lightType || 'point'}
                                onChange={(e) => updateNodeProperties(activeNode.id, { lightType: e.target.value })}
                            >
                                <option value="point">Point Light</option>
                                <option value="ambient">Ambient Light</option>
                                <option value="directional">Directional Light</option>
                                <option value="spot">Spot Light</option>
                            </select>
                        </div>

                        <SliderControl
                            label="Intensity"
                            value={activeNode.properties?.intensity ?? 1}
                            min={0} max={10} step={0.1}
                            onChange={(v) => updateNodeProperties(activeNode.id, { intensity: v })}
                        />

                        {(activeNode.properties?.lightType === 'point' || activeNode.properties?.lightType === 'spot') && (
                            <SliderControl
                                label="Distance"
                                value={activeNode.properties?.distance ?? 10}
                                min={1} max={50} step={1}
                                onChange={(v) => updateNodeProperties(activeNode.id, { distance: v })}
                            />
                        )}

                        {activeNode.properties?.lightType === 'spot' && (
                            <SliderControl
                                label="Angle"
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
                    <div className="flex flex-col gap-1 mt-1">
                        <label className="text-[11px] text-[#888]">Texture Map</label>
                        <select
                            className="bg-[#111] border border-[#444] px-1 py-1 rounded text-[11px] text-[#ddd] focus:outline-none focus:border-[#00aaff] w-full mt-0.5"
                            value={activeNode.assetId || ''}
                            onChange={(e) => updateNodeAssetId(activeNode.id, e.target.value)}
                        >
                            <option value="">— Solid Color —</option>
                            {imageAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                {/* Image Target */}
                {activeNode.type === 'image-target' && (
                    <div className="flex flex-col gap-1 mt-1">
                        <label className="text-[11px] text-[#888]">Target Image (.mind)</label>
                        <select
                            className="bg-[#111] border border-[#444] px-1 py-1 rounded text-[11px] text-[#ddd] focus:outline-none focus:border-[#00aaff] w-full mt-0.5"
                            value={activeNode.assetId || ''}
                            onChange={(e) => updateNodeAssetId(activeNode.id, e.target.value)}
                        >
                            <option value="">— Unassigned —</option>
                            {targetAssets.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        </select>
                    </div>
                )}

                {/* Camera Props */}
                {activeNode.type === 'camera' && (
                    <div className="flex flex-col gap-3 mt-1">
                        <SliderControl
                            label="FOV"
                            value={activeNode.properties?.fov ?? 60}
                            min={30} max={120} step={1}
                            onChange={(v) => updateNodeProperties(activeNode.id, { fov: v })}
                        />
                    </div>
                )}

                {/* GLTF Info */}
                {activeNode.type === 'gltf-model' && (
                    <div className="text-[10px] text-[#666] bg-[#1a1a1a] p-2 rounded border border-[#333] mt-2 leading-tight">
                        GLB Materials are defined inside the external file.
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
                className="bg-[#111] border border-[#00aaff] outline-none text-xs font-semibold text-[#eee] w-32 px-1 rounded"
                value={val}
                onChange={(e) => setVal(e.target.value)}
                onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') commit(); }}
            />
        );
    }

    return (
        <h3
            className="text-xs font-semibold text-[#eee] cursor-text hover:text-[#fff] transition-colors"
            onDoubleClick={() => setEditing(true)}
            title="Double click to rename"
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
        <div className="flex text-[11px] items-center gap-1">
            <span className="w-14 text-[#888] shrink-0">{label}</span>
            <div className="flex-1 grid grid-cols-3 gap-1 relative">
                {(['x', 'y', 'z'] as const).map((axis) => (
                    <div key={axis} className="relative">
                        <span className="absolute left-1.5 top-1 text-[9px] text-[#555] uppercase">{axis}</span>
                        <NumericInput
                            value={value[axis]}
                            step={step}
                            onChange={(v) => onChange({ ...value, [axis]: v })}
                        />
                    </div>
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
            className="bg-[#111] border border-[#333] pl-4 pr-1 py-0.5 rounded text-right w-full focus:outline-none focus:border-[#00aaff] text-[#ddd] transition-colors font-mono"
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
        <div className="flex items-center gap-2">
            <label className="text-[11px] text-[#888] w-16">{label}</label>
            <input
                type="range"
                min={min} max={max} step={step}
                className="accent-[#00aaff] flex-1 h-1 bg-[#111] rounded appearance-none cursor-pointer"
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
            />
            <span className="text-[11px] text-[#00aaff] font-mono w-8 text-right shrink-0">{displayFn ? displayFn(value) : value.toFixed(1)}</span>
        </div>
    );
}
