/**
 * Tests for batch processing utilities
 */

const BatchProcessor = require('../../src/utils/batchers/batchProcessor');
const { batchChunkDocuments } = require('../../src/utils/batchers/chunkerBatch');
const { batchGenerateEmbeddings } = require('../../src/utils/batchers/embeddingBatch');
const { processDocuments } = require('../../src/utils/processors/documentProcessor');
const { createDocumentProcessor, createPDFProcessor } = require('../../src/utils/processors/processorFactory');
const { 
  calculateOptimalBatchSize, 
  memoryManager, 
  batchOptimizer 
} = require('../../src/memory');

describe('Batch Processing Utilities', () => {
  
  describe('BatchProcessor', () => {
    it('should process items in batches', async () => {
      const processor = new BatchProcessor({ batchSize: 2 });
      const items = [1, 2, 3, 4, 5];
      const processFn = jest.fn().mockImplementation(batch => {
        return batch.map(item => item * 2);
      });
      
      const results = await processor.process(items, processFn);
      
      expect(results).toEqual([2, 4, 6, 8, 10]);
      expect(processFn).toHaveBeenCalledTimes(3); // 3 batches of size 2 (with last batch having 1 item)
    });
    
    it('should handle errors with failFast=false', async () => {
      const processor = new BatchProcessor({ batchSize: 2, failFast: false });
      const items = [1, 2, 3, 4, 5];
      const processFn = jest.fn();
      
      // First batch succeeds, second fails, third succeeds
      processFn
        .mockReturnValueOnce([2, 4])
        .mockImplementationOnce(() => {
          throw new Error('Test error');
        })
        .mockReturnValueOnce([10]);
      
      const results = await processor.process(items, processFn);
      
      expect(results).toEqual([2, 4, 10]);
      expect(processFn).toHaveBeenCalledTimes(3);
    });
    
    it('should emit events during processing', async () => {
      const processor = new BatchProcessor({ batchSize: 2 });
      const items = [1, 2, 3, 4];
      const processFn = batch => batch.map(item => item * 2);
      
      const batchStartSpy = jest.fn();
      const batchCompleteSpy = jest.fn();
      const processingCompleteSpy = jest.fn();
      
      processor.on('batchStart', batchStartSpy);
      processor.on('batchComplete', batchCompleteSpy);
      processor.on('processingComplete', processingCompleteSpy);
      
      await processor.process(items, processFn);
      
      expect(batchStartSpy).toHaveBeenCalledTimes(2);
      expect(batchCompleteSpy).toHaveBeenCalledTimes(2);
      expect(processingCompleteSpy).toHaveBeenCalledTimes(1);
    });

    it('should use auto optimize when enabled', async () => {
      // Create items of varying sizes
      const items = [
        { text: 'a'.repeat(1000) },  // Small item
        { text: 'b'.repeat(10000) }, // Medium item
        { text: 'c'.repeat(50000) }, // Large item
        { text: 'd'.repeat(5000) },  // Small-medium item
        { text: 'e'.repeat(20000) }  // Medium-large item
      ];
      
      // Mock the batchOptimizer's calculateOptimalBatchSize function
      const mockCalculate = jest.spyOn(batchOptimizer, 'calculateOptimalBatchSize')
        .mockReturnValue(2);
      
      const processor = new BatchProcessor({ 
        batchSize: 5, // Default would process all at once
        autoOptimize: true,
        processName: 'test_process'
      });
      
      const processFn = jest.fn().mockImplementation(batch => batch);
      
      await processor.process(items, processFn);
      
      // Verify the batchOptimizer was used
      expect(mockCalculate).toHaveBeenCalledWith(
        items, 
        expect.objectContaining({ operation: 'test_process' })
      );
      
      // Since our mock returns batch size of 2, we expect 3 calls (2, 2, 1 items)
      expect(processFn).toHaveBeenCalledTimes(3);
      
      // Restore the original implementation
      mockCalculate.mockRestore();
    });
  });

  describe('MemoryManager', () => {
    it('should calculate optimal batch size based on item size', () => {
      // Test with various item sizes
      const smallItems = Array(10).fill().map(() => ({ text: 'x'.repeat(1000) }));
      const largeItems = Array(10).fill().map(() => ({ text: 'x'.repeat(100000) }));
      
      const smallBatchSize = memoryManager.calculateOptimalBatchSize(smallItems);
      const largeBatchSize = memoryManager.calculateOptimalBatchSize(largeItems);
      
      // Larger items should result in smaller batch sizes
      expect(smallBatchSize).toBeGreaterThan(largeBatchSize);
    });
    
    it('should monitor memory usage', () => {
      const result = memoryManager.monitorMemory();
      
      expect(result).toHaveProperty('heapUsed');
      expect(result).toHaveProperty('heapTotal');
      expect(result).toHaveProperty('heapUsedMB');
    });
  });
  
  describe('BatchOptimizer', () => {
    it('should optimize process functions for memory efficiency', async () => {
      const processFn = jest.fn().mockImplementation(batch => batch.map(item => item * 2));
      
      const optimizedFn = batchOptimizer.optimizeProcessFunction(processFn, {
        operation: 'test_optimization'
      });
      
      // Optimized function should still work correctly
      const result = await optimizedFn([1, 2, 3]);
      expect(result).toEqual([2, 4, 6]);
      
      // Original function should have been called
      expect(processFn).toHaveBeenCalledWith([1, 2, 3]);
    });
  });
  
  describe('TextChunkerBatch', () => {
    it('should chunk multiple documents in batches', async () => {
      const documents = [
        { id: 'doc1', text: 'This is the first document with some text for testing.' },
        { id: 'doc2', text: 'This is the second document.\n\nIt has multiple paragraphs.\n\nThree paragraphs to be exact.' }
      ];
      
      const results = await batchChunkDocuments(documents, { strategy: 'paragraphs' });
      
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('doc1');
      expect(results[1].id).toBe('doc2');
      expect(Array.isArray(results[0].chunks)).toBe(true);
      expect(Array.isArray(results[1].chunks)).toBe(true);
      expect(results[1].chunks.length).toBeGreaterThan(1); // Should have multiple chunks for doc2
    });
  });
  
  describe('EmbeddingBatch', () => {
    it('should generate embeddings for text chunks in batches', async () => {
      const chunks = [
        'This is the first chunk',
        'This is the second chunk',
        'This is the third chunk'
      ];
      
      const results = await batchGenerateEmbeddings(chunks);
      
      expect(results).toHaveLength(3);
      expect(Array.isArray(results[0].embedding)).toBe(true);
      expect(results[0].content).toBe(chunks[0]);
    });
    
    it('should handle text chunks with metadata', async () => {
      const chunks = [
        { documentId: 'doc1', chunkIndex: 0, content: 'Chunk 1', metadata: { source: 'test' } },
        { documentId: 'doc1', chunkIndex: 1, content: 'Chunk 2', metadata: { source: 'test' } }
      ];
      
      const results = await batchGenerateEmbeddings(chunks, { includeMetadata: true });
      
      expect(results).toHaveLength(2);
      expect(Array.isArray(results[0].embedding)).toBe(true);
      expect(results[0].documentId).toBe('doc1');
      expect(results[0].metadata).toEqual({ source: 'test' });
    });
  });
  
  describe('DocumentProcessor', () => {
    it('should process documents through the full pipeline', async () => {
      // Sample documents
      const documents = [
        {
          id: 'doc1',
          text: 'This is a sample document for testing the document processor.',
          metadata: { source: 'test', author: 'AI' }
        },
        {
          id: 'doc2',
          text: 'This is another document.\n\nIt has multiple paragraphs.\n\nThree paragraphs in total.',
          metadata: { source: 'test', author: 'Human' }
        }
      ];
      
      // Mock store function
      const storeFn = jest.fn().mockResolvedValue(['stored1', 'stored2']);
      
      const results = await processDocuments(documents, {
        chunking: { strategy: 'paragraphs' },
        embedding: { includeContent: true, includeMetadata: true },
        batch: { documentBatchSize: 2, chunkBatchSize: 5 },
        memory: { detectMemoryIssues: true }
      }, storeFn);
      
      expect(results).toHaveProperty('documentCount', 2);
      expect(results).toHaveProperty('chunkCount');
      expect(results.chunkCount).toBeGreaterThan(1);
      expect(results).toHaveProperty('embeddingCount');
      expect(results.embeddingCount).toBeGreaterThan(1);
      expect(storeFn).toHaveBeenCalled();
    });
    
    it('should process documents without storing', async () => {
      // Sample documents
      const documents = [
        { id: 'doc1', text: 'Sample document for testing.' },
        { id: 'doc2', text: 'Another document for testing.' }
      ];
      
      const results = await processDocuments(documents, {
        chunking: { strategy: 'characters', chunkSize: 20 }
      });
      
      expect(results).toHaveProperty('documentCount', 2);
      expect(results).toHaveProperty('embeddings');
      expect(Array.isArray(results.embeddings)).toBe(true);
    });
  });
  
  describe('ProcessorFactory', () => {
    it('should create a document processor with options', () => {
      const options = {
        chunking: { strategy: 'markdown' },
        batch: { concurrency: 4 }
      };
      
      const processor = createDocumentProcessor(options);
      expect(processor.options.chunking.strategy).toBe('markdown');
      expect(processor.options.batch.concurrency).toBe(4);
    });
    
    it('should create a PDF processor with options', () => {
      const options = {
        chunking: { strategy: 'paragraphs' },
        embedding: { includeContent: false }
      };
      
      const processor = createPDFProcessor(options);
      expect(processor.options.chunking.strategy).toBe('paragraphs');
      expect(processor.options.embedding.includeContent).toBe(false);
    });
    
    it('should apply default options when not specified', () => {
      const processor = createDocumentProcessor();
      expect(processor.options.chunking.strategy).toBe('characters');
      expect(processor.options.batch.documentBatchSize).toBe(5);
      expect(processor.options.embedding.includeContent).toBe(true);
    });
  });
}); 