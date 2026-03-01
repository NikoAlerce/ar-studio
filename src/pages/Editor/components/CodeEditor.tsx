import Editor from '@monaco-editor/react';

export default function CodeEditor() {
    // In the future this might load different files, for now just a mockup
    const defaultCode = `// AR Studio Interactive Logic Layer
// Automatically executed on scene load

const ARObject = {
  init: function() {
    console.log("AR Scene Loaded");
    // this.el is the entity
  },
  tick: function(time, timeDelta) {
    // Called every frame
    // Make object float or spin
    const rotation = this.el.object3D.rotation;
    rotation.y += 0.01;
  }
};

export default ARObject;
`;

    return (
        <div className="w-full h-full bg-[#1e1e1e] flex flex-col">
            <div className="h-8 bg-[#2d2d2d] border-b border-[#1e1e1e] flex items-center px-4 text-xs text-gray-400 font-mono">
                👉 main.js
            </div>
            <div className="flex-1">
                <Editor
                    height="100%"
                    defaultLanguage="javascript"
                    theme="vs-dark"
                    defaultValue={defaultCode}
                    options={{
                        minimap: { enabled: false },
                        fontSize: 14,
                        wordWrap: 'on',
                        fontFamily: "'Fira Code', 'Courier New', monospace",
                        padding: { top: 16 }
                    }}
                />
            </div>
        </div>
    );
}
