import QRCode from 'react-qr-code';
import { X, ExternalLink, Download } from 'lucide-react';

interface QRCodeModalProps {
    isOpen: boolean;
    onClose: () => void;
    projectId: string;
}

export default function QRCodeModal({ isOpen, onClose, projectId }: QRCodeModalProps) {
    if (!isOpen) return null;

    // Use VITE_PUBLIC_URL if available (for local dev pointing to prod), else use current origin
    const baseUrl = import.meta.env.VITE_PUBLIC_URL || window.location.origin;
    const playUrl = `${baseUrl}/play/${projectId}`;

    const handleDownload = () => {
        const svg = document.getElementById("QRCodeImage");
        if (!svg) return;

        const svgData = new XMLSerializer().serializeToString(svg);
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const img = new Image();

        img.onload = () => {
            canvas.width = img.width;
            canvas.height = img.height;
            if (ctx) {
                // Add white background for better visibility when downloaded
                ctx.fillStyle = "white";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
            }

            const pngFile = canvas.toDataURL("image/png");
            const downloadLink = document.createElement("a");
            downloadLink.download = `ar-project-${projectId}-qr.png`;
            downloadLink.href = `${pngFile}`;
            downloadLink.click();
        };

        img.src = "data:image/svg+xml;base64," + btoa(svgData);
    };

    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100]">
            <div className="bg-[#1e1e24] border border-gray-700 rounded-xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center p-4 border-b border-gray-800 bg-gray-900/50">
                    <h3 className="font-semibold text-white">Compartir Experiencia AR</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
                        <X size={20} />
                    </button>
                </div>

                <div className="p-8 flex flex-col items-center">
                    <div className="bg-white p-4 rounded-xl shadow-inner mb-6">
                        <QRCode
                            id="QRCodeImage"
                            value={playUrl}
                            size={200}
                            level="H"
                            className="w-full h-full"
                        />
                    </div>

                    <p className="text-gray-300 text-sm text-center mb-4">
                        Escanea este código con la cámara de tu celular para abrir la experiencia en Realidad Aumentada.
                    </p>

                    {baseUrl.includes('localhost') && (
                        <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3 mb-6 text-xs text-yellow-500 text-center">
                            <strong>Aviso (Desarrollo Local):</strong> El código apunta a <code className="text-yellow-400">localhost</code>. Para escanearlo desde tu teléfono móvil, el visor debe estar desplegado en producción (ej. Vercel) puesto que un dispositivo móvil externo no puede acceder al localhost de tu computadora.
                        </div>
                    )}

                    <div className="flex gap-3 w-full">
                        <button
                            onClick={handleDownload}
                            className="flex-1 flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white py-2 px-4 rounded font-medium transition-colors text-sm"
                        >
                            <Download size={16} /> Descargar
                        </button>
                        <a
                            href={playUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-white py-2 px-4 rounded font-medium transition-colors text-sm"
                        >
                            <ExternalLink size={16} /> Abrir Link
                        </a>
                    </div>
                </div>

                <div className="bg-gray-900 px-4 py-3 border-t border-gray-800 text-xs text-gray-500 font-mono break-all text-center">
                    {playUrl}
                </div>
            </div>
        </div>
    );
}
