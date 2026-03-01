import { useState } from 'react';
import { Layers, Folder, Search, Settings, Share2 } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import QRCodeModal from './Editor/components/QRCodeModal';

const mockProjects = [
    { id: '1', name: 'Galería Arte Glitch', thumbnail: 'https://images.unsplash.com/photo-1547823528-76faeb13454b?q=80&w=300&auto=format&fit=crop', type: 'Image Target' },
    { id: '2', name: 'Menú Hamburguesas', thumbnail: 'https://images.unsplash.com/photo-1568901346375-23c9450c58cd?q=80&w=300&auto=format&fit=crop', type: 'SLAM' },
    { id: '3', name: 'Tarjeta Niko', thumbnail: 'https://images.unsplash.com/photo-1518002171953-a080ee817e1f?q=80&w=300&auto=format&fit=crop', type: 'Image Target' },
];

export default function Dashboard() {
    const [search, setSearch] = useState('');
    const [selectedProjectForQR, setSelectedProjectForQR] = useState<string | null>(null);
    const navigate = useNavigate();

    const handleNewProject = () => {
        const newId = `proj-${Date.now()}`;
        navigate(`/editor/${newId}`);
    };

    return (
        <div className="flex h-screen bg-[#111114] text-gray-200">
            {/* Sidebar Fija Izquierda */}
            <aside className="w-64 bg-[#1e1e24] border-r border-gray-800 flex flex-col">
                <div className="p-6">
                    <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                        <Layers className="text-purple-500" /> AR Studio
                    </h1>
                </div>
                <nav className="flex-1 px-4 space-y-2">
                    <a href="#" className="flex items-center gap-3 px-3 py-2 bg-gray-800/50 text-white rounded-md">
                        <Folder size={20} /> Proyectos
                    </a>
                    <a href="#" className="flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-gray-800/50 rounded-md transition-colors">
                        <Settings size={20} /> Ajustes
                    </a>
                </nav>
            </aside>

            {/* Contenido Principal */}
            <main className="flex-1 overflow-auto">
                <header className="flex justify-between items-center p-8 pb-4">
                    <h2 className="text-3xl font-bold text-white">Workspace</h2>
                    <button
                        onClick={handleNewProject}
                        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md font-medium transition-colors"
                    >
                        + Nuevo Proyecto
                    </button>
                </header>

                <div className="px-8 py-4">
                    <div className="relative max-w-md mb-8">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                        <input
                            type="text"
                            placeholder="Buscar proyectos..."
                            className="w-full bg-[#1e1e24] border border-gray-700 text-white rounded-md pl-10 pr-4 py-2 focus:outline-none focus:border-purple-500 transition-colors"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {mockProjects.filter(p => p.name.toLowerCase().includes(search.toLowerCase())).map((project) => (
                            <div key={project.id} className="bg-[#1e1e24] border border-gray-800 rounded-lg overflow-hidden group hover:border-gray-600 transition-colors">
                                <div className="h-40 overflow-hidden relative group">
                                    <button
                                        onClick={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            setSelectedProjectForQR(project.id);
                                        }}
                                        className="absolute top-2 left-2 bg-black/60 backdrop-blur-sm text-gray-300 hover:text-white p-1.5 rounded-full z-10 transition-colors opacity-0 group-hover:opacity-100"
                                        title="Compartir QR"
                                    >
                                        <Share2 size={16} />
                                    </button>
                                    <span className="absolute top-2 right-2 bg-black/60 backdrop-blur-sm text-xs px-2 py-1 rounded text-white z-10">
                                        {project.type}
                                    </span>
                                    <img src={project.thumbnail} alt={project.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                </div>
                                <div className="p-4 flex justify-between items-center">
                                    <h3 className="font-medium text-white">{project.name}</h3>
                                    <Link to={`/editor/${project.id}`} className="text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors">
                                        Editar
                                    </Link>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </main>

            <QRCodeModal
                isOpen={selectedProjectForQR !== null}
                onClose={() => setSelectedProjectForQR(null)}
                projectId={selectedProjectForQR || ''}
            />
        </div>
    );
}
