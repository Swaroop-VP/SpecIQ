const fs = require('fs');
const path = require('path');

// Helper function to chunk text
function chunkText(text, maxChunkSize = 1000) {
    const chunks = [];
    // Split by double newline to respect paragraphs
    const paragraphs = text.split(/\n\s*\n/);
    
    let currentChunk = '';
    
    for (const p of paragraphs) {
        if ((currentChunk.length + p.length) < maxChunkSize) {
            currentChunk += p + '\n\n';
        } else {
            if (currentChunk.trim()) {
                chunks.push(currentChunk.trim());
            }
            // If a single paragraph is huge, we should ideally split by sentences, 
            // but for simplicity we'll just push it or slice it.
            if (p.length > maxChunkSize) {
                // simple split by length for massive paragraphs
                let i = 0;
                while (i < p.length) {
                    chunks.push(p.slice(i, i + maxChunkSize));
                    i += maxChunkSize;
                }
                currentChunk = '';
            } else {
                currentChunk = p + '\n\n';
            }
        }
    }
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
    }
    return chunks;
}

async function extractTextFromPDF(pdfPath) {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const data = new Uint8Array(fs.readFileSync(pdfPath));
    const loadingTask = pdfjsLib.getDocument({ data: data });
    const pdf = await loadingTask.promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(' ');
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
    }
    return fullText;
}

async function main() {
    console.log("Loading embedding model...");
    const { pipeline } = await import('@xenova/transformers');
    const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');

    console.log("Starting PDF chunking and embedding...");
    const pdfDir = path.join(__dirname);
    const files = fs.readdirSync(pdfDir).filter(f => f.toLowerCase().endsWith('.pdf'));
    
    if (files.length === 0) {
        console.error(`No PDF files found in ${pdfDir}. Please add the PDF files.`);
        process.exit(1);
    }

    const documentChunks = [];
    
    for (const file of files) {
        console.log(`Processing ${file}...`);
        const text = await extractTextFromPDF(path.join(pdfDir, file));
        
        console.log(`Chunking ${file}...`);
        const chunks = chunkText(text, 1500); // 1500 characters per chunk
        
        console.log(`Calculating embeddings for ${chunks.length} chunks from ${file}...`);
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const output = await embedder(chunk, { pooling: 'mean', normalize: true });
            const embedding = Array.from(output.data);
            
            documentChunks.push({
                document: file,
                chunkIndex: i,
                text: chunk,
                embedding: embedding
            });
            
            if ((i + 1) % 50 === 0) {
                console.log(`   Embedded ${i + 1}/${chunks.length} chunks...`);
            }
        }
    }
    
    const outputPath = path.join(__dirname, 'public', 'data.json');
    fs.writeFileSync(outputPath, JSON.stringify(documentChunks, null, 2));
    console.log(`Successfully chunked, embedded, and saved to ${outputPath}`);
}

main().catch(console.error);
