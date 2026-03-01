import { useState, useEffect } from 'react';
import { Layers, Folder, Search, Settings, Share2, Plus, Trash2, Clock, Box } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import QRCodeModal from './Editor/components/QRCodeModal';
import { useSceneStore } from '../store/sceneStore';

export default function Dashboard() {
    const [search, setSearch] = useState('');
    const [selectedProjectForQR, setSelectedProjectForQR] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();

    const { projects, listProjects, deleteProject } = useSceneStore();

    useEffect(() => {
        listProjects().finally(() => setIsLoading(false));
    }, []);

    const handleNewProject = () => {
        const newId = crypto.randomUUID();
        navigate(`/editor/${newId}`);
    };

    const handleDelete = async (id: string) => {
        const ok = await deleteProject(id);
        if (ok) setDeletingId(null);
    };

    const filtered = projects.filter(p =>
        p.name?.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase())
    );

    const timeAgo = (dateStr: string) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'ahora';
        if (mins < 60) return `hace ${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        const days = Math.floor(hrs / 24);
        return `hace ${days}d`;
    };

    return (
        <div className="flex h-screen bg-[#0a0a0c] text-gray-200">
            {/* Sidebar */}
            <aside className="w-64 bg-[#131318] border-r border-gray-800/60 flex flex-col">
                <div className="p-6 pb-4">
                    <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                            <Layers size={16} className="text-white" />
                        </div>
                        AR Studio
                    </h1>
                    <p className="text-[11px] text-gray-500 mt-1 ml-[42px]">WebAR Platform</p>
                </div>
                <nav className="flex-1 px-3 space-y-1">
                    <a href="#" className="flex items-center gap-3 px-3 py-2.5 bg-purple-500/10 text-purple-300 rounded-lg text-sm font-medium border border-purple-500/20">
                        <Folder size={18} /> Proyectos
                    </a>
                    <a href="#" className="flex items-center gap-3 px-3 py-2.5 text-gray-500 hover:text-gray-300 hover:bg-white/5 rounded-lg text-sm transition-colors">
                        <Settings size={18} /> Ajustes
                    </a>
                </nav>
                <div className="p-4 border-t border-gray-800/60">
                    <div className="text-[10px] text-gray-600 text-center">AR Studio v1.0 — Self-hosted</div>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 overflow-auto">
                <header className="flex justify-between items-center p-8 pb-2">
                    <div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">Workspace</h2>
                        <p className="text-sm text-gray-500 mt-1">{projects.length} proyecto{projects.length !== 1 ? 's' : ''}</p>
                    </div>
                    <button
                        onClick={handleNewProject}
                        className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-lg font-medium transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/30 flex items-center gap-2"
                    >
                        <Plus size={18} /> Nuevo Proyecto
                    </button>
                </header>

                <div className="px-8 py-4">
                    <div className="relative max-w-md mb-8">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar proyectos..."
                            className="w-full bg-[#131318] border border-gray-800/60 text-white rounded-lg pl-11 pr-4 py-2.5 focus:outline-none focus:border-purple-500/50 focus:ring-1 focus:ring-purple-500/20 transition-all text-sm placeholder-gray-600"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {/* Loading State */}
                    {isLoading && (
                        <div className="flex flex-col items-center justify-center py-20">
                            <div className="w-10 h-10 border-3 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-gray-500 text-sm">Cargando proyectos...</p>
                        </div>
                    )}

                    {/* Empty State */}
                    {!isLoading && projects.length === 0 && (
                        <div className="flex flex-col items-center justify-center py-20 px-4">
                            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-purple-500/10 to-indigo-500/10 border border-purple-500/20 flex items-center justify-center mb-5">
                                <Box size={32} className="text-purple-400" />
                            </div>
                            <h3 className="text-xl font-semibold text-white mb-2">Sin proyectos aún</h3>
                            <p className="text-gray-500 text-sm text-center max-w-sm mb-6">
                                Crea tu primer proyecto AR y empieza a construir experiencias inmersivas para tus clientes.
                            </p>
                            <button
                                onClick={handleNewProject}
                                className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-2.5 rounded-lg font-medium transition-colors flex items-center gap-2"
                            >
                                <Plus size={18} /> Crear Primer Proyecto
                            </button>
                        </div>
                    )}

                    {/* Project Grid */}
                    {!isLoading && filtered.length > 0 && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {filtered.map((project) => (
                                <div
                                    key={project.id}
                                    className="bg-[#131318] border border-gray-800/60 rounded-xl overflow-hidden group hover:border-gray-700/80 transition-all hover:shadow-xl hover:shadow-black/20"
                                >
                                    {/* Thumbnail / Placeholder */}
                                    <div className="h-40 overflow-hidden relative bg-gradient-to-br from-[#1a1a22] to-[#0d0d12]">
                                        {/* Action buttons */}
                                        <div className="absolute top-2.5 left-2.5 z-10 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setSelectedProjectForQR(project.id); }}
                                                className="bg-black/60 backdrop-blur-md text-gray-300 hover:text-white p-2 rounded-lg transition-colors border border-white/10"
                                                title="Compartir QR"
                                            >
                                                <Share2 size={14} />
                                            </button>
                                            <button
                                                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeletingId(project.id); }}
                                                className="bg-black/60 backdrop-blur-md text-gray-300 hover:text-red-400 p-2 rounded-lg transition-colors border border-white/10"
                                                title="Eliminar proyecto"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>

                                        {project.thumbnail ? (
                                            <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <div className="w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                                                    <Box size={24} className="text-purple-400/60" />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="p-4 flex justify-between items-center">
                                        <div className="min-w-0 flex-1 mr-3">
                                            <h3 className="font-medium text-white text-sm truncate">{project.name || 'Sin nombre'}</h3>
                                            <div className="flex items-center gap-1.5 mt-1">
                                                <Clock size={11} className="text-gray-600" />
                                                <span className="text-[11px] text-gray-600">{timeAgo(project.updated_at)}</span>
                                            </div>
                                        </div>
                                        <Link
                                            to={`/editor/${project.id}`}
                                            className="text-xs bg-white/5 hover:bg-purple-500/20 text-gray-400 hover:text-purple-300 px-3.5 py-1.5 rounded-lg transition-all border border-gray-800/60 hover:border-purple-500/30 font-medium shrink-0"
                                        >
                                            Editar
                                        </Link>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* No search results */}
                    {!isLoading && projects.length > 0 && filtered.length === 0 && (
                        <div className="text-center py-12">
                            <p className="text-gray-500 text-sm">No se encontraron proyectos con "{search}"</p>
                        </div>
                    )}
                </div>
            </main>

            {/* Delete Confirmation Modal */}
            {deletingId && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100]">
                    <div className="bg-[#1a1a22] border border-gray-800 rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
                        <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 mx-auto">
                            <Trash2 size={20} className="text-red-400" />
                        </div>
                        <h3 className="text-white font-semibold text-center mb-2">¿Eliminar proyecto?</h3>
                        <p className="text-gray-400 text-sm text-center mb-6">Esta acción no se puede deshacer. Se eliminarán la escena y todos los datos asociados.</p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeletingId(null)}
                                className="flex-1 bg-white/5 hover:bg-white/10 text-gray-300 py-2 rounded-lg text-sm font-medium transition-colors border border-gray-800"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(deletingId)}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white py-2 rounded-lg text-sm font-medium transition-colors"
                            >
                                Eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <QRCodeModal
                isOpen={selectedProjectForQR !== null}
                onClose={() => setSelectedProjectForQR(null)}
                projectId={selectedProjectForQR || ''}
            />
        </div>
    );
}
