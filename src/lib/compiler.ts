// MindAR Image Compiler Helper Function
// We use dynamic script injection to load the MindAR Image Compiler SDK from CDN 
// to bypass native node-gyp build issues on Windows.

export async function compileMindARImage(file: File): Promise<{ mindBlob: Blob, thumbnailBlob: Blob }> {
    return new Promise((resolve, reject) => {
        // 1. Ensure MindAR Compiler is loaded
        if (!(window as any).MINDAR) {
            const script = document.createElement('script');
            script.src = "https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image.prod.js"; // This loads MINDAR core
            script.crossOrigin = "anonymous";
            script.onload = () => {
                // Now load compiler
                const compilerScript = document.createElement('script');
                compilerScript.src = "https://cdn.jsdelivr.net/npm/mind-ar@1.1.0/dist/mindar-image-compiler.prod.js";
                compilerScript.onload = () => runCompiler(file, resolve, reject);
                compilerScript.onerror = () => reject(new Error("Failed to load MindAR Compiler SDK"));
                document.head.appendChild(compilerScript);
            };
            script.onerror = () => reject(new Error("Failed to load MindAR Core"));
            document.head.appendChild(script);
        } else {
            runCompiler(file, resolve, reject);
        }
    });
}

function runCompiler(file: File, resolve: (res: { mindBlob: Blob, thumbnailBlob: Blob }) => void, reject: (err: Error) => void) {
    try {
        const fileURL = URL.createObjectURL(file);
        const originalImage = new Image();
        originalImage.src = fileURL;

        originalImage.onload = async () => {
            try {
                // Resize logic to prevent WebGL out-of-memory errors on huge images
                const MAX_DIM = 1024;
                let w = originalImage.width;
                let h = originalImage.height;

                if (w > MAX_DIM || h > MAX_DIM) {
                    if (w > h) {
                        h = Math.round((h * MAX_DIM) / w);
                        w = MAX_DIM;
                    } else {
                        w = Math.round((w * MAX_DIM) / h);
                        h = MAX_DIM;
                    }
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(originalImage, 0, 0, w, h);
                }

                // Get resized image as blob for thumbnail
                const thumbnailBlob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.8));
                if (!thumbnailBlob) throw new Error("Failed to create thumbnail blob");

                // Get resized image as DataURL for MindAR Compiler
                const resizedUrl = canvas.toDataURL('image/jpeg', 0.8);
                const compilerImage = new Image();
                compilerImage.src = resizedUrl;

                compilerImage.onload = async () => {
                    try {
                        // @ts-ignore - Loaded via CDN
                        const compiler = new window.MINDAR.IMAGE.Compiler();
                        console.log("Compiling feature points from resized image...");

                        // Compiler takes an array of images.
                        await compiler.compileImageTargets([compilerImage], (progress: number) => {
                            console.log(`Compilation progress: ${progress.toFixed(2)}%`);
                        });

                        // Export data
                        const exportedData = await compiler.exportData();
                        const mindBlob = new Blob([exportedData], { type: 'application/octet-stream' });

                        URL.revokeObjectURL(fileURL);
                        resolve({ mindBlob, thumbnailBlob });
                    } catch (err) {
                        console.error("MindAR Compilation failed:", err);
                        URL.revokeObjectURL(fileURL);
                        reject(err as Error);
                    }
                };
            } catch (err) {
                console.error("Image resize processing failed:", err);
                URL.revokeObjectURL(fileURL);
                reject(err as Error);
            }
        };

        originalImage.onerror = () => {
            URL.revokeObjectURL(fileURL);
            reject(new Error("Failed to load image for compilation"));
        };
    } catch (e) {
        reject(e as Error);
    }
}
