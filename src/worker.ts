import { pipeline, env } from '@xenova/transformers';

// Disable local models loading to use CDN
env.allowLocalModels = false;

class RAGPipeline {
  static embeddingTask = 'feature-extraction';
  static embeddingModel = 'Xenova/all-MiniLM-L6-v2';

  static embeddingInstance = null;

  static async getEmbeddingInstance(progress_callback) {
    if (this.embeddingInstance === null) {
      this.embeddingInstance = pipeline(this.embeddingTask, this.embeddingModel, { progress_callback });
    }
    return this.embeddingInstance;
  }
}

function cosineSimilarity(vecA: number[], vecB: number[]) {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
        dotProduct += vecA[i] * vecB[i];
        normA += vecA[i] * vecA[i];
        normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

self.addEventListener('message', async (event) => {
  const { type, query, documentChunks } = event.data;

  if (type === 'search') {
    try {
      self.postMessage({ status: 'progress', message: 'Loading local search model...' });
      
      const embedder = await RAGPipeline.getEmbeddingInstance(x => {
        self.postMessage({ status: 'progress', message: 'Loading local search model...', detail: x });
      });
      
      self.postMessage({ status: 'progress', message: 'Finding relevant pages...' });
      const output = await embedder(query, { pooling: 'mean', normalize: true });
      const queryEmbedding = Array.from(output.data);

      const scoredChunks = documentChunks.map((doc: any) => ({
          ...doc,
          score: cosineSimilarity(queryEmbedding, doc.embedding)
      }));

      // Sort by highest score
      scoredChunks.sort((a: any, b: any) => b.score - a.score);
      
      // Get the top 10 most relevant chunks for Gemini
      const topChunks = scoredChunks.slice(0, 10);

      self.postMessage({ 
        status: 'complete', 
        topChunks: topChunks 
      });
      
    } catch (err: any) {
      self.postMessage({ status: 'error', message: err.message });
    }
  }
});
