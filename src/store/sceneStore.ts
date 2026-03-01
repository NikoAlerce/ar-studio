import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// Representación en memoria de nuestra escena 3D y biblioteca de archivos

export interface Transform {
    x: number;
    y: number;
    z: number;
}

export interface Asset {
    id: string;
    name: string;
    type: 'gltf' | 'image-target' | 'video' | 'image' | 'audio';
    url: string;
    thumbnailUrl?: string;
}

export interface SceneNode {
    id: string;
    name: string;
    type: 'gltf-model' | 'image-target' | 'plane' | 'box' | 'light';
    assetId?: string;
    position: Transform;
    rotation: Transform;
    scale: Transform;
    properties?: Record<string, any>;
}

export interface ProjectInfo {
    id: string;
    name: string;
    thumbnail: string | null;
    created_at: string;
    updated_at: string;
}

interface DBSceneData {
    assets: Record<string, Asset>;
    sceneNodes: Record<string, SceneNode>;
    customCode?: string;
}

interface SceneState {
    // Data Model state
    assets: Record<string, Asset>;
    sceneNodes: Record<string, SceneNode>;
    customCode: string;

    // Project meta
    projectName: string;
    projects: ProjectInfo[];

    // UI State
    activeNodeId: string | null;
    isSaving: boolean;

    // UI Actions
    setActiveNode: (id: string | null) => void;
    setProjectName: (name: string) => void;

    // Node Actions
    updateTransform: (id: string, property: 'position' | 'rotation' | 'scale', value: Transform) => void;
    addNode: (node: SceneNode) => void;
    removeNode: (id: string) => void;
    updateNodeName: (id: string, name: string) => void;
    updateNodeProperties: (id: string, properties: Record<string, any>) => void;
    updateNodeAssetId: (id: string, assetId: string) => void;

    // Asset Actions
    uploadAsset: (projectId: string, file: File, type: Asset['type'], thumbnailUrl?: string) => Promise<string | null>;
    deleteAsset: (assetId: string) => void;

    // Code Action
    setCustomCode: (code: string) => void;

    // Supabase Sync
    saveScene: (projectId: string) => Promise<boolean>;
    loadScene: (projectId: string) => Promise<void>;
    listProjects: () => Promise<void>;
    deleteProject: (projectId: string) => Promise<boolean>;
    updateProjectName: (projectId: string, name: string) => Promise<void>;
}

const DEFAULT_CODE = `// AR Studio — Interactive Logic Layer
// This code runs inside your AR experience.
// Use it to add animations, interactions, and custom behavior.

// Example: make all entities slowly rotate
// AFRAME.registerComponent('auto-rotate', {
//   tick: function (time, timeDelta) {
//     this.el.object3D.rotation.y += 0.01;
//   }
// });
`;

const defaultSceneNodes: Record<string, SceneNode> = {};

export const useSceneStore = create<SceneState>((set, get) => ({
    assets: {},
    sceneNodes: defaultSceneNodes,
    customCode: DEFAULT_CODE,
    projectName: 'Proyecto sin nombre',
    projects: [],
    activeNodeId: null,
    isSaving: false,

    setActiveNode: (id) => set({ activeNodeId: id }),
    setProjectName: (name) => set({ projectName: name }),

    updateTransform: (id, property, value) => set((state) => {
        if (!state.sceneNodes[id]) return state;
        return {
            sceneNodes: {
                ...state.sceneNodes,
                [id]: {
                    ...state.sceneNodes[id],
                    [property]: value
                }
            }
        };
    }),

    addNode: (node) => set((state) => ({
        sceneNodes: { ...state.sceneNodes, [node.id]: node },
        activeNodeId: node.id
    })),

    removeNode: (id) => set((state) => {
        const newNodes = { ...state.sceneNodes };
        delete newNodes[id];
        return {
            sceneNodes: newNodes,
            activeNodeId: state.activeNodeId === id ? null : state.activeNodeId
        };
    }),

    updateNodeName: (id, name) => set((state) => {
        if (!state.sceneNodes[id]) return state;
        return {
            sceneNodes: {
                ...state.sceneNodes,
                [id]: { ...state.sceneNodes[id], name }
            }
        };
    }),

    updateNodeProperties: (id, properties) => set((state) => {
        if (!state.sceneNodes[id]) return state;
        return {
            sceneNodes: {
                ...state.sceneNodes,
                [id]: {
                    ...state.sceneNodes[id],
                    properties: { ...state.sceneNodes[id].properties, ...properties }
                }
            }
        };
    }),

    updateNodeAssetId: (id, assetId) => set((state) => {
        if (!state.sceneNodes[id]) return state;
        return {
            sceneNodes: {
                ...state.sceneNodes,
                [id]: { ...state.sceneNodes[id], assetId }
            }
        };
    }),

    deleteAsset: (assetId) => set((state) => {
        const newAssets = { ...state.assets };
        delete newAssets[assetId];
        // Also clear assetId from any nodes referencing it
        const newNodes = { ...state.sceneNodes };
        for (const nodeId in newNodes) {
            if (newNodes[nodeId].assetId === assetId) {
                newNodes[nodeId] = { ...newNodes[nodeId], assetId: undefined };
            }
        }
        return { assets: newAssets, sceneNodes: newNodes };
    }),

    setCustomCode: (code) => set({ customCode: code }),

    // ----- Supabase Methods -----

    saveScene: async (projectId: string) => {
        set({ isSaving: true });
        try {
            const { assets, sceneNodes, customCode, projectName } = get();

            const sceneDataToSave: DBSceneData = { assets, sceneNodes, customCode };

            const { error } = await supabase
                .from('projects')
                .upsert({
                    id: projectId,
                    name: projectName,
                    scene_data: sceneDataToSave as any,
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            console.log("✅ Proyecto guardado con éxito!");
            set({ isSaving: false });
            return true;
        } catch (err) {
            console.error("Error al guardar:", err);
            set({ isSaving: false });
            return false;
        }
    },

    loadScene: async (projectId: string) => {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('scene_data, name')
                .eq('id', projectId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error("Error cargando proyecto:", error);
                return;
            }

            if (data && data.scene_data) {
                const loadedData = data.scene_data as unknown as DBSceneData | Record<string, any>;

                // Compatibility: old format had 'entities' instead of 'sceneNodes'
                if ('entities' in loadedData && !('sceneNodes' in loadedData)) {
                    set({
                        assets: {},
                        sceneNodes: loadedData.entities as any,
                        customCode: DEFAULT_CODE,
                        projectName: data.name || 'Proyecto sin nombre',
                        activeNodeId: null
                    });
                } else {
                    const typedData = loadedData as DBSceneData;
                    set({
                        assets: typedData.assets || {},
                        sceneNodes: typedData.sceneNodes || {},
                        customCode: typedData.customCode || DEFAULT_CODE,
                        projectName: data.name || 'Proyecto sin nombre',
                        activeNodeId: null
                    });
                }
            } else {
                set({
                    assets: {},
                    sceneNodes: defaultSceneNodes,
                    customCode: DEFAULT_CODE,
                    projectName: 'Proyecto sin nombre',
                    activeNodeId: null,
                });
            }
        } catch (err) {
            console.error("Excepción al cargar:", err);
        }
    },

    listProjects: async () => {
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('id, name, thumbnail, created_at, updated_at')
                .order('updated_at', { ascending: false });

            if (error) {
                console.error("Error listando proyectos:", error);
                return;
            }

            set({ projects: (data || []) as ProjectInfo[] });
        } catch (err) {
            console.error("Excepción al listar proyectos:", err);
        }
    },

    deleteProject: async (projectId: string) => {
        try {
            const { error } = await supabase
                .from('projects')
                .delete()
                .eq('id', projectId);

            if (error) throw error;

            // Remove from local list
            set((state) => ({
                projects: state.projects.filter(p => p.id !== projectId)
            }));
            return true;
        } catch (err) {
            console.error("Error eliminando proyecto:", err);
            return false;
        }
    },

    updateProjectName: async (projectId: string, name: string) => {
        set({ projectName: name });
        try {
            await supabase
                .from('projects')
                .update({ name, updated_at: new Date().toISOString() })
                .eq('id', projectId);
        } catch (err) {
            console.error("Error actualizando nombre:", err);
        }
    },

    uploadAsset: async (projectId: string, file: File, type: Asset['type'], thumbnailUrl?: string) => {
        set({ isSaving: true });
        try {
            const fileName = `${projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;

            const { error } = await supabase.storage
                .from('assets')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            const { data: publicUrlData } = supabase.storage
                .from('assets')
                .getPublicUrl(fileName);

            const url = publicUrlData.publicUrl;

            const newAsset: Asset = {
                id: crypto.randomUUID(),
                name: file.name,
                type: type,
                url: url,
                ...(thumbnailUrl ? { thumbnailUrl } : {})
            };

            set((state) => ({
                assets: { ...state.assets, [newAsset.id]: newAsset },
                isSaving: false
            }));

            // Auto-save
            await get().saveScene(projectId);

            return newAsset.id;
        } catch (err) {
            console.error("Error al subir archivo:", err);
            set({ isSaving: false });
            return null;
        }
    }
}));
