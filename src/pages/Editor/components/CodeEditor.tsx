import { useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useSceneStore } from '../../../store/sceneStore';

export default function CodeEditor() {
    const { customCode, setCustomCode } = useSceneStore();
    const [localCode, setLocalCode] = useState(customCode);

    // Sync from store on load
    useEffect(() => { setLocalCode(customCode); }, [customCode]);

    const handleChange = (value: string | undefined) => {
        const code = value || '';
        setLocalCode(code);
        setCustomCode(code);
    };

    return (
        <div className="w-full h-full bg-[#1e1e1e] flex flex-col">
            <div className="h-8 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center justify-between px-4">
                <span className="text-xs text-gray-400 font-mono flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    main.js
                </span>
                <span className="text-[10px] text-gray-600">Se guarda con el proyecto</span>
            </div>
            <div className="flex-1">
                <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme="vs-dark"
                    value={localCode}
                    onChange={handleChange}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        fontFamily: "'Fira Code', 'Courier New', monospace",
                        padding: { top: 16 },
                        scrollBeyondLastLine: false,
                        smoothScrolling: true,
                    }}
                />
            </div>
        </div>
    );
}
