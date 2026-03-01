import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface AROverlayUIProps {
    status: 'loading' | 'preparing' | 'ready' | 'error' | 'empty';
    errorMsg?: string;
    onStart: () => void;
    xrSupported: boolean;
}

export default function AROverlayUI({ status, errorMsg, onStart, xrSupported }: AROverlayUIProps) {
    const [started, setStarted] = useState(false);

    const handleStart = () => {
        setStarted(true);
        onStart();
    };

    if (started && status === 'ready') return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md text-white px-6 text-center font-sans"
            >
                {status === 'empty' && (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
                        <div className="w-20 h-20 rounded-2xl bg-violet-500/10 border border-violet-500/25 flex items-center justify-center mb-6 mx-auto text-4xl">💡</div>
                        <h2 className="text-2xl font-bold mb-2">Proyecto Vacío</h2>
                        <p className="text-gray-400 text-sm max-w-xs mx-auto leading-relaxed">
                            No hay contenido. Abrí el Editor y guardá la escena.
                        </p>
                    </motion.div>
                )}

                {status === 'error' && (
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
                        <div className="w-20 h-20 rounded-2xl bg-red-500/10 border border-red-500/25 flex items-center justify-center mb-6 mx-auto text-4xl">⚠️</div>
                        <h2 className="text-2xl font-bold mb-2">Error</h2>
                        <p className="text-gray-400 text-sm max-w-xs mx-auto">{errorMsg}</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-6 px-6 py-2.5 bg-violet-600 rounded-lg text-white font-semibold shadow-lg shadow-violet-500/30"
                        >
                            Reintentar
                        </button>
                    </motion.div>
                )}

                {(status === 'loading' || status === 'preparing') && (
                    <motion.div className="flex flex-col items-center">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow-[0_0_40px_rgba(124,58,237,0.3)] mb-8">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                            </svg>
                        </div>
                        <h2 className="text-lg font-bold tracking-widest mb-1.5">AR STUDIO</h2>
                        <p className="text-gray-500 text-sm mb-5">
                            {status === 'loading' ? 'Cargando experiencia...' : 'Preparando entorno 3D...'}
                        </p>
                        <div className="w-48 h-1 bg-gray-800 rounded-full overflow-hidden">
                            <motion.div
                                className="h-full bg-gradient-to-r from-violet-500 to-indigo-500"
                                animate={{ x: ['-100%', '250%'] }}
                                transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut" }}
                            />
                        </div>
                    </motion.div>
                )}

                {status === 'ready' && !started && (
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="flex flex-col items-center">
                        <div className="w-20 h-20 rounded-full bg-violet-600/20 border-2 border-violet-500 flex items-center justify-center mb-8 shadow-[0_0_50px_rgba(124,58,237,0.4)]">
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400">
                                <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                            </svg>
                        </div>
                        <h2 className="text-3xl font-bold tracking-tight mb-3">Listo para AR</h2>
                        <p className="text-gray-400 text-sm max-w-[280px] mb-8 leading-relaxed">
                            {xrSupported
                                ? "Apunta tu cámara al suelo y muévela suavemente para colocar los objetos."
                                : "Tu dispositivo no soporta WebXR nativo. Usaremos la versión de compatibilidad (Giroscopio)."}
                        </p>
                        <button
                            onClick={handleStart}
                            className="w-full max-w-[280px] py-4 bg-gradient-to-r from-violet-600 to-indigo-600 rounded-xl text-lg font-bold shadow-lg shadow-violet-600/30 hover:scale-105 transition-transform active:scale-95"
                        >
                            Comenzar Experiencia
                        </button>
                    </motion.div>
                )}
            </motion.div>
        </AnimatePresence>
    );
}
