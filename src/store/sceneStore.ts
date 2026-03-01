import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// Representación en memoria de nuestra escena 3D y biblioteca de archivos

export interface Transform {
    x: number;
    y: number;
    z: number;
}

export interface Asset {
    id: string; // Unique ID for the uploaded file
    name: string; // e.g. "poseidon.glb", "marker.jpg"
    type: 'gltf' | 'image-target' | 'video' | 'image' | 'audio';
    url: string; // Public URL in Supabase Storage
    thumbnailUrl?: string; // For image-targets or video previews
}

export interface SceneNode {
    id: string;
    name: string;
    type: 'gltf-model' | 'image-target' | 'plane' | 'box' | 'light';
    assetId?: string; // Relación: Un modelo GLTF o una textura de Video apunta a un Asset subido
    position: Transform;
    rotation: Transform;
    scale: Transform;
    properties?: Record<string, any>; // Material colors, light intensities, etc.
}

interface DBSceneData {
    assets: Record<string, Asset>;
    sceneNodes: Record<string, SceneNode>;
}

interface SceneState {
    // Estado del Modelo de Datos
    assets: Record<string, Asset>;
    sceneNodes: Record<string, SceneNode>;

    // Estado de la UI
    activeNodeId: string | null;
    isSaving: boolean;

    // Acciones de UI
    setActiveNode: (id: string | null) => void;

    // Acciones de Nodos (Escena)
    updateTransform: (id: string, property: 'position' | 'rotation' | 'scale', value: Transform) => void;
    addNode: (node: SceneNode) => void;
    removeNode: (id: string) => void;
    updateNodeProperties: (id: string, properties: Record<string, any>) => void;
    updateNodeAssetId: (id: string, assetId: string) => void;

    // Acciones de Assets (Biblioteca)
    uploadAsset: (projectId: string, file: File, type: Asset['type'], thumbnailUrl?: string) => Promise<string | null>;

    // Sincronización Supabase
    saveScene: (projectId: string) => Promise<boolean>;
    loadScene: (projectId: string) => Promise<void>;
}

// Valores por defecto
const defaultSceneNodes: Record<string, SceneNode> = {};

export const useSceneStore = create<SceneState>((set, get) => ({
    assets: {},
    sceneNodes: defaultSceneNodes,
    activeNodeId: null,
    isSaving: false,

    setActiveNode: (id) => set({ activeNodeId: id }),

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
        activeNodeId: node.id // Auto-seleccionar al añadir
    })),

    removeNode: (id) => set((state) => {
        const newNodes = { ...state.sceneNodes };
        delete newNodes[id];
        return {
            sceneNodes: newNodes,
            activeNodeId: state.activeNodeId === id ? null : state.activeNodeId
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
                [id]: {
                    ...state.sceneNodes[id],
                    assetId
                }
            }
        };
    }),

    // Methods
    saveScene: async (projectId: string) => {
        set({ isSaving: true });
        try {
            const { assets, sceneNodes } = get();
            console.log(`Guardando el proyecto ${projectId} en la DB...`);

            const sceneDataToSave: DBSceneData = { assets, sceneNodes };

            const { error } = await supabase
                .from('projects')
                .upsert({
                    id: projectId,
                    scene_data: sceneDataToSave as any, // jsonb casting
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;

            console.log("¡Proyecto guardado con éxito!");
            set({ isSaving: false });
            return true;
        } catch (err) {
            console.error("Excepción inesperada al guardar:", err);
            set({ isSaving: false });
            return false;
        }
    },

    loadScene: async (projectId: string) => {
        console.log(`Cargando proyecto ${projectId}...`);
        try {
            const { data, error } = await supabase
                .from('projects')
                .select('scene_data')
                .eq('id', projectId)
                .single();

            if (error && error.code !== 'PGRST116') {
                console.error("Error cargando proyecto:", error);
                return;
            }

            if (data && data.scene_data) {
                const loadedData = data.scene_data as unknown as DBSceneData | Record<string, any>;

                // Compatibility mapping just in case it's the old format (entities)
                if ('entities' in loadedData && !('sceneNodes' in loadedData)) {
                    console.log("Migrando datos de formato antiguo (entities) a nuevo formato (sceneNodes)...");
                    set({
                        assets: {},
                        sceneNodes: loadedData.entities as any,
                        activeNodeId: null
                    });
                } else {
                    const typedData = loadedData as DBSceneData;
                    set({
                        assets: typedData.assets || {},
                        sceneNodes: typedData.sceneNodes || {},
                        activeNodeId: null
                    });
                }
                console.log("Datos cargados.");
            } else {
                console.log("Proyecto nuevo. Iniciando en blanco.");
                set({ assets: {}, sceneNodes: defaultSceneNodes, activeNodeId: null });
            }
        } catch (err) {
            console.error("Excepción inesperada al cargar:", err);
        }
    },

    uploadAsset: async (projectId: string, file: File, type: Asset['type'], thumbnailUrl?: string) => {
        set({ isSaving: true });
        try {
            // Generar nombre único para no sobreescribir
            const fileName = `${projectId}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '')}`;

            console.log(`Subiendo archivo ${fileName} a Supabase Storage...`);
            const { error } = await supabase.storage
                .from('assets')
                .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            // Obtener URL pública
            const { data: publicUrlData } = supabase.storage
                .from('assets')
                .getPublicUrl(fileName);

            const url = publicUrlData.publicUrl;
            console.log(`Archivo subido con éxito. URL: ${url}`);

            // Crear el Asset en la Biblioteca (NO instanciarlo automáticamente en la escena)
            const newAsset: Asset = {
                id: `asset-${Date.now()}`,
                name: file.name,
                type: type,
                url: url,
                ...(thumbnailUrl ? { thumbnailUrl } : {})
            };

            set((state) => ({
                assets: { ...state.assets, [newAsset.id]: newAsset },
                isSaving: false
            }));

            // Auto-guardar para guardar la biblioteca
            await get().saveScene(projectId);

            return newAsset.id;
        } catch (err) {
            console.error("Excepción inesperada al subir archivo:", err);
            set({ isSaving: false });
            return null;
        }
    }
}));
